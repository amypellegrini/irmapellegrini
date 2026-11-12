// Turns one timeline scene into an intermediate video file of an exact
// number of frames. Each scene is rendered on its own so it can be cached.

import { ffmpeg, probe, hasFilter } from './ffmpeg.mjs';

const even = (n) => Math.round(n / 2) * 2;
const n4 = (n) => Number(n.toFixed(4));

function encodeArgs(ctx, frames, out) {
  return [
    '-frames:v', String(frames), '-an',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', ctx.preview ? '20' : '12',
    '-pix_fmt', 'yuv420p', '-r', String(ctx.fps),
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    out,
  ];
}

// --- phone footage -------------------------------------------------------

// The phone records HLG HDR. Left alone it looks grey and washed out, so it
// is converted to standard dynamic range first. VideoToolbox does this
// properly on a Mac; elsewhere a colour-space conversion plus a contrast
// curve gets close.
function hdrToSdr() {
  if (hasFilter('scale_vt') && process.platform === 'darwin') {
    return {
      input: ['-hwaccel', 'videotoolbox', '-hwaccel_output_format', 'videotoolbox_vld'],
      filters: ['scale_vt=color_matrix=bt709:color_primaries=bt709:color_transfer=bt709', 'hwdownload', 'format=p010le'],
    };
  }
  if (hasFilter('zscale') && hasFilter('tonemap')) {
    return {
      input: [],
      filters: [
        'zscale=t=linear:npl=100', 'format=gbrpf32le', 'zscale=p=bt709',
        'tonemap=hable:desat=0', 'zscale=t=bt709:m=bt709:r=tv',
      ],
    };
  }
  return {
    input: [],
    filters: [
      'format=gbrpf32le', 'colorspace=all=bt709:iall=bt2020:itrc=bt2020-10:fast=0',
      'format=yuv420p', 'eq=contrast=1.12:saturation=1.25:gamma=0.92',
    ],
  };
}

export async function renderClip(scene, ctx, file, frames, out) {
  const { W, H, fps } = ctx;
  const info = await probe(file);
  const speed = scene.speed ?? 1;
  const seconds = (frames / fps) * speed;
  if (scene.in + seconds > info.duration + 0.05) {
    throw new Error(`${scene.src}: needs ${seconds.toFixed(2)}s from ${scene.in}s but the clip is ${info.duration.toFixed(2)}s long`);
  }

  const sdr = info.hdr ? hdrToSdr() : { input: [], filters: [] };
  // `widen` shows more of the landscape frame than a straight 9:16 crop can:
  // 1.6 shows 1.6 times the width, set over a blurred copy of the same shot.
  const widen = scene.widen ?? 1;
  const cropW = Math.min(info.width, even(((info.height * W) / H) * widen));
  const cropX = Math.round((info.width - cropW) * (scene.focus ?? 0.5));
  const fgH = even((W * info.height) / cropW);

  // The grade pulls the phone's saturation back a touch so skin and the
  // leaves sit with the wood tones of the artwork.
  const finish = ['eq=saturation=0.94:contrast=1.02', ...(ctx.preview ? [] : ['unsharp=5:5:0.4']), 'format=yuv420p'];
  const head = [...sdr.filters, ...(speed !== 1 ? [`setpts=PTS/${speed}`] : []), `fps=${fps}`, `crop=${cropW}:${info.height}:${cropX}:0`];

  const graph =
    widen <= 1 || fgH >= H
      ? `[0:v]${[...head, `scale=${W}:${H}:flags=lanczos`, ...finish].join(',')}[v]`
      : [
          `[0:v]${head.join(',')},split[a][b]`,
          `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=${Math.round(40 * ctx.k)},eq=brightness=-0.06[bg]`,
          `[b]scale=${W}:${fgH}:flags=lanczos[fg]`,
          `[bg][fg]overlay=0:${Math.round((scene.imageY ?? 790) * ctx.k - fgH / 2)},${finish.join(',')}[v]`,
        ].join(';');

  // The camera's rotation flag is unreliable when the phone is tilted down,
  // so it is ignored; every clip here was shot in landscape.
  await ffmpeg([
    ...sdr.input, '-noautorotate',
    '-ss', String(scene.in), '-t', String(n4(seconds + 0.5)), '-i', file,
    '-filter_complex', graph, '-map', '[v]',
    ...encodeArgs(ctx, frames, out),
  ]);
}

// --- still images --------------------------------------------------------

// Slow zoom: the picture is fitted inside the frame over a blurred copy of
// itself, then the whole card is zoomed. Rendering at `ss` times the output
// size keeps the movement smooth instead of stepping pixel by pixel.
async function renderZoom(scene, ctx, file, frames, out) {
  const { W, H, fps, ss, k: unit } = ctx;
  const info = await probe(file);
  const maxW = W - 2 * (scene.margin ?? 0) * unit;
  const maxH = (scene.maxHeight ?? 1240) * unit;
  const k = Math.min(maxW / info.width, maxH / info.height);
  const fgW = even(info.width * k * ss);
  const fgH = even(info.height * k * ss);
  const centreY = (scene.imageY ?? 790) * unit;
  const fgX = Math.round((W * ss - fgW) / 2);
  const fgY = Math.round(centreY * ss - fgH / 2);

  const amount = scene.amount ?? 0.1;
  const [z0, z1] = scene.move === 'out' ? [1 + amount, 1] : [1, 1 + amount];
  const fx = scene.focusX ?? 0.5;
  const fy = scene.focusY ?? centreY / H;
  const p = `(on/${Math.max(1, frames - 1)})`;

  const graph = [
    `[0:v]format=rgb24,split[a][b]`,
    `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=45,` +
      `eq=brightness=-0.05:saturation=0.9,scale=${W * ss}:${H * ss}:flags=bilinear[bg]`,
    `[b]scale=${fgW}:${fgH}:flags=lanczos[fg]`,
    `[bg][fg]overlay=${fgX}:${fgY},` +
      `zoompan=z='${z0}+(${n4(z1 - z0)})*${p}':x='(iw-iw/zoom)*${fx}':y='(ih-ih/zoom)*${n4(fy)}':` +
      `d=${frames}:s=${W}x${H}:fps=${fps},format=yuv420p[v]`,
  ].join(';');

  await ffmpeg(['-i', file, '-filter_complex', graph, '-map', '[v]', ...encodeArgs(ctx, frames, out)]);
}

// Pan: the picture is scaled to a set height (the full frame by default) and
// the frame slides across it.
async function renderPan(scene, ctx, file, frames, out) {
  const { W, H, fps, ss, k: unit } = ctx;
  const info = await probe(file);
  const vertical = scene.move === 'up' || scene.move === 'down';
  const seconds = frames / fps;

  let imgW;
  let imgH;
  if (vertical) {
    imgW = even(W * ss);
    imgH = even((info.height * imgW) / info.width);
    if (imgH < H * ss * 1.05) {
      imgH = even(H * ss * 1.12);
      imgW = even((info.width * imgH) / info.height);
    }
  } else {
    imgH = even((scene.imageHeight ? scene.imageHeight * unit : H) * ss);
    imgW = even((info.width * imgH) / info.height);
    if (imgW < W * ss * 1.05) {
      imgW = even(W * ss * 1.12);
      imgH = even((info.height * imgW) / info.width);
    }
  }

  const canvasW = Math.max(imgW, W * ss);
  const canvasH = Math.max(imgH, H * ss);
  const imgX = Math.round((canvasW - imgW) / 2);
  const imgY = scene.imageHeight
    ? Math.round((scene.imageY ? scene.imageY * unit : H / 2) * ss - imgH / 2)
    : Math.round((canvasH - imgH) / 2);

  const reverse = scene.move === 'left' || scene.move === 'up';
  const from = scene.from ?? (reverse ? 1 : 0);
  const to = scene.to ?? (reverse ? 0 : 1);
  const travel = `(${from}+(${n4(to - from)})*t/${n4(seconds)})`;
  const x = vertical ? `(iw-ow)*${scene.focusX ?? 0.5}` : `(iw-ow)*${travel}`;
  const y = vertical ? `(ih-oh)*${travel}` : `(ih-oh)*${scene.focusY ?? 0.5}`;

  const graph = [
    `color=c=${scene.background ?? '#000000'}:s=${canvasW}x${canvasH}:r=${fps}[bg]`,
    `[0:v]scale=${imgW}:${imgH}:flags=lanczos,format=rgba[img]`,
    `[bg][img]overlay=${imgX}:${imgY}:shortest=1,` +
      `crop=${W * ss}:${H * ss}:x='${x}':y='${y}',scale=${W}:${H}:flags=lanczos,format=yuv420p[v]`,
  ].join(';');

  await ffmpeg([
    '-loop', '1', '-framerate', String(fps), '-t', String(n4(seconds + 0.2)), '-i', file,
    '-filter_complex', graph, '-map', '[v]', ...encodeArgs(ctx, frames, out),
  ]);
}

export function renderStill(scene, ctx, file, frames, out) {
  const move = scene.move ?? 'in';
  if (move === 'in' || move === 'out') return renderZoom(scene, ctx, file, frames, out);
  if (['left', 'right', 'up', 'down'].includes(move)) return renderPan(scene, ctx, file, frames, out);
  throw new Error(`Unknown move "${move}" for ${scene.src}`);
}
