# Collatz Music

A hybrid visualization / musical experiment built on the Collatz Conjecture.

Pick a starting number, a key, a chord progression, and a BPM, then press
**Play**. A ball bounces along a number line following the number's Collatz
trajectory (halve if even, 3n + 1 if odd), landing on one number per beat.
Each landing plays a note: the number's magnitude sets a raw pitch
(log-scaled, so halving steps descend by a fixed interval), which is then
snapped to the nearest chord tone of the current bar's chord — so the melody
literally traces the rise and fall of the sequence while always staying
harmonic.

- Progressions are 4 bars long (one chord per bar) and cycle indefinitely,
  with chord-tone pools spanning multiple octaves.
- The number line is linear; the camera pans and zooms to follow the ball
  through the sequence's wild spikes (try 27, which climbs to 9,232).
- When the trajectory reaches 1, it rides the famous 4 → 2 → 1 loop as a
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

## Code layout

| File | Purpose |
| --- | --- |
| `js/collatz.js` | Collatz sequence generation and the terminal 4→2→1 cycle |
| `js/theory.js` | Keys, progressions, chord-tone pools, number→pitch mapping |
| `js/audio.js` | Web Audio synthesis (lead voice, bass, feedback delay) |
| `js/viz.js` | Canvas rendering: number line, camera follow, bouncing ball |
| `js/main.js` | UI wiring, transport, and the lookahead note scheduler |

## Roadmap

- Multiple balls droppable on different starting numbers
- User-definable chord progressions and key sequences
- Alternative pitch mappings (modulo into chord pool, scale-degree based)
