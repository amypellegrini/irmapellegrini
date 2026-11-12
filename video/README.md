# Instagram reel

Renders a short vertical video (1080x1920, about 36 seconds) from the images
on this site and the phone footage of Irma collecting leaves. The whole edit
lives in one file, `timeline.mjs`, so changing a shot or a caption is a text
edit followed by a re-render.

## Requirements

- Node 18 or newer
- ffmpeg on the PATH (`brew install ffmpeg`), or point `FFMPEG_PATH` and
  `FFPROBE_PATH` at a build
- For recorded-instrument music: MuseScore, ideally with Muse Sounds (see
  Music below)

## Rendering

```sh
cd video
npm install
npm run preview   # half size, a few seconds: out/irma-leaves-reel-preview.mp4
npm run sheet     # preview plus a contact sheet, one frame per second
npm run render    # full quality: out/irma-leaves-reel.mp4
```

Upload `out/irma-leaves-reel.mp4` to Instagram as a reel.

## Footage

The phone clips are too large for git, so `video/footage/` is ignored. Copy
the clips in with the names the timeline uses (`20261025_134821.mp4` and so
on). Images come straight from `files/gimgs/` and `assets/site/img/`.

The phone records HDR. The renderer converts it to standard range, using
VideoToolbox on a Mac and a plain colour conversion elsewhere.

## Editing the reel

Open `timeline.mjs`. The comment at the top lists every option.

- **Timing** is in beats. At 72 bpm one beat is 25 frames, so every cut lands
  on the music. Change `beats` on a scene to lengthen or shorten it.
- **Clips** take a start time (`in`, seconds) and a `focus` from 0 to 1 that
  slides the vertical crop across the landscape frame.
- **Stills** move so they never sit frozen: `move: 'in'` or `'out'` is a slow
  zoom over a blurred copy of the picture, `'left'`, `'right'`, `'up'` and
  `'down'` pan across it.
- **Captions** are on their own track with a start beat and a length, so one
  line can stay up across several shots. They sit in the middle of the
  lower third; set `y` on a caption to move it.

Rendered scenes are cached in `.cache/`, so after an edit only the scenes
that changed are rendered again.

## Music

The backing track is a short piano piece with quiet strings (D major, 72
bpm). The notes are in `src/piece.mjs`; `src/music.mjs` gets them played by
the best instrument on the machine:

1. **MuseScore** (`/Applications/MuseScore 4.app`). The piece is written out
   as a score and MuseScore plays it. With Muse Sounds installed from Muse
   Hub and set as the default playback profile, that means recorded
   instruments performing from the notation.
2. **FluidSynth** (`brew install fluid-synth`) with MuseScore's basic
   soundfont, or any General MIDI soundfont named in `SOUNDFONT`.
3. A plain synthesised track from `src/synth.mjs`, which needs nothing
   installed.

Set `MUSIC_ENGINE` to `musescore`, `fluidsynth` or `synth` to force one.
`npm run music` writes just the track to `out/music.wav`. Nothing is licensed
from anyone and the tempo always matches the cuts.

To use another track, set `music` in the timeline to a file path relative to
`video/` and set `bpm` to that track's tempo. You can also mute the track in
Instagram and pick one from its library.

## Layout

```
timeline.mjs      the edit: scenes, captions, tempo
src/render.mjs    runs the steps and joins the result
src/scenes.mjs    turns one clip or still into a scene
src/captions.mjs  draws caption images
src/music.mjs     writes the backing track
src/ffmpeg.mjs    runs ffmpeg and ffprobe
```
