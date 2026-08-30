/* UI wiring, transport, and the note scheduler. */
(() => {
  /* A boot failure here would otherwise leave dead controls and no clue why. */
  function reportBootError(err) {
    console.error(err);
    let banner = document.getElementById('boot-error');
    if (!banner) {
      // A stale index.html won't have the placeholder; make one so the failure is still visible.
      banner = document.createElement('div');
      banner.id = 'boot-error';
      document.body.appendChild(banner);
    }
    banner.hidden = false;
    banner.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:10;padding:12px 20px;' +
      'background:#ff5d73;color:#1c0508;font:13px/1.5 system-ui,sans-serif;display:block';
    banner.textContent =
      'Collatz Music failed to start: ' + err.message +
      ' — if you just updated, force-reload the page (Cmd/Ctrl + Shift + R) to clear cached files.';
  }

  try {
    boot();
  } catch (err) {
    reportBootError(err);
  }

  function boot() {
  const ballList = document.getElementById('ball-list');
  const addBallButton = document.getElementById('add-ball');
  const keySelect = document.getElementById('key-select');
  const progSelect = document.getElementById('progression-select');
  const bpmInput = document.getElementById('bpm');
  const bpmValue = document.getElementById('bpm-value');
  const playButton = document.getElementById('play-button');
  const hudChord = document.getElementById('hud-chord');
  const hudBar = document.getElementById('hud-bar');
  const hudBalls = document.getElementById('hud-balls');

  const required = {
    'ball-list': ballList, 'add-ball': addBallButton, 'key-select': keySelect,
    'progression-select': progSelect, 'bpm': bpmInput, 'bpm-value': bpmValue,
    'play-button': playButton, 'hud-chord': hudChord, 'hud-bar': hudBar,
    'hud-balls': hudBalls, 'viz': document.getElementById('viz'),
  };
  const missing = Object.keys(required).filter(id => !required[id]);
  if (missing.length) throw new Error('missing page elements: #' + missing.join(', #'));

  const LOOKAHEAD_S = 0.15;
  const SCHEDULER_INTERVAL_MS = 30;
  const MAX_BALLS = 4;
  const BALL_COLORS = ['#ffb347', '#58c4dd', '#7ee787', '#ff7eb6'];

  const DURATIONS = [
    { id: 'quarter', name: '♩ quarter', beats: 1 },
    { id: 'eighth', name: '♪ eighth', beats: 0.5 },
    { id: 'dotted', name: '♪· dotted 8th', beats: 0.75 },
    { id: 'distance', name: '↔ by distance', beats: null },
  ];

  /*
   * Distance mode: a step's length comes from how far the ball has to travel,
   * so halving ticks by quickly and a 3n+1 leap gets a long note.
   *
   * Jumps span orders of magnitude, so distance is measured in log2 and then
   * stretched across this ladder. The stretch is normalized per trajectory:
   * mapping log2 straight onto the ladder pins everything to the long end
   * once values get big (every jump is absolutely large up there), which
   * flattens the whole point and drags the piece out. Normalizing keeps the
   * full range of note lengths in play at any magnitude.
   */
  const DISTANCE_LADDER = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

  function jumpLog(seq, step) {
    const from = Collatz.valueAt(seq, step);
    const to = Collatz.valueAt(seq, step + 1);
    return Math.log2(1 + Math.abs(to - from));
  }

  /* The log-distance span of a trajectory, including its terminal cycle. */
  function buildDistanceScale(seq) {
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < seq.length + Collatz.TERMINAL_CYCLE.length; k++) {
      const L = jumpLog(seq, k);
      if (L < lo) lo = L;
      if (L > hi) hi = L;
    }
    return { lo, hi };
  }

  function distanceDuration(scale, logDistance) {
    const span = scale.hi - scale.lo;
    // A trajectory with almost no variation (tiny starts) sits mid-ladder.
    const t = span < 0.5 ? 0.5 : (logDistance - scale.lo) / span;
    const index = Math.round(t * (DISTANCE_LADDER.length - 1));
    return DISTANCE_LADDER[Math.min(Math.max(index, 0), DISTANCE_LADDER.length - 1)];
  }

  const piece = {
    keyRoot: 0,
    progression: Theory.PROGRESSIONS[0],
    rawPitch: null, // shared magnitude→pitch mapping, built on play
  };

  let nextBallUid = 1;

  function makeBall(start, voiceId, durationId) {
    return {
      uid: nextBallUid++,
      start,
      voiceId,
      durationId,
      seq: Collatz.sequence(start),
      distanceScale: null, // log-distance span, rebuilt when the trajectory changes
      // Per-play state:
      onsets: [0],     // onsets[k] = beat on which step k lands; grown on demand
      nextStep: 0,
      lastLandedStep: -1,
      currentNote: null,
    };
  }

  const balls = [
    makeBall(27, 'pluck', 'quarter'),
    makeBall(15, 'bell', 'distance'),
  ];

  /* How long step k lasts, in beats. Fixed modes ignore the trajectory. */
  function stepDurationBeats(ball, step) {
    const fixed = DURATIONS.find(d => d.id === ball.durationId).beats;
    if (fixed !== null) return fixed;
    if (!ball.distanceScale) ball.distanceScale = buildDistanceScale(ball.seq);
    return distanceDuration(ball.distanceScale, jumpLog(ball.seq, step));
  }

  /*
   * Beat on which a step lands. Variable durations make this a running sum, so
   * the table is extended lazily and reused by the scheduler, the frame loop,
   * and pitch lookup — all of which walk forward through the same steps.
   */
  function onsetOf(ball, step) {
    while (ball.onsets.length <= step) {
      const last = ball.onsets.length - 1;
      ball.onsets.push(ball.onsets[last] + stepDurationBeats(ball, last));
    }
    return ball.onsets[step];
  }

  const transport = {
    playing: false,
    startTime: 0,        // AudioContext time of beat 0
    secondsPerBeat: 0.6,
    nextBarToSchedule: 0,
    schedulerTimer: null,
  };

  const ballColor = index => BALL_COLORS[index % BALL_COLORS.length];

  // ---- Ball list UI ----

  function renderBallList() {
    ballList.innerHTML = '';
    balls.forEach((ball, index) => {
      const row = document.createElement('div');
      row.className = 'ball-row';

      const swatch = document.createElement('span');
      swatch.className = 'ball-swatch';
      swatch.style.background = ballColor(index);
      row.appendChild(swatch);

      const numInput = document.createElement('input');
      numInput.type = 'number';
      numInput.min = 1;
      numInput.max = 999999;
      numInput.step = 1;
      numInput.value = ball.start;
      numInput.title = 'Start number';
      numInput.addEventListener('change', () => {
        stopIfPlaying();
        ball.start = Math.max(1, Math.min(999999, Math.floor(Number(numInput.value) || 1)));
        numInput.value = ball.start;
        ball.seq = Collatz.sequence(ball.start);
        ball.distanceScale = null;
        Viz.reset();
      });
      row.appendChild(numInput);

      const voiceSelect = document.createElement('select');
      voiceSelect.title = 'Voice';
      for (const [id, voice] of Object.entries(AudioEngine.VOICES)) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = voice.name;
        voiceSelect.appendChild(opt);
      }
      voiceSelect.value = ball.voiceId;
      voiceSelect.addEventListener('change', () => {
        ball.voiceId = voiceSelect.value;
      });
      row.appendChild(voiceSelect);

      const durSelect = document.createElement('select');
      durSelect.title = 'Note duration';
      for (const d of DURATIONS) {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.name;
        durSelect.appendChild(opt);
      }
      durSelect.value = ball.durationId;
      durSelect.addEventListener('change', () => {
        stopIfPlaying();
        ball.durationId = durSelect.value;
      });
      row.appendChild(durSelect);

      const removeButton = document.createElement('button');
      removeButton.className = 'remove-ball';
      removeButton.type = 'button';
      removeButton.textContent = '×';
      removeButton.title = 'Remove ball';
      removeButton.disabled = balls.length <= 1;
      removeButton.addEventListener('click', () => {
        stopIfPlaying();
        balls.splice(index, 1);
        Viz.reset();
        renderBallList();
        renderHudChips();
      });
      row.appendChild(removeButton);

      ballList.appendChild(row);
    });
    addBallButton.hidden = balls.length >= MAX_BALLS;
  }

  addBallButton.addEventListener('click', () => {
    stopIfPlaying();
    const voiceIds = Object.keys(AudioEngine.VOICES);
    balls.push(makeBall(
      7,
      voiceIds[balls.length % voiceIds.length],
      'quarter'
    ));
    Viz.reset();
    renderBallList();
    renderHudChips();
  });

  // ---- Other controls ----

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

  playButton.addEventListener('click', () => {
    if (transport.playing) stop();
    else play();
  });

  function stopIfPlaying() {
    if (transport.playing) stop();
  }

  // ---- Pitch assignment ----

  function chordAtBeat(beat) {
    const bar = Math.floor(beat / Theory.BEATS_PER_BAR) % piece.progression.chords.length;
    return piece.progression.chords[bar];
  }

  const poolCache = new Map();

  function chordPoolFor(chord) {
    let pool = poolCache.get(chord);
    if (!pool) {
      pool = Theory.chordPool(piece.keyRoot, chord);
      poolCache.set(chord, pool);
    }
    return pool;
  }

  /* One magnitude→pitch mapping shared by all balls, scaled to the global peak. */
  function buildPitchMapper() {
    const maxValue = Math.max(...balls.map(b => Math.max(...b.seq)));
    piece.rawPitch = Theory.makePitchMapper(maxValue);
    poolCache.clear();
  }

  function pitchOf(ball, step) {
    const pool = chordPoolFor(chordAtBeat(onsetOf(ball, step)));
    return Theory.snapToPool(piece.rawPitch(Collatz.valueAt(ball.seq, step)), pool);
  }

  // ---- Transport ----

  function play() {
    AudioEngine.resume();
    piece.keyRoot = Number(keySelect.value);
    piece.progression = Theory.PROGRESSIONS.find(p => p.id === progSelect.value);
    buildPitchMapper();
    Viz.reset();

    for (const ball of balls) {
      ball.onsets = [0];
      ball.nextStep = 0;
      ball.lastLandedStep = -1;
      ball.currentNote = null;
    }

    transport.secondsPerBeat = 60 / Number(bpmInput.value);
    AudioEngine.setDelayTime(transport.secondsPerBeat);
    transport.startTime = AudioEngine.now() + 0.1;
    transport.nextBarToSchedule = 0;
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
    hudBar.textContent = '–';
  }

  function scheduleAhead() {
    const horizon = AudioEngine.now() + LOOKAHEAD_S;
    const spb = transport.secondsPerBeat;

    for (const ball of balls) {
      while (transport.startTime + onsetOf(ball, ball.nextStep) * spb < horizon) {
        const step = ball.nextStep;
        const beat = onsetOf(ball, step);
        const time = transport.startTime + beat * spb;
        const downbeat = beat % Theory.BEATS_PER_BAR === 0;
        AudioEngine.playNote(
          ball.voiceId,
          pitchOf(ball, step),
          time,
          stepDurationBeats(ball, step) * spb * 0.95,
          downbeat ? 0.9 : 0.7
        );
        ball.nextStep++;
      }
    }

    const beatsPerBar = Theory.BEATS_PER_BAR;
    while (transport.startTime + transport.nextBarToSchedule * beatsPerBar * spb < horizon) {
      const barBeat = transport.nextBarToSchedule * beatsPerBar;
      const time = transport.startTime + barBeat * spb;
      const chord = chordAtBeat(barBeat);
      AudioEngine.playBass(Theory.chordRootMidi(piece.keyRoot, chord), time, beatsPerBar * spb * 0.98);
      transport.nextBarToSchedule++;
    }
  }

  // ---- HUD ----

  const hudChips = []; // { root, n, note } DOM refs, parallel to balls

  function renderHudChips() {
    hudBalls.innerHTML = '';
    hudChips.length = 0;
    balls.forEach((ball, index) => {
      const chip = document.createElement('div');
      chip.className = 'hud-ball';

      const swatch = document.createElement('span');
      swatch.className = 'ball-swatch';
      swatch.style.background = ballColor(index);
      chip.appendChild(swatch);

      const n = document.createElement('span');
      n.className = 'hud-ball-n';
      chip.appendChild(n);

      const note = document.createElement('span');
      note.className = 'hud-ball-note';
      chip.appendChild(note);

      hudBalls.appendChild(chip);
      hudChips.push({ n, note });
    });
  }

  function updateHud(beatFloat) {
    if (transport.playing) {
      const chord = chordAtBeat(Math.max(0, beatFloat));
      hudChord.textContent = `${Theory.chordName(piece.keyRoot, chord)} (${chord.numeral})`;
      const barCount = piece.progression.chords.length;
      hudBar.textContent = (Math.floor(Math.max(0, beatFloat) / Theory.BEATS_PER_BAR) % barCount) + 1;
    }
    balls.forEach((ball, index) => {
      const chip = hudChips[index];
      if (!chip) return;
      if (transport.playing) {
        const step = Math.max(0, ball.lastLandedStep);
        chip.n.textContent = Collatz.valueAt(ball.seq, step);
        chip.note.textContent = ball.currentNote || '';
      } else {
        chip.n.textContent = ball.start;
        chip.note.textContent = '';
      }
    });
  }

  // ---- Frame loop ----

  function beatFloatNow() {
    return (AudioEngine.now() - transport.startTime) / transport.secondsPerBeat;
  }

  /* Fractional step position for the bounce arc, spanning this step's own length. */
  function stepFloatOf(ball, beat) {
    const step = Math.max(0, ball.lastLandedStep);
    const progress = (beat - onsetOf(ball, step)) / stepDurationBeats(ball, step);
    return step + Math.min(1, Math.max(0, progress));
  }

  function frame() {
    let beatFloat = 0;
    if (transport.playing) {
      beatFloat = Math.max(0, beatFloatNow());
      balls.forEach((ball, index) => {
        // Register every landing since the last frame (usually just one).
        while (onsetOf(ball, ball.lastLandedStep + 1) <= beatFloat) {
          ball.lastLandedStep++;
          Viz.registerHit(Collatz.valueAt(ball.seq, ball.lastLandedStep), ballColor(index));
          ball.currentNote = Theory.midiToName(pitchOf(ball, ball.lastLandedStep));
        }
      });
    }

    updateHud(beatFloat);

    Viz.draw({
      playing: transport.playing,
      balls: balls.map((ball, index) => ({
        seq: ball.seq,
        stepFloat: transport.playing ? stepFloatOf(ball, beatFloat) : 0,
        color: ballColor(index),
        getValue: k => Collatz.valueAt(ball.seq, k),
      })),
    });

    requestAnimationFrame(frame);
  }

  // ---- Boot ----

  Viz.attach(document.getElementById('viz'));
  renderBallList();
  renderHudChips();
  requestAnimationFrame(frame);
  }
})();
