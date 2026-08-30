# Collatz Music

A hybrid visualization / musical experiment built on the Collatz Conjecture.

Pick one or more starting numbers (up to 4 balls), a key, a chord
progression, and a BPM, then press **Play**. Each ball bounces along a
number line following its number's Collatz trajectory (halve if even,
3n + 1 if odd). Each ball has its own voice (Pluck, Bell, Square, or Airy)
and its own note duration — quarter, eighth, or dotted eighth — so two
balls at different durations phase against each other polyrhythmically.
Each landing plays a note: the number's magnitude sets a raw pitch
(log-scaled, so halving steps descend by a fixed interval), which is then
snapped to the nearest chord tone of the current bar's chord — so the melody
literally traces the rise and fall of the sequence while always staying
harmonic.

- Progressions are 4 bars long (one chord per bar) and cycle indefinitely,
  with chord-tone pools spanning multiple octaves. The harmony clock is
  global: all balls snap to the current bar's chord, whatever their rate.
- The number line is linear; the camera pans and zooms to keep every ball
  in frame through the sequences' wild spikes (try 27, which climbs to
  9,232). One pitch mapping is shared across balls, so relative height on
  the line matches relative pitch.
- When a trajectory reaches 1, it rides the famous 4 → 2 → 1 loop as a
  low ostinato until you press Stop.
- A soft bass note grounds each bar on the chord root.

## Running

No build step. Serve the directory with any static file server and open it
in a browser:

```sh
python3 -m http.server
# then visit http://localhost:8000
```

(Opening `index.html` directly from the filesystem also works.)

Browsers cache the CSS and JS aggressively, and a page that loads a stale
mix of files can fail to start. Assets are requested with a `?v=N` query
string to prevent that — **bump the number on every `<script>` and `<link>`
tag in `index.html` whenever you change a JS or CSS file**. If the app ever
does fail to boot it now says so in a red banner at the bottom of the page
rather than leaving dead controls, and a force-reload
(Cmd/Ctrl + Shift + R) clears it.

## Code layout

| File | Purpose |
| --- | --- |
| `js/collatz.js` | Collatz sequence generation and the terminal 4→2→1 cycle |
| `js/theory.js` | Keys, progressions, chord-tone pools, number→pitch mapping |
| `js/audio.js` | Web Audio synthesis (lead voice, bass, feedback delay) |
| `js/viz.js` | Canvas rendering: number line, camera follow, bouncing ball |
| `js/main.js` | UI wiring, transport, and the lookahead note scheduler |

## Roadmap

- Dropping balls mid-playback (live performance mode)
- User-definable chord progressions and key sequences
- Alternative pitch mappings (modulo into chord pool, scale-degree based)
