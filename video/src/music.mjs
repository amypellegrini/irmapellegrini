// The backing track: a short piano piece with quiet strings underneath.
// The notes live in piece.mjs; this file gets them played, by the best
// instrument available:
//
//   1. MuseScore   plays the score with Muse Sounds (recorded instruments,
//                  performed from the notation) when they are installed and
//                  set as the default playback profile, otherwise with its
//                  basic soundfont
//   2. FluidSynth  plays a MIDI version through MuseScore's basic soundfont
//   3. synth.mjs   plain synthesised tones, needs nothing installed
//
// Set MUSIC_ENGINE to musescore, fluidsynth or synth to force one. Nothing
// is licensed from anyone, and the tempo always matches the cuts.
//
//   node src/music.mjs [seconds] [bpm] [out.wav]

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { FFMPEG, ffmpeg, run } from './ffmpeg.mjs';
import { musicXml } from './musicxml.mjs';
import { BARS, ENDING, STRINGS_ENTER_AT_BAR, barCount } from './piece.mjs';
import { composeTrack } from './synth.mjs';

const FLUIDSYNTH = process.env.FLUIDSYNTH_PATH || 'fluidsynth';
const MUSESCORE = [process.env.MUSESCORE_PATH, '/Applications/MuseScore 4.app/Contents/MacOS/mscore', '/Applications/MuseScore Studio.app/Contents/MacOS/mscore'].filter(Boolean);
const SOUNDFONTS = [
  process.env.SOUNDFONT,
  '/Applications/MuseScore 4.app/Contents/Resources/sound/MS Basic.sf3',
  '/Applications/MuseScore 3.app/Contents/Resources/sound/MuseScore_General.sf3',
  '/usr/share/sounds/sf3/MuseScore_General.sf3',
  '/usr/share/sounds/sf2/FluidR3_GM.sf2',
].filter(Boolean);

// Small seeded generator: the same slightly uneven "performance" every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TICKS = 480; // per beat
const PIANO = 0;
const STRINGS = 1;

function arrange(seconds, bpm) {
  const random = rng(1987);
  const bars = barCount(seconds, bpm);
  const events = []; // { tick, bytes }
  const at = (beat) => Math.max(0, Math.round(beat * TICKS));
  const note = (channel, beat, pitch, beats, velocity) => {
    // Nobody plays exactly on the grid or at an even weight.
    const start = channel === PIANO ? beat + (random() - 0.5) * 0.02 : beat;
    const v = Math.max(1, Math.min(127, Math.round(velocity * (0.9 + random() * 0.2))));
    events.push({ tick: at(start), bytes: [0x90 | channel, pitch, v] });
    events.push({ tick: at(start + beats) - 1, bytes: [0x80 | channel, pitch, 0] });
  };
  const control = (channel, beat, number, value) => events.push({ tick: at(beat), bytes: [0xb0 | channel, number, value] });

  events.push({ tick: 0, bytes: [0xc0 | PIANO, 0] }); // grand piano
  events.push({ tick: 0, bytes: [0xc0 | STRINGS, 48] }); // string ensemble
  control(PIANO, 0, 7, 105);
  control(PIANO, 0, 91, 70); // reverb send
  control(STRINGS, 0, 7, 62);
  control(STRINGS, 0, 91, 95);

  for (let b = 0; b < bars; b++) {
    const start = b * 4;
    const last = b === bars - 1;
    const bar = last ? ENDING : BARS[b % BARS.length];
    // The piece builds a little towards the middle and settles again.
    const shape = 0.85 + 0.25 * Math.sin((Math.PI * b) / (bars - 1));

    // Sustain pedal: lifted and pressed again at each change of chord.
    control(PIANO, start + 0.06, 64, 127);
    if (!last) control(PIANO, start + 3.97, 64, 0);

    if (last) {
      bar.left.forEach((pitch, i) => note(PIANO, start + i * 0.5, pitch, 8, 46 - i * 3));
      bar.chord.forEach((pitch, i) => note(PIANO, start + 1.5 + i * 0.04, pitch, 8, 50));
    } else {
      bar.left.forEach((pitch, i) => {
        if (b === 0 && i % 2 === 1 && i > 2) return; // a sparse first bar
        const weight = i === 0 ? 56 : i % 2 === 0 ? 46 : 40;
        note(PIANO, start + i * 0.5, pitch, 0.5, weight * shape);
      });
      for (const [beat, pitch, beats] of bar.melody) note(PIANO, start + beat, pitch, beats, 66 * shape);
    }

    // Strings hold each chord into the next.
    if (b >= STRINGS_ENTER_AT_BAR) for (const pitch of bar.strings) note(STRINGS, start, pitch, last ? 8 : 4.15, 44);
    if (b >= STRINGS_ENTER_AT_BAR) {
      for (let step = 0; step < 4; step++) {
        const swell = 70 + 40 * Math.sin((Math.PI * (b - STRINGS_ENTER_AT_BAR + step / 4)) / Math.max(1, bars - STRINGS_ENTER_AT_BAR));
        control(STRINGS, start + step, 11, Math.round(swell));
      }
    }
  }

  // A silent event after the last note so the reverb tail is rendered.
  control(PIANO, bars * 4 + 8, 7, 105);
  return events;
}

function varLength(value) {
  const bytes = [value & 0x7f];
  while ((value >>= 7) > 0) bytes.unshift((value & 0x7f) | 0x80);
  return bytes;
}

function midiFile(events, bpm) {
  const usPerBeat = Math.round(60000000 / bpm);
  const tempo = { tick: 0, bytes: [0xff, 0x51, 0x03, (usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff] };
  // Stable sort: at the same tick, note-offs come before note-ons.
  const ordered = [tempo, ...events]
    .map((e, i) => ({ ...e, i }))
    .sort((a, b) => a.tick - b.tick || ((a.bytes[0] & 0xf0) === 0x80 ? -1 : 0) - ((b.bytes[0] & 0xf0) === 0x80 ? -1 : 0) || a.i - b.i);

  const body = [];
  let previous = 0;
  for (const e of ordered) {
    body.push(...varLength(e.tick - previous), ...e.bytes);
    previous = e.tick;
  }
  body.push(0, 0xff, 0x2f, 0x00);

  const header = Buffer.alloc(22);
  header.write('MThd', 0);
  header.writeUInt32BE(6, 4);
  header.writeUInt16BE(0, 8); // format 0: one track
  header.writeUInt16BE(1, 10);
  header.writeUInt16BE(TICKS, 12);
  header.write('MTrk', 14);
  header.writeUInt32BE(body.length, 18);
  return Buffer.concat([header, Buffer.from(body)]);
}

// Trims to length, takes a little brightness off and sets a steady level.
// Sampled instruments can start a moment late, so anything before the first
// sound is cut to keep the first note on the first frame.
async function finish(raw, out, seconds) {
  const probe = spawnSync(FFMPEG, ['-hide_banner', '-i', raw, '-af', 'silencedetect=noise=-55dB:d=0.01', '-f', 'null', '-'], { encoding: 'utf8' });
  const lead = /silence_start: 0(?:\.0+)?\b[\s\S]*?silence_end: ([\d.]+)/.exec(probe.stderr || '');
  const start = lead ? Math.max(0, Number(lead[1]) - 0.01) : 0;
  await ffmpeg([
    '-i', raw,
    '-af', `atrim=start=${start.toFixed(3)},asetpts=PTS-STARTPTS,atrim=0:${seconds.toFixed(3)},highpass=f=35,lowpass=f=9000,loudnorm=I=-17:TP=-1.5:LRA=11,aresample=48000`,
    '-c:a', 'pcm_s16le', out,
  ]);
  await rm(raw, { force: true });
}

async function withMuseScore(out, seconds, bpm) {
  const app = MUSESCORE.find((file) => existsSync(file));
  if (!app) return null;
  const score = out.replace(/\.wav$/, '.musicxml');
  const raw = out.replace(/\.wav$/, '.raw.wav');
  await writeFile(score, musicXml(seconds, bpm));
  await run(app, ['-o', raw, score]);
  await rm(score, { force: true });
  await finish(raw, out, seconds);
  return 'piano and strings, played by MuseScore';
}

async function withFluidSynth(out, seconds, bpm) {
  const soundfont = SOUNDFONTS.find((file) => existsSync(file));
  if (!soundfont || spawnSync(FLUIDSYNTH, ['--version']).error) return null;
  const midi = out.replace(/\.wav$/, '.mid');
  const raw = out.replace(/\.wav$/, '.raw.wav');
  await writeFile(midi, midiFile(arrange(seconds, bpm), bpm));
  await run(FLUIDSYNTH, [
    '-ni', '-q', '-F', raw, '-r', '48000', '-g', '0.8',
    '-o', 'synth.reverb.active=1', '-o', 'synth.reverb.room-size=0.82', '-o', 'synth.reverb.damp=0.35',
    '-o', 'synth.reverb.width=0.9', '-o', 'synth.reverb.level=0.75',
    '-o', 'synth.chorus.active=0',
    soundfont, midi,
  ]);
  await rm(midi, { force: true });
  await finish(raw, out, seconds);
  return `piano and strings, played by FluidSynth with ${soundfont.split('/').pop()}`;
}

async function withSynth(out, seconds, bpm) {
  await writeFile(out, composeTrack(seconds, bpm));
  return 'synthesised tones (install MuseScore or FluidSynth for recorded instruments)';
}

const ENGINES = { musescore: withMuseScore, fluidsynth: withFluidSynth, synth: withSynth };

// Writes the track to `out` (a .wav) and returns a line describing how it
// was made.
export async function writeMusic(out, seconds, bpm = 72) {
  const forced = process.env.MUSIC_ENGINE;
  if (forced && !ENGINES[forced]) throw new Error(`MUSIC_ENGINE must be one of ${Object.keys(ENGINES).join(', ')}`);
  for (const [name, engine] of Object.entries(ENGINES)) {
    if (forced && forced !== name) continue;
    try {
      const made = await engine(out, seconds, bpm);
      if (made) return made;
    } catch (error) {
      if (forced) throw error;
      console.warn(`  ${name} failed (${error.message.split('\n')[0]}), trying the next option`);
    }
  }
  throw new Error(`Music engine "${forced}" is not available on this machine`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const seconds = Number(process.argv[2] ?? 36);
  const bpm = Number(process.argv[3] ?? 72);
  const out = process.argv[4] ?? 'out/music.wav';
  console.log(`Wrote ${out}: ${await writeMusic(out, seconds, bpm)}`);
}
