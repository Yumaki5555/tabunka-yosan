// 自治体を比較（2〜3自治体がおすすめ、最大5）。予算額・一般会計に占める割合・1人当たりをカードと横棒で、使い道（10分類）を帯で比べる

import { db, loadPopulation, popOf, status, cell, ratio, generalOf } from './store.js';
import { $, $$, esc, yen, yenExact, yenPer, num, fyFull, download, ratioPct } from './util.js';
import { href, go, currentYear, currentStage, yearPicker, bindYearPicker, stageSeg } from './app.js';
import { muniPicker, statusBadge, stLabel, fieldLabel, exploreTabs, ratioView, scopeNoteHTML } from './components.js';
import { hbarChart, stackChart, columnChart, COLORS } from './charts.js';
import { COUNTED, fundCoverage } from './calc.js';
import { FIELDS } from './schema.js';
import { ICON } from './icons.js';
import { toCSV } from './csv.js';
import { SUMMARY_CSV_HEADER, summaryRow } from './export.js';

const MAX = 5;

export async function comparePage(ctx) {
  const { app, params } = ctx;
  await loadPopulation();
  const fy = currentYear(params), stage = currentStage(params);
  const codes = [...new Set((params.get('c') || '').split(',').filter(c => db.byCode.has(c)))].slice(0, MAX);
  const ms = codes.map(c => db.byCode.get(c));
  const nav = (cs, y = fy, s = stage) => go('/compare', { c: cs.join(','), y, s: s === '決算' ? '決算' : '' });

  app.innerHTML = `${exploreTabs('compare', fy, ICON)}
    <div class="page-head"><h1>自治体を比較</h1>
      <p class="lead">2〜3の自治体を選ぶと、予算額・一般会計に占める割合・使い道を並べて比べられます（最大5つ）。</p></div>
    <div class="cmp-pick"><div id="c-pick"></div>
      <div class="cmp-chips">${ms.map(m => `<span class="chip">${esc(m.full)}<button type="button" data-rm="${m.code}" aria-label="${esc(m.full)}を外す">×</button></span>`).join('')}</div></div>
    <div class="ctl-row">
      <div class="ctl"><span class="label">年度</span>${yearPicker(fy, 'c-fy')}</div>
      <div class="ctl"><span class="label">予算か決算か</span>${stageSeg(stage)}</div>
    </div>
    <div id="c-body"></div>`;
  if (ms.length < MAX) muniPicker($('#c-pick'), { id: 'c-q', label: ms.length ? `比べる自治体を追加（あと${MAX - ms.length}つ）` : '比べる自治体を選ぶ', fy, onPick: m => nav([...codes.filter(c => c !== m.code), m.code]) });
  else $('#c-pick').innerHTML = `<p class="info">5つまで選べます。入れ替えるときは、下の × で外してください。</p>`;
  $$('[data-rm]', app).forEach(b => b.addEventListener('click', () => nav(codes.filter(c => c !== b.dataset.rm))));
  bindYearPicker(app, y => nav(codes, y));
  $$('[data-stage]', app).forEach(b => b.addEventListener('click', () => nav(codes, fy, b.dataset.stage)));

  const body = $('#c-body');
  if (!ms.length) {
    // 例：外国人住民の多い、主な資料を調査済みの市（同じ年度）
    const ex = db.munis.filter(m => !m.isPref && status(m.code, fy, stage) === '確認済み' && ratio(m.code, fy, stage).v !== null)
      .sort((a, b) => (popOf(b.code, fy)?.foreign || 0) - (popOf(a.code, fy)?.foreign || 0)).slice(0, 3);
    body.innerHTML = `<p class="info">上の欄に自治体名を入れて選んでください。${ex.length >= 2 ? `<br>例：<a href="${href('/compare', { c: ex.map(m => m.code).join(','), y: fy })}">${ex.map(m => esc(m.full)).join('・')}を比べる</a>` : ''}</p>`;
    return;
  }

  const rows = ms.map(m => {
    const c = cell(m.code, fy, stage);
    const st = status(m.code, fy, stage);
    const ok = c && COUNTED.has(st) && c.a !== null;
    const v = st === '該当事業なし' ? 0 : ok ? c.a : null;
    return { m, c, st, v, p: popOf(m.code, fy), r: ratioView(m.code, fy, stage), g: generalOf(m.code, fy, stage) };
  });
  const reasons = [];
  if (ms.some(m => m.isPref) && ms.some(m => !m.isPref)) reasons.push('都道府県と市区町村が混ざっています。都道府県の金額は県庁の予算で、県内の市区町村の予算は含みません。役割がちがうので、同じ物差しでは比べにくい組み合わせです。');
  for (const r of rows) {
    if (r.st === '一部確認') reasons.push(`${r.m.full}は「${stLabel('一部確認')}」です。確認できた事業だけの合計なので、実際より少ない可能性があります（割合は確認済み分の割合）。`);
    else if (r.v === null) reasons.push(`${r.m.full}は${fyFull(fy)}の${stage}が「${stLabel(r.st)}」のため、金額を比べられません。`);
    else if (r.r.v === null) reasons.push(`${r.m.full}は一般会計に占める割合を出していません（${r.r.sub || r.r.text}）。`);  }
  const ok = rows.filter(r => r.v !== null);
  body.innerHTML = `
    ${reasons.length ? `<div class="note"><b>そろっていない点</b><ul>${reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : `<p class="info small">選んだ自治体は、同じ条件（${esc(fyFull(fy))}・${esc(stage)}・${esc(stLabel('確認済み'))}）でそろっています。ほかの事業にまざって金額が分からない支出は、どの自治体にも入っていません。</p>`}
    <div class="cmp-cards2">${rows.map(r => `<div class="cmp-kpi">
      <a class="ck-name" href="${href('/m/' + r.m.code, { y: fy, s: stage === '決算' ? '決算' : '' })}">${esc(r.m.full)}</a>${statusBadge(r.st)}
      <p class="ck-k">多文化共生関連予算</p><p class="ck-v">${r.v !== null ? esc(yen(r.v)) : `<span class="tc-text">${esc(stLabel(r.st))}</span>`}</p>
      <p class="ck-k">一般会計に占める割合</p><p class="ck-v2">${esc(r.r.text)}</p>${r.r.sub ? `<p class="ck-s">${esc(r.r.sub)}</p>` : ''}
      <p class="ck-k">住民1人当たり</p><p class="ck-v3">${r.v !== null && r.p?.population ? esc(yenPer(r.v / r.p.population)) : '—'}</p>
    </div>`).join('')}</div>
    ${ok.some(r => r.v > 0) ? scopeNoteHTML() : ''}

    <section class="section"><h2 class="sec-h">予算額</h2><div id="cc-total"></div></section>
    <section class="section"><h2 class="sec-h">一般会計に占める割合</h2><div id="cc-ratio"></div></section>
    <section class="section"><h2 class="sec-h">使い道（10分類）の割合</h2><p class="chart-cap">それぞれの自治体の合計を100%として、使い道ごとの割合を並べました。帯を押すと金額が出ます。</p><div id="cc-use"></div></section>

    <section class="deep"><h2 class="sec-h">さらに詳しく比べる</h2>
      <details class="dd"><summary>${ICON.people}<span>住民1人当たり・外国人住民1人当たり</span></summary><h3>住民1人当たり</h3><div id="cc-pc"></div><h3>外国人住民1人当たり（参考）</h3><div id="cc-pf"></div><p class="small muted">合計を人数で割った目安で、1人に支払われた金額ではありません。</p></details>
      <details class="dd"><summary>${ICON.yen}<span>財源の内訳</span></summary><div id="cc-fund"></div></details>
      <details class="dd"><summary>${ICON.trend}<span>当初予算の推移</span></summary><p class="chart-cap">自治体ごとに別のグラフにしています（目盛りは自治体ごとにちがいます）。</p><div class="small-multi" id="cc-trend"></div></details>
      <details class="dd"><summary>${ICON.list}<span>数字の表で見る</span></summary><div id="cc-table"></div>
        <p><button type="button" class="btn btn-outline btn-small" id="c-csv">比較結果をCSVでダウンロード</button></p></details>
    </section>`;

  hbarChart($('#cc-total'), { rows: rows.map(r => ({ label: r.m.full, value: r.v ?? 0, sub: r.v === null ? stLabel(r.st) : r.st === '一部確認' ? '一部の資料だけ調査' : '' })) });
  hbarChart($('#cc-ratio'), { rows: rows.map(r => ({ label: r.m.full, value: r.r.v ?? 0, sub: r.r.v === null ? (r.r.sub || r.r.text) : r.g ? `一般会計 ${yen(r.g, { approx: true })}` : '' })), fmt: v => ratioPct(v) });
  const useRows = ok.filter(r => r.v > 0 && r.c?.f);
  if (useRows.length) stackChart($('#cc-use'), {
    full: true,
    keys: FIELDS.filter(f => useRows.some(r => r.c.f[f])).map(f => ({ key: f, label: fieldLabel(f), color: COLORS.field[f] })),
    rows: useRows.map(r => ({ label: r.m.full, parts: r.c.f })),
  });
  else $('#cc-use').innerHTML = '<p class="muted">使い道を比べられる金額がありません。</p>';
  // 詳しく比べる（開いたときに描く）
  const once = (sel, fn) => { const d = $(sel).closest('details'); d.addEventListener('toggle', () => { if (d.open && !d.dataset.done) { d.dataset.done = '1'; fn(); } }); };
  once('#cc-pc', () => {
    hbarChart($('#cc-pc'), { rows: rows.map(r => ({ label: r.m.full, value: r.v !== null && r.p?.population ? r.v / r.p.population : 0, sub: r.v === null ? stLabel(r.st) : '' })), fmt: v => yenPer(v) });
    hbarChart($('#cc-pf'), { rows: rows.map(r => ({ label: r.m.full, value: r.v !== null && r.p?.foreign ? r.v / r.p.foreign : 0, sub: r.v === null ? stLabel(r.st) : r.p?.foreign ? `外国人住民 ${num(r.p.foreign)}人` : '' })), fmt: v => yenPer(v) });
  });
  once('#cc-fund', () => {
    const fRows = rows.filter(r => r.c?.fd && r.v);
    if (fRows.length) stackChart($('#cc-fund'), {
      keys: [{ key: 'national', label: '国からの補助', color: COLORS.fund.national }, { key: 'pref', label: '都道府県からの補助', color: COLORS.fund.pref }, { key: 'national_pref', label: '国・都道府県（区別なし）', color: COLORS.fund.national_pref }, { key: 'general', label: '自治体自身のお金（一般財源）', color: COLORS.fund.general }, { key: 'bondOther', label: '地方債・その他', color: COLORS.fund.bondOther }, { key: 'unknown', label: '財源が分からない分', color: COLORS.fund.unknown, pattern: true }],
      rows: fRows.map(r => ({ label: r.m.full, parts: { ...r.c.fd, bondOther: r.c.fd.bond + r.c.fd.other } })),
    });
    else $('#cc-fund').innerHTML = '<p class="muted">財源の内訳を比べられるデータがありません。</p>';
  });
  once('#cc-trend', () => {
    for (const r of rows) {
      const card = document.createElement('div'); card.className = 'card';
      card.innerHTML = `<h4>${esc(r.m.full)}</h4>`;
      const ch = document.createElement('div'); ch.dataset.title = r.m.full + 'の推移'; card.appendChild(ch);
      $('#cc-trend').appendChild(card);
      columnChart(ch, { cats: db.years, catLabel: y => String(y).slice(2), highlight: fy, height: 180, series: [{ label: '当初予算', color: COLORS['当初予算'], values: db.years.map(y => { const c = cell(r.m.code, y, '当初予算'); const st = status(r.m.code, y, '当初予算'); return st === '該当事業なし' ? 0 : c && COUNTED.has(st) ? c.a : null; }), missing: db.years.map(y => stLabel(status(r.m.code, y, '当初予算'))) }] });
    }
  });
  once('#cc-table', () => {
    const fundRow = (label, fn) => `<tr><td>${label}</td>${rows.map(r => `<td class="num">${r.v !== null && r.c?.fd ? fn(r) : '—'}</td>`).join('')}</tr>`;
    $('#cc-table').innerHTML = `<p class="cond"><b>比べる条件：</b>${fyFull(fy)}・${stage}・公式資料で確認できた多文化共生関連予算（自治体のページと同じ数え方）。人口は住民基本台帳（${fy}年1月1日）、外国人住民数は在留外国人統計（${fy - 1}年12月末）。</p>
      <div class="table-wrap"><table><thead><tr><th>項目</th>${rows.map(r => `<th class="num"><a href="${href('/m/' + r.m.code, { y: fy })}">${esc(r.m.full)}</a></th>`).join('')}</tr></thead><tbody>
      <tr><td>調査状況（${stage}）</td>${rows.map(r => `<td class="num">${statusBadge(r.st)}</td>`).join('')}</tr>
      <tr><td><b>多文化共生関連予算（当初予算）</b></td>${rows.map(r => `<td class="num">${cellText(r.m.code, '当初予算', fy)}</td>`).join('')}</tr>
      <tr><td>多文化共生関連予算（決算）</td>${rows.map(r => `<td class="num">${cellText(r.m.code, '決算', fy)}</td>`).join('')}</tr>
      <tr><td><b>一般会計に占める割合（${stage}）</b></td>${rows.map(r => `<td class="num">${esc(r.r.text)}${r.r.sub ? `<br><small>${esc(r.r.sub)}</small>` : ''}</td>`).join('')}</tr>
      <tr><td>一般会計の予算総額（${stage}）</td>${rows.map(r => `<td class="num">${r.g ? esc(yen(r.g, { approx: true })) : '未確認'}</td>`).join('')}</tr>
      <tr><td>　合計に入れた事業の数</td>${rows.map(r => `<td class="num">${r.v !== null ? `${r.c?.an ?? 0}件` : '—'}</td>`).join('')}</tr>
      <tr><td>　うち① 直接給付・支援</td>${rows.map(r => `<td class="num">${r.v !== null ? esc(yen(r.c?.d1 || 0)) : '—'}</td>`).join('')}</tr>
      <tr><td>　うち② 行政経費</td>${rows.map(r => `<td class="num">${r.v !== null ? esc(yen(r.c?.d2 || 0)) : '—'}</td>`).join('')}</tr>
      <tr><td>　うち③ 一般事業の外国人関連部分</td>${rows.map(r => `<td class="num">${r.v !== null ? esc(yen(r.c?.d3 || 0)) : '—'}</td>`).join('')}</tr>
      ${FIELDS.filter(f => rows.some(r => r.c?.f?.[f])).map(f => `<tr><td>　使い道：${esc(fieldLabel(f))}</td>${rows.map(r => `<td class="num">${r.v !== null ? esc(yen(r.c?.f?.[f] || 0)) : '—'}</td>`).join('')}</tr>`).join('')}
      ${fundRow('財源の内訳を確認できた割合', r => { const fc = fundCoverage(r.c); return fc ? `${(fc.rate * 100).toFixed(1)}%` : '—'; })}
      <tr><td>外国人住民数</td>${rows.map(r => `<td class="num">${r.p?.foreign ? num(r.p.foreign) + '人' : '—'}</td>`).join('')}</tr>
      <tr><td>外国人住民の割合</td>${rows.map(r => `<td class="num">${r.p?.foreign && r.p?.population ? (r.p.foreign / r.p.population * 100).toFixed(2) + '%' : '—'}</td>`).join('')}</tr>
      <tr><td>住民1人当たり</td>${rows.map(r => `<td class="num">${r.v !== null && r.p?.population ? esc(yenPer(r.v / r.p.population)) : '—'}</td>`).join('')}</tr>
      <tr><td>外国人住民1人当たり（参考）</td>${rows.map(r => `<td class="num">${r.v !== null && r.p?.foreign ? esc(yenPer(r.v / r.p.foreign)) : '—'}</td>`).join('')}</tr>
    </tbody></table></div>`;
    $('#c-csv').addEventListener('click', () => {
      const out = [];
      for (const r of rows) for (const y of db.years) for (const s of ['当初予算', '決算']) out.push(summaryRow(r.m, y, s, cell(r.m.code, y, s), popOf(r.m.code, y)));
      download(`compare_${codes.join('_')}.csv`, toCSV(SUMMARY_CSV_HEADER, out));
    });
  });
}

function cellText(code, stage, fy) {
  const st = status(code, fy, stage), c = cell(code, fy, stage);
  if (st === '該当事業なし') return '0円';
  if (c && COUNTED.has(st) && c.a !== null) return `${esc(yen(c.a))}${st === '一部確認' ? '<br><small>一部の資料で確認できた分</small>' : ''}`;
  return `<small>${esc(stLabel(st))}</small>`;
}
