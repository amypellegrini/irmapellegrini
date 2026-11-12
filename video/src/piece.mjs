// The notes of the backing track, shared by every way of playing it.
//
// D major, four beats to the bar, pitches as MIDI numbers (60 = middle C).
// `left` is the broken chord the left hand plays in quavers, `strings` the
// held chord, `melody` is a list of [beat, pitch, length in beats] that
// fills the bar.

const D = { left: [38, 45, 50, 54, 57, 54, 50, 45], strings: [50, 57, 62, 66] };
const A = { left: [37, 45, 52, 57, 61, 57, 52, 45], strings: [49, 57, 61, 64] };
const Bm = { left: [35, 42, 47, 50, 54, 50, 47, 42], strings: [47, 54, 59, 62] };
const G = { left: [31, 38, 43, 47, 50, 47, 43, 38], strings: [43, 50, 59, 62] };

export const BARS = [
  { ...D, melody: [[2, 66, 2]] },
  { ...A, melody: [[0, 64, 4]] },
  { ...Bm, melody: [[0, 62, 2], [2, 66, 2]] },
  { ...G, melody: [[0, 67, 3], [3, 66, 1]] },
  { ...D, melody: [[0, 69, 2], [2, 66, 1], [3, 64, 1]] },
  { ...A, melody: [[0, 64, 2], [2, 69, 2]] },
  { ...Bm, melody: [[0, 71, 2], [2, 69, 1], [3, 66, 1]] },
  { ...G, melody: [[0, 67, 2], [2, 71, 2]] },
  { ...Bm, melody: [[0, 74, 2], [2, 71, 1], [3, 69, 1]] },
  { ...G, melody: [[0, 67, 2], [2, 64, 2]] },
];

// The last bar always lands on a held D major chord.
export const ENDING = { left: [38, 45, 50], strings: [50, 57, 62, 66], chord: [57, 62, 66] };

// Strings stay out for the first two bars.
export const STRINGS_ENTER_AT_BAR = 2;

export const barCount = (seconds, bpm) => Math.max(3, Math.ceil((seconds * bpm) / 60 / 4));
