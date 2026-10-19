// Runs the browser engine (web/motor.js) in Node on a few fixed universes and prints the optimal weights as JSON.
// Used by check_scipy.py to cross-check the projected-gradient optimiser against SciPy's SLSQP.
const path = require('path');
const M = require(path.join(__dirname, '..', 'web', 'motor.js'));
const D = require(path.join(__dirname, '..', 'web', 'dades-cartera.json'));
const CASES = require(path.join(__dirname, 'cases.json'));
const out = CASES.map(c => {
  const { R } = M.rendiments(D, c.ids, c.from);
  const t0 = Date.now();
  const o = M.optimitza(R, { rf: c.rf, lo: c.lo, hi: c.hi });
  return { ...c, T: R.length, ms: Date.now() - t0, w: o.metodes };
});
console.log(JSON.stringify(out));
