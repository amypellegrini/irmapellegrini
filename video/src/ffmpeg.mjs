import { spawn, spawnSync } from 'node:child_process';

export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

export function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) =>
      reject(e.code === 'ENOENT' ? new Error(`${bin} not found. Install ffmpeg (brew install ffmpeg) or set FFMPEG_PATH.`) : e),
    );
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${bin} exited with ${code}\n${err.split('\n').slice(-12).join('\n')}\nargs: ${args.join(' ')}`));
    });
  });
}

// Runs ffmpeg with a pipe on stdin and hands the pipe to `feed`, which writes
// raw frames into it.
export function ffmpegWithInput(args, feed) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    child.stdin.on('error', () => {}); // ffmpeg's own exit code reports the failure
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}\n${err.split('\n').slice(-12).join('\n')}`))));
    feed(child.stdin).then(() => child.stdin.end(), (e) => { child.kill(); reject(e); });
  });
}

export const ffmpeg = (args) => run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

export async function probe(file) {
  const json = await run(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,color_transfer:format=duration',
    '-of', 'json', file,
  ]);
  const data = JSON.parse(json);
  const s = data.streams[0];
  return {
    width: s.width,
    height: s.height,
    duration: Number(data.format?.duration ?? 0),
    hdr: s.color_transfer === 'arib-std-b67' || s.color_transfer === 'smpte2084',
  };
}

let filters;
export function hasFilter(name) {
  if (!filters) {
    const res = spawnSync(FFMPEG, ['-hide_banner', '-filters'], { encoding: 'utf8' });
    filters = new Set((res.stdout || '').split('\n').map((l) => l.trim().split(/\s+/)[1]).filter(Boolean));
  }
  return filters.has(name);
}
