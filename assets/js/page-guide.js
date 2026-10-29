// 3分でわかる 多文化共生予算（5つの図）
// 1 何のお金？ → 2 何に使う？（全国の使い道）→ 3 どんな事業？（実際の事業の例）→ 4 自治体でどれくらい違う？（一般会計に占める割合）→ 5 数字の見方
// 図の数字は、公式資料で確認できたデータだけを使う。データがない図は「調査中」と出す

import { db, cell, status, metricOf, loadUses } from './store.js';
import { $, esc, yen, num, fyFull, ratioPct } from './util.js';
import { href, currentYear } from './app.js';
import { ICON } from './icons.js';
import { COLORS, donutSVG } from './charts.js';
import { fieldTotals, fieldShares } from './calc.js';
import { fieldLabel, stLabel } from './components.js';
import { RELATION_INFO, FIELD_INFO } from './schema.js';

// [見出しのID, 問い, 絵]（トップページの入口と同じ並び）
export const GUIDE_STEPS = [
  ['g1', '多文化共生予算って何？', 'people'],
  ['g2', 'どんなことにお金を使う？', 'donut'],
  ['g3', '具体的にどんな事業がある？', 'list'],
  ['g4', '自治体によってどれくらい違う？', 'bars'],
  ['g5', 'このサイトの数字はどう見ればいい？', 'ruler'],
];
const R = RELATION_INFO;

const step = (n, lead, fig, more) => {
  const [id, title] = GUIDE_STEPS[n - 1];
  return `<article class="g-step" id="${id}" aria-labelledby="${id}-h">
    <div class="g-head"><span class="g-no" aria-hidden="true"><small>STEP</small>${n}</span><h2 id="${id}-h">${title}</h2></div>
    <p class="g-lead">${lead}</p>
    <div class="g-fig">${fig}</div>
    ${more ? `<details class="g-more"><summary>くわしく</summary>${more}</details>` : ''}
  </article>`;
};

function step1() {
  const uses = [
    [ICON.class, '日本語教室'], [ICON.talk, '外国人相談窓口'], [ICON.school, '学校での日本語指導'],
    [ICON.medical, '医療通訳'], [ICON.lang, '多言語の案内・翻訳'], [ICON.people, '地域の交流・理解'],
  ];
  return step(1, '都道府県や市区町村が、<b>外国人住民などに関係する事業</b>に使うお金です。', `
    <div class="g-uses">${uses.map(([ic, t]) => `<div class="g-use">${ic}<span>${t}</span></div>`).join('')}</div>
    <div class="g-split">
      <div class="g-yes"><b>多くは「役所の仕事」のお金</b>窓口の運営、先生や通訳の人件費、翻訳、施設の運営など</div>
      <div class="g-also"><b>「外国人に配るお金」だけではない</b>給付金もあるが、一部にすぎない</div>
    </div>`,
    `<p>行政が「多文化共生」と呼ぶ事業だけでなく、外国人への給付・教育・医療・福祉・通訳・行政対応なども、予算書などの公式資料から探して記録しています。政策に賛成・反対するためのものではありません。</p>
    <p><b>予算</b>は「その年度に使う予定のお金」、<b>決算</b>は「年度が終わって確定した、実際に使ったお金」です。予算と決算は足さずに、別々に表示します。</p>`);
}

function step2(fy) {
  const ft = fieldTotals(db.munis.map(m => cell(m.code, fy, '当初予算')));
  const sh = fieldShares(ft.amount).filter(r => r.amount > 0);
  if (!sh.length) return step(2, '使い道を10の分類に分けて見られます。', '<p class="note">確認できた金額は、まだありません（調査中）。</p>');
  const top = sh.slice(0, 5), rest = sh.slice(5);
  const restAmt = rest.reduce((s, r) => s + r.amount, 0);
  return step(2, `いちばん多いのは<b>${esc(fieldLabel(sh[0].field))}</b>。全体の${(sh[0].share * 100).toFixed(0)}%です。`, `
    <div class="g-donut">
      <div class="g-donut-fig">${donutSVG(sh.map(r => ({ value: r.amount, color: COLORS.field[r.field] })), { size: 180 })}<div class="g-donut-c"><small>確認できた合計</small><b>${esc(yen(ft.total, { approx: true }))}</b></div></div>
      <ul class="g-legend">${top.map(r => `<li><i style="background:${COLORS.field[r.field]}"></i><span>${esc(fieldLabel(r.field))}</span><b>${(r.share * 100).toFixed(1)}%</b></li>`).join('')}
        ${rest.length ? `<li><i class="other"></i><span>ほか${rest.length}分類</span><b>${(restAmt / ft.total * 100).toFixed(1)}%</b></li>` : ''}</ul>
    </div>
    <p class="fig-cap">${esc(fyFull(fy))}・当初予算。これまでに調べた${num(ft.n)}自治体（都道府県庁と市区町村の単純合計）のうち、公式資料で金額を確かめた分です。全国すべての自治体の内訳ではありません。</p>
    <p><a class="btn btn-outline" href="${href('/national', { y: fy })}">使い道の内訳と事業を見る</a></p>`,
    `<ul>${Object.entries(FIELD_INFO).map(([, v]) => `<li><b>${esc(v.label)}</b>：${esc(v.desc)}</li>`).join('')}</ul><p>1つの事業は1つの使い道にだけ入れるので、同じお金を2回数えません。</p>`);
}

function step3(fy) {
  return step(3, '日本語教室の運営、学校の日本語指導員、相談窓口の通訳など、くらしに身近な事業です。', `<div id="g3-ex"><p class="muted small">読み込んでいます…</p></div>`);
}

function step4(fy) {
  const rows = db.munis.filter(m => !m.isPref).map(m => ({ m, v: metricOf('ratio', m.code, fy, '当初予算', false) })).filter(x => x.v !== null).sort((a, b) => b.v - a.v);
  if (rows.length < 3) return step(4, '自治体によって、使う金額も、一般会計に占める割合も大きくちがいます。', '<p class="note">同じ条件で比べられる自治体が、まだそろっていません（調査中）。</p>');
  const mid = rows[Math.floor(rows.length / 2)].v;
  const top = rows.slice(0, 5);
  const max = top[0].v;
  return step(4, `一般会計に占める割合は、多い自治体で<b>${esc(ratioPct(rows[0].v))}</b>、まん中の自治体で<b>${esc(ratioPct(mid))}</b>。自治体の予算全体から見ると、ごく一部です。`, `
    <p class="g-cap-top">一般会計に占める割合が高い市区町村（${esc(fyFull(fy))}・当初予算）</p>
    <ul class="g-bars">${top.map(x => `<li><a href="${href('/m/' + x.m.code, { y: fy })}">${esc(x.m.name)}<small>${esc(x.m.pref)}</small></a><span class="g-bar"><i style="width:${Math.max(3, x.v / max * 100).toFixed(1)}%"></i></span><b>${esc(ratioPct(x.v))}</b></li>`).join('')}
      <li class="g-mid"><span>まん中の自治体<small>${num(rows.length)}市区町村の中央値</small></span><span class="g-bar"><i style="width:${Math.max(1, mid / max * 100).toFixed(1)}%"></i></span><b>${esc(ratioPct(mid))}</b></li></ul>
    <p class="fig-cap">「${esc(stLabel('確認済み'))}」で、一般会計の予算総額を確かめた市区町村だけ。外国人住民の多さ・事業の進め方・資料の詳しさで、数字は大きく変わります。</p>
    <p><a class="btn btn-outline" href="${href('/ranking', { y: fy, k: 'ratio' })}">ランキングで全部を見る</a></p>`,
    `<p>一般会計に占める割合は、確認できた多文化共生関連予算のうち一般会計の事業の金額を、その自治体の一般会計の当初予算の総額で割ったものです（同じ年度・同じ自治体どうし）。特別会計・企業会計の事業は入れません。</p>`);
}

function step5() {
  const rule = (ic, t, d) => `<li>${ICON[ic]}<div><b>${t}</b><span>${d}</span></div></li>`;
  return step(5, '数字は「公式資料で確かめられた分」です。比べるときは、条件をそろえましょう。', `
    <ul class="g-rules">
      ${rule('check', '確かめた分だけを足す', '予算書などの該当ページで金額を確認した事業だけの合計です。その自治体の関連支出のすべてとは限りません。')}
      ${rule('pin', '「未調査」は0円ではない', '地図の灰色は、まだ調べていない自治体です。0円は、関係する事業がないと確かめたときだけです。')}
      ${rule('percent', '割合は一般会計との比', '分子は確認できた予算のうち一般会計の事業、分母は同じ年度の一般会計の当初予算の総額です。')}
      ${rule('compare', '同じ条件で比べる', '同じ年度・当初予算どうしで。都道府県と市区町村は足したり比べたりしません。一部の資料だけ調べた自治体は少なく出ます。')}
    </ul>`,
    `<p>このサイトは、事業を「誰を対象に、何のために使うお金か」で分けて、次のものだけを合計しています。</p>
    <ul>${['①', '②', '③'].map(k => `<li><b>${esc(R[k].no)} ${esc(R[k].label)}</b>：${esc(R[k].desc)}</li>`).join('')}</ul>
    <p>${esc(R['④'].no)} ${esc(R['④'].label)}（国際交流協会の運営補助など）・${esc(R['⑤'].no)} ${esc(R['⑤'].label)}・判定保留は、合計に入れません。学校の教員の人件費（多くの自治体で教職員の人件費全体にまとめられ、金額が分からないため）と、中国残留邦人等・引揚者などの援護（外国人向けの施策とは性格がちがうため）も、どの自治体でも<a href="#/about?to=betsuwaku">別枠</a>にし、合計に入れずに金額を参考として別に示しています。くわしくは<a href="#/about?to=rule">集計基準</a>を見てください。</p>
    <p>国や都道府県からの補助金は、事業の金額の「財源の内訳」として示すだけで上乗せしません。確認できない金額を推計で補うこともしません。</p>`);
}

export function guidePage(ctx) {
  const { app, params } = ctx;
  const fy = currentYear(params);
  const how = (ic, t, d) => `<li>${ICON[ic]}<b>${t}</b><span>${d}</span></li>`;
  app.innerHTML = `<div class="page-head g-top"><span class="kicker">はじめての方向け</span><h1>3分でわかる 多文化共生予算</h1>
    <p class="lead">何のお金か・数字の見方を5つの図で、このサイトの使い方を最後にまとめて説明します。</p>
    <ol class="g-toc">${GUIDE_STEPS.map(([id, t], i) => `<li><a href="${href('/guide', { to: id })}"><span>${i + 1}</span>${esc(t)}</a></li>`).join('')}
      <li><a href="${href('/guide', { to: 'g-how' })}"><span>${ICON.search}</span>このサイトの使い方</a></li></ol></div>
    <div class="g-wrap">${step1()}${step2(fy)}${step3(fy)}${step4(fy)}${step5()}</div>
    <section class="g-end" id="g-how" aria-labelledby="g-how-h"><h2 id="g-how-h">このサイトの使い方</h2>
      <ol class="g-how">
        ${how('search', '自治体を探す', 'トップページで名前を入れるか、地図・都道府県の一覧から選びます。')}
        ${how('yen', '予算と割合を見る', '自治体のページの最初に、確認できた予算の合計と、一般会計に占める割合が出ます。')}
        ${how('donut', '使い道と事業を見る', '円グラフで使い道（10分類）を、一覧で事業ごとの金額と出典の資料を確かめられます。')}
        ${how('bars', 'ほかと比べる', '「全国を見る」のランキング・比較・年度別の変化で、ほかの自治体と並べて見られます。')}
      </ol>
      <div class="g-go"><a class="btn" href="#/?to=find">${ICON.search}自分の自治体を調べる</a><a class="btn btn-outline" href="${href('/national', { y: fy })}">${ICON.bars}全国を見る</a></div></section>`;
  // 目次から同じページの図へ移動（もう一度押しても移動する）
  app.querySelector('.g-toc').addEventListener('click', ev => {
    const a = ev.target.closest('a'); if (!a) return;
    const id = new URLSearchParams(a.getAttribute('href').split('?')[1]).get('to');
    const t = document.getElementById(id); if (!t) return;
    ev.preventDefault(); history.replaceState(null, '', href('/guide', { to: id })); t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // STEP3：使い道ごとに、実際の事業を1つずつ（市区町村の事業から、金額の大きいもの）
  (async () => {
    const box = $('#g3-ex');
    try {
      const u = await loadUses();
      const rows = (u.rows[`${fy}|当初予算`] || []).filter(r => !db.byCode.get(r[0])?.isPref);
      const want = ['日本語教育', '教育支援', '外国人相談', '多言語対応'];
      const icon = { '日本語教育': 'class', '教育支援': 'school', '外国人相談': 'talk', '多言語対応': 'lang' };
      const picks = want.map(f => rows.filter(r => r[3] === f).sort((a, b) => b[4] - a[4])[0]).filter(Boolean);
      if (!picks.length) { box.innerHTML = '<p class="note">実際の事業の例は、まだ登録されていません（調査中）。</p>'; return; }
      box.innerHTML = `<ul class="g-ex">${picks.map(r => { const m = db.byCode.get(r[0]); return `<li><a href="${href('/m/' + r[0], { y: fy, pj: r[1] })}">${ICON[icon[r[3]]]}<span class="g-ex-f" style="--c:${COLORS.field[r[3]]}">${esc(fieldLabel(r[3]))}</span><b>${esc(r[2])}</b><span class="g-ex-m">${esc(m?.full || '')}</span><span class="g-ex-a">${esc(yen(r[4]))}</span></a></li>`; }).join('')}</ul>
        <p class="fig-cap">${esc(fyFull(fy))}・当初予算。市区町村の事業のうち、それぞれの使い道で金額の大きいものの例です（公式資料で金額を確認したもの）。押すと事業の説明と出典が見られます。</p>`;
    } catch { box.innerHTML = '<p class="note">実際の事業の例を読み込めませんでした。</p>'; }
  })();
}
