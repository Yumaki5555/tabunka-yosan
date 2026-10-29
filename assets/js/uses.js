// 使い道（10分類）の内訳の欄：円グラフ・金額の一覧・分類を押すと出る事業の一覧・集計の範囲
// 全国（トップページ）・都道府県・市区町村のページで、同じ部品と同じ計算を使う。
// ・金額：calc.js の fieldTotals（自治体×年度×段階の集計を足したもの）。地図・ランキング・自治体のページの合計と同じ数
// ・分類を押したときの事業の一覧：自治体のページでは breakdown（「この金額はどう計算した？」と同じ計算）、
//   全国では tools/build.mjs が同じ breakdown から作った uses.json。どちらも、一覧の足し算がその分類の金額と合うかを画面でも確かめる
// ・都道府県と市区町村の両方を足すときは「単純合計（重複の調整なし）」と書く（県から市区町村への補助が両方に出てくるおそれがあるため）

import { status, loadUses } from './store.js';
import { $$, esc, yen, yenExact, num } from './util.js';
import { donutChart, COLORS } from './charts.js';
import { fieldTotals, fieldShares, valueOf } from './calc.js';
import { FIELD_INFO, RELATION_INFO } from './schema.js';
import { fieldLabel, sourceLink, stLabel } from './components.js';

// 割合（小数第1位まで。0より大きく0.1%未満は「0.1%未満」と書く）
export const shareText = r => r > 0 && r < 0.001 ? '0.1%未満' : `${(r * 100).toFixed(1)}%`;
// 円グラフの真ん中に書く短い金額（正確な金額は一覧とその下の文に書く）
const shortYen = v => {
  if (v >= 1e8) { const s = Math.round(v / 1e7); return `${s * 1e7 === v ? '' : '約'}${num(s / 10)}億円`; }
  if (v >= 1e4) { const s = Math.round(v / 1e4); return `${s * 1e4 === v ? '' : '約'}${num(s)}万円`; }
  return `${num(v)}円`;
};
const relShort = k => `${RELATION_INFO[k]?.no || ''}${RELATION_INFO[k]?.short || ''}`;
const FIRST = 30;

// 分類を押したときに出す事業1件。it = {name, amt, k（分類①②③）, muni（自治体名）, pj（事業ID）, link（自治体のページへのURL。同じページの事業一覧なら null）, s（出典）, page}
function itemHTML(it) {
  const a = it.link ? `<a href="${esc(it.link)}">${esc(it.name)}</a>` : `<a href="#pj-${esc(it.pj)}" data-pj="${esc(it.pj)}">${esc(it.name)}</a>`;
  const sub = [it.muni ? esc(it.muni) : '', esc(relShort(it.k)), it.s ? `出典：${sourceLink(it.s, it.page)}` : ''].filter(Boolean).join('・');
  return `<li><span>${a}<small>${sub}</small></span><span class="ml-amt">${esc(yen(it.amt))}${it.k === '③' ? '<small>外国人関連の部分</small>' : ''}</span></li>`;
}

// box に使い道の内訳を描く。
//   cells：足し合わせる集計（同じ年度・同じ段階のもの）
//   items(field)：その使い道に入る事業の一覧を返す関数（Promise でもよい）
//   centerK：円グラフの真ん中に書く合計の呼び方、foot：一覧の下に書く HTML（集計の範囲など）
//   expect：画面のほかの場所に出している合計（渡すと、使い道の合計と一致するかも確かめる）
export function renderUses(box, { cells, items, label, centerK = '合計', foot = '', expect, empty }) {
  const ft = fieldTotals(cells);
  const rows = fieldShares(ft.amount);
  const ok = ft.total === ft.sum && (expect === undefined || expect === null || expect === ft.total);
  if (!ft.total) {
    box.innerHTML = `<p class="info">${empty ? esc(empty) : 'この範囲・年度・段階では、使い道ごとに分けられる、資料で確かめた金額がありません。0円という意味ではありません（未調査や、金額が分からない事業は円グラフに入れていません）。'}</p>${foot}`;
    return ft;
  }
  // 金額のない分類は一覧に出さない（名前だけ下に書く）
  const zero = rows.filter(r => !r.amount);
  box.innerHTML = `<div class="uses-wrap">
      <div class="uses-chart"><div class="donut-box"></div><p class="small muted">扇形か一覧の分類を押すと、その分類に入っている事業・金額・出典が出ます。</p></div>
      <div class="uses-list">${rows.filter(r => r.amount).map(r => {
        const color = COLORS.field[r.field];
        const head = `<span class="uz-top"><span class="uz-name"><i class="uz-sw" style="background:${color}"></i>${esc(fieldLabel(r.field))}</span>
          <span class="uz-amt">${esc(yen(r.amount))}<small>${r.amount ? `${shareText(r.share)}・${num(ft.count[r.field])}事業` : 'この範囲で確認できた事業なし'}</small></span></span>`;
        if (!r.amount) return `<div class="uz uz-zero">${head}</div>`;
        return `<details class="uz" data-field="${esc(r.field)}"><summary>${head}
          <span class="uz-track" aria-hidden="true"><span class="uz-fill" style="width:${Math.max(0.6, r.share * 100).toFixed(2)}%;background:${color}"></span></span></summary>
          <div class="uz-body"></div></details>`;
      }).join('')}${zero.length ? `<p class="small muted uz-none">この範囲で金額のある事業がない分類：${zero.map(r => esc(fieldLabel(r.field))).join('・')}</p>` : ''}</div>
    </div>
    <p class="${ok ? 'uz-ok' : 'calc-ng'} small">${ok
      ? `✔ 10分類の合計 ${esc(yenExact(ft.total))} は、予算額の合計と一致します（1つの事業は1つの分類にだけ入れ、同じ金額を2回数えていません）。`
      : `✕ 10分類の金額の合計 ${esc(yenExact(ft.total))} が、多文化共生関連予算の合計 ${esc(yenExact(expect ?? ft.sum))} と合いません。データを確かめるまで、この内訳は使わないでください。`}</p>
    ${foot}`;

  const list = box.querySelector('.uses-list');
  const det = new Map($$('details.uz', list).map(d => [d.dataset.field, d]));
  const chart = donutChart(box.querySelector('.donut-box'), {
    label: label || '使い道（10分類）の円グラフ',
    center: { k: centerK, v: shortYen(ft.total) },
    rows: rows.map(r => ({ key: r.field, label: fieldLabel(r.field), value: r.amount, color: COLORS.field[r.field], text: `${yen(r.amount)}（${shareText(r.share)}）` })),
    onPick: f => {
      const d = det.get(f);
      if (!d) return;
      d.open = !d.open;
      if (d.open) setTimeout(() => d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30);
    },
  });

  const fill = async (d, f) => {
    const body = d.querySelector('.uz-body');
    if (body.dataset.done) return;
    body.dataset.done = '1';
    body.innerHTML = '<p class="small muted">読み込んでいます…</p>';
    let its;
    try { its = await items(f); } catch (e) { body.innerHTML = `<p class="error small">事業の一覧を読み込めませんでした（${esc(e.message || e)}）。</p>`; body.dataset.done = ''; return; }
    its = [...its].sort((x, y) => y.amt - x.amt || String(x.muni || '').localeCompare(String(y.muni || '')));
    const s = its.reduce((t, x) => t + x.amt, 0);
    const same = s === ft.amount[f] && its.length === ft.count[f];
    body.innerHTML = `<p class="uz-sum">この分類の合計 <b>${esc(yenExact(ft.amount[f]))}</b>（${num(its.length)}事業）</p>
      <p class="small muted">入るもの：${esc(FIELD_INFO[f]?.desc || '')}</p>
      <ul class="mini-list">${its.slice(0, FIRST).map(itemHTML).join('')}</ul>
      ${its.length > FIRST ? `<p><button type="button" class="btn btn-outline btn-small uz-more">残りの${num(its.length - FIRST)}事業も表示する</button></p>` : ''}
      <p class="${same ? 'calc-ok' : 'calc-ng'} small">${same ? `✔ この一覧の${num(its.length)}事業を足すと、この分類の金額と一致します。` : `✕ この一覧の足し算 ${esc(yenExact(s))}（${its.length}事業）が、この分類の金額と合いません。`}</p>`;
    body.querySelector('.uz-more')?.addEventListener('click', ev => {
      ev.target.closest('p').remove();
      body.querySelector('.mini-list').insertAdjacentHTML('beforeend', its.slice(FIRST).map(itemHTML).join(''));
    });
  };
  for (const [f, d] of det) d.addEventListener('toggle', () => {
    if (d.open) {
      for (const o of det.values()) if (o !== d && o.open) o.open = false;
      chart.select(f);
      fill(d, f);
    } else if (![...det.values()].some(o => o.open)) chart.select(null);
  });
  // 同じページの事業一覧へ移動（自治体のページ）
  list.addEventListener('click', ev => {
    const a = ev.target.closest('a[data-pj]');
    if (!a) return;
    ev.preventDefault();
    const p = document.getElementById('pj-' + a.dataset.pj);
    if (!p) return;
    // 事業の一覧が閉じていたら開く（自治体のページの「事業の一覧を見る」）
    const host = p.closest('[data-reveal]');
    if (host?.hidden) { host.hidden = false; document.querySelector(`[aria-controls="${host.id}"]`)?.setAttribute('aria-expanded', 'true'); }
    for (let d = p.parentElement?.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
    p.open = true; p.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  return ft;
}

// 集計の範囲（何自治体を調べて、何自治体を円グラフに入れたか）。munis：範囲に入る自治体の一覧、scopeName：範囲の呼び方
export function coverageHTML({ munis, fy, stage, ft, when, scopeName }) {
  const st = {};
  for (const m of munis) { const s = status(m.code, fy, stage); st[s] = (st[s] || 0) + 1; }
  const n = k => st[k] || 0;
  const notYet = n('未調査') + n('決算未公表');
  const kinds = ['確認済み', '一部確認', '該当事業なし', '資料未発見', '金額非公表'].filter(k => n(k)).map(k => `${stLabel(k)} ${num(n(k))}`).join('・');
  return `<div class="uz-cov"><h3>集計の範囲（どこまで調べた？）</h3><dl class="cov-dl">
      <div><dt>対象年度</dt><dd>${esc(when)}（ほかの年度・予算と決算は混ぜていません）</dd></div>
      <div><dt>調べた自治体</dt><dd><b>${num(munis.length - notYet)}</b> / ${num(munis.length)}（${esc(scopeName)}）${kinds ? `<small>${esc(kinds)}</small>` : ''}</dd></div>
      <div><dt>円グラフに入れた自治体</dt><dd><b>${num(ft.n)}</b><small>資料で金額を確かめられた事業がある自治体（集計対象）。「一部の資料だけ調査」の自治体は、確かめられた事業の分だけです</small></dd></div>
      <div><dt>資料が見つからない・金額は非公表</dt><dd>${num(n('資料未発見') + n('金額非公表'))}<small>調べたが金額が分からない自治体。円グラフに入れていません（0円とはみなしません）</small></dd></div>
      <div><dt>まだ調べていない自治体</dt><dd>${num(n('未調査'))}${n('決算未公表') ? `<small>ほかに、決算がまだ公表前 ${num(n('決算未公表'))}</small>` : ''}<small>円グラフに入れていません（0円とはみなしません）</small></dd></div>
      <div><dt>金額を確認できた事業</dt><dd><b>${num(ft.an)}</b>件<small>円グラフに入れた事業（公式資料の該当ページで金額を確認したもの）</small></dd></div>
      <div><dt>外国人関連の金額が分からない事業</dt><dd>${num(ft.unknown)}件<small>一般事業のうち外国人関連の部分の金額が資料にない事業や、金額の記録がない事業。円グラフに入れていません${ft.pend ? `。ほかに、資料で確認している途中の金額 ${num(ft.pend)}件も入れていません` : ''}</small></dd></div>
    </dl>
    <p class="small muted">これは全国（その地域）すべての自治体の予算の内訳ではなく、これまでに調べて、公式資料で金額を確かめられた分だけの内訳です。調べる自治体が増えると、内訳も変わります。④関連事業・⑤対象外・判定保留の事業は、もともと多文化共生関連予算の合計に入れない事業なので、円グラフにも入れていません。</p></div>`;
}

// 1つの自治体のとき：円グラフに入れた事業と、入れていない事業の数
export function singleCoverageHTML(ft) {
  return `<p class="small">円グラフに入れた事業：<b>${num(ft.an)}</b>件（資料の該当ページで金額を確認したもの）。${ft.unknown ? `外国人関連の金額が分からない事業 ${num(ft.unknown)}件は、0円とみなさず円グラフに入れていません。` : ''}${ft.pend ? `資料で確認している途中の金額 ${num(ft.pend)}件も入れていません。` : ''}④関連事業・⑤対象外・判定保留の事業は、合計と同じく入れていません。</p>`;
}

// 都道府県庁と市区町村を足すときの注意（重複の調整はしていない）。資料で確かめられた、県から市区町村への補助などの額も書く
export function overlapHTML(prefCells, muniCells, area = '全国') {
  let tr = 0, pf = 0, npf = 0;
  for (const c of prefCells) if (valueOf(c)) tr += c.tr || 0;
  for (const c of muniCells) if (valueOf(c) && c.fd) { pf += c.fd.pref || 0; npf += c.fd.national_pref || 0; }
  return `<p class="note"><b>都道府県庁の予算と市区町村の予算を、そのまま足した「単純合計」です（重複の調整はしていません）。</b>都道府県から市区町村への補助金は、県の予算と市区町村の予算の両方に出てくるので、同じお金を2回数えている部分がありえます。${esc(area)}で実際に使われたお金の総額ではありません。
    <br><small>資料で確かめられた分だけでも、県から市区町村への補助 ${esc(yen(tr))}、市区町村の事業の財源のうち都道府県からの補助 ${esc(yen(pf))}${npf ? `（ほかに国・都道府県の区別なし ${esc(yen(npf))}）` : ''}があります。どれがどの事業と同じお金かまでは資料で結びつけられないため、差し引いていません。国の予算はこのサイトでは数えていないので、国からの補助金が二重になることはありません。</small></p>`;
}

// 全国の事業の一覧（uses.json）から、その使い道に入る事業を取り出す。codeOk(code) で範囲をしぼる
export async function nationalItems({ fy, stage, field, codeOk, byCode, linkOf }) {
  const u = await loadUses();
  return (u.rows[`${fy}|${stage}`] || []).filter(r => r[3] === field && codeOk(r[0])).map(r => {
    const s = u.src[r[6]];
    return { name: r[2], amt: r[4], k: r[5], pj: r[1], muni: byCode.get(r[0])?.full || r[0], link: linkOf(r[0], r[1]), s: s ? { source_id: r[6], title: s[0], url: s[1] } : null, page: r[7] };
  });
}

// 自治体のページの内訳（breakdown の結果）から、その使い道に入る事業を取り出す。link が null なら同じページの事業一覧へ移動する
export function breakdownItems(bd, field, { muni = '', link = null } = {}) {
  const g = bd.fields.find(x => x.field === field);
  return (g?.list || []).map(r => ({ name: r.p.name, amt: r.amt, k: r.k, pj: r.p.project_id, muni, link: link ? link(r.p.project_id) : null, s: r.s, page: r.b.page }));
}
