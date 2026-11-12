// Writes the piece as a MusicXML score (piano on two staves plus a string
// section) for MuseScore to play. Dynamics and pedal marks are part of the
// score because Muse Sounds perform from the notation.

import { BARS, ENDING, STRINGS_ENTER_AT_BAR, barCount } from './piece.mjs';

const DIVISIONS = 2; // per beat, so a quaver is 1
const TYPES = { 1: ['eighth', 0], 2: ['quarter', 0], 4: ['half', 0], 6: ['half', 1], 8: ['whole', 0] };
// Spellings for D major.
const SPELL = { 0: ['C', 0], 1: ['C', 1], 2: ['D', 0], 3: ['D', 1], 4: ['E', 0], 5: ['F', 0], 6: ['F', 1], 7: ['G', 0], 8: ['G', 1], 9: ['A', 0], 10: ['A', 1], 11: ['B', 0] };

function pitchXml(midi) {
  const [step, alter] = SPELL[midi % 12];
  return `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${Math.floor(midi / 12) - 1}</octave></pitch>`;
}

function shape(duration) {
  const [type, dots] = TYPES[duration];
  return `<type>${type}</type>${'<dot/>'.repeat(dots)}`;
}

// One or more pitches sounding together; an empty list is a rest.
function chord(pitches, duration, { voice = 1, staff, arpeggio = false } = {}) {
  const tail = `<duration>${duration}</duration><voice>${voice}</voice>${shape(duration)}${staff ? `<staff>${staff}</staff>` : ''}`;
  if (pitches.length === 0) return `<note><rest/>${tail}</note>`;
  const marks = arpeggio ? '<notations><arpeggiate/></notations>' : '';
  return pitches.map((p, i) => `<note>${i ? '<chord/>' : ''}${pitchXml(p)}${tail}${marks}</note>`).join('');
}

const dynamic = (mark, staff) =>
  `<direction placement="below"><direction-type><dynamics><${mark}/></dynamics></direction-type>${staff ? `<staff>${staff}</staff>` : ''}</direction>`;
const pedal = (type) =>
  `<direction placement="below"><direction-type><pedal type="${type}" line="yes"/></direction-type><staff>2</staff></direction>`;

// The piano carries the piece; the strings stay well underneath it.
function pianoDynamic(bar, bars) {
  if (bar === 0) return 'mp';
  if (bar === Math.floor(bars * 0.4)) return 'mf';
  if (bar === Math.floor(bars * 0.75)) return 'mp';
  return null;
}

function stringsDynamic(bar, bars) {
  if (bar === STRINGS_ENTER_AT_BAR) return 'ppp';
  if (bar === bars - 1) return 'pp'; // a little more under the last chord
  return null;
}

export function musicXml(seconds, bpm) {
  const bars = barCount(seconds, bpm);
  const piano = [];
  const strings = [];

  for (let b = 0; b < bars; b++) {
    const last = b === bars - 1;
    const bar = last ? ENDING : BARS[b % BARS.length];
    const first = b === 0;

    // --- piano ---
    let p = '';
    if (first) {
      p +=
        `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>2</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>` +
        `<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>` +
        `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`;
    }
    const mark = pianoDynamic(b, bars);
    if (mark) p += dynamic(mark, 1);
    p += pedal(first ? 'start' : 'change');

    if (last) {
      p += chord(bar.chord, 8, { staff: 1, arpeggio: true });
      p += `<backup><duration>8</duration></backup>`;
      p += chord(bar.left, 8, { voice: 2, staff: 2, arpeggio: true });
      p += pedal('stop');
    } else {
      let beat = 0;
      for (const [at, pitch, length] of bar.melody) {
        if (at > beat) p += chord([], (at - beat) * DIVISIONS, { staff: 1 });
        p += chord([pitch], length * DIVISIONS, { staff: 1 });
        beat = at + length;
      }
      if (beat < 4) p += chord([], (4 - beat) * DIVISIONS, { staff: 1 });
      p += `<backup><duration>8</duration></backup>`;
      for (const pitch of bar.left) p += chord([pitch], 1, { voice: 2, staff: 2 });
    }
    piano.push(`<measure number="${b + 1}">${p}</measure>`);

    // --- strings ---
    let s = '';
    if (first) {
      s += `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>2</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes>`;
    }
    if (b < STRINGS_ENTER_AT_BAR) {
      s += chord([], 8);
    } else {
      const quiet = stringsDynamic(b, bars);
      if (quiet) s += dynamic(quiet);
      // Three voices are enough under a piano; the top note is left to it.
      s += chord(bar.strings.slice(0, 3), 8);
    }
    strings.push(`<measure number="${b + 1}">${s}</measure>`);
  }

  const part = (id, name, sound) =>
    `<score-part id="${id}"><part-name>${name}</part-name><score-instrument id="${id}-I1"><instrument-name>${name}</instrument-name><instrument-sound>${sound}</instrument-sound></score-instrument></score-part>`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<score-partwise version="4.0"><work><work-title>Leaves</work-title></work>` +
    `<part-list>${part('P1', 'Piano', 'keyboard.piano')}${part('P2', 'Strings', 'strings.group')}</part-list>` +
    `<part id="P1">${piano.join('')}</part><part id="P2">${strings.join('')}</part></score-partwise>\n`
  );
}
