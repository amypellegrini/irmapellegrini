// The edit. Everything is timed in beats so cuts land on the music.
// At 72 bpm one beat is exactly 25 frames at 30 fps.
//
// Scene types
//   clip  - phone footage from video/footage. `in` is the start time in
//           seconds, `focus` is where the 9:16 crop sits across the landscape
//           frame (0 = left edge, 1 = right edge). `speed: 0.5` is half
//           speed. `widen: 1.6` shows 1.6 times the width of a straight
//           crop, over a blurred copy of the shot.
//   still - an image from the website (path relative to the repo root).
//           move: 'in' | 'out'  slow zoom on the whole picture over a blurred
//                               copy of itself
//           move: 'left' | 'right' | 'up' | 'down'  pan across the picture,
//                               which fills the frame
// `fade` (seconds) cross-fades into the scene; without it the scene cuts in.
//
// Captions sit on their own track: `at` and `beats` are in beats from the
// start of the reel, so one caption can run across several scenes.

export default {
  name: 'irma-leaves-reel',
  width: 1080,
  height: 1920,
  fps: 30,
  bpm: 72,

  // 'generated' builds the piano backing track in src/music.mjs.
  // Put a path here (relative to video/) to use a track of your own.
  music: 'generated',

  scenes: [
    // Collecting
    { type: 'clip', src: '20261025_134821.mp4', in: 4.0, beats: 3, focus: 0.36 },
    { type: 'clip', src: '20261025_134302.mp4', in: 0.1, beats: 3, focus: 0.55 },
    { type: 'clip', src: '20261025_134802.mp4', in: 4.6, beats: 3, focus: 0.56 },
    { type: 'clip', src: '20261025_135008.mp4', in: 5.0, beats: 2, focus: 0.47 },
    { type: 'clip', src: '20261025_135035.mp4', in: 0.0, beats: 2, focus: 0.56, widen: 1.6, speed: 0.5 },
    { type: 'clip', src: '20261025_135035.mp4', in: 8.4, beats: 3, focus: 0.47 },

    // Who she is: the early wood carvings
    { type: 'still', src: 'files/gimgs/9_archive002.jpg', beats: 2, move: 'in', fade: 0.3 },
    { type: 'still', src: 'files/gimgs/9_archive007.jpg', beats: 2, move: 'out', fade: 0.3 },
    { type: 'still', src: 'files/gimgs/9_archive008.jpg', beats: 2, move: 'in', fade: 0.3 },

    // The leaves series
    { type: 'still', src: 'files/gimgs/1_irmabricklane-2.jpg', beats: 3, move: 'right', from: 0.25, to: 0.6, fade: 0.3 },
    { type: 'still', src: 'files/gimgs/13_hojitas1.jpg', beats: 2, move: 'in', fade: 0.3 },
    { type: 'still', src: 'files/gimgs/13_hojitas3.jpg', beats: 2, move: 'out', fade: 0.3 },
    { type: 'still', src: 'files/gimgs/17_14hojas5.jpg', beats: 2, move: 'in', fade: 0.3 },

    // The wall of leaves
    { type: 'still', src: 'files/gimgs/26_1irma004.jpg', beats: 2, move: 'out', fade: 0.3 },
    { type: 'still', src: 'files/gimgs/26_1irma002.jpg', beats: 2, move: 'left', fade: 0.3 },

    // Back out for more
    { type: 'clip', src: '20261025_135207.mp4', in: 8.2, beats: 3, focus: 0.42, fade: 0.3 },

    // End card
    {
      type: 'still', src: 'assets/site/img/leaves-wall.png', beats: 5, fade: 0.5,
      move: 'left', background: '#f6f1e7', imageHeight: 900, imageY: 560,
    },
  ],

  captions: [
    { at: 0, beats: 3, text: 'My mum collects fallen leaves.' },
    { at: 3, beats: 3, text: 'From the parks and pavements of London.' },
    { at: 6, beats: 5, text: 'One by one.\nEach chosen by hand.' },
    { at: 11, beats: 2, text: 'A whole bag of autumn.' },
    { at: 13, beats: 3, text: 'This is Irma.' },
    { at: 16, beats: 3, text: 'She has been carving wood since the 1980s.' },
    { at: 19, beats: 3, text: 'First in Argentina. Now in London.' },
    { at: 22, beats: 3, text: 'Then the leaves joined in.' },
    { at: 25, beats: 6, text: 'Little wooden people, holding on to real leaves.' },
    { at: 31, beats: 4, text: 'Every leaf is unique. Like us.' },
    { at: 35, beats: 3, text: 'And every autumn, she goes back for more.' },

    { at: 38.6, beats: 4.4, style: 'title', y: 1150, text: 'The Little Wooden People' },
    { at: 39.2, beats: 3.8, style: 'byline', y: 1360, text: 'by Irma Pellegrini' },
    { at: 39.8, beats: 3.2, style: 'url', y: 1440, text: 'irmapellegrini.co.uk' },
  ],
};
