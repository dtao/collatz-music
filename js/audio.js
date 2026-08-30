/* Web Audio synthesis: selectable per-ball voices, a soft bass, and a feedback delay. */
const AudioEngine = (() => {
  let ctx = null;
  let master = null;
  let delaySend = null;
  let delayNode = null;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    master = ctx.createGain();
    master.gain.value = 0.6;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 24;
    compressor.ratio.value = 4;

    master.connect(compressor);
    compressor.connect(ctx.destination);

    // Feedback delay on a send bus for a little space.
    delayNode = ctx.createDelay(2.0);
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 2400;
    const delayWet = ctx.createGain();
    delayWet.gain.value = 0.22;

    delaySend = ctx.createGain();
    delaySend.gain.value = 1.0;
    delaySend.connect(delayNode);
    delayNode.connect(delayFilter);
    delayFilter.connect(feedback);
    feedback.connect(delayNode);
    delayFilter.connect(delayWet);
    delayWet.connect(master);
  }

  function resume() {
    init();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  function setDelayTime(secondsPerBeat) {
    if (delayNode) delayNode.delayTime.setValueAtTime(secondsPerBeat * 0.75, ctx.currentTime);
  }

  /* Shared per-note plumbing: envelope gain routed to master + delay send. */
  function makeNoteOutput(time, peak, duration, attack = 0.012, midRatio = 0.35) {
    const gain = ctx.createGain();
    gain.connect(master);
    gain.connect(delaySend);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak * midRatio, 0.0002), time + duration * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    return gain;
  }

  function startStop(oscs, time, duration) {
    for (const o of oscs) {
      o.start(time);
      o.stop(time + duration + 0.05);
    }
  }

  /* Plucky triangle + a quiet sine an octave up, with a closing lowpass. */
  function voicePluck(freq, time, duration, velocity) {
    const gain = makeNoteOutput(time, 0.26 * velocity, duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 6, 9000), time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.5, 200), time + duration);
    filter.Q.value = 0.8;
    filter.connect(gain);

    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.value = freq;
    osc1.connect(filter);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.25;
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);

    startStop([osc1, osc2], time, duration);
  }

  /* Bell: sine fundamental + inharmonic partial, fast percussive decay. */
  function voiceBell(freq, time, duration, velocity) {
    const ring = Math.max(duration, Math.min(duration * 2, 1.4));
    const gain = makeNoteOutput(time, 0.24 * velocity, ring, 0.005, 0.2);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = freq;
    osc1.connect(gain);

    const partial = ctx.createOscillator();
    partial.type = 'sine';
    partial.frequency.value = freq * 2.76;
    const partialGain = ctx.createGain();
    partialGain.gain.setValueAtTime(0.18, time);
    partialGain.gain.exponentialRampToValueAtTime(0.005, time + ring * 0.4);
    partial.connect(partialGain);
    partialGain.connect(gain);

    startStop([osc1, partial], time, ring);
  }

  /* Hollow square through a lowpass — a bit reedy/chiptune. */
  function voiceSquare(freq, time, duration, velocity) {
    const gain = makeNoteOutput(time, 0.16 * velocity, duration, 0.015, 0.45);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 4, 6000), time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 2, 300), time + duration);
    filter.Q.value = 1.2;
    filter.connect(gain);

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    osc.connect(filter);

    startStop([osc], time, duration);
  }

  /* Airy: two softly detuned sines with a slow attack, pad-like. */
  function voiceAiry(freq, time, duration, velocity) {
    const gain = makeNoteOutput(time, 0.24 * velocity, duration, Math.min(duration * 0.35, 0.12), 0.6);

    const oscs = [-5, 5].map(cents => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * Math.pow(2, cents / 1200);
      o.connect(gain);
      return o;
    });

    startStop(oscs, time, duration);
  }

  const VOICES = {
    pluck: { name: 'Pluck', play: voicePluck },
    bell: { name: 'Bell', play: voiceBell },
    square: { name: 'Square', play: voiceSquare },
    airy: { name: 'Airy', play: voiceAiry },
  };

  function playNote(voiceId, midi, time, duration, velocity = 0.8) {
    const voice = VOICES[voiceId] || VOICES.pluck;
    voice.play(Theory.midiToFreq(midi), time, duration, velocity);
  }

  /* A soft sustained root note grounding each bar. */
  function playBass(midi, time, duration, velocity = 0.5) {
    const freq = Theory.midiToFreq(midi);

    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = freq;
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.4;

    osc.connect(filter);
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);
    filter.connect(gain);
    gain.connect(master);

    const peak = 0.22 * velocity;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.04);
    gain.gain.setValueAtTime(peak, time + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.start(time);
    osc2.start(time);
    osc.stop(time + duration + 0.05);
    osc2.stop(time + duration + 0.05);
  }

  return { init, resume, now, setDelayTime, playNote, playBass, VOICES, get ctx() { return ctx; } };
})();
