// Renders the reel described in timeline.mjs.
//
//   npm run render     full quality, 1080x1920  -> out/<name>.mp4
//   npm run preview    half size and fast       -> out/<name>-preview.mp4
//   npm run sheet      preview plus a contact sheet of one frame per second
//
// Steps: each scene becomes its own cached clip, captions are drawn to PNGs,
// the music is generated, then one ffmpeg pass joins it all together.

import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import timeline from '../timeline.mjs';
import { ffmpeg } from './ffmpeg.mjs';
import { renderClip, renderStill } from './scenes.mjs';
import { renderCaption } from './captions.mjs';
import { composeTrack } from './music.mjs';

const VIDEO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_DIR = path.resolve(VIDEO_DIR, '..');
const CACHE_DIR = path.join(VIDEO_DIR, '.cache');
const OUT_DIR = path.join(VIDEO_DIR, 'out');
const CACHE_VERSION = 7;

const args = new Set(process.argv.slice(2));
const preview = args.has('--preview');

const scale = preview ? 0.5 : 1;
const ctx = {
  W: timeline.width * scale,
  H: timeline.height * scale,
  fps: timeline.fps,
  k: (timeline.width * scale) / 1080, // caption and layout sizes are given for a 1080 px frame
  ss: preview ? 1 : 3, // supersampling for still-image movement
  preview,
};

const framesPerBeat = (ctx.fps * 60) / timeline.bpm;
if (!Number.isInteger(framesPerBeat)) {
  throw new Error(`${timeline.bpm} bpm at ${ctx.fps} fps is ${framesPerBeat} frames per beat; pick a tempo that gives a whole number`);
}
const beatsToSeconds = (beats) => (beats * framesPerBeat) / ctx.fps;
const t3 = (n) => n.toFixed(3);

function sourcePath(scene) {
  const file = scene.type === 'clip' ? path.join(VIDEO_DIR, 'footage', scene.src) : path.join(REPO_DIR, scene.src);
  if (!existsSync(file)) {
    const hint = scene.type === 'clip' ? ' Copy the phone footage into video/footage/ (see video/README.md).' : '';
    throw new Error(`Missing source file: ${file}.${hint}`);
  }
  return file;
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
}

async function renderScene(scene, index) {
  const file = sourcePath(scene);
  const fadeFrames = index === 0 ? 0 : Math.round((scene.fade ?? 0) * ctx.fps);
  // A scene that fades in starts early by the length of the fade, so that it
  // is fully on screen exactly on its beat.
  const frames = scene.beats * framesPerBeat + fadeFrames;
  const stat = statSync(file);
  const key = createHash('sha1')
    .update(JSON.stringify([CACHE_VERSION, scene, ctx, frames, stat.size, stat.mtimeMs]))
    .digest('hex')
    .slice(0, 12);
  const out = path.join(CACHE_DIR, `scene-${String(index).padStart(2, '0')}-${key}.mp4`);

  if (!existsSync(out)) {
    const tmp = out.replace(/\.mp4$/, '.tmp.mp4');
    if (scene.type === 'clip') {
      const start = Math.max(0, scene.in - fadeFrames / ctx.fps);
      await renderClip({ ...scene, in: start }, ctx, file, frames, tmp);
    } else if (scene.type === 'still') {
      await renderStill(scene, ctx, file, frames, tmp);
    } else {
      throw new Error(`Unknown scene type "${scene.type}"`);
    }
    await rename(tmp, out);
    console.log(`  scene ${index + 1}/${timeline.scenes.length}  ${scene.src}`);
  }
  return { file: out, frames, fadeFrames };
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  const totalBeats = timeline.scenes.reduce((sum, s) => sum + s.beats, 0);
  const totalSeconds = beatsToSeconds(totalBeats);
  console.log(`${timeline.name}: ${timeline.scenes.length} scenes, ${totalBeats} beats, ${totalSeconds.toFixed(1)}s at ${ctx.W}x${ctx.H}`);

  console.log('Rendering scenes');
  const scenes = await pool(timeline.scenes, 3, renderScene);

  console.log('Drawing captions');
  const captions = await Promise.all(
    (timeline.captions ?? []).map(async (caption, i) => {
      const png = await renderCaption(caption, ctx, path.join(CACHE_DIR, `caption-${String(i).padStart(2, '0')}${preview ? '-preview' : ''}.png`));
      const start = beatsToSeconds(caption.at) + 0.1;
      const end = Math.min(totalSeconds, beatsToSeconds(caption.at + caption.beats)) - 0.06;
      return { ...png, start, end };
    }),
  );

  let musicFile;
  if (timeline.music === 'generated') {
    console.log('Composing music');
    musicFile = path.join(CACHE_DIR, 'music.wav');
    await writeFile(musicFile, composeTrack(totalSeconds, timeline.bpm));
  } else if (timeline.music) {
    musicFile = path.resolve(VIDEO_DIR, timeline.music);
    if (!existsSync(musicFile)) throw new Error(`Music file not found: ${musicFile}`);
  }

  // --- one pass to join everything ---------------------------------------
  const inputs = [];
  const graph = [];
  scenes.forEach((scene, i) => {
    inputs.push('-i', scene.file);
    graph.push(`[${i}:v]settb=AVTB,setpts=PTS-STARTPTS[s${i}]`);
  });

  let current = 's0';
  let length = scenes[0].frames;
  for (let i = 1; i < scenes.length; i++) {
    const { frames, fadeFrames } = scenes[i];
    if (fadeFrames > 0) {
      graph.push(
        `[${current}][s${i}]xfade=transition=fade:duration=${t3(fadeFrames / ctx.fps)}:offset=${t3((length - fadeFrames) / ctx.fps)},settb=AVTB[j${i}]`,
      );
      length += frames - fadeFrames;
    } else {
      graph.push(`[${current}][s${i}]concat=n=2:v=1:a=0,settb=AVTB[j${i}]`);
      length += frames;
    }
    current = `j${i}`;
  }

  captions.forEach((caption, i) => {
    const input = scenes.length + i;
    inputs.push('-loop', '1', '-framerate', String(ctx.fps), '-t', t3(totalSeconds), '-i', caption.file);
    const fade = 0.25;
    const rise = Math.round(18 * ctx.k);
    graph.push(
      `[${input}:v]format=rgba,fade=t=in:st=${t3(caption.start)}:d=${fade}:alpha=1,fade=t=out:st=${t3(caption.end - fade)}:d=${fade}:alpha=1[c${i}]`,
      `[${current}][c${i}]overlay=x=${caption.x}:y='${caption.y}+${rise}*pow(1-min(1,(t-${t3(caption.start)})/0.4),2)':enable='between(t,${t3(caption.start)},${t3(caption.end)})'[o${i}]`,
    );
    current = `o${i}`;
  });
  graph.push(`[${current}]format=yuv420p[v]`);

  const maps = ['-map', '[v]'];
  const audio = [];
  if (musicFile) {
    const input = scenes.length + captions.length;
    inputs.push('-i', musicFile);
    graph.push(
      `[${input}:a]atrim=0:${t3(totalSeconds)},afade=t=in:d=0.3,afade=t=out:st=${t3(totalSeconds - 2.5)}:d=2.5,aresample=48000[a]`,
    );
    maps.push('-map', '[a]');
    audio.push('-c:a', 'aac', '-b:a', '192k');
  }

  const out = path.join(OUT_DIR, `${timeline.name}${preview ? '-preview' : ''}.mp4`);
  console.log('Joining');
  await ffmpeg([
    ...inputs,
    '-filter_complex', graph.join(';'),
    ...maps,
    '-frames:v', String(length),
    '-c:v', 'libx264', '-preset', preview ? 'veryfast' : 'slow', '-crf', preview ? '24' : '17',
    '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(ctx.fps),
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    ...audio,
    '-movflags', '+faststart',
    out,
  ]);
  console.log(`Done: ${path.relative(process.cwd(), out)}`);

  if (args.has('--sheet')) {
    const sheet = out.replace(/\.mp4$/, '-sheet.jpg');
    const columns = 9;
    const rows = Math.ceil(totalSeconds / columns);
    await ffmpeg(['-i', out, '-vf', `fps=1,scale=240:-2,tile=${columns}x${rows}`, '-frames:v', '1', '-update', '1', sheet]);
    console.log(`Contact sheet: ${path.relative(process.cwd(), sheet)}`);
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
