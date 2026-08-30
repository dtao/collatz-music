/* Keys, chord progressions, and the number→pitch mapping. */
const Theory = (() => {
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const QUALITIES = {
    maj: [0, 4, 7],
    min: [0, 3, 7],
  };

  /* Each progression is 4 bars; deg = semitones above the key root. */
  const PROGRESSIONS = [
    {
      id: 'axis',
      name: 'I – V – vi – IV',
      chords: [
        { deg: 0, quality: 'maj', numeral: 'I' },
        { deg: 7, quality: 'maj', numeral: 'V' },
        { deg: 9, quality: 'min', numeral: 'vi' },
        { deg: 5, quality: 'maj', numeral: 'IV' },
      ],
    },
    {
      id: 'fifties',
      name: 'I – vi – IV – V',
      chords: [
        { deg: 0, quality: 'maj', numeral: 'I' },
        { deg: 9, quality: 'min', numeral: 'vi' },
        { deg: 5, quality: 'maj', numeral: 'IV' },
        { deg: 7, quality: 'maj', numeral: 'V' },
      ],
    },
    {
      id: 'minor-pop',
      name: 'i – VI – III – VII (minor)',
      chords: [
        { deg: 0, quality: 'min', numeral: 'i' },
        { deg: 8, quality: 'maj', numeral: 'VI' },
        { deg: 3, quality: 'maj', numeral: 'III' },
        { deg: 10, quality: 'maj', numeral: 'VII' },
      ],
    },
    {
      id: 'andalusian',
      name: 'i – VII – VI – V (Andalusian)',
      chords: [
        { deg: 0, quality: 'min', numeral: 'i' },
        { deg: 10, quality: 'maj', numeral: 'VII' },
        { deg: 8, quality: 'maj', numeral: 'VI' },
        { deg: 7, quality: 'maj', numeral: 'V' },
      ],
    },
  ];

  const BEATS_PER_BAR = 4;
  const PITCH_FLOOR = 36;   // C2
  const PITCH_CEIL = 93;    // A6

  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  function midiToName(m) {
    return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
  }

  function chordName(keyRoot, chord) {
    const root = NOTE_NAMES[(keyRoot + chord.deg) % 12];
    return chord.quality === 'min' ? root + 'm' : root;
  }

  /* All MIDI notes in [PITCH_FLOOR, PITCH_CEIL] whose pitch class is a chord tone. */
  function chordPool(keyRoot, chord) {
    const pcs = QUALITIES[chord.quality].map(iv => (keyRoot + chord.deg + iv) % 12);
    const pool = [];
    for (let m = PITCH_FLOOR; m <= PITCH_CEIL; m++) {
      if (pcs.includes(m % 12)) pool.push(m);
    }
    return pool;
  }

  function chordRootMidi(keyRoot, chord) {
    const pc = (keyRoot + chord.deg) % 12;
    return 24 + pc; // C1..B1, an octave below the melody floor
  }

  /*
   * Magnitude → pitch: log2(n) scaled so a halving step descends by a fixed
   * interval (at most an octave), anchored at PITCH_FLOOR for n = 1 and
   * capped so the sequence's peak stays at or below PITCH_CEIL.
   */
  function makePitchMapper(maxValue) {
    const log2max = Math.max(1, Math.log2(maxValue));
    const semisPerDoubling = Math.min(12, (PITCH_CEIL - PITCH_FLOOR) / log2max);
    return n => PITCH_FLOOR + Math.log2(n) * semisPerDoubling;
  }

  /* Snap a fractional MIDI target to the nearest note in the pool (ties go low). */
  function snapToPool(target, pool) {
    let best = pool[0];
    let bestDist = Math.abs(pool[0] - target);
    for (let i = 1; i < pool.length; i++) {
      const d = Math.abs(pool[i] - target);
      if (d < bestDist) {
        best = pool[i];
        bestDist = d;
      }
    }
    return best;
  }

  return {
    NOTE_NAMES, PROGRESSIONS, BEATS_PER_BAR,
    midiToFreq, midiToName, chordName, chordPool, chordRootMidi,
    makePitchMapper, snapToPool,
  };
})();
