/* Analitzador de cartera: interfície. El càlcul és a motor.js (window.Motor). Gràfics en SVG sense llibreries. */
(function () {
  const M = window.Motor;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pc = (v, d = 1) => isFinite(v) ? (v * 100).toLocaleString('ca-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%' : '–';
  const nf = (v, d = 2) => isFinite(v) ? v.toLocaleString('ca-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–';
  const eur = v => Math.round(v).toLocaleString('ca-ES') + ' €';
  const METODES = [
    ['minVar', 'Mínima variància', 'La que menys es mou'],
    ['igual', 'Parts iguals', 'El mateix pes a cada actiu'],
    ['maxSharpe', 'Sharpe màxim', 'Més rendiment per unitat de risc'],
    ['maxSortino', 'Sortino màxim', 'Igual, però només penalitza les baixades'],
  ];
  const COL = { minVar: '#2c6e8f', igual: '#857b63', maxSharpe: '#b0811f', maxSortino: '#2c8250' };
  const PER_DEFECTE = ['SP500', 'EUROPA', 'EMERG', 'BO_7_10', 'TIPS', 'OR', 'BTC'];
  let D, estat = null, metode = 'minVar';

  /* ---------- controls ---------- */
  function pintaActius() {
    const grups = {};
    for (const [id, a] of Object.entries(D.actius)) (grups[a.grup] = grups[a.grup] || []).push([id, a]);
    $('#pa-actius').innerHTML = Object.entries(grups).map(([g, l]) => `<div class="pa__g"><span>${esc(g)}</span>${l.map(([id, a]) =>
      `<label class="pa__chip"><input type="checkbox" value="${id}"${PER_DEFECTE.includes(id) ? ' checked' : ''}><span>${esc(a.nom)}<small>${esc(a.ticker)}</small></span></label>`).join('')}</div>`).join('');
    $('#pa-actius').addEventListener('change', compta);
    compta();
  }
  const triats = () => [...document.querySelectorAll('#pa-actius input:checked')].map(i => i.value);
  function compta() { const n = triats().length; $('#pa-n').textContent = n < 2 ? 'Tria almenys 2 actius.' : n > 12 ? 'Màxim 12 actius.' : `${n} actius triats.`; }

  /* ---------- càlcul ---------- */
  function calcula() {
    $('#pa-err').textContent = '';
    const ids = triats();
    if (ids.length < 2 || ids.length > 12) { $('#pa-err').textContent = 'Tria entre 2 i 12 actius.'; return; }
    const lo = +$('#pa-lo').value / 100, hi = +$('#pa-hi').value / 100, rf = +$('#pa-rf').value / 100;
    if (lo * ids.length > 1) { $('#pa-err').textContent = `Amb ${ids.length} actius el pes mínim no pot passar del ${Math.floor(100 / ids.length)}%.`; return; }
    if (hi * ids.length < 1) { $('#pa-err').textContent = `Amb ${ids.length} actius el pes màxim ha de ser com a mínim del ${Math.ceil(100 / ids.length)}%.`; return; }
    const per = $('#pa-per').value, fi = D.dates[D.dates.length - 1];
    const desde = per === 'max' ? null : (+fi.slice(0, 4) - +per) + fi.slice(4);
    const tot = M.rendiments(D, ids, desde);
    if (tot.R.length < 250) { $('#pa-err').textContent = 'Amb aquests actius hi ha menys d\'un any de dades.'; return; }
    const oos = $('#pa-oos').checked, tall = oos ? Math.floor(tot.R.length * .6) : tot.R.length;
    const opt = M.optimitza(tot.R.slice(0, tall), { rf, lo, hi });
    estat = { ids, rf, lo, hi, tot, opt, oos, tall };
    pinta();
    const avis = per !== 'max' && tot.desde > desde ? ` Les dades comencen el ${dataCat(tot.desde)} perquè algun actiu no existia abans.` : '';
    $('#pa-act').textContent = `Dades del ${dataCat(tot.desde)} al ${dataCat(fi)}, en euros.${avis}`;
  }
  const MESOS = ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'];
  const dataCat = d => { const [a, m, di] = d.split('-').map(Number); return `${di} ${/^[ao]/.test(MESOS[m - 1]) ? "d'" : 'de '}${MESOS[m - 1]} de ${a}`; };

  /* ---------- resultats ---------- */
  function pinta() {
    const { tot, opt, rf, tall } = estat, Rin = tot.R.slice(0, tall);
    const met = {}; for (const [k] of METODES) met[k] = M.metriques(M.port(Rin, opt.metodes[k]), rf);
    $('#pa-met').innerHTML = METODES.map(([k, nom, sub]) => `<button type="button" class="pa__m${k === metode ? ' on' : ''}" data-k="${k}" style="--c:${COL[k]}">
      <span class="pa__mn">${nom}</span><span class="pa__ms">${sub}</span>
      <span class="pa__mx"><span><small>Rend./any</small><b>${pc(met[k].ret)}</b></span><span><small>Risc</small><b>${pc(met[k].vol)}</b></span><span><small>Sharpe</small><b>${nf(met[k].sharpe)}</b></span></span></button>`).join('') +
      `<div class="pa__tw"><table class="pa__t"><thead><tr><th></th>${METODES.map(([k, n]) => `<th style="color:${COL[k]}">${n}</th>`).join('')}</tr></thead><tbody>${[
        ['Rendiment anual', 'ret', pc], ['Volatilitat anual', 'vol', pc], ['Sharpe', 'sharpe', nf], ['Sortino', 'sortino', nf],
        ['Pitjor caiguda', 'mdd', pc], ['Pitjor 5% dels dies (CVaR)', 'cvar', v => '−' + pc(v, 2)]].map(([n, c, f]) =>
        `<tr><th>${n}</th>${METODES.map(([k]) => `<td>${f(met[k][c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` +
      (estat.oos ? `<p class="pa__nota">Mètriques calculades amb el primer 60% del període, el mateix que s'ha fet servir per triar els pesos.</p>` : '');
    pintaFrontera(met); pintaPesos(); pintaCorr(); pintaBacktest();
  }

  // els gràfics es dibuixen a l'amplada real del contenidor, perquè el text no s'encongeixi al mòbil
  const ample = s => Math.max(300, Math.round($(s).clientWidth) || 760);
  // escales i eixos per als gràfics SVG
  const escala = (d0, d1, r0, r1) => v => r0 + (v - d0) / (d1 - d0 || 1) * (r1 - r0);
  function ticks(a, b, n = 5) {
    const pas = Math.pow(10, Math.floor(Math.log10((b - a) / n))), m = [1, 2, 2.5, 5, 10].find(x => (b - a) / (x * pas) <= n) * pas;
    const t = []; for (let v = Math.ceil(a / m) * m; v <= b + 1e-12; v += m) t.push(+v.toFixed(10)); return t;
  }

  function pintaFrontera(met) {
    const { opt } = estat, W = ample('#pa-front'), H = W < 520 ? 300 : 380, P = { l: W < 520 ? 44 : 56, r: 12, t: 14, b: 40 };
    const xs = opt.nuvol.map(p => p[0]).concat(opt.frontera.map(p => p[0])), ys = opt.nuvol.map(p => p[1]).concat(opt.frontera.map(p => p[1]));
    const x0 = Math.min(...xs) * .92, x1 = Math.max(...xs) * 1.04, y0 = Math.min(...ys, 0), y1 = Math.max(...ys) * 1.08;
    const X = escala(x0, x1, P.l, W - P.r), Y = escala(y0, y1, H - P.b, P.t);
    const sh = opt.nuvol.map(p => p[2]), s0 = Math.min(...sh), s1 = Math.max(...sh);
    const punts = opt.nuvol.map(p => { const k = (p[2] - s0) / (s1 - s0 || 1); return `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="1.6" fill="rgb(${Math.round(200 - 24 * k)},${Math.round(186 - 57 * k)},${Math.round(150 - 119 * k)})" fill-opacity="${.35 + .4 * k}"/>`; }).join('');
    const linia = opt.frontera.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
    const eixX = ticks(x0, x1).map(v => `<g><line x1="${X(v)}" x2="${X(v)}" y1="${P.t}" y2="${H - P.b}" class="g"/><text x="${X(v)}" y="${H - P.b + 18}" text-anchor="middle">${pc(v, 0)}</text></g>`).join('');
    const eixY = ticks(y0, y1).map(v => `<g><line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="g${Math.abs(v) < 1e-9 ? ' z' : ''}"/><text x="${P.l - 8}" y="${Y(v) + 4}" text-anchor="end">${pc(v, 0)}</text></g>`).join('');
    const marques = METODES.map(([k, nom]) => `<g class="pa__pt${k === metode ? ' on' : ''}"><circle cx="${X(met[k].vol)}" cy="${Y(met[k].ret)}" r="${k === metode ? 8 : 6}" fill="${COL[k]}" stroke="#fbf6ea" stroke-width="2"><title>${nom}: ${pc(met[k].ret)} de rendiment, ${pc(met[k].vol)} de volatilitat</title></circle></g>`).join('');
    $('#pa-front').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Frontera eficient: rendiment anual segons la volatilitat">
      ${eixX}${eixY}${punts}<path d="${linia}" fill="none" stroke="#1d1a13" stroke-width="2" stroke-linejoin="round"/>${marques}
      <text x="${(P.l + W - P.r) / 2}" y="${H - 6}" text-anchor="middle" class="t">Volatilitat anual (risc)</text>
      <text x="14" y="${(P.t + H - P.b) / 2}" text-anchor="middle" class="t" transform="rotate(-90 14 ${(P.t + H - P.b) / 2})">Rendiment anual</text></svg>
      <p class="pa__lleg">${METODES.map(([k, n]) => `<span><i style="background:${COL[k]}"></i>${n}</span>`).join('')}<span><i class="l"></i>Frontera eficient</span></p>`;
  }

  function pintaPesos() {
    const { ids, opt } = estat, w = opt.metodes[metode], nom = METODES.find(m => m[0] === metode)[1];
    $('#pa-pes-t').textContent = `${nom}. Toca un altre mètode a dalt per comparar-los.`;
    const ord = ids.map((id, i) => [id, w[i]]).sort((a, b) => b[1] - a[1]);
    $('#pa-pesos').innerHTML = ord.map(([id, x]) => `<div class="pa__pr"><span>${esc(D.actius[id].nom)}</span><span class="pa__pb"><i style="width:${(x * 100).toFixed(1)}%;background:${COL[metode]}"></i></span><b>${pc(x)}</b></div>`).join('');
  }

  function pintaCorr() {
    const { ids, opt } = estat, n = ids.length, c = opt.corr;
    const col = v => v >= 0 ? `rgba(176,129,31,${(.08 + .82 * v).toFixed(2)})` : `rgba(44,110,143,${(.08 + .82 * -v).toFixed(2)})`;
    $('#pa-corr').innerHTML = `<table><thead><tr><th></th>${ids.map(id => `<th title="${esc(D.actius[id].nom)}">${esc(D.actius[id].ticker.replace('-USD', ''))}</th>`).join('')}</tr></thead><tbody>${ids.map((id, i) =>
      `<tr><th title="${esc(D.actius[id].nom)}">${esc(D.actius[id].ticker.replace('-USD', ''))}</th>${ids.map((_, j) => `<td style="background:${col(c[i][j])}${Math.abs(c[i][j]) > .6 ? ';color:#fbf6ea' : ''}">${i === j ? '' : nf(c[i][j], 2).replace(/^(-?)0,/, '$1,')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    void n;
  }

  function pintaBacktest() {
    const { ids, tot, opt, rf, tall, oos } = estat;
    const reb = $('#pa-reb').value, aportacio = Math.max(0, +$('#pa-ap').value || 0);
    const filtre = $('#pa-filtre').checked ? ids.map((id, i) => [id, i]).filter(([id]) => D.actius[id].grup === 'Borsa' || id === 'BTC').map(x => x[1]) : null;
    const op = { reb, aportacio, filtre };
    const triada = M.backtest(tot.R, tot.dates, opt.metodes[metode], op);
    const igual = M.backtest(tot.R, tot.dates, opt.metodes.igual, { reb, aportacio });
    // borsa mundial als mateixos dies (si comença després, la sèrie arrenca quan n'hi ha)
    const mon = D.actius.MON, off = D.dates.length - mon.p.length, idx = new Map(D.dates.map((d, i) => [d, i]));
    const Rm = tot.dates.map((d, t) => { const i = idx.get(d), ant = t ? idx.get(tot.dates[t - 1]) : i - 1; return (i - off > 0 && ant - off >= 0) ? [mon.p[i - off] / mon.p[ant - off] - 1] : [0]; });
    const borsa = M.backtest(Rm, tot.dates, [1], { reb: 'mai', aportacio });
    const series = [[METODES.find(m => m[0] === metode)[1], triada, COL[metode], 2.6], ['Parts iguals', igual, '#857b63', 1.6], ['Borsa mundial', borsa, '#2c6e8f', 1.6]];
    if (metode === 'igual') series.splice(1, 1);
    const W = ample('#pa-bt'), H = W < 520 ? 260 : 340, P = { l: W < 520 ? 50 : 64, r: 12, t: 14, b: 32 }, T = tot.dates.length;
    const vals = series.flatMap(s => s[1].valor).concat(triada.invertit);
    const y0 = Math.min(...vals) * .95, y1 = Math.max(...vals) * 1.03;
    const X = escala(0, T - 1, P.l, W - P.r), Y = escala(y0, y1, H - P.b, P.t);
    const cami = v => { let d = '', pas = Math.max(1, Math.floor(T / 700)); for (let t = 0; t < T; t += pas) d += `${d ? 'L' : 'M'}${X(t).toFixed(1)},${Y(v[t]).toFixed(1)}`; return d + `L${X(T - 1).toFixed(1)},${Y(v[T - 1]).toFixed(1)}`; };
    const anys = []; for (let t = 1; t < T; t++) if (tot.dates[t].slice(0, 4) !== tot.dates[t - 1].slice(0, 4)) anys.push(t);
    const cadaAny = Math.ceil(anys.length / (W < 520 ? 4 : 8));
    const eixX = anys.filter((_, i) => i % cadaAny === 0).map(t => `<g><line x1="${X(t)}" x2="${X(t)}" y1="${P.t}" y2="${H - P.b}" class="g"/><text x="${X(t)}" y="${H - P.b + 18}" text-anchor="middle">${tot.dates[t].slice(0, 4)}</text></g>`).join('');
    const eixY = ticks(y0, y1, 5).map(v => `<g><line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="g"/><text x="${P.l - 8}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v / 1000).toLocaleString('ca-ES')}k €</text></g>`).join('');
    // franges on el filtre de caigudes estava fora de borsa
    let franges = '';
    if (filtre) { let a = -1; triada.senyal.forEach((s, t) => { if (s && a < 0) a = t; if ((!s || t === T - 1) && a >= 0) { franges += `<rect x="${X(a)}" y="${P.t}" width="${Math.max(1, X(t) - X(a))}" height="${H - P.b - P.t}" fill="rgba(181,70,61,.1)"/>`; a = -1; } }); }
    const linOos = oos ? `<line x1="${X(tall)}" x2="${X(tall)}" y1="${P.t}" y2="${H - P.b}" stroke="#1d1a13" stroke-dasharray="4 4"/><text x="${X(tall) + 6}" y="${P.t + 14}" class="t">Fora de mostra</text>` : '';
    const inv = aportacio ? `<path d="${cami(triada.invertit)}" fill="none" stroke="#857b63" stroke-dasharray="2 4" stroke-width="1.4"/>` : '';
    $('#pa-bt').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolució de 10.000 euros invertits">${franges}${eixX}${eixY}${inv}${linOos}
      ${series.slice().reverse().map(([, s, c, w]) => `<path d="${cami(s.valor)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/>`).join('')}</svg>
      <p class="pa__lleg">${series.map(([n, , c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('')}${aportacio ? '<span><i class="l d"></i>Diners aportats</span>' : ''}${filtre ? '<span><i style="background:rgba(181,70,61,.25)"></i>Filtre actiu (fora de borsa)</span>' : ''}</p>`;
    // taula: valor final i mètriques del tram que toca (tot, o només fora de mostra)
    const t0 = oos ? tall : 0;
    $('#pa-bt-t').innerHTML = `<table class="pa__t"><thead><tr><th>${oos ? 'Només el tram fora de mostra' : 'Tot el període'}</th><th>Valor final</th><th>Rendiment anual</th><th>Volatilitat</th><th>Pitjor caiguda</th><th>Sharpe</th></tr></thead><tbody>${series.map(([n, s, c]) => {
      const m = M.metriques(s.rd.slice(t0), rf);
      return `<tr><th><i class="pa__dot" style="background:${c}"></i>${n}</th><td>${eur(s.valor[T - 1])}</td><td>${pc(m.ret)}</td><td>${pc(m.vol)}</td><td>${pc(m.mdd)}</td><td>${nf(m.sharpe)}</td></tr>`; }).join('')}</tbody></table>
      ${aportacio ? `<p class="pa__nota">Has aportat ${eur(triada.invertit[T - 1])} en total. Les mètriques no compten les aportacions com a rendiment.</p>` : ''}`;
  }

  /* ---------- esdeveniments ---------- */
  function engega() {
    pintaActius();
    $('#pa-form').addEventListener('submit', e => { e.preventDefault(); calcula(); });
    $('#pa-met').addEventListener('click', e => { const b = e.target.closest('.pa__m'); if (!b || !estat) return; metode = b.dataset.k; pinta(); });
    ['#pa-reb', '#pa-ap', '#pa-filtre'].forEach(s => $(s).addEventListener('change', () => estat && pintaBacktest()));
    $('#pa-oos').addEventListener('change', () => estat && calcula());
    let ultim = innerWidth, rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (estat && Math.abs(innerWidth - ultim) > 40) { ultim = innerWidth; pinta(); } }, 200); });
    calcula();
  }
  fetch(document.body.dataset.dades || '/cartera/dades-cartera.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(d => { D = d; engega(); })
    .catch(() => { $('#pa-err').textContent = "No s'han pogut carregar les dades. Torna-ho a provar d'aquí a una estona."; });
})();
