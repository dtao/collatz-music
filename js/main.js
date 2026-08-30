/* UI wiring, transport, and the note scheduler. */
(() => {
  const startInput = document.getElementById('start-number');
  const keySelect = document.getElementById('key-select');
  const progSelect = document.getElementById('progression-select');
  const bpmInput = document.getElementById('bpm');
  const bpmValue = document.getElementById('bpm-value');
  const playButton = document.getElementById('play-button');
  const hudNumber = document.getElementById('hud-number');
  const hudStep = document.getElementById('hud-step');
  const hudChord = document.getElementById('hud-chord');
  const hudNote = document.getElementById('hud-note');

  const LOOKAHEAD_S = 0.15;
  const SCHEDULER_INTERVAL_MS = 30;

  const piece = {
    seq: Collatz.sequence(27),
    keyRoot: 0,
    progression: Theory.PROGRESSIONS[0],
    pitchOf: null, // step → snapped MIDI, built on play
  };

  const transport = {
    playing: false,
    startTime: 0,        // AudioContext time of beat 0
    secondsPerBeat: 0.6,
    nextBeatToSchedule: 0,
    lastLandedBeat: -1,
    schedulerTimer: null,
  };

  // ---- UI setup ----

  Theory.NOTE_NAMES.forEach((name, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = name;
    keySelect.appendChild(opt);
  });

  Theory.PROGRESSIONS.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    progSelect.appendChild(opt);
  });

  bpmInput.addEventListener('input', () => {
    bpmValue.textContent = bpmInput.value;
    if (transport.playing) {
      // Re-anchor beat 0 so the current beat position is preserved at the new tempo.
      const now = AudioEngine.now();
      const beatFloat = (now - transport.startTime) / transport.secondsPerBeat;
      transport.secondsPerBeat = 60 / Number(bpmInput.value);
      transport.startTime = now - beatFloat * transport.secondsPerBeat;
      AudioEngine.setDelayTime(transport.secondsPerBeat);
    }
  });

  function rebuildSequence() {
    const n = Math.max(1, Math.min(999999, Math.floor(Number(startInput.value) || 27)));
    startInput.value = n;
    piece.seq = Collatz.sequence(n);
    Viz.reset();
  }

  startInput.addEventListener('change', () => {
    if (transport.playing) stop();
    rebuildSequence();
  });

  playButton.addEventListener('click', () => {
    if (transport.playing) stop();
    else play();
  });

  // ---- Pitch assignment ----

  function chordAtBeat(beat) {
    const bar = Math.floor(beat / Theory.BEATS_PER_BAR) % piece.progression.chords.length;
    return piece.progression.chords[bar];
  }

  function buildPitchMapper() {
    const maxValue = Math.max(...piece.seq);
    const rawPitch = Theory.makePitchMapper(maxValue);
    const poolCache = new Map();
    piece.pitchOf = beat => {
      const chord = chordAtBeat(beat);
      let pool = poolCache.get(chord);
      if (!pool) {
        pool = Theory.chordPool(piece.keyRoot, chord);
        poolCache.set(chord, pool);
      }
      const value = Collatz.valueAt(piece.seq, beat);
      return Theory.snapToPool(rawPitch(value), pool);
    };
  }

  // ---- Transport ----

  function play() {
    AudioEngine.resume();
    rebuildSequence();
    piece.keyRoot = Number(keySelect.value);
    piece.progression = Theory.PROGRESSIONS.find(p => p.id === progSelect.value);
    buildPitchMapper();

    transport.secondsPerBeat = 60 / Number(bpmInput.value);
    AudioEngine.setDelayTime(transport.secondsPerBeat);
    transport.startTime = AudioEngine.now() + 0.1;
    transport.nextBeatToSchedule = 0;
    transport.lastLandedBeat = -1;
    transport.playing = true;

    transport.schedulerTimer = setInterval(scheduleAhead, SCHEDULER_INTERVAL_MS);
    scheduleAhead();

    playButton.textContent = 'Stop';
    playButton.classList.add('playing');
  }

  function stop() {
    transport.playing = false;
    clearInterval(transport.schedulerTimer);
    playButton.textContent = 'Play';
    playButton.classList.remove('playing');
    hudChord.textContent = '–';
    hudNote.textContent = '–';
  }

  function scheduleAhead() {
    const horizon = AudioEngine.now() + LOOKAHEAD_S;
    while (transport.startTime + transport.nextBeatToSchedule * transport.secondsPerBeat < horizon) {
      const beat = transport.nextBeatToSchedule;
      const time = transport.startTime + beat * transport.secondsPerBeat;
      const spb = transport.secondsPerBeat;
      const downbeat = beat % Theory.BEATS_PER_BAR === 0;

      AudioEngine.playNote(piece.pitchOf(beat), time, spb * 0.95, downbeat ? 0.95 : 0.75);
      if (downbeat) {
        const chord = chordAtBeat(beat);
        AudioEngine.playBass(Theory.chordRootMidi(piece.keyRoot, chord), time, spb * Theory.BEATS_PER_BAR * 0.98);
      }
      transport.nextBeatToSchedule++;
    }
  }

  // ---- Frame loop ----

  function beatFloatNow() {
    return (AudioEngine.now() - transport.startTime) / transport.secondsPerBeat;
  }

  function updateHud(beat) {
    const value = Collatz.valueAt(piece.seq, beat);
    hudNumber.textContent = value;
    hudStep.textContent = beat;
    const chord = chordAtBeat(beat);
    hudChord.textContent = `${Theory.chordName(piece.keyRoot, chord)} (${chord.numeral})`;
    hudNote.textContent = Theory.midiToName(piece.pitchOf(beat));
  }

  function frame() {
    let beatFloat = 0;
    if (transport.playing) {
      beatFloat = Math.max(0, beatFloatNow());
      const landed = Math.floor(beatFloat);
      // Register every landing since the last frame (usually just one).
      while (transport.lastLandedBeat < landed) {
        transport.lastLandedBeat++;
        const v = Collatz.valueAt(piece.seq, transport.lastLandedBeat);
        Viz.registerHit(v);
        updateHud(transport.lastLandedBeat);
      }
    } else {
      hudNumber.textContent = piece.seq[0];
      hudStep.textContent = '–';
    }

    Viz.draw({
      playing: transport.playing,
      beatFloat,
      seq: piece.seq,
      getValue: k => Collatz.valueAt(piece.seq, k),
    });

    requestAnimationFrame(frame);
  }

  // ---- Boot ----

  Viz.attach(document.getElementById('viz'));
  rebuildSequence();
  requestAnimationFrame(frame);
})();
