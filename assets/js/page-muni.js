// 自治体の詳しいページ
// 表示の順番：いくら使う？（予算額）→ 全体の何％？（一般会計に占める割合と一般会計の予算総額）→ 何に使う？（10分類の円グラフ）
// → 事業の一覧を見る・ほかの自治体と比べる → さらに詳しく調べる（年度別の推移・人口当たり・財源・合計に入れていない事業・調査状況・集計方法・出典・更新履歴）
// 金額は calc.js の breakdown（tools/build.mjs の検算と同じ計算）で事業ごとに出す。集計（summary.json）と合わないときは、
// 誤った金額を使わせないよう、合計を出さずに「確認中」と表示する。分類の基準は docs/分類と集計の基準.md

import { db, loadDetail, loadPopulation, popOf, status, cell, munisOfPref, ratio, generalOf } from './store.js';
import { $, $$, esc, yen, yenExact, yenPer, pct, num, diffYen, fyFull, fmtDate, download, copyText, toast, ratioPct, yenShort } from './util.js';
import { href, currentYear, currentStage, yearPicker, bindYearPicker } from './app.js';
import { statusBadge, stLabel, relBadge, relName, fieldBadge, fieldLabel, sourceLink, sourceMeta, amountOrStatus, ratioView } from './components.js';
import { columnChart, lineChart, stackChart, COLORS } from './charts.js';
import { FUND_KEYS, FUND_LABELS, COUNTED, breakdown, fieldTotals, valueOf } from './calc.js';
import { renderUses, coverageHTML, singleCoverageHTML, overlapHTML, breakdownItems } from './uses.js';
import { RELATION_INFO, SURVEY_INFO, FIELD_INFO, TYPE_INFO, CHECK_INFO, TOTAL_LABEL } from './schema.js';
import { ICON } from './icons.js';
import { budgetCSV } from './export.js';

const short = (y, small) => small ? `${String(y).slice(2)}` : `${y}`;
// 割合（0より大きく0.1%未満は「0.1%未満」と書く）
const share = (part, whole) => { if (!whole) return '—'; const v = part / whole * 100; return v > 0 && v < 0.1 ? '0.1%未満' : `${v.toFixed(1)}%`; };
const sQ = stage => stage === '決算' ? '決算' : '';
const R = RELATION_INFO;
// 財源の表示（国・都道府県・自治体自身・その他・不明）。財源が分からない分を自治体の負担にしない
const FUND_ROWS = [
  { key: 'national', color: COLORS.fund.national }, { key: 'pref', color: COLORS.fund.pref }, { key: 'national_pref', color: COLORS.fund.national_pref },
  { key: 'general', color: COLORS.fund.general }, { key: 'bondOther', label: '地方債・その他（使用料・基金など）', color: COLORS.fund.bondOther },
  { key: 'unknown', color: COLORS.fund.unknown, pattern: true },
];
const fundLabel = r => r.label || FUND_LABELS[r.key];

export async function muniPage(ctx, code) {
  const { app, params } = ctx;
  const m = db.byCode.get(code);
  if (!m) { app.innerHTML = `<div class="page-head"><h1>自治体が見つかりません</h1><p>自治体コード ${esc(code)} は一覧にありません。<a href="#/?to=find">自治体を探す</a></p></div>`; return; }
  const [detail] = await Promise.all([loadDetail(m.pc), loadPopulation()]);
  const fy = currentYear(params);
  const stage = currentStage(params);
  const openPj = params.get('pj');
  const D = {
    projects: detail.projects.filter(p => p.code === code),
    budgets: detail.budgets.filter(b => b.code === code),
    funds: detail.funds.filter(f => f.code === code),
    recipients: detail.recipients.filter(r => r.code === code),
    general: (detail.general || []).filter(g => g.code === code),
    survey: detail.survey.filter(s => s.code === code),
    changelog: detail.changelog.filter(c => c.code === code),
    notes: detail.notes.filter(n => n.code === code),
    links: detail.links.filter(l => l.code === code),
  };
  const src = new Map(detail.sources.map(s => [s.source_id, s]));
  const fundBy = new Map(D.funds.map(f => [`${f.project_id}|${f.fy}|${f.stage}`, f]));
  const budBy = new Map(D.budgets.map(b => [`${b.project_id}|${b.fy}|${b.stage}`, b]));

  const st = status(code, fy, stage);
  const c = cell(code, fy, stage);
  const bd = breakdown(detail, code, fy, stage, c?.a ?? 0);
  const counted = st === '該当事業なし' ? 0 : (c && COUNTED.has(st) && c.a !== null) ? c.a : null;
  const checking = counted !== null && counted !== bd.total;
  const total = checking ? null : counted;
  const sv = D.survey.find(s => s.fy === fy && s.stage === stage);
  const p = popOf(code, fy);
  const notes = D.notes.filter(n => (!n.from_fy || n.from_fy <= fy) && (!n.to_fy || n.to_fy >= fy));
  const yrs = db.years;
  const when = `${fyFull(fy)}・${stage}`;
  const amtWord = stage === '決算' ? '決算額' : '予算';
  const gRow = D.general.find(g => g.fy === fy && g.stage === stage && g.verified === '確認済み');
  const rv = checking ? { v: null, text: '確認中', sub: '' } : ratioView(code, fy, stage);
  // 使い道の円グラフの集計の範囲（都道府県のページだけ切り替えられる。県庁と市区町村を足すのは重複の調整をしない単純合計）
  const useScopes = m.isPref ? { self: `${m.name}庁の予算`, muni: `${m.name}内の市区町村`, all: '両方の単純合計' } : { self: '' };
  let useScope = useScopes[params.get('us')] ? params.get('us') : 'self';
  const usQ = () => useScope === 'self' ? '' : useScope;
  const nRef = bd.u3.length + bd.c4.length + bd.hold.length;
  const mainProjects = D.projects.filter(x => ['①', '②', '③'].includes(x.relation));

  // ① いくら使う？（調べていない・資料がないときは、金額の代わりに状況を書く。0円とは書かない）
  let headValue, headSub = '';
  if (checking) {
    headValue = `<span class="tc-text">確認中</span>`; headSub = 'この年度・段階の合計は、いま確認しています。確認が終わるまで金額は表示しません。';
  } else if (total !== null && total > 0) {
    headValue = esc(yen(total, { approx: true }));
    headSub = `${bd.inc.length}事業の合計（${esc(yenExact(total))}）${st === '一部確認' ? `。<b>一部の資料だけで確かめた分</b>で、実際の${amtWord}はこれより多い可能性があります` : ''}`;
  } else if (st === '該当事業なし') {
    headValue = '0円'; headSub = '調べた結果、関係する事業がないことを確かめました';
  } else if (c && COUNTED.has(st)) {
    headValue = `<span class="tc-text">${c.apend ? '確認中' : '金額なし'}</span>`;
    headSub = c.apend ? `資料で確認している途中の${c.apend}件の金額は、まだ入れていません` : 'この年度・段階では、合計に入る金額は見つかっていません（0円と確かめたわけではありません）';
  } else {
    headValue = `<span class="tc-text">${esc(stLabel(st))}</span>`;
    headSub = st === '未調査' ? `まだ調べていません。<b>0円という意味ではありません</b>。${D.budgets.length ? 'ほかの年度・段階のデータはあります。上で年度を切り替えてください。' : ''}` : esc(SURVEY_INFO[st] || '');
  }
  const genTotal = generalOf(code, fy, stage);
  const genSrc = gRow ? src.get(gRow.source_id) : null;

  app.innerHTML = `
  <nav class="crumbs" aria-label="現在の場所"><a href="${href('/', { y: fy, to: 'find' })}">自治体を探す</a> › ${m.isPref ? esc(m.name) : `<a href="${href('/m/' + db.prefs.find(x => x.pc === m.pc).code, { y: fy })}">${esc(m.pref)}</a> › ${esc(m.name)}`}</nav>
  <div class="mu-head">
    <h1>${esc(m.name)}<span class="kind">${esc(m.isPref ? '都道府県庁の予算' : m.pref + '・' + m.kind)}</span></h1>
    <div class="mu-ctl">
      ${yearPicker(fy, 'mu-fy')}
      <div class="seg seg-sm" role="group" aria-label="予算か決算か">${['当初予算', '決算'].map(s => `<a class="seg-a" href="${href('/m/' + code, { y: fy, s: sQ(s), us: usQ() })}" aria-pressed="${s === stage}">${s}</a>`).join('')}</div>
    </div>
  </div>
  ${notes.map(n => `<p class="note"><b>${esc(n.kind)}：</b>${esc(n.note)}${n.source_url ? ` <a href="${esc(n.source_url)}" target="_blank" rel="noopener">出典</a>` : ''}</p>`).join('')}

  <section class="kpi-card" aria-labelledby="kpi-h">
    <p class="kpi-when"><span>${esc(when)}</span>${statusBadge(st)}</p>
    <h2 id="kpi-h" class="kpi-k">多文化共生関連予算<small>（公式資料で確認できた分）</small></h2>
    <p class="kpi-v">${headValue}</p>
    ${headSub ? `<p class="kpi-sub">${headSub}</p>` : ''}
    <div class="kpi-ratio">
      <p class="kpi-k2">一般会計に占める割合</p>
      <p class="kpi-v2${rv.v === null ? ' is-na' : ''}">${esc(rv.text)}</p>
      ${rv.sub ? `<p class="kpi-sub2">${esc(rv.sub)}</p>` : ''}
    </div>
    <p class="kpi-base"><span>一般会計の${stage === '決算' ? '決算額' : '予算総額'}</span><b>${genTotal ? esc(yenShort(genTotal)) : '未確認'}</b>${genSrc ? `<a href="${esc(genSrc.archived_url || genSrc.url)}" target="_blank" rel="noopener">出典</a>` : ''}</p>
    ${!checking && (bd.inc.length || bd.pend.length || nRef || bd.ex.length) ? `<p class="kpi-how"><a href="${href('/m/' + code, { y: fy, s: sQ(stage), to: 'method' })}" id="calc-link">この金額はどう計算した？</a></p>` : ''}
  </section>

  <section class="section" id="uses" aria-labelledby="use-h"><h2 id="use-h" class="sec-h">${stage === '決算' ? '何に使った？' : '何に使う？'}<small>使い道（10分類）</small></h2>
    ${m.isPref ? `<div class="ctl"><span class="label">集計の範囲</span><div class="seg seg-sm" role="group" aria-label="集計の範囲">${Object.entries(useScopes).map(([k, t]) => `<button type="button" data-us="${k}" aria-pressed="${useScope === k}">${esc(t)}</button>`).join('')}</div></div>` : ''}
    <div id="use-box"></div></section>

  <div class="entry-row">
    <button type="button" class="entry" id="pj-btn" aria-expanded="false" aria-controls="projects">${ICON.list}<span>事業の一覧を見る<small>${mainProjects.length}事業。目的・金額・出典</small></span></button>
    <a class="entry" href="${href('/compare', { c: code, y: fy })}">${ICON.compare}<span>ほかの自治体と比べる<small>予算額・割合・使い道を並べる</small></span></a>
  </div>
  <section class="proj-panel" id="projects" data-reveal hidden aria-labelledby="pj-h"><h2 id="pj-h" class="sec-h">事業の一覧</h2>
    <p class="chart-cap">事業を押すと、目的・中身・年度ごとの金額・財源・支払先・公式資料へのリンクが開きます。</p>
    <div id="proj-box"></div></section>

  <section class="deep" aria-labelledby="deep-h"><h2 id="deep-h" class="sec-h">さらに詳しく調べる</h2>
    <details class="dd" id="d-trend"><summary>${ICON.trend}<span>年度別の推移</span></summary><div id="yr-box"></div></details>
    <details class="dd" id="d-per"><summary>${ICON.people}<span>人口当たりの金額</span></summary><div id="per-box"></div></details>
    <details class="dd" id="d-fund"><summary>${ICON.yen}<span>財源（お金の出どころ）</span></summary><div id="fund-box"></div></details>
    <details class="dd" id="d-ref"><summary>${ICON.doc}<span>合計に入れていない関連事業</span><small>${nRef + bd.ex.length ? `${nRef + bd.ex.length}件` : ''}</small></summary><div id="ref-box"></div></details>
    <details class="dd" id="d-check"><summary>${ICON.check}<span>どこまで調べた？（調査状況）</span></summary>${checklistHTML()}<h3>年度ごとの調査状況</h3><div id="survey-box"></div></details>
    <details class="dd" id="method"><summary>${ICON.ruler}<span>集計方法（この金額はどう計算した？）</span></summary><div id="method-box"></div></details>
    ${m.isPref ? `<details class="dd" id="d-munis"><summary>${ICON.city}<span>${esc(m.name)}の市区町村</span></summary><div id="pref-munis"></div></details>` : ''}
    <details class="dd" id="d-src"><summary>${ICON.book}<span>公式資料・出典</span></summary><div id="src-box"></div></details>
    <details class="dd" id="d-log"><summary>${ICON.history}<span>更新履歴</span></summary><div id="log-box"></div></details>
    <details class="dd" id="d-use"><summary>${ICON.download}<span>このページを使う・関連サイト</span></summary>
      <p class="btn-row">
        <a class="btn btn-outline btn-small" href="${href('/trend', { c: code, y: fy })}">年度どうしで比べる</a>
        <button type="button" class="btn btn-outline btn-small" id="mu-share">このページのURLをコピー</button>
        <button type="button" class="btn btn-outline btn-small" id="mu-csv">この自治体のデータ（CSV）</button>
      </p>
      <div class="ext-links" id="ext-box"></div></details>
  </section>`;

  bindYearPicker(app, y => { location.hash = href('/m/' + code, { y, s: sQ(stage), us: usQ() }).slice(1); });
  $('#mu-share').addEventListener('click', async () => {
    const url = location.href.split('#')[0] + href('/m/' + code, { y: fy, s: sQ(stage) });
    toast(await copyText(url) ? 'このページのURLをコピーしました' : url);
  });
  $('#mu-csv').addEventListener('click', () => download(`${code}_${m.full}_多文化共生予算.csv`, budgetCSV(detail, b => b.code === code)));

  // 事業の一覧（ボタンで開く。事業へのリンク・円グラフの事業名から来たときは開いておく）
  const pjBtn = $('#pj-btn'), pjPanel = $('#projects');
  const showProjects = (open, scroll) => {
    pjPanel.hidden = !open;
    pjBtn.setAttribute('aria-expanded', String(open));
    pjBtn.querySelector('span').firstChild.textContent = open ? '事業の一覧を閉じる' : '事業の一覧を見る';
    if (open && scroll) pjPanel.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  pjBtn.addEventListener('click', () => showProjects(pjPanel.hidden, true));
  if (openPj) showProjects(true, false);

  // 「さらに詳しく調べる」は、開いたときに中身を作る（グラフは見える大きさが分かってから描く）
  const lazy = (id, fn) => {
    const d = $('#' + id);
    if (!d) return;
    let done = false;
    const run = () => { if (d.open && !done) { done = true; fn(); } };
    d.addEventListener('toggle', run);
    run();
  };
  $('#calc-link')?.addEventListener('click', ev => {
    ev.preventDefault();
    const d = $('#method'); d.open = true;
    history.replaceState(null, '', href('/m/' + code, { y: fy, s: sQ(stage), us: usQ(), to: 'method' }));
    d.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  if (params.get('calc') === '1') $('#method').open = true;

  // ---------- 確認の状況（「金額を確かめた」と「すべて調べ終えた」を分けて書く） ----------
  function checklistHTML() {
    if (!bd.inc.length && !bd.pend.length && !nRef && !bd.ex.length) return '';
    const n3 = bd.inc.filter(r => r.k === '③').length;
    const items = [];
    items.push(['ok', '予算額', `合計に入れた${bd.inc.length}事業の金額は、すべて資料の該当ページで確認しました。${bd.pend.length ? `確認している途中の${bd.pend.length}件は合計に入れていません。` : ''}`]);
    items.push([gRow ? 'ok' : 'part', '一般会計の予算総額', gRow ? `${esc(src.get(gRow.source_id)?.title || '公式資料')}で確認しました。` : `${esc(when)}の一般会計の総額は、まだ確認していません。`]);
    items.push(['info', '事業の中身と対象', '事業ごとに、資料に書かれた目的・内容・対象者の範囲・分類の理由を「事業の一覧」に載せています。']);
    if (n3 + bd.u3.length) items.push([bd.u3.length ? 'part' : 'ok', '一般事業の外国人関連部分の金額', `一般事業の中に外国人関連の経費が含まれる${n3 + bd.u3.length}件のうち、その部分の金額まで分かったのは${n3}件です。`]);
    if (bd.hold.length) items.push(['part', '判定保留', `資料の記録だけでは分類を決められない事業が${bd.hold.length}件あります（追加で調べます）。`]);
    const left = sv?.not_checked;
    items.push([left ? 'part' : st === '確認済み' ? 'ok' : 'part', '調べ終わっていない範囲', left ? `残っています：${esc(left)}`
      : st === '確認済み' ? '記録されている残りの範囲はありません。' : `調べたのは一部の資料だけです。`]);
    return `<ul class="ck">${items.map(([cls, k, v]) => `<li class="ck-${cls}"><span class="ck-ic" aria-hidden="true">${cls === 'ok' ? '✔' : cls === 'part' ? '△' : 'ｉ'}</span><div><b>${k}</b>：${v}</div></li>`).join('')}</ul>
      <p class="small muted">「${esc(stLabel('確認済み'))}」は、予算書などの主な資料をひととおり調べたという意味です。ほかの事業の中に含まれていて金額が分からない支出まで、すべて見つけ終えたという意味ではありません。</p>`;
  }

  // ---------- 集計方法：計算の内訳と一般会計に占める割合 ----------
  function calcHTML() {
    const rowLine = (r, i) => `<li><span class="cl-no">${i + 1}</span><span class="cl-name">${esc(r.p.name)}<small>${esc(fieldLabel(r.p.field))}・${r.k === '③' ? `事業全体 ${esc(yenExact(r.b.amount_yen))} のうち、外国人関連の部分だけ` : '資料の金額をそのまま（全額）'}${r.p.account && r.p.account !== '一般会計' ? `・${esc(r.p.account)}` : ''}${r.b.note ? `・${esc(r.b.note)}` : ''}</small><small class="cl-src">根拠：${r.k === '③' ? `${esc(r.b.portion_note || '資料の記載による')} … ` : `${esc(r.b.label_in_doc ? r.b.label_in_doc + ' ' : '')}${esc(r.b.amount_raw)}${esc(r.b.unit_raw)} … `}${sourceLink(r.s, r.b.page)}</small></span><span class="cl-amt">${esc(yenExact(r.amt))}</span></li>`;
    const excl = [
      ...bd.u3.map(r => [r, `一般事業の一部です。外国人関連の部分の金額が資料に書かれていないため、${r.b ? `事業全体の${esc(yenExact(r.b.amount_yen))}を足していません` : '金額の記録もありません'}。`]),
      ...bd.c4.map(r => [r, `関連事業・参考経費：${esc(r.p.relation_reason || R['④'].desc)}${r.b ? `（事業全体 ${esc(yenExact(r.b.amount_yen))}）` : '（金額の記録なし）'}`]),
      ...bd.hold.map(r => [r, `判定保留：${esc(r.p.relation_reason || R['保留'].desc)}${r.b ? `（事業全体 ${esc(yenExact(r.b.amount_yen))}）` : '（金額の記録なし）'}`]),
      ...bd.ex.map(r => [r, `対象外：${esc(r.p.relation_reason || R['⑤'].desc)}${r.b ? `（事業全体 ${esc(yenExact(r.b.amount_yen))}）` : ''}`]),
      ...bd.dup.map(r => [r, `金額が「${esc(r.host?.name || r.p.included_in)}」の金額にも含まれる（再掲）ため、二重に数えないよう足していません${r.b ? `（${esc(yenExact(r.b.amount_yen))}）` : ''}。`]),
      ...bd.noAmt.map(r => [r, `事業があることは分かっていますが、金額の記録がありません。`]),
      ...bd.pend.map(r => [r, `金額を資料で確認している途中のため（${esc(yenExact(r.b.amount_yen))}）。`]),
      ...bd.noRow.map(r => [r, `${esc(when)}の金額の記録がありません（ほかの年度・段階だけに記録がある事業です）。`]),
    ];
    const usedSrc = [...new Map(bd.inc.map(r => [r.b.source_id, r.s])).values()].filter(Boolean);
    let no = 0;
    const groupHTML = k => {
      const list = bd.inc.filter(r => r.k === k);
      if (!list.length) return '';
      const sub = list.reduce((s, r) => s + r.amt, 0);
      return `<h4>${esc(relName(k))}（${list.length}件）</h4><ol class="calc-list">${list.map(r => rowLine(r, no++)).join('')}</ol>
        <div class="calc-total"><span>${R[k].no}の小計（${list.length}事業）</span><b>${esc(yenExact(sub))}</b></div>`;
    };
    // 一般会計に占める割合の計算
    const rr = ratio(code, fy, stage);
    const ratioBlock = `<div class="ratio-calc"><h3>一般会計に占める割合の計算</h3>
      ${rr.v !== null ? `<p class="calc-formula big"><b>${esc(yenExact(rr.num))}</b> ÷ <b>${esc(yenExact(rr.den))}</b> ＝ <b>${(rr.v * 100).toFixed(4)}%</b><small>（画面では小数第2位までの ${esc(ratioPct(rr.v))} と表示）</small></p>
        <dl class="per-dl"><div><dt>割られる数</dt><dd>確認できた多文化共生関連予算のうち、一般会計の事業の金額（${esc(when)}）${bd.ts ? `。特別会計の事業 ${bd.sp.length}件（${esc(yenExact(bd.ts))}：${bd.sp.map(r => esc(r.p.name)).join('、')}）は入れていません` : ''}</dd></div>
          <div><dt>割る数</dt><dd>${esc(m.name)}の一般会計の${stage === '決算' ? '決算額' : '当初予算の総額'}（${esc(when)}）${gRow ? `。${sourceLink(src.get(gRow.source_id), gRow.page)}${gRow.quote ? `<div class="quote">${esc(gRow.quote)}</div>` : ''}${gRow.note ? `<small>${esc(gRow.note)}</small>` : ''}` : ''}</dd></div></dl>
        ${rr.partial ? '<p class="note small">一部の資料だけで確かめた予算額で割っているので、<b>確認済み分の割合</b>です。実際の割合はこれより大きい可能性があります。</p>' : ''}`
      : `<p class="info">${esc(rv.sub || '割合は出していません。')}${rr.why === '一般会計の総額が未確認' ? '一般会計の総額を確認できたら表示します。' : ''}</p>`}
      <p class="small muted">分子と分母は、同じ自治体・同じ年度・同じ段階（当初予算どうし）です。補正予算・決算の金額とは混ぜていません。都道府県と市区町村は、それぞれ自分の一般会計で割っています。</p></div>`;
    return `<div class="calc">
      ${bd.inc.length ? `<h3>合計に入れた事業（${bd.inc.length}件）</h3>
      <p class="small">${esc(when)}の金額です。外国人のための事業（①②）は資料に書かれたその事業の金額を全額、一般事業の一部（③）は外国人関連の部分の金額だけを数えています。</p>
      ${groupHTML('①')}${groupHTML('②')}${groupHTML('③')}
      <div class="calc-total"><span>合計（${bd.inc.length}事業）</span><b>${esc(yenExact(bd.total))}</b></div>
      <p class="calc-formula"><b>計算式：</b>①${esc(yenExact(bd.t1))} ＋ ②${esc(yenExact(bd.t2))} ＋ ③${esc(yenExact(bd.t3))} ＝ ${esc(yenExact(bd.total))}</p>` : `<p class="info">${esc(when)}は、合計に入れた事業がありません。</p>`}
      ${ratioBlock}
      <h3>点検の結果</h3><ul class="checks">${bd.checks.map(x => `<li class="${x.ok ? '' : 'ng'}"><span class="ck-ic" aria-hidden="true">${x.ok ? '✔' : '✕'}</span><div><b>${esc(x.label)}</b><span class="small">${esc(x.detail)}</span></div></li>`).join('')}</ul>
      ${excl.length ? `<details><summary>合計に入れなかった事業と理由（${excl.length}件）</summary>
      <ul class="excl-list">${excl.map(([r, why]) => `<li><b>${esc(r.p.name)}</b><span class="small">${why}</span></li>`).join('')}</ul></details>` : ''}
      ${usedSrc.length ? `<details><summary>合計に入れた金額の出典資料（${usedSrc.length}件）</summary><ul class="src-list">${usedSrc.map(s => `<li>${sourceLink(s)}<br><small class="muted">${esc(s.doc_type)}${s.fy ? `・${s.fy}年度` : ''}・${sourceMeta(s)}</small></li>`).join('')}</ul></details>` : ''}
      <details><summary>このサイトの数え方（ルール）</summary>${rulesHTML()}</details>
    </div>`;
  }
  lazy('method', () => { $('#method-box').innerHTML = checking ? '<p class="info">この年度・段階の合計は、いま確認しています。</p>' : calcHTML(); });

  // ---------- 何に使う？（使い道の内訳：円グラフと10分類の金額の一覧） ----------
  // 金額は集計（summary.json）から、分類を押したときの事業の一覧は breakdown（集計方法と同じ計算）から出す
  const useBox = $('#use-box');
  const bdCache = new Map([[code, bd]]);
  const bdOf = cd => { if (!bdCache.has(cd)) bdCache.set(cd, breakdown(detail, cd, fy, stage, cell(cd, fy, stage)?.a ?? 0)); return bdCache.get(cd); };
  const drawUse = () => {
    if (useScope === 'self') {
      if (!(total > 0)) { useBox.innerHTML = `<p class="info">${esc(when)}は、使い道ごとに分けられる金額がありません（${checking ? '合計を確認中' : esc(stLabel(st))}）。0円という意味ではありません。</p>`; return; }
      const ft = renderUses(useBox, {
        cells: [c], expect: total, items: f => breakdownItems(bd, f),
        label: `${m.name}の多文化共生関連予算の使い道の円グラフ（${when}）`,
        foot: '',
      });
      useBox.insertAdjacentHTML('beforeend', `<details class="more-box"><summary>この円グラフに入れたもの</summary><p class="small">合計 ${esc(yen(total))} の内訳です（${esc(when)}）。上の金額・集計方法・事業の一覧と同じ金額で、事業名を押すと事業の一覧のその事業が開きます。</p>${singleCoverageHTML(ft)}</details>`);
      return;
    }
    const ms = munisOfPref(m.pc);
    const list = useScope === 'all' ? [m, ...ms] : ms;
    const cellsOf = xs => xs.map(x => cell(x.code, fy, stage));
    const ft = fieldTotals(cellsOf(list));
    renderUses(useBox, {
      cells: cellsOf(list),
      label: `${useScope === 'all' ? `${m.name}庁と${m.name}内の市区町村` : `${m.name}内の市区町村`}の多文化共生関連予算の使い道の円グラフ（${when}）`,
      centerK: useScope === 'all' ? '単純合計' : '合計',
      items: f => list.filter(x => valueOf(cell(x.code, fy, stage))).flatMap(x => breakdownItems(bdOf(x.code), f, x.code === code ? { muni: `${m.name}庁` } : { muni: x.name, link: pj => href('/m/' + x.code, { y: fy, s: sQ(stage), pj }) })),
      foot: `<details class="more-box"><summary>集計の範囲と注意</summary>${useScope === 'all' ? overlapHTML(cellsOf([m]), cellsOf(ms), m.name + '内') : `<p class="small muted">${esc(m.name)}内の市区町村の予算の合計の内訳です。${esc(m.name)}庁の予算（このページの上の金額）は入っていません。</p>`}
        ${coverageHTML({ munis: list, fy, stage, ft, when, scopeName: useScope === 'all' ? `${m.name}庁と${m.name}内の市区町村` : `${m.name}内の市区町村` })}</details>`,
    });
  };
  drawUse();
  $$('#uses [data-us]').forEach(b => b.addEventListener('click', () => {
    useScope = b.dataset.us;
    $$('#uses [data-us]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    history.replaceState(null, '', href('/m/' + code, { y: fy, s: sQ(stage), us: usQ() }));
    $$('.mu-ctl .seg-a').forEach((a, i) => { a.href = href('/m/' + code, { y: fy, s: sQ(['当初予算', '決算'][i]), us: usQ() }); });
    drawUse();
  }));

  // ---------- 事業の一覧（外国人に関係する事業を上に。関連事業・対象外は折りたたむ） ----------
  const pbox = $('#proj-box');
  const amtLine = (pj, y, s) => {
    const b = budBy.get(`${pj.project_id}|${y}|${s}`);
    if (!b) return { main: '記録なし', sub: `${y}年度の${s}の金額の記録なし` };
    if (b.verified === '要確認') return { main: yen(b.amount_yen), sub: '確認中（合計に入れていない）' };
    if (pj.included_in) return { main: yen(b.amount_yen), sub: '別の事業の金額に含まれる再掲（足していない）' };
    if (pj.relation === '①' || pj.relation === '②') return { main: yen(b.amount_yen), sub: '合計に入れています（全額）' };
    if (pj.relation === '③') return b.portion_yen !== null && b.portion_yen !== undefined
      ? { main: yen(b.portion_yen), sub: `外国人関連の部分だけ合計に（事業全体 ${yen(b.amount_yen)}）` } : { main: '関連部分は不明', sub: `事業全体 ${yen(b.amount_yen)}（足していない）` };
    if (pj.relation === '⑤') return { main: yen(b.amount_yen), sub: '対象外（合計に入れていない）' };
    if (pj.relation === '保留') return { main: yen(b.amount_yen), sub: '判定保留（合計に入れていない）' };
    return { main: yen(b.amount_yen), sub: '参考（合計に入れていない）' };
  };
  const byAmt = list => [...list].sort((a, b) => (budBy.get(`${b.project_id}|${fy}|${stage}`)?.amount_yen ?? -1) - (budBy.get(`${a.project_id}|${fy}|${stage}`)?.amount_yen ?? -1));
  const refProjects = D.projects.filter(x => !['①', '②', '③'].includes(x.relation));
  if (!D.projects.length) pbox.innerHTML = `<p class="info">登録された事業はまだありません（${esc(stLabel(status(code, fy, '当初予算')))}）。</p>`;
  else {
    pbox.innerHTML = `${mainProjects.length ? `<h3 class="grp-h">外国人に関係する事業（${mainProjects.length}件）</h3><div class="proj-list">${byAmt(mainProjects).map(pj => projHTML(pj, amtLine(pj, fy, stage))).join('')}</div>` : ''}
      ${refProjects.length ? `<details class="grp"${refProjects.some(x => x.project_id === openPj) ? ' open' : ''}><summary>参考：合計に入れていない関連事業・対象外（${refProjects.length}件）</summary><p class="small muted">国際交流協会の運営補助・姉妹都市交流など、外国人住民などへの支出として金額を特定できない事業や、対象外と判断した事業です。</p><div class="proj-list">${byAmt(refProjects).map(pj => projHTML(pj, amtLine(pj, fy, stage))).join('')}</div></details>` : ''}`;
  }
  function projHTML(pj, a) {
    const bs = D.budgets.filter(b => b.project_id === pj.project_id).sort((x, y) => y.fy - x.fy || x.stage.localeCompare(y.stage));
    const recs = D.recipients.filter(r => r.project_id === pj.project_id);
    const pred = pj.predecessor ? D.projects.find(x => x.project_id === pj.predecessor) : null;
    const succ = D.projects.filter(x => x.predecessor === pj.project_id);
    const flag = budBy.get(`${pj.project_id}|${fy}|当初予算`)?.status_flag;
    return `<details class="proj" id="pj-${esc(pj.project_id)}"${openPj === pj.project_id ? ' open' : ''}>
      <summary><span class="pname">${esc(pj.name)}</span><span class="pamt">${esc(a.main)}<small>${esc(a.sub)}</small></span>
        <span class="pmeta">${fieldBadge(pj.field)}${pj.account && pj.account !== '一般会計' ? `<span class="badge acc">${esc(pj.account)}</span>` : ''}${pj.department ? `<span>${esc(pj.department)}</span>` : ''}${flag && flag !== '不明' ? `<span class="badge fld">${esc(flag)}</span>` : ''}</span></summary>
      <div class="proj-body">
        ${pj.purpose ? `<h4>事業の目的</h4><p>${esc(pj.purpose)}</p>` : ''}
        ${pj.content ? `<h4>事業の内容</h4><p>${esc(pj.content)}</p>` : ''}
        <h4>このサイトでの分け方</h4><p>${relBadge(pj.relation)} ${pj.type && pj.type !== '保留' ? `<span class="badge fld">${esc(TYPE_INFO[pj.type]?.label || pj.type)}</span> ` : ''}${esc(pj.relation_reason || RELATION_INFO[pj.relation].desc)}</p>
        <p class="small"><b>対象者の範囲：</b>${esc(String(pj.target || '').split(/[;；]/).map(s => s.trim()).filter(Boolean).join('・') || '—')}${pj.target_note ? `（${esc(pj.target_note)}）` : ''}</p>
        ${pj.account ? `<p class="small"><b>会計：</b>${esc(pj.account)}${pj.account !== '一般会計' ? '（一般会計に占める割合の計算には入れていません）' : ''}</p>` : ''}
        <p class="small"><b>確認状況：</b>${esc(pj.check_status || '—')}${CHECK_INFO[pj.check_status] ? `（${esc(CHECK_INFO[pj.check_status])}）` : ''}</p>
        ${pj.included_in ? `<p class="small"><b>再掲：</b>この事業の金額（の一部）は「${esc(D.projects.find(x => x.project_id === pj.included_in)?.name || pj.included_in)}」の金額にも含まれているため、二重に数えないよう合計に入れていません。</p>` : ''}
        ${pred ? `<p class="small">前身の事業：${esc(pred.name)}（内容が変わったため別の事業として記録）</p>` : ''}
        ${succ.length ? `<p class="small">後の事業：${succ.map(x => esc(x.name)).join('・')}</p>` : ''}
        <h4>年度ごとの金額</h4>
        ${bs.length ? `<div class="table-wrap"><table><thead><tr><th>年度</th><th>段階</th><th class="num">金額</th><th>資料の記載</th><th>出典</th></tr></thead><tbody>
        ${bs.map(b => {
          const f = fundBy.get(`${b.project_id}|${b.fy}|${b.stage}`);
          const s = src.get(b.source_id);
          return `<tr class="${b.fy === fy && b.stage === stage ? 'is-on' : ''}"><td>${b.fy}年度${b.name_in_year && b.name_in_year !== pj.name ? `<br><small>${esc(b.name_in_year)}</small>` : ''}</td><td>${esc(b.stage)}${b.status_flag && b.status_flag !== '不明' ? `<br><small>${esc(b.status_flag)}</small>` : ''}</td>
            <td class="num">${esc(yen(b.amount_yen))}<br><small>${esc(yenExact(b.amount_yen))}</small>${b.portion_yen !== undefined && b.portion_yen !== null ? `<br><small>うち外国人関連 ${esc(yen(b.portion_yen))}</small>` : ''}${b.verified === '要確認' ? '<br><span class="badge pend">確認中</span>' : ''}</td>
            <td><small>${esc(b.label_in_doc || '')} ${esc(b.amount_raw)}${esc(b.unit_raw)}</small>${b.quote ? `<div class="quote">${esc(b.quote)}</div>` : ''}${b.portion_note ? `<small>${b.portion_yen !== undefined && b.portion_yen !== null ? '外国人関連部分の根拠' : '金額についての説明'}：${esc(b.portion_note)}</small><br>` : ''}${b.foreign_only_yen !== undefined && b.foreign_only_yen !== null ? `<small>うち外国籍の人だけへの支出 ${esc(yen(b.foreign_only_yen))}${b.foreign_only_note ? `（${esc(b.foreign_only_note)}）` : ''}</small><br>` : ''}${f ? `<small>財源：${FUND_KEYS.filter(k => f[k] !== undefined && f[k] !== null).map(k => `${esc(FUND_LABELS[k].replace(/（.*）/, ''))} ${esc(yen(f[k]))}`).join('・') || '—'}</small>` : ''}${b.note ? `<br><small>${esc(b.note)}</small>` : ''}</td>
            <td><small>${sourceLink(s, b.page)}<br>確認日 ${esc(fmtDate(b.checked_date))}</small></td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="small muted">金額の記録はありません。</p>'}
        ${recs.length ? `<h4>補助金・委託金の支払先</h4><div class="table-wrap"><table><thead><tr><th>年度</th><th>支払先</th><th>種類</th><th class="num">金額</th><th>出典</th></tr></thead><tbody>${recs.map(r => `<tr><td>${r.fy}年度 ${esc(r.stage)}</td><td>${esc(r.recipient)}<br><small>${esc(r.recipient_type)}${r.recipient_type === '市区町村' ? '（自治体間の資金移転）' : ''}</small></td><td>${esc(r.kind)}</td><td class="num">${r.amount_yen !== undefined ? esc(yen(r.amount_yen)) : '金額の記載なし'}</td><td><small>${sourceLink(src.get(r.source_id), r.page)}</small>${r.quote ? `<div class="quote">${esc(r.quote)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
        ${pj.mou_ids ? `<p class="small">関連する可能性のある協定：${pj.mou_ids.split(/[;；]/).map(id => `<a href="https://yumaki5555.github.io/mou-map/#/mou/${encodeURIComponent(id.trim())}" target="_blank" rel="noopener">${esc(id.trim())}</a>`).join('・')}（MOUマップ。協定があることだけで費用が発生したとは扱っていません）</p>` : ''}
        ${pj.note ? `<p class="small muted">備考：${esc(pj.note)}</p>` : ''}
        <p class="small muted"><a href="${href('/m/' + code, { y: fy, s: sQ(stage), pj: pj.project_id })}">この事業へのリンク</a></p>
      </div></details>`;
  }
  if (openPj) setTimeout(() => document.getElementById('pj-' + openPj)?.scrollIntoView({ block: 'start' }), 50);

  // ---------- 合計に入れていない関連事業（③で部分の金額が分からない事業・④・判定保留・⑤） ----------
  lazy('d-ref', () => {
    const rows = [...bd.u3.map(r => [r, '一般事業の一部（外国人関連の部分の金額が分からない）']), ...bd.c4.map(r => [r, R['④'].label]), ...bd.hold.map(r => [r, R['保留'].label]), ...bd.ex.map(r => [r, R['⑤'].label])];
    $('#ref-box').innerHTML = rows.length ? `<p class="small">外国人住民などへの支出として金額を特定できない事業です。事業全体の金額を参考として示し、<b>合計には足していません</b>（${esc(when)}）。</p>
      <ul class="mini-list">${rows.map(([r, k]) => `<li><span>${esc(r.p.name)}<small>${esc(k)}。${esc(r.p.relation_reason || '')}</small></span><span class="ml-amt"><small>${r.b ? `事業全体 ${esc(yen(r.b.amount_yen))}` : '金額の記録なし'}</small></span></li>`).join('')}</ul>
      <details><summary>どんな事業？</summary>${['③', '④', '⑤', '保留'].map(k => `<p><b>${esc(relName(k))}</b>：${esc(R[k].desc)}<br><small>例：${esc(R[k].examples)}</small></p>`).join('')}</details>`
      : `<p class="info">${esc(when)}には、合計に入れていない関連事業は登録されていません。</p>`;
  });

  // ---------- 年度別の推移（予算額と一般会計に占める割合を切り替え） ----------
  lazy('d-trend', () => {
    const val = (y, s) => { const cc = cell(code, y, s); const ss = status(code, y, s); if (ss === '該当事業なし') return 0; return cc && COUNTED.has(cc.st) ? cc.a : null; };
    const missing = (y, s) => { const ss = status(code, y, s); const cc = cell(code, y, s); return cc && COUNTED.has(ss) && cc.a === null ? (cc.apend ? '確認中' : '合計に入る事業なし') : stLabel(ss); };
    const hasRevised = D.budgets.some(b => b.stage === '補正後予算');
    const stages = hasRevised ? ['当初予算', '補正後予算', '決算'] : ['当初予算', '決算'];
    const v0 = val(fy - 1, stage), v1 = val(fy, stage);
    const partialYoy = [status(code, fy - 1, stage), status(code, fy, stage)].includes('一部確認');
    const box = $('#yr-box');
    box.innerHTML = `<p class="yoy">${v0 !== null && v1 !== null && v0 > 0
      ? `${fy - 1}年度の${stage} <b>${esc(yen(v0))}</b> → ${fy}年度 <b>${esc(yen(v1))}</b>：<b class="${v1 >= v0 ? 'up' : 'down'}">${esc(diffYen(v1 - v0))}（${esc(pct((v1 - v0) / v0))}）</b>${partialYoy ? '<br><small>一部の資料だけ調べた年度を含むので、増減は調べた範囲の差の影響も受けます。</small>' : ''}`
      : `${fy - 1}年度の${stage}は「${esc(missing(fy - 1, stage))}」のため、前の年度と比べられません。`}</p>
      <div class="seg seg-sm" role="group" aria-label="グラフの指標"><button type="button" data-tm="amt" aria-pressed="true">予算額</button><button type="button" data-tm="ratio" aria-pressed="false">一般会計に占める割合</button></div>
      <div id="ch-yr-wrap"></div><div id="tb-yr"></div>`;
    const draw = mode => {
      const w = $('#ch-yr-wrap');
      w.innerHTML = '';
      if (mode === 'amt') {
        w.innerHTML = `<p class="chart-cap">確認できた多文化共生関連予算の合計を年度ごとに並べました。棒を押すと正確な金額が出ます。予算と決算は足さずに並べています。短い縦線は「未調査」などで、0円ではありません。</p><div id="ch-yr" data-title="年度別の推移"></div>`;
        columnChart($('#ch-yr'), { cats: yrs, catLabel: (y, sm) => short(y, sm), highlight: fy, series: stages.map(s => ({ label: s, color: COLORS[s], values: yrs.map(y => val(y, s)), missing: yrs.map(y => missing(y, s)) })) });
      } else {
        const rs = yrs.map(y => ratio(code, y, '当初予算'));
        w.innerHTML = `<p class="chart-cap">当初予算どうしの割合（一般会計の事業の金額 ÷ 一般会計の当初予算の総額）。一般会計の総額を確かめた年度だけ出しています（短い縦線は未確認・未調査で、0%ではありません）。</p><div id="ch-yr" data-title="一般会計に占める割合の推移"></div>`;
        columnChart($('#ch-yr'), { cats: yrs, catLabel: (y, sm) => short(y, sm), highlight: fy, unit: 'ratio', missingLabel: '未確認', series: [{ label: '一般会計に占める割合', color: COLORS['当初予算'], values: rs.map(r => r.v), missing: rs.map(r => r.why === '一般会計の総額が未確認' ? '一般会計の総額は未確認' : r.why || '—') }] });
      }
    };
    draw('amt');
    $$('#yr-box [data-tm]').forEach(b => b.addEventListener('click', () => { $$('#yr-box [data-tm]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(b.dataset.tm); }));
    $('#tb-yr').innerHTML = `<details><summary>表で見る（年度別）</summary><div class="table-wrap"><table><thead><tr><th>年度</th>${stages.map(s => `<th class="num">${s}</th>`).join('')}<th class="num">一般会計に占める割合（当初予算）</th></tr></thead><tbody>${[...yrs].reverse().map(y => { const r = ratioView(code, y, '当初予算'); return `<tr class="${y === fy ? 'is-on' : ''}"><td>${fyFull(y)}</td>${stages.map(s => { const v = val(y, s); return `<td class="num">${v !== null ? esc(yenExact(v)) + (status(code, y, s) === '一部確認' ? '<br><small>一部の資料だけ調査</small>' : '') : `<small>${esc(missing(y, s))}</small>`}</td>`; }).join('')}<td class="num">${r.v !== null ? esc(r.text) : `<small>${esc(r.sub || r.text)}</small>`}</td></tr>`; }).join('')}</tbody></table></div></details>`;
  });

  // ---------- 人口当たりの金額（分子・分母・時点を書く） ----------
  lazy('d-per', () => {
    const asOf = p?.asOf;
    const perCard = (title, denomLabel, denom, denomNote) => `<div class="per-card"><h3>${title}</h3>
      <p class="per-val">${esc(yenPer(total / denom))}</p>
      <p class="formula">${esc(yenExact(total))} ÷ ${num(denom)}人</p>
      <dl class="per-dl"><div><dt>割られる数</dt><dd>確認できた多文化共生関連${stage === '決算' ? '予算の決算額' : '予算'}（${esc(when)}）</dd></div>
        <div><dt>割る数</dt><dd>${denomLabel} ${num(denom)}人（${denomNote}）</dd></div></dl></div>`;
    $('#per-box').innerHTML = total !== null && total > 0 && (p?.foreign || p?.population)
      ? `<div class="per-cards">
          ${p?.population ? perCard('住民1人当たり', '住民の数', p.population, `住民基本台帳、${asOf?.pop ? esc(fmtDate(asOf.pop)) : ''}時点、日本人と外国人の合計`) : ''}
          ${p?.foreign ? perCard('外国人住民1人当たり（参考）', '外国人住民数', p.foreign, `出入国在留管理庁「在留外国人統計」${asOf?.for ? esc(fmtDate(asOf.for)) : ''}時点`) : ''}
        </div>
        <p class="note"><b>1人に配られた金額ではありません。</b>多くは相談窓口・日本語教室・先生の人件費など行政サービスの費用で、日本国籍の人が対象に含まれる事業もあります。自治体の大きさをそろえて比べるための目安です。${st === '一部確認' ? '一部の資料だけで確かめた合計で割っているので、実際より小さく出ている可能性があります。' : ''}</p>
        <details><summary>外国人住民数の推移</summary><div id="ch-for"></div><p class="small muted">外国人住民数：出入国在留管理庁「在留外国人統計」（その年度の前年12月末。中長期在留者と特別永住者）。${m.zairyu ? `<a href="${esc(m.zairyu)}" target="_blank" rel="noopener">「数でみる在留外国人」で国籍・在留資格を見る</a>` : ''}</p></details>`
      : `<p class="info">${total === null ? '多文化共生関連予算の合計が分からないため' : p?.foreign || p?.population ? '多文化共生関連予算の合計が0円のため' : '人口の統計がないため'}、1人当たりの値は出していません。${p?.foreign ? `外国人住民数は ${num(p.foreign)}人（${asOf?.for ? esc(fmtDate(asOf.for)) : ''}）です。` : ''}</p>`;
    const chFor = $('#ch-for');
    if (chFor) chFor.closest('details').addEventListener('toggle', () => { if (!chFor.dataset.done) { chFor.dataset.done = '1'; lineChart(chFor, { cats: yrs, catLabel: (y, sm) => short(y, sm), values: yrs.map(y => popOf(code, y)?.foreign ?? null), label: '外国人住民数', highlight: fy }); } }, { once: true });
  });

  // ---------- 財源の内訳 ----------
  lazy('d-fund', () => {
    const fundBox = $('#fund-box');
    if (!checking && bd.inc.length && bd.total > 0) {
      const fd = { ...bd.fund, bondOther: bd.fund.bond + bd.fund.other };
      const known = bd.total - fd.unknown;
      // 国・都道府県・自治体自身・財源不明はいつも出す（0円でも）。都道府県のページでは「都道府県からの補助」は0円なら出さない
      const rows = FUND_ROWS.filter(r => fd[r.key] > 0 || ['national', 'general', 'unknown'].includes(r.key) || (r.key === 'pref' && !m.isPref));
      fundBox.innerHTML = `<p class="fund-cov">予算合計のうち、<b>財源の内訳を確認できた割合：${share(known, bd.total)}</b><br><small>${esc(yenExact(known))} ÷ 多文化共生関連予算の合計 ${esc(yenExact(bd.total))}</small></p>
        <ul class="fund-rows">${rows.map(r => `<li><span class="fr-name"><i class="${r.pattern ? 'pat' : ''}" style="background:${r.color}"></i>${esc(fundLabel(r))}</span><span class="fr-amt">${esc(yen(fd[r.key]))}<small>${share(fd[r.key], bd.total)}</small></span><span class="fr-track" aria-hidden="true"><span class="${r.pattern ? 'pat' : ''}" style="width:${(fd[r.key] / bd.total * 100).toFixed(2)}%;background:${r.color}"></span></span></li>`).join('')}</ul>
        <p class="small muted">「財源が分からない分」は、資料に事業ごとの財源が書かれていない金額です（一般事業の外国人関連の部分は、事業全体の財源を当てはめず、ここに入れています）。自治体自身の負担として数えていません。財源は、その事業だけの内訳が資料にあるときだけ記録しています。国や都道府県からの補助は、事業の金額の内訳として示すだけで、金額に上乗せしていません。</p>
        <details><summary>年度ごとの財源（グラフと表）</summary><div id="ch-fund"></div><div id="tb-fund"></div></details>`;
      const fRows = [...yrs].reverse().map(y => ({ y, c: cell(code, y, stage) })).filter(r => r.c && COUNTED.has(r.c.st) && r.c.a && r.c.fd);
      const det = fundBox.querySelector('details');
      det.addEventListener('toggle', () => {
        if (det.dataset.done) return; det.dataset.done = '1';
        stackChart($('#ch-fund'), { keys: FUND_ROWS.map(r => ({ key: r.key, label: fundLabel(r), color: r.color, pattern: r.pattern })), rows: fRows.map(({ y, c: cc }) => ({ label: `${y}年度`, on: y === fy, parts: { ...cc.fd, bondOther: cc.fd.bond + cc.fd.other } })) });
        $('#tb-fund').innerHTML = `<div class="table-wrap"><table><thead><tr><th>年度</th>${[...FUND_KEYS, 'unknown'].map(k => `<th class="num">${esc(FUND_LABELS[k])}</th>`).join('')}<th class="num">合計</th><th class="num">内訳を確認できた割合</th></tr></thead><tbody>${fRows.map(({ y, c: cc }) => `<tr class="${y === fy ? 'is-on' : ''}"><td>${y}年度</td>${[...FUND_KEYS, 'unknown'].map(k => `<td class="num">${esc(yenExact(cc.fd[k]))}</td>`).join('')}<td class="num">${esc(yenExact(cc.a))}</td><td class="num">${share(cc.a - cc.fd.unknown, cc.a)}</td></tr>`).join('')}</tbody></table></div>`;
      });
    } else fundBox.innerHTML = `<p class="info">${esc(when)}は、財源を示せる多文化共生関連予算の金額がありません。</p>`;
  });

  // ---------- 都道府県のページ：県内の市区町村 ----------
  lazy('d-munis', () => {
    const ms = munisOfPref(m.pc);
    const surveyed = ms.filter(x => status(x.code, fy, '当初予算') !== '未調査');
    const tr = D.recipients.filter(r => r.recipient_type === '市区町村' && r.fy === fy);
    $('#pref-munis').innerHTML = `<p class="small">都道府県の金額は<b>都道府県庁の予算</b>で、県内の市区町村の予算は含みません。県と市区町村の金額は足さないでください（県から市区町村への補助が二重に数えられるおそれがあるため）。</p>
      ${tr.length ? `<p class="cond"><b>県から市区町村への補助（自治体間の資金移転）：</b>${tr.map(r => `${esc(r.recipient)} ${esc(yen(r.amount_yen))}（${esc(r.stage)}）`).join('、')}。この分は市区町村の予算にも「都道府県からの補助」として出てきます。</p>` : ''}
      <p>調査した市区町村：${surveyed.length} / ${ms.length}（${fyFull(fy)}・当初予算）。<a href="${href('/', { y: fy, p: m.pc, to: 'find' })}">地図で見る</a></p>
      ${surveyed.length ? `<ul class="muni-list">${surveyed.map(x => { const a = amountOrStatus(x.code, fy, '当初予算'); const r = ratioView(x.code, fy, '当初予算'); return `<li><a href="${href('/m/' + x.code, { y: fy })}">${esc(x.name)}</a><span class="amt">${a.value !== undefined ? esc(a.text) : statusBadge(a.st)}</span>${a.value !== undefined ? `<span class="small muted">一般会計に占める割合 ${esc(r.text)}・${esc(stLabel(a.st))}</span>` : ''}</li>`; }).join('')}</ul>` : ''}`;
  });

  // ---------- 調査状況・出典・更新履歴 ----------
  // 調査状況は「調査状況・最終確認日・確認した主な公式資料・まだ確認できていない範囲」だけを出す
  const ids = s => String(s || '').split(/[;；]/).map(x => x.trim()).filter(Boolean);
  const svRows = [...D.survey].sort((a, b) => b.fy - a.fy || a.stage.localeCompare(b.stage));
  $('#survey-box').innerHTML = svRows.length ? `<div class="sv-list">${svRows.map(s => {
    const ss = ids(s.source_ids).map(id => src.get(id)).filter(Boolean);
    return `<div class="sv-item${s.fy === fy && s.stage === stage ? ' is-on' : ''}">
      <p class="sv-head"><b>${s.fy}年度・${esc(s.stage)}</b>${statusBadge(s.status)}<small class="muted">最終確認日 ${esc(fmtDate(s.checked_date))}</small></p>
      ${s.scope || ss.length ? `<details><summary>確認した主な公式資料</summary>${s.scope ? `<p class="small">${esc(s.scope)}</p>` : ''}${ss.length ? `<ul class="src-list small">${ss.map(x => `<li>${sourceLink(x)}</li>`).join('')}</ul>` : ''}</details>` : ''}
      ${s.not_checked ? `<details><summary>まだ確認できていない範囲</summary><p class="small">${esc(s.not_checked)}</p></details>` : ''}</div>`;
  }).join('')}</div>
    <p class="small muted">記録のない年度・段階は「未調査」です（0円ではありません）。</p>` : `<p class="info">この自治体は、まだどの年度も調べていません（未調査）。</p>`;
  lazy('d-src', () => {
    // 金額の行で使った資料に加えて、一般会計の総額・調査状況・更新履歴で使った資料（団体の事業計画書など）も載せる
    const usedSrc = [...new Set(D.budgets.map(b => b.source_id).concat(D.funds.map(f => f.source_id), D.recipients.map(r => r.source_id), D.general.map(g => g.source_id), D.survey.flatMap(s => ids(s.source_ids)), D.changelog.flatMap(x => ids(x.source_id))))].map(id => src.get(id)).filter(Boolean).sort((a, b) => b.fy - a.fy);
    $('#src-box').innerHTML = usedSrc.length ? `<ul class="src-list">${usedSrc.map(s => `<li>${sourceLink(s)}<br><small class="muted">${esc(s.doc_type)}${s.fy ? `・${s.fy}年度` : ''}・${sourceMeta(s)}${s.page_url ? `・<a href="${esc(s.page_url)}" target="_blank" rel="noopener">資料の掲載ページ</a>` : ''}</small></li>`).join('')}</ul>` : '<p class="muted">まだありません。</p>';
  });
  lazy('d-log', () => {
    // 更新履歴（公開しているのは、利用者に影響する実質的な変更だけ）。訂正の根拠の資料も示す
    $('#log-box').innerHTML = D.changelog.length ? `<ul>${D.changelog.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(x => {
      const xs = ids(x.source_id).map(id => src.get(id)).filter(Boolean);
      return `<li><small>${esc(fmtDate(x.date))}</small>　${esc(x.kind)}：${esc(x.item || '')} ${x.before ? `「${esc(x.before)}」→` : ''}${x.after ? `「${esc(x.after)}」` : ''}（${esc(x.reason)}）${xs.length ? `<br><small>根拠：${xs.map(s => sourceLink(s)).join('、')}</small>` : ''}</li>`;
    }).join('')}</ul>` : '<p class="muted">まだありません。</p>';
  });

  // ---------- 関連するサイト ----------
  const ext = [];
  if (m.zairyu) ext.push(`<a class="ext-link" href="${esc(m.zairyu)}" target="_blank" rel="noopener"><b>数でみる在留外国人：${esc(m.name)}</b><small>外国人住民の数・国籍・在留資格の移り変わり</small></a>`);
  ext.push(`<a class="ext-link" href="https://yumaki5555.github.io/mou-map/#/${m.isPref ? 'pref/' + m.pc : 'search?q=' + encodeURIComponent(m.name)}" target="_blank" rel="noopener"><b>MOU・協定マップ：${esc(m.name)}</b><small>海外と結んだ覚書・協定。協定があることだけで、関連する費用が発生したとは扱いません</small></a>`);
  for (const l of D.links) ext.push(`<a class="ext-link" href="${esc(l.url)}" target="_blank" rel="noopener"><b>${esc(l.label)}</b><small>${esc(l.note || '')}</small></a>`);
  $('#ext-box').innerHTML = ext.join('');

  // 「?to=…」で来たときは、その欄を開く（app.js が移動する）
  const to = params.get('to');
  if (to && document.getElementById(to)?.tagName === 'DETAILS') document.getElementById(to).open = true;
}

// このサイトの数え方（自治体のページ・集計基準のページで同じ決まりを使う）
export function rulesHTML() {
  return `<ul class="rules">
    <li><b>${esc(TOTAL_LABEL)}の合計</b>＝ ①外国人等への直接給付・支援 ＋ ②外国人対応の行政経費 ＋ ③一般事業のうち外国人関連の部分の金額が資料で分かった分。資料の該当ページで確認した金額だけを足します。</li>
    <li>事業は「多文化共生と呼ばれているか」ではなく、<b>誰を対象に、何のために使うお金か</b>で①〜⑤に分けます。</li>
    <li><b>③</b>で外国人関連の部分の金額が分からない事業と、<b>④関連事業・参考経費</b>（国際交流協会の運営補助・国際交流センターの施設全体・姉妹都市交流など）は、事業全体の金額を参考として示し、足しません。<b>⑤対象外</b>と<b>判定保留</b>も足しません。</li>
    <li><b>一般会計に占める割合</b>＝ 合計のうち一般会計の事業の金額 ÷ 同じ自治体・同じ年度・同じ段階の一般会計の予算総額。特別会計・企業会計の事業は分子に入れません。</li>
    <li>人口や外国人住民の割合などで、金額を按分（割り算で配分）しません。金額が分からないものを0円として扱いません。</li>
    <li>当初予算・補正後の予算・決算は、それぞれ別に数えます。ほかの年度の金額も混ぜません。</li>
    <li>国や都道府県からの補助金は、事業の金額の「財源の内訳」として示すだけで、上乗せしません。都道府県と市区町村の合計も足しません。</li>
    <li>確認できない金額を推計で補うことはしません。調べていない自治体・年度は「未調査」と表示し、0円とは書きません。</li>
  </ul><p class="small"><a href="#/about?to=rule">集計基準をすべて見る</a></p>`;
}
