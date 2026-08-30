/* Canvas rendering: linear number line, camera follow, bouncing balls. */
const Viz = (() => {
  let canvas, g;
  let width = 0, height = 0, dpr = 1;

  // Smoothed camera window over the number line.
  const camera = { vMin: 0, vMax: 40, initialized: false };
  let lastFrameTime = null;

  // value → { lastHit: performance.now() ms, color } for glow decay on visited numbers.
  const visited = new Map();
  // Landing flashes: { value, t0, color }.
  let flashes = [];

  const COLORS = {
    baseline: 'rgba(219, 226, 236, 0.35)',
    tick: 'rgba(219, 226, 236, 0.5)',
    tickLabel: 'rgba(125, 138, 156, 0.9)',
    integerDot: 'rgba(219, 226, 236, 0.12)',
  };

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const gg = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${gg}, ${b}, ${alpha})`;
  }

  function attach(canvasEl) {
    canvas = canvasEl;
    g = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  function reset() {
    visited.clear();
    flashes = [];
    camera.initialized = false;
  }

  function registerHit(value, color) {
    visited.set(value, { lastHit: performance.now(), color });
    flashes.push({ value, t0: performance.now(), color });
    if (flashes.length > 32) flashes.shift();
  }

  function baselineY() {
    return height * 0.68;
  }

  function xOf(v) {
    const margin = 60;
    return margin + ((v - camera.vMin) / (camera.vMax - camera.vMin)) * (width - 2 * margin);
  }

  /* Window covering every ball's local neighborhood: current step plus a few ahead. */
  function targetWindow(state) {
    let lo = Infinity, hi = -Infinity;
    for (const ball of state.balls) {
      const i = Math.max(0, Math.floor(ball.stepFloat));
      for (let k = i - 1; k <= i + 4; k++) {
        if (k < 0) continue;
        const v = ball.getValue(k);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    let span = hi - lo;
    const minSpan = 8;
    if (span < minSpan) {
      const mid = (lo + hi) / 2;
      lo = mid - minSpan / 2;
      hi = mid + minSpan / 2;
    }
    span = hi - lo;
    return { vMin: Math.max(-1, lo - span * 0.18), vMax: hi + span * 0.18 };
  }

  function updateCamera(state, dt) {
    let target;
    if (state.playing) {
      target = targetWindow(state);
    } else {
      // Idle: frame every ball's whole trajectory.
      let lo = Infinity, hi = -Infinity;
      for (const ball of state.balls) {
        lo = Math.min(lo, ...ball.seq);
        hi = Math.max(hi, ...ball.seq);
      }
      const span = Math.max(8, hi - lo);
      target = { vMin: Math.max(-1, lo - span * 0.08), vMax: hi + span * 0.08 };
    }
    if (!camera.initialized) {
      camera.vMin = target.vMin;
      camera.vMax = target.vMax;
      camera.initialized = true;
      return;
    }
    const rate = 1 - Math.exp(-dt * 2.6);
    camera.vMin += (target.vMin - camera.vMin) * rate;
    camera.vMax += (target.vMax - camera.vMax) * rate;
  }

  function niceStep(raw) {
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const mult of [1, 2, 5, 10]) {
      if (mag * mult >= raw) return mag * mult;
    }
    return mag * 10;
  }

  function drawNumberLine() {
    const y = baselineY();
    g.strokeStyle = COLORS.baseline;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(width, y);
    g.stroke();

    const span = camera.vMax - camera.vMin;
    const pxPerUnit = (width - 120) / span;
    const step = Math.max(1, niceStep(70 / pxPerUnit));

    g.font = '11px "Avenir Next", "Segoe UI", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'top';

    const first = Math.max(0, Math.ceil(camera.vMin / step) * step);
    for (let v = first; v <= camera.vMax; v += step) {
      const x = xOf(v);
      if (x < -20 || x > width + 20) continue;
      g.strokeStyle = COLORS.tick;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y - 5);
      g.lineTo(x, y + 5);
      g.stroke();
      g.fillStyle = COLORS.tickLabel;
      g.fillText(String(v), x, y + 10);
    }

    // Faint dots at every integer when zoomed in enough.
    if (pxPerUnit >= 9) {
      g.fillStyle = COLORS.integerDot;
      const lo = Math.max(1, Math.ceil(camera.vMin));
      for (let v = lo; v <= camera.vMax; v++) {
        const x = xOf(v);
        g.beginPath();
        g.arc(x, y, 2, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  function drawSequenceDots(state) {
    const y = baselineY();
    const nowMs = performance.now();

    // Upcoming values (dim, in each ball's color), skipping ones already visited.
    for (const ball of state.balls) {
      const seen = new Set();
      const iCur = Math.floor(ball.stepFloat);
      g.fillStyle = hexToRgba(ball.color, 0.4);
      for (let k = iCur; k <= iCur + 24; k++) {
        const v = ball.getValue(k);
        if (visited.has(v) || seen.has(v)) continue;
        seen.add(v);
        const x = xOf(v);
        if (x < -10 || x > width + 10) continue;
        g.beginPath();
        g.arc(x, y, 3.5, 0, Math.PI * 2);
        g.fill();
      }
    }

    // Visited values glow in the color of the last ball to land there.
    for (const [v, hit] of visited) {
      const x = xOf(v);
      if (x < -10 || x > width + 10) continue;
      const age = (nowMs - hit.lastHit) / 1000;
      const alpha = 0.45 + 0.55 * Math.exp(-age * 1.8);
      g.fillStyle = hexToRgba(hit.color, alpha);
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawFlashes() {
    const y = baselineY();
    const nowMs = performance.now();
    flashes = flashes.filter(f => nowMs - f.t0 < 700);
    for (const f of flashes) {
      const age = (nowMs - f.t0) / 700;
      const x = xOf(f.value);
      if (x < -40 || x > width + 40) continue;
      const r = 6 + age * 30;
      g.strokeStyle = hexToRgba(f.color, 0.6 * (1 - age));
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
    }
  }

  function drawBall(state, ball) {
    const y = baselineY();
    let x, by;

    if (!state.playing) {
      x = xOf(ball.seq[0]);
      by = y - 9;
    } else {
      const i = Math.max(0, Math.floor(ball.stepFloat));
      const p = Math.max(0, ball.stepFloat - i);
      const x0 = xOf(ball.getValue(i));
      const x1 = xOf(ball.getValue(i + 1));
      x = x0 + (x1 - x0) * p;
      const arcH = Math.min(Math.max(36, Math.abs(x1 - x0) * 0.28), height * 0.42);
      by = y - 9 - arcH * 4 * p * (1 - p);
    }

    g.fillStyle = hexToRgba(ball.color, 0.35);
    g.beginPath();
    g.arc(x, by, 16, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = ball.color;
    g.beginPath();
    g.arc(x, by, 8, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = 'rgba(255, 255, 255, 0.75)';
    g.beginPath();
    g.arc(x - 2.5, by - 2.5, 2.4, 0, Math.PI * 2);
    g.fill();
  }

  function draw(state) {
    const nowMs = performance.now();
    const dt = lastFrameTime === null ? 1 / 60 : Math.min(0.1, (nowMs - lastFrameTime) / 1000);
    lastFrameTime = nowMs;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);

    updateCamera(state, dt);
    drawNumberLine();
    drawSequenceDots(state);
    drawFlashes();
    for (const ball of state.balls) drawBall(state, ball);
  }

  return { attach, reset, registerHit, draw };
})();
