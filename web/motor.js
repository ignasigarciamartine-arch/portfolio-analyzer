/* Motor de l'analitzador de cartera: estadístiques, optimització i backtest. Sense dependències.
   Mateixa metodologia que el Portfolio Analyzer en Python (03_PROYECTOS/_PAUSADO_portfolio-analyzer):
   pesos acotats [min, max] que sumen 1, Monte Carlo Dirichlet, i 4 mètodes (mínima variància, 1/N,
   Sharpe màxim i Sortino màxim). L'optimitzador és un descens de gradient projectat sobre el símplex
   acotat (equivalent al SLSQP de l'original per a aquests problemes). Funciona al navegador i a Node. */
(function (arrel) {
  const DIES = 252;

  /* ---------- dades ---------- */
  // rendiments diaris dels actius triats a la finestra [desde, fins], tallada on tots tenen dades
  function rendiments(D, ids, desde, fins) {
    const n0 = D.dates.length;
    const inici = Math.max(...ids.map(id => n0 - D.actius[id].p.length));   // els actius curts comencen tard
    let a = inici, b = n0 - 1;
    if (desde) while (a < b && D.dates[a] < desde) a++;
    if (fins) while (b > a && D.dates[b] > fins) b--;
    const preu = (id, i) => D.actius[id].p[i - (n0 - D.actius[id].p.length)];
    const R = [], dates = [];
    for (let i = a + 1; i <= b; i++) {
      R.push(ids.map(id => preu(id, i) / preu(id, i - 1) - 1));
      dates.push(D.dates[i]);
    }
    return { R, dates, desde: D.dates[a] };
  }

  const mitjanes = R => { const n = R[0].length, m = new Array(n).fill(0); for (const r of R) for (let j = 0; j < n; j++) m[j] += r[j]; return m.map(x => x / R.length); };
  function covariancia(R, m) {
    const n = m.length, C = Array.from({ length: n }, () => new Array(n).fill(0));
    for (const r of R) for (let i = 0; i < n; i++) { const di = r[i] - m[i]; for (let j = i; j < n; j++) C[i][j] += di * (r[j] - m[j]); }
    for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { C[i][j] /= R.length - 1; C[j][i] = C[i][j]; }
    return C;
  }
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const matvec = (C, w) => C.map(f => dot(f, w));
  const port = (R, w) => R.map(r => dot(r, w));

  /* ---------- mètriques (mateixes fórmules que compute_stats de l'original) ---------- */
  function metriques(rp, rf) {
    const T = rp.length, mu = rp.reduce((s, x) => s + x, 0) / T;
    const sd = Math.sqrt(rp.reduce((s, x) => s + (x - mu) ** 2, 0) / (T - 1));
    const rfD = (1 + rf) ** (1 / DIES) - 1;
    const ret = (1 + mu) ** DIES - 1, vol = sd * Math.sqrt(DIES);
    let down = 0, nd = 0; for (const x of rp) if (x < rfD) { down += (x - rfD) ** 2; nd++; }
    const dd = nd ? Math.sqrt(down / T) * Math.sqrt(DIES) : NaN;   // semidesviació sobre tots els dies
    const ord = [...rp].sort((a, b) => a - b), k = Math.max(1, Math.floor(.05 * T));
    const cvar = -ord.slice(0, k).reduce((s, x) => s + x, 0) / k;
    let v = 1, pic = 1, mdd = 0; for (const x of rp) { v *= 1 + x; pic = Math.max(pic, v); mdd = Math.min(mdd, v / pic - 1); }
    return { ret, vol, sharpe: (ret - rf) / vol, sortino: (ret - rf) / dd, cvar, mdd };
  }

  /* ---------- projecció al símplex acotat {lo <= w <= hi, suma 1} (bisecció sobre el desplaçament) ---------- */
  function projecta(v, lo, hi) {
    const f = t => v.reduce((s, x) => s + Math.min(hi, Math.max(lo, x - t)), 0) - 1;
    let a = Math.min(...v) - hi - 1, b = Math.max(...v) - lo + 1;
    for (let i = 0; i < 80; i++) { const t = (a + b) / 2; f(t) > 0 ? a = t : b = t; }
    const t = (a + b) / 2;
    return v.map(x => Math.min(hi, Math.max(lo, x - t)));
  }

  // generador pseudoaleatori amb llavor (resultats repetibles, com np.random.seed(42))
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function dirichlet(n, lo, aleat) {   // uniforme sobre el símplex, desplaçat perquè cap pes quedi sota lo
    const e = Array.from({ length: n }, () => -Math.log(1 - aleat())), s = e.reduce((a, b) => a + b, 0);
    return e.map(x => lo + (1 - lo * n) * x / s);
  }

  // descens de gradient projectat amb cerca de pas (Armijo). f i g reben w; minimitza f.
  function pgd(f, g, w0, lo, hi, iters = 400) {
    let w = projecta(w0, lo, hi), fw = f(w), pas = 1;
    for (let it = 0; it < iters; it++) {
      const gr = g(w); let millor = false;
      for (let k = 0; k < 40; k++) {
        const nw = projecta(w.map((x, i) => x - pas * gr[i]), lo, hi), fn = f(nw);
        const dif = nw.reduce((s, x, i) => s + gr[i] * (x - w[i]), 0);
        if (fn <= fw + 1e-4 * dif) { const canvi = Math.abs(fw - fn); w = nw; fw = fn; pas *= 2; millor = canvi > 1e-15; break; }
        pas /= 2;
      }
      if (!millor) break;
    }
    return w;
  }

  /* ---------- optimització ---------- */
  function optimitza(R, { rf = .02, lo = 0, hi = 1, nMc = 4000, llavor = 42 } = {}) {
    const n = R[0].length;
    if (lo * n > 1 + 1e-9 || hi * n < 1 - 1e-9) throw new Error('Els límits de pes no permeten que la cartera sumi el 100%.');
    const m = mitjanes(R), C = covariancia(R, m), rfD = (1 + rf) ** (1 / DIES) - 1, T = R.length;
    const aleat = rng(llavor), inicis = Array.from({ length: 8 }, () => dirichlet(n, lo, aleat).map(x => Math.min(hi, x)));
    const multi = (f, g) => inicis.map(w0 => pgd(f, g, w0, lo, hi)).reduce((a, b) => f(a) <= f(b) ? a : b);

    // escalem els objectius perquè el pas inicial sigui raonable (variàncies diàries ~1e-4)
    const varF = w => dot(w, matvec(C, w)) * 1e4, varG = w => matvec(C, w).map(x => 2e4 * x);
    const minVar = multi(varF, varG);

    const shF = w => { const s = Math.sqrt(dot(w, matvec(C, w))); return -(dot(w, m) - rfD) / s; };
    const shG = w => { const Cw = matvec(C, w), v = dot(w, Cw), s = Math.sqrt(v), e = dot(w, m) - rfD; return m.map((x, i) => -(x / s - e * Cw[i] / (s * v))); };
    const maxSharpe = multi(shF, shG);

    const soF = w => { const rp = port(R, w), mu = rp.reduce((a, b) => a + b, 0) / T; let d = 0; for (const x of rp) if (x < rfD) d += (x - rfD) ** 2; return -(mu - rfD) / Math.sqrt(d / T); };
    const soG = w => {
      const rp = port(R, w), mu = rp.reduce((a, b) => a + b, 0) / T; let d = 0; const gd = new Array(n).fill(0);
      rp.forEach((x, t) => { if (x < rfD) { d += (x - rfD) ** 2; for (let j = 0; j < n; j++) gd[j] += (x - rfD) * R[t][j]; } });
      const DD = Math.sqrt(d / T), e = mu - rfD;
      return m.map((x, j) => -(x / DD - e * (gd[j] / T) / (DD ** 3)));
    };
    const maxSortino = multi(soF, soG);

    const igual = projecta(new Array(n).fill(1 / n), lo, hi);

    // núvol Monte Carlo (rendiment i volatilitat de carteres aleatòries vàlides)
    const nuvol = [];
    for (let k = 0; k < nMc; k++) {
      const w = dirichlet(n, lo, aleat); if (w.some(x => x > hi + 1e-12)) continue;
      const mu = dot(w, m), sd = Math.sqrt(dot(w, matvec(C, w)));
      nuvol.push([sd * Math.sqrt(DIES), (1 + mu) ** DIES - 1, (((1 + mu) ** DIES - 1) - rf) / (sd * Math.sqrt(DIES))]);
    }
    // frontera eficient: mínima variància per a cada nivell d'aversió al risc
    const frontera = [];
    let wPrev = minVar;
    for (const lam of [0, .5, 1, 2, 3, 5, 8, 12, 18, 27, 40, 60, 90, 140, 220, 400]) {
      const f = w => dot(w, matvec(C, w)) * 1e4 - lam * dot(w, m) * 1e2, g = w => matvec(C, w).map((x, i) => 2e4 * x - lam * 1e2 * m[i]);
      wPrev = pgd(f, g, wPrev, lo, hi, 600);
      const mu = dot(wPrev, m), sd = Math.sqrt(dot(wPrev, matvec(C, wPrev)));
      frontera.push([sd * Math.sqrt(DIES), (1 + mu) ** DIES - 1]);
    }
    const sd = C.map((f, i) => Math.sqrt(f[i]));
    const corr = C.map((f, i) => f.map((x, j) => x / (sd[i] * sd[j])));
    return { metodes: { minVar, igual, maxSharpe, maxSortino }, nuvol, frontera, corr, m, C };
  }

  /* ---------- backtest amb rebalanceig, aportacions i filtre de caigudes ---------- */
  // R: rendiments diaris; w: pesos objectiu; opcions: reb 'mes'|'any'|'mai', aportacio mensual,
  // filtre: índexs dels actius de risc; si la mitjana del seu rendiment del mes < tau, el mes següent
  // la part de risc va a efectiu (0%). És el filtre de caigudes del TFM (tau = -4%).
  function backtest(R, dates, w, { reb = 'any', inicial = 10000, aportacio = 0, filtre = null, tau = -.04 } = {}) {
    const n = w.length; let pos = w.map(x => x * inicial), efectiu = 0, aportat = inicial, fora = false;
    let mesRet = new Array(n).fill(1);
    const valor = [], invertit = [], senyal = [];
    const objectiu = () => fora ? w.map((x, i) => filtre.includes(i) ? 0 : x) : w;
    for (let t = 0; t < R.length; t++) {
      for (let j = 0; j < n; j++) { pos[j] *= 1 + R[t][j]; mesRet[j] *= 1 + R[t][j]; }
      const total = pos.reduce((a, b) => a + b, 0) + efectiu;
      valor.push(total); invertit.push(aportat); senyal.push(fora);
      const fiMes = t === R.length - 1 || dates[t + 1].slice(5, 7) !== dates[t].slice(5, 7);
      if (!fiMes) continue;
      let canvia = false;
      if (filtre && filtre.length) {
        const mitja = filtre.reduce((s, i) => s + mesRet[i] - 1, 0) / filtre.length;
        const nouFora = mitja < tau;
        canvia = nouFora !== fora; fora = nouFora;
      }
      mesRet = new Array(n).fill(1);
      const fiAny = t === R.length - 1 || dates[t + 1].slice(0, 4) !== dates[t].slice(0, 4);
      const toca = canvia || reb === 'mes' || (reb === 'any' && fiAny);
      let actual = total + aportacio; aportat += aportacio;
      if (toca) {
        const o = objectiu(), so = o.reduce((a, b) => a + b, 0);
        pos = o.map(x => x * actual); efectiu = actual * (1 - so);
      } else if (aportacio) {   // l'aportació entra amb els pesos objectiu sense vendre res
        const o = objectiu(); o.forEach((x, j) => pos[j] += x * aportacio); efectiu += aportacio * (1 - o.reduce((a, b) => a + b, 0));
      }
    }
    // rendiments diaris de la cartera nets d'aportacions (per a les mètriques)
    const rd = valor.map((v, t) => t === 0 ? v / inicial - 1 : (v - (invertit[t] - invertit[t - 1])) / valor[t - 1] - 1);
    return { valor, invertit, senyal, rd };
  }

  const API = { rendiments, metriques, optimitza, backtest, projecta, port, DIES };
  if (typeof module !== 'undefined') module.exports = API; else arrel.Motor = API;
})(this);
