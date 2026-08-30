/* Collatz sequence generation. */
const Collatz = (() => {
  const MAX_STEPS = 10000;
  const TERMINAL_CYCLE = [4, 2, 1];

  /* Full trajectory from n down to 1 (inclusive of both ends). */
  function sequence(n) {
    const seq = [n];
    let v = n;
    while (v !== 1 && seq.length < MAX_STEPS) {
      v = v % 2 === 0 ? v / 2 : 3 * v + 1;
      seq.push(v);
    }
    return seq;
  }

  /* Value at step k; past the end of the trajectory we ride the 4→2→1 loop forever. */
  function valueAt(seq, k) {
    if (k < seq.length) return seq[k];
    return TERMINAL_CYCLE[(k - seq.length) % TERMINAL_CYCLE.length];
  }

  return { sequence, valueAt, TERMINAL_CYCLE };
})();
