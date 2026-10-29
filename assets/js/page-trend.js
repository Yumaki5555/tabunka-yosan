// 年度別の推移・期間比較（2つの年度を比べる／過去5年間／過去11年間）
// 同じ事業は事業IDで年度をまたいで追いかける。内容が大きく変わった事業は別IDで、前身の事業IDでつなぐ。

import { db, loadDetail, loadPopulation, popOf, status, cell, ratio } from './store.js';
import { $, $$, esc, yen, yenExact, pct, num, diffYen, fyFull, ratioPct } from './util.js';
import { href, go, currentYear, currentStage } from './app.js';
import { muniPicker, stLabel, fieldLabel, exploreTabs, scopeNoteHTML } from './components.js';
import { ICON } from './icons.js';
import { columnChart, COLORS } from './charts.js';
import { COUNTED, countedAmount, matchedPair } from './calc.js';
import { FIELDS } from './schema.js';

const val = (code, y, s) => { const st = status(code, y, s), c = cell(code, y, s); if (st === '該当事業なし') return 0; return c && COUNTED.has(st) ? c.a : null; };

export async function trendPage(ctx) {
  const { app, params } = ctx;
  await loadPopulation();
  const code = params.get('c');
  const m = db.byCode.get(code || '');
  const ys = db.years, last = ys[ys.length - 1];
  const mode = ['two', '5', '11'].includes(params.get('mode')) ? params.get('mode') : 'two';
  const stage = currentStage(params);
  let b = Number(params.get('b')) || currentYear(params), a = Number(params.get('a')) || b - 1;
  if (!ys.includes(a)) a = ys[0];
  if (!ys.includes(b)) b = last;
  if (a > b) [a, b] = [b, a];
  const ind = params.get('i') === 'ratio' ? 'ratio' : 'amt';
  const nav = (o = {}) => go('/trend', { c: code, mode, a, b, s: stage === '決算' ? '決算' : '', i: ind === 'ratio' ? 'ratio' : '', ...o });

  app.innerHTML = `${exploreTabs('trend', b, ICON)}<div class="page-head"><h1>年度別の変化</h1>
    <p class="lead">自治体を選ぶと、予算額や一般会計に占める割合の変化を年度ごとに見られます。2つの年度の比較や、事業の新設・廃止、使い道ごとの増減もわかります。</p></div>
    <div id="t-pick"></div><div id="t-body"></div>`;
  muniPicker($('#t-pick'), { id: 't-q', label: m ? '別の自治体を選ぶ' : '自治体を選ぶ', fy: b, big: !m, onPick: x => go('/trend', { c: x.code, mode, a, b, i: ind === 'ratio' ? 'ratio' : '' }) });
  const body = $('#t-body');
  if (!m) {
    const withMulti = Object.keys(db.sum).filter(c => Object.keys(db.sum[c]).length >= 2).map(c => db.byCode.get(c));
    body.innerHTML = `<p class="info">自治体を選んでください。</p>${withMulti.length ? `<details class="side-list" open><summary>2年度以上のデータがある自治体（${withMulti.length}）</summary><ul class="muni-list">${withMulti.map(x => `<li><a href="${href('/trend', { c: x.code })}">${esc(x.full)}</a><span class="small muted">${Object.keys(db.sum[x.code]).sort().join('・')}年度</span></li>`).join('')}</ul></details>` : '<p class="note">2つ以上の年度のデータがそろった自治体は、まだありません。過去の年度の調査（第3段階）が進むと比べられるようになります。</p>'}`;
    return;
  }
  const detail = await loadDetail(m.pc);
  const P = new Map(detail.projects.filter(p => p.code === code).map(p => [p.project_id, p]));
  const B = detail.budgets.filter(x => x.code === code && x.stage === stage && x.verified === '確認済み');
  const F = new Map(detail.funds.filter(f => f.code === code && f.stage === stage && f.verified === '確認済み').map(f => [`${f.project_id}|${f.fy}`, f]));
  const range = mode === 'two' ? [a, b] : ys.slice(-Number(mode));

  body.innerHTML = `
    <h2>${esc(m.full)}</h2>
    <div class="ctl"><span class="label">見方</span><div class="seg" role="group" aria-label="見方">${[['two', '2つの年度を比べる'], ['5', '過去5年間'], ['11', '過去11年間']].map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}</div></div>
    ${mode === 'two' ? `<div class="ctl-row"><label class="ctl"><span class="label">比べる年度（前）</span><select id="t-a">${ys.map(y => `<option value="${y}"${y === a ? ' selected' : ''}>${fyFull(y)}</option>`).join('')}</select></label>
      <label class="ctl"><span class="label">比べる年度（後）</span><select id="t-b">${ys.map(y => `<option value="${y}"${y === b ? ' selected' : ''}>${fyFull(y)}</option>`).join('')}</select></label></div>` : ''}
    <div class="ctl-row"><div class="ctl"><span class="label">予算か決算か</span><div class="seg seg-sm" role="group" aria-label="予算か決算か">${['当初予算', '決算'].map(s => `<button type="button" data-stage="${s}" aria-pressed="${stage === s}">${s}</button>`).join('')}</div></div>
    <div class="ctl"><span class="label">グラフの指標</span><div class="seg seg-sm" role="group" aria-label="グラフの指標"><button type="button" data-ind="amt" aria-pressed="${ind === 'amt'}">予算額</button><button type="button" data-ind="ratio" aria-pressed="${ind === 'ratio'}">一般会計に占める割合</button></div></div></div>
    <p class="cond"><b>条件：</b>${esc(m.full)}・${stage}・多文化共生関連予算の合計（自治体のページと同じ数え方。①直接給付・支援＋②行政経費＋③一般事業のうち分かった部分）・${mode === 'two' ? `${a}年度と${b}年度` : `${range[0]}〜${range[range.length - 1]}年度`}。調査していない年度は「未調査」として比べません。</p>
    ${scopeNoteHTML()}
    <div id="t-main"></div>`;
  $$('[data-mode]', body).forEach(x => x.addEventListener('click', () => nav({ mode: x.dataset.mode })));
  $$('[data-stage]', body).forEach(x => x.addEventListener('click', () => nav({ s: x.dataset.stage === '決算' ? '決算' : '' })));
  $$('[data-ind]', body).forEach(x => x.addEventListener('click', () => nav({ i: x.dataset.ind === 'ratio' ? 'ratio' : '' })));
  $('#t-a')?.addEventListener('change', e => nav({ a: e.target.value }));
  $('#t-b')?.addEventListener('change', e => nav({ b: e.target.value }));

  const main = $('#t-main');
  const ok = y => val(code, y, stage) !== null;
  // 一部の資料だけ調べた年度は、調べた範囲の差で増減が大きく見えるので、ほかの年度と比べない（増減・事業の新設・廃止を出さない）
  const part = y => status(code, y, stage) === '一部確認';
  const cmp = y => ok(y) && !part(y);
  // 推移のグラフ（範囲の年度）
  const chartBox = document.createElement('div');
  chartBox.dataset.title = '推移';
  if (ind === 'ratio') {
    const rs = range.map(y => ratio(code, y, stage));
    main.appendChild(Object.assign(document.createElement('h3'), { textContent: `一般会計に占める割合（${stage}）` }));
    main.appendChild(chartBox);
    columnChart(chartBox, { cats: range, catLabel: (y, sm) => sm && range.length > 6 ? String(y).slice(2) : `${y}年度`, unit: 'ratio', missingLabel: '未確認', series: [{ label: '一般会計に占める割合', color: COLORS[stage], values: rs.map(r => r.v), missing: rs.map(r => r.why === '一般会計の総額が未確認' ? '一般会計の総額は未確認' : r.why || '—') }] });
    main.insertAdjacentHTML('beforeend', `<p class="chart-cap">一般会計の総額を確かめた年度だけ出しています（短い縦線は未確認・未調査で、0%ではありません）。${rs.some(r => r.partial) ? '一部の資料だけ調べた年度は「確認済み分の割合」です。' : ''}</p>`);
  } else {
    main.appendChild(Object.assign(document.createElement('h3'), { textContent: `多文化共生関連予算の合計（${stage}）` }));
    main.appendChild(chartBox);
    columnChart(chartBox, { cats: range, catLabel: (y, sm) => sm && range.length > 6 ? String(y).slice(2) : `${y}年度`, series: [{ label: stage, color: COLORS[stage], values: range.map(y => val(code, y, stage)), missing: range.map(y => stLabel(status(code, y, stage))) }] });
  }

  // 基本集計に入る行（①②の金額・③の外国人関連部分）。財源は①②の事業だけ（③の部分には事業全体の財源を当てはめない）
  const inSum = x => countedAmount(P.get(x.project_id), x) !== null;
  const sumBy = (y, fn) => B.filter(x => x.fy === y && inSum(x)).reduce((s, x) => s + fn(x), 0);
  const fieldOf = (y, f) => sumBy(y, x => P.get(x.project_id).field === f ? countedAmount(P.get(x.project_id), x) : 0);
  const fundOf = (y, k) => sumBy(y, x => P.get(x.project_id).relation !== '③' ? F.get(`${x.project_id}|${y}`)?.[k] || 0 : 0);
  const projsIn = y => new Set(B.filter(x => x.fy === y && inSum(x)).map(x => x.project_id));

  // 表：年度ごとの合計・分野・財源
  const cols = range;
  // dfmt：増減の書き方（円・件・人）。always：調査していない年度でも出す（外国人住民数）。noPct：増減の率を出さない
  const tableRow = (label, fn, fmt = yenExact, dfmt = diffYen, always = false, noPct = false) => `<tr><td>${label}</td>${cols.map(y => `<td class="num">${ok(y) || always ? esc(fmt(fn(y))) : `<small>${esc(stLabel(status(code, y, stage)))}</small>`}</td>`).join('')}${mode === 'two' ? `<td class="num">${(cmp(a) && cmp(b)) || always ? esc(dfmt(fn(b) - fn(a))) + (fn(a) && !noPct ? `<br><small>${esc(pct((fn(b) - fn(a)) / fn(a)))}</small>` : '') : '—'}</td>` : ''}</tr>`;
  // 2つの年度を比べるときは、増減の率を両方の年度に金額がある同じ事業どうしで出す（合計の行は差の金額だけ）
  const ym = mode === 'two' && cmp(a) && cmp(b) && a !== b ? matchedPair(P, B, a, b, stage) : null;
  const ymRow = ym ? `<tr><td>うち同じ事業どうし（${num(ym.n)}件）</td><td class="num">${esc(yenExact(ym.p))}</td><td class="num">${esc(yenExact(ym.c))}</td><td class="num">${esc(diffYen(ym.c - ym.p))}${ym.p > 0 ? `<br><small>${esc(pct((ym.c - ym.p) / ym.p))}</small>` : ''}</td></tr>
      <tr><td>${a}年度だけの事業</td><td class="num">${esc(yenExact(ym.o0w))}<br><small>${num(ym.o0n)}件</small></td><td class="num">—</td><td class="num">—</td></tr>
      <tr><td>${b}年度だけの事業</td><td class="num">—</td><td class="num">${esc(yenExact(ym.o1w))}<br><small>${num(ym.o1n)}件</small></td><td class="num">—</td></tr>` : '';
  const diffN = u => n => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${num(Math.abs(n))}${u}`;
  const fundKnown = cols.some(y => ok(y) && ['national', 'pref', 'national_pref', 'bond', 'other', 'general'].some(k => fundOf(y, k) > 0));
  main.insertAdjacentHTML('beforeend', `<h3>使い道ごとの増減・財源の変化</h3>
    <div class="table-wrap"><table><thead><tr><th>項目</th>${cols.map(y => `<th class="num">${y}年度${ok(y) && part(y) ? '<br><small>一部の資料だけ調査</small>' : ''}</th>`).join('')}${mode === 'two' ? '<th class="num">増減</th>' : ''}</tr></thead><tbody>
      ${tableRow('<b>多文化共生関連予算の合計</b>', y => val(code, y, stage), yenExact, diffYen, false, !!ym)}
      ${ymRow}
      <tr><td>一般会計に占める割合</td>${cols.map(y => { const r = ratio(code, y, stage); return `<td class="num">${r.v !== null ? esc(ratioPct(r.v)) : '<small>未確認</small>'}</td>`; }).join('')}${mode === 'two' ? '<td class="num">—</td>' : ''}</tr>
      ${FIELDS.filter(f => cols.some(y => fieldOf(y, f))).map(f => tableRow(`使い道：${esc(fieldLabel(f))}`, y => fieldOf(y, f))).join('')}
      ${fundKnown ? `${tableRow('財源：国からの補助', y => fundOf(y, 'national'))}
      ${tableRow('財源：都道府県からの補助', y => fundOf(y, 'pref'))}
      ${tableRow('財源：国・都道府県（区別なし）', y => fundOf(y, 'national_pref'))}
      ${tableRow('財源：自治体自身のお金（一般財源）', y => fundOf(y, 'general'))}
      ${tableRow('財源：地方債・その他', y => fundOf(y, 'bond') + fundOf(y, 'other'))}
      ${tableRow('財源が分からない分', y => (val(code, y, stage) || 0) - ['national', 'pref', 'national_pref', 'bond', 'other', 'general'].reduce((s, k) => s + fundOf(y, k), 0))}` : `<tr><td>財源</td><td colspan="${cols.length + (mode === 'two' ? 1 : 0)}"><small>事業ごとの財源の内訳がわかるデータがありません</small></td></tr>`}
      ${tableRow('合計に入れた事業の数', y => projsIn(y).size, n => `${n}件`, diffN('件'))}
      ${tableRow('外国人住民数（前年12月末）', y => popOf(code, y)?.foreign || 0, n => n ? `${num(n)}人` : '—', diffN('人'), true)}
    </tbody></table></div>
    ${ym ? `<p class="small">増減の率は、両方の年度に金額がある同じ事業（前身の事業でつないだ事業を含む）どうしで比べています。片方の年度だけの事業には、新しく始まった事業・終わった事業のほか、前の年度の補正予算に前倒しして当初予算に載らなかった事業や、片方の年度だけ金額が分かった事業が入り、合計の差が実際の変化とずれるためです。</p>` : ''}
    ${cols.some(y => ok(y) && part(y)) ? `<p class="small">「一部の資料だけ調査」の年度は、見つかって確かめられた事業だけの合計です。調べた範囲の差で増減が実際より大きく見えるので、${mode === 'two' ? 'この年度との増減は出していません。' : 'ほかの年度と単純に比べられません。'}</p>` : ''}
    <p class="small muted">財源は、その事業だけの内訳が資料にあるものだけを足しています。財源が分からない分は、自治体自身の負担として数えていません。外国人住民数と予算の増減に、直接の因果関係があるとは限りません。</p>`);

  // 事業の新設・廃止
  const changes = [];
  const pairs = mode === 'two' ? [[a, b]] : cols.slice(1).map((y, i) => [cols[i], y]);
  for (const [y0, y1] of pairs) {
    if (!ok(y0) || !ok(y1)) { changes.push(`<li><b>${y0}→${y1}年度</b>：どちらかの年度が未調査のため、新設・廃止は判断できません。</li>`); continue; }
    if (part(y0) || part(y1)) { changes.push(`<li><b>${y0}→${y1}年度</b>：どちらかの年度が一部の資料だけ調べた年度のため、新設・廃止は判断できません。</li>`); continue; }
    const s0 = projsIn(y0), s1 = projsIn(y1);
    const add = [...s1].filter(id => !s0.has(id)), del = [...s0].filter(id => !s1.has(id));
    const name = id => { const p = P.get(id); const pred = p.predecessor && P.get(p.predecessor); return `${esc(p.name)}${pred ? `<small>（前身：${esc(pred.name)}）</small>` : ''}`; };
    changes.push(`<li><b>${y0}→${y1}年度</b>：${add.length || del.length ? `${add.length ? `新しく出てきた事業 ${add.map(name).join('、')}` : ''}${add.length && del.length ? '／' : ''}${del.length ? `出てこなくなった事業 ${del.map(name).join('、')}` : ''}` : '事業の出入りなし'}</li>`);
  }
  main.insertAdjacentHTML('beforeend', `<h3>事業の新設・廃止</h3><ul>${changes.join('')}</ul>
    <p class="small muted">「出てこなくなった事業」は、その年度の資料に名前が出てこなかったものです。ほかの事業にまとめられた場合もあります。年度で名前が変わっても中身が同じ事業は、同じ事業IDで追いかけています。</p>
    <p><a class="btn btn-outline" href="${href('/m/' + code, { y: b })}">${esc(m.name)}のページへ</a></p>`);
}
