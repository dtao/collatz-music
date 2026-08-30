/* Web Audio synthesis: a plucky lead voice, a soft bass, and a feedback delay. */
const AudioEngine = (() => {
  let ctx = null;
  let master = null;
  let delaySend = null;
  let delayNode = null;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    master = ctx.createGain();
    master.gain.value = 0.7;

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

  /* The lead voice the bouncing ball plays: triangle + a quiet sine an octave up. */
  function playNote(midi, time, duration, velocity = 0.8) {
    const freq = Theory.midiToFreq(midi);

    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 6, 9000), time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.5, 200), time + duration);
    filter.Q.value = 0.8;

    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.value = freq;

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.25;

    osc1.connect(filter);
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    gain.connect(delaySend);

    const peak = 0.28 * velocity;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(peak * 0.35, time + duration * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration + 0.05);
    osc2.stop(time + duration + 0.05);
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

  return { init, resume, now, setDelayTime, playNote, playBass, get ctx() { return ctx; } };
})();
