// Draws each caption to a transparent PNG, cropped to the text, and reports
// where it goes in the frame. ffmpeg then fades it in over the video.

import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const font = (pkg, file) => require.resolve(`@fontsource/${pkg}/files/${file}`);

// The same faces the website uses.
GlobalFonts.registerFromPath(font('public-sans', 'public-sans-latin-600-normal.woff2'), 'Reel Sans');
GlobalFonts.registerFromPath(font('public-sans', 'public-sans-latin-400-normal.woff2'), 'Reel Sans Regular');
GlobalFonts.registerFromPath(font('great-vibes', 'great-vibes-latin-400-normal.woff2'), 'Reel Script');

// Sizes are for a 1080 px wide frame. y is the centre of the caption; the
// default keeps it clear of Instagram's own buttons and caption text.
const STYLES = {
  caption: { font: 'Reel Sans', size: 56, lineHeight: 1.28, color: '#fffaf0', box: 'rgba(28,20,13,0.78)', padX: 34, padY: 24, radius: 26, maxWidth: 860, y: 1400 },
  title: { font: 'Reel Script', size: 136, lineHeight: 1.05, color: '#654530', maxWidth: 1000, y: 1190 },
  byline: { font: 'Reel Sans', size: 50, lineHeight: 1.2, color: '#305065', maxWidth: 960, y: 1330 },
  url: { font: 'Reel Sans Regular', size: 40, lineHeight: 1.2, color: '#654530', maxWidth: 960, y: 1420 },
};

function greedy(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

// Wraps to as few lines as fit, then narrows the block so the lines come
// out a similar length instead of leaving one word on its own.
function wrap(ctx, text, maxWidth) {
  let best = greedy(ctx, text, maxWidth);
  for (let width = maxWidth * 0.95; width > maxWidth * 0.4; width -= maxWidth * 0.05) {
    const lines = greedy(ctx, text, width);
    if (lines.length > best.length) break;
    best = lines;
  }
  return best;
}

export async function renderCaption(caption, frame, out) {
  const base = STYLES[caption.style ?? 'caption'];
  if (!base) throw new Error(`Unknown caption style "${caption.style}"`);
  const k = frame.W / 1080;
  const s = { ...base, padX: base.padX ?? 8, padY: base.padY ?? 8 };
  const size = s.size * k;
  const fontSpec = `${size}px "${s.font}"`;

  const measure = createCanvas(8, 8).getContext('2d');
  measure.font = fontSpec;
  const lines = wrap(measure, caption.text, s.maxWidth * k);
  const textW = Math.max(...lines.map((l) => measure.measureText(l).width));
  const lineH = size * s.lineHeight;
  // Script faces swing well outside their advance width, so leave room.
  const bleed = s.box ? 0 : size * 0.35;
  const w = Math.ceil(textW + 2 * (s.padX * k + bleed));
  const h = Math.ceil(lines.length * lineH + 2 * (s.padY * k + bleed));

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (s.box) {
    ctx.fillStyle = s.box;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, s.radius * k);
    ctx.fill();
  }
  ctx.font = fontSpec;
  ctx.fillStyle = s.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.fillText(line, w / 2, s.padY * k + bleed + lineH * (i + 0.5));
  });

  await writeFile(out, canvas.toBuffer('image/png'));
  const y = (caption.y ?? s.y) * k;
  return { file: out, x: Math.round((frame.W - w) / 2), y: Math.round(y - h / 2) };
}
