// Fallback backing track, used when FluidSynth or a soundfont is missing.
// Everything is synthesised from sine waves: a soft pad, a piano-like
// arpeggio and a few high notes over D - A/C# - Bm7 - Gmaj7, with a simple
// reverb. It is in time with the cuts but sounds plainly electronic; see
// music.mjs for the sampled version.

const RATE = 44100;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// Small seeded generator so every render gets the same "performance".
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

const CHORDS = [
  { bass: 38, pad: [50, 57, 62, 66], arp: [62, 66, 69, 74, 76] }, // D add9
  { bass: 37, pad: [49, 57, 61, 64], arp: [61, 64, 69, 73, 76] }, // A / C#
  { bass: 35, pad: [47, 54, 57, 62], arp: [59, 62, 66, 69, 74] }, // Bm7
  { bass: 31, pad: [43, 50, 54, 59], arp: [59, 62, 66, 71, 74] }, // Gmaj7
];
const ARP_PATTERN = [0, 2, 1, 3, 2, 4, 3, 1];
const MELODY = [78, 76, 74, 81, 78, 76, 74, 69]; // one note per bar, D major

function addPiano(L, R, start, midi, velocity, pan) {
  const f = hz(midi);
  const length = Math.floor(RATE * 3.2);
  const i0 = Math.floor(start * RATE);
  const gl = Math.cos((pan * Math.PI) / 2);
  const gr = Math.sin((pan * Math.PI) / 2);
  for (let i = 0; i < length && i0 + i < L.length; i++) {
    const t = i / RATE;
    const attack = Math.min(1, t / 0.006);
    let v = 0;
    for (let n = 1; n <= 6; n++) {
      const fn = f * n * (1 + 0.0004 * n * n);
      if (fn > 9000) break;
      v += (Math.sin(2 * Math.PI * fn * t) / n ** 1.7) * Math.exp(-t * (1.1 + 0.9 * n));
    }
    v *= attack * velocity;
    L[i0 + i] += v * gl;
    R[i0 + i] += v * gr;
  }
}

function addPad(L, R, start, seconds, midi, level) {
  const f = hz(midi);
  const attack = 1.4;
  const release = 2.2;
  const length = Math.floor(RATE * (seconds + release));
  const i0 = Math.floor(start * RATE);
  for (let i = 0; i < length && i0 + i < L.length; i++) {
    if (i0 + i < 0) continue;
    const t = i / RATE;
    const env = t < seconds ? Math.min(1, t / attack) : Math.max(0, 1 - (t - seconds) / release);
    const shaped = env * env * (3 - 2 * env);
    const a = Math.sin(2 * Math.PI * f * 0.9985 * t) + 0.18 * Math.sin(2 * Math.PI * f * 2 * t);
    const b = Math.sin(2 * Math.PI * f * 1.0015 * t) + 0.18 * Math.sin(2 * Math.PI * f * 2.003 * t);
    L[i0 + i] += a * shaped * level;
    R[i0 + i] += b * shaped * level;
  }
}

// Schroeder reverb: four comb filters into two all-pass filters.
function reverb(x, offset) {
  const out = new Float32Array(x.length);
  for (const [ms, feedback] of [[29.7, 0.86], [37.1, 0.84], [41.1, 0.83], [43.7, 0.82]]) {
    const d = Math.floor(((ms + offset) / 1000) * RATE);
    const buf = new Float32Array(d);
    let lp = 0;
    for (let i = 0, p = 0; i < x.length; i++, p = (p + 1) % d) {
      const y = buf[p];
      lp = y * 0.6 + lp * 0.4; // damp the tail
      buf[p] = x[i] + lp * feedback;
      out[i] += y * 0.25;
    }
  }
  for (const ms of [5, 1.7]) {
    const d = Math.floor((ms / 1000) * RATE);
    const buf = new Float32Array(d);
    for (let i = 0, p = 0; i < out.length; i++, p = (p + 1) % d) {
      const b = buf[p];
      const y = -0.7 * out[i] + b;
      buf[p] = out[i] + 0.7 * y;
      out[i] = y;
    }
  }
  return out;
}

export function composeTrack(seconds, bpm = 72) {
  const total = Math.ceil(seconds * RATE);
  const L = new Float32Array(total);
  const R = new Float32Array(total);
  const beat = 60 / bpm;
  const bar = beat * 4;
  const bars = Math.ceil(seconds / bar);
  const random = rng(1987);

  for (let b = 0; b < bars; b++) {
    const last = b === bars - 1;
    const chord = last ? CHORDS[0] : CHORDS[b % 4];
    const t0 = b * bar;

    for (const note of chord.pad) addPad(L, R, t0 - 0.3, bar, note, 0.035);
    addPad(L, R, t0 - 0.2, bar, chord.bass, 0.11);

    // Arpeggio in quavers; it thins out for the first bar and the ending.
    for (let step = 0; step < 8; step++) {
      if (b === 0 && step % 2 === 1) continue;
      if (last && step > 4) continue;
      if (random() < 0.12) continue;
      const note = chord.arp[ARP_PATTERN[step]];
      const time = t0 + (step * beat) / 2 + (random() - 0.5) * 0.012;
      const accent = step % 4 === 0 ? 1 : 0.72;
      addPiano(L, R, time, note, 0.2 * accent * (0.85 + random() * 0.3), 0.35 + random() * 0.3);
    }

    if (b > 0) addPiano(L, R, t0 + beat * (b % 2 ? 2 : 0), MELODY[b % MELODY.length], 0.16, b % 2 ? 0.3 : 0.7);
  }

  const wetL = reverb(L, 0);
  const wetR = reverb(R, 1.3);
  let peak = 0;
  for (let i = 0; i < total; i++) {
    const t = i / RATE;
    const fade = Math.min(1, t / 0.4) * Math.min(1, Math.max(0, (seconds - t) / 3));
    L[i] = (L[i] * 0.75 + wetL[i] * 0.55) * fade;
    R[i] = (R[i] * 0.75 + wetR[i] * 0.55) * fade;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const gain = 0.7 / (peak || 1);

  const header = Buffer.alloc(44);
  const bytes = total * 4;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + bytes, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(bytes, 40);
  const pcm = Buffer.alloc(bytes);
  for (let i = 0; i < total; i++) {
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain)) * 32767), i * 4);
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain)) * 32767), i * 4 + 2);
  }
  return Buffer.concat([header, pcm]);
}
