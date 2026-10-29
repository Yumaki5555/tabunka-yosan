// ランキング（同じ年度・同じ段階・同じ数え方で確認できた自治体だけを並べる。自治体のページの合計と同じ値を使う）
// 自治体名・値・横棒を1行にまとめる。指標は「予算の合計・一般会計に占める割合・住民1人当たり・外国人住民1人当たり・増減」を切り替える

import { db, metricOf, status, cell, loadPopulation, popOf, generalOf } from './store.js';
import { $, $$, esc, yen, yenExact, yenPer, pct, num, fyFull, download, ratioPct } from './util.js';
import { href, currentYear, currentStage, yearPicker, bindYearPicker, stageSeg } from './app.js';
import { statusBadge, stLabel, exploreTabs, scopeNoteHTML } from './components.js';
import { ICON } from './icons.js';
import { toCSV } from './csv.js';

export const RANK_KINDS = {
  high: { label: '予算の合計', mode: 'total', dir: -1, fmt: v => yen(v) },
  ratio: { label: '一般会計に占める割合', mode: 'ratio', dir: -1, fmt: ratioPct },
  perCapita: { label: '住民1人当たり', mode: 'perCapita', dir: -1, fmt: yenPer },
  perForeign: { label: '外国人住民1人当たり', mode: 'perForeign', dir: -1, fmt: yenPer },
  up: { label: '前年度より増えた', mode: 'yoy', dir: -1, filter: v => v > 0, fmt: v => pct(v) },
  down: { label: '前年度より減った', mode: 'yoy', dir: 1, filter: v => v < 0, fmt: v => pct(v) },
  low: { label: '予算の合計（少ない順）', mode: 'total', dir: 1, fmt: v => yen(v) },
};
// 指標のボタン（少ない順・減った順は「並び」で切り替える）
const MAIN = [['high', '予算の合計'], ['ratio', '一般会計に占める割合'], ['perCapita', '住民1人当たり'], ['perForeign', '外国人住民1人当たり'], ['up', '前年度からの増減']];
const mainOf = k => k === 'low' ? 'high' : k === 'down' ? 'up' : k;

export function rankRows({ kind, level, fy, stage, partial }) {
  const k = RANK_KINDS[kind];
  const pool = db.munis.filter(m => (level === 'pref') === m.isPref);
  const rows = [];
  for (const m of pool) {
    const v = metricOf(k.mode, m.code, fy, stage, partial);
    if (v === null || (k.filter && !k.filter(v))) continue;
    const c = cell(m.code, fy, stage);
    rows.push({ m, v, st: status(m.code, fy, stage), a: c?.a ?? (status(m.code, fy, stage) === '該当事業なし' ? 0 : null), n: c?.an ?? 0 });
  }
  rows.sort((a, b) => (a.v - b.v) * k.dir || a.m.code.localeCompare(b.m.code));
  let rank = 0, prev = null;
  rows.forEach((r, i) => { if (r.v !== prev) { rank = i + 1; prev = r.v; } r.rank = rank; });
  return rows;
}

function condition({ kind, level, fy, stage, partial, n }) {
  const k = RANK_KINDS[kind];
  if (k.mode === 'yoy') partial = false;
  const asOf = db.pop?.asOf?.[fy];
  const extra = k.mode === 'perForeign' ? `計算：予算の合計 ÷ 外国人住民数（在留外国人統計、${asOf ? asOf.for.slice(0, 4) + '年12月末' : '前年12月末'}）。外国人住民1人に支払われた金額ではありません。`
    : k.mode === 'perCapita' ? `計算：予算の合計 ÷ 住民の数（住民基本台帳、${asOf ? asOf.pop.slice(0, 4) + '年1月1日' : '1月1日'}現在）。`
      : k.mode === 'ratio' ? `計算：確認できた予算のうち一般会計の事業の金額 ÷ その自治体の一般会計の${stage === '決算' ? '決算額' : '当初予算の総額'}（同じ年度）。一般会計の総額を確かめた自治体だけ。`
        : k.mode === 'yoy' ? `${fy - 1}年度と${fy}年度の両方を、同じ段階で主な資料まで調べた自治体だけ（一部の資料だけ調べた年度があると、調べた範囲の差で増減が大きく見えるため比べません）。増減率は、両方の年度に金額がある同じ事業どうしで計算しています（新しく始まった・終わった事業、前の年度の補正予算に前倒しした事業、片方の年度だけ金額が分かった事業は入れません）。` : '';
  return `<details class="cond-box"><summary><b>比べる条件</b>：${esc(fyFull(fy))}・${esc(stage)}・${level === 'pref' ? '都道府県庁' : '市区町村'}・${esc(stLabel('確認済み'))}${partial ? `と${esc(stLabel('一部確認'))}` : ''}の${num(n)}自治体</summary>
    <p class="small">金額は自治体のページと同じ数え方（公式資料で確認できた多文化共生関連予算）です。${extra}未調査の自治体は0円として順位に入れていません。都道府県と市区町村は別のランキングです。${partial ? '「一部の資料だけ調査」の自治体は、確認できた分だけなので実際より少ない可能性があります（割合は「確認済み分の割合」）。' : ''}</p>
    <p class="small"><b>完全な比較ではありません。</b>自治体ごとに資料の詳しさや調べた範囲がちがい、ほかの事業にまざって金額が分からない支出は入っていません。</p></details>`;
}

// 横棒のランキング（自治体名・値・棒を1行に）
export function rankBarsHTML(rows, { kind, fy, stage, limit }) {
  const k = RANK_KINDS[kind];
  const shown = limit ? rows.slice(0, limit) : rows;
  const max = Math.max(...rows.map(r => Math.abs(r.v)), 1e-12);
  const neg = k.mode === 'yoy';
  return `<ol class="rank-bars">${shown.map(r => {
    const w = Math.max(1.5, Math.abs(r.v) / max * 100);
    const sub = [k.mode !== 'total' ? `予算 ${yen(r.a)}` : '', k.mode === 'ratio' && generalOf(r.m.code, fy, stage) ? `一般会計 ${yen(generalOf(r.m.code, fy, stage), { approx: true })}` : '', r.st === '一部確認' ? '一部の資料だけ調査' : ''].filter(Boolean).join('・');
    return `<li><span class="rb-rank">${r.rank}</span>
      <a class="rb-name" href="${href('/m/' + r.m.code, { y: fy, s: stage === '決算' ? '決算' : '' })}">${esc(r.m.isPref ? r.m.name : r.m.name)}<small>${esc(r.m.isPref ? '' : r.m.pref)}</small></a>
      <span class="rb-bar"><i class="${neg && r.v < 0 ? 'neg' : ''}${r.st === '一部確認' ? ' part' : ''}" style="width:${w.toFixed(2)}%"></i></span>
      <span class="rb-val">${esc(k.fmt(r.v))}${sub ? `<small>${esc(sub)}</small>` : ''}</span></li>`;
  }).join('')}</ol>`;
}

export async function rankingPage(ctx) {
  const { app, params } = ctx;
  await loadPopulation();
  const st = {
    kind: RANK_KINDS[params.get('k')] ? params.get('k') : 'high',
    level: params.get('lv') === 'pref' ? 'pref' : 'muni',
    fy: currentYear(params), stage: currentStage(params), partial: params.get('pt') === '1',
    all: params.get('all') === '1',
  };
  const save = () => history.replaceState(null, '', href('/ranking', { k: st.kind === 'high' ? '' : st.kind, lv: st.level === 'muni' ? '' : st.level, y: st.fy, s: st.stage === '決算' ? '決算' : '', pt: st.partial ? '1' : '', all: st.all ? '1' : '' }));
  const draw = () => {
    save();
    const rows = rankRows(st);
    const k = RANK_KINDS[st.kind];
    const main = mainOf(st.kind);
    const desc = st.kind === 'low' || st.kind === 'down';
    const LIMIT = 30;
    app.innerHTML = `${exploreTabs('ranking', st.fy, ICON)}
      <div class="page-head"><h1>ランキング</h1>
        <p class="lead">同じ年度・同じ数え方で確認できた自治体だけを並べます。</p></div>
      <div class="ctl-row">
        <div class="ctl"><span class="label">年度</span>${yearPicker(st.fy, 'rk-fy')}</div>
        <div class="ctl"><span class="label">予算か決算か</span>${stageSeg(st.stage)}</div>
        <div class="ctl"><span class="label">比べる自治体</span><div class="seg seg-sm" role="group" aria-label="都道府県か市区町村か">${[['muni', '市区町村'], ['pref', '都道府県']].map(([key, l]) => `<button type="button" data-rl="${key}" aria-pressed="${key === st.level}">${l}</button>`).join('')}</div></div>
      </div>
      <div class="ctl"><span class="label">指標</span><div class="seg" role="group" aria-label="指標">${MAIN.map(([key, l]) => `<button type="button" data-rk="${key}" aria-pressed="${key === main}">${esc(l)}</button>`).join('')}</div></div>
      <div class="ctl-row tight">
        ${main === 'high' || main === 'up' ? `<div class="seg seg-sm" role="group" aria-label="並び">${main === 'high' ? `<button type="button" data-rk="high" aria-pressed="${st.kind === 'high'}">多い順</button><button type="button" data-rk="low" aria-pressed="${st.kind === 'low'}">少ない順</button>` : `<button type="button" data-rk="up" aria-pressed="${st.kind === 'up'}">増えた順</button><button type="button" data-rk="down" aria-pressed="${st.kind === 'down'}">減った順</button>`}</div>` : ''}
        ${k.mode !== 'yoy' ? `<label class="check small"><input type="checkbox" id="rk-pt" ${st.partial ? 'checked' : ''}> 一部の資料だけ調べた自治体も含める（参考）</label>` : ''}
      </div>
      ${condition({ ...st, n: rows.length })}
      ${rows.length ? scopeNoteHTML() : ''}
      <h2 class="rank-h">${esc(k.label)}${desc ? '' : main === 'up' ? '' : ''}<small>${esc(st.level === 'pref' ? '都道府県庁' : '市区町村')}・${esc(fyFull(st.fy))}・${esc(st.stage)}</small></h2>
      ${rows.length ? rankBarsHTML(rows, { kind: st.kind, fy: st.fy, stage: st.stage, limit: st.all ? 0 : LIMIT })
        : `<p class="note">この条件で比べられる自治体は、まだありません。${!st.partial && k.mode !== 'yoy' ? `「一部の資料だけ調べた自治体も含める」にすると表示される場合があります。` : ''}</p>`}
      ${rows.length > LIMIT && !st.all ? `<p><button type="button" class="btn btn-outline" id="rk-all">残りの${num(rows.length - LIMIT)}自治体も表示する</button></p>` : ''}
      <p class="next-links"><button type="button" class="linklike" id="rk-csv">${ICON.download}この順位をCSVでダウンロード</button><a href="${href('/compare', { y: st.fy, c: rows.slice(0, 3).map(r => r.m.code).join(',') })}">${ICON.compare}上位3つを比較する</a></p>`;
    bindYearPicker(app, y => { st.fy = y; draw(); });
    $$('[data-stage]', app).forEach(b => b.addEventListener('click', () => { st.stage = b.dataset.stage; draw(); }));
    $$('[data-rk]', app).forEach(b => b.addEventListener('click', () => { st.kind = b.dataset.rk; draw(); }));
    $$('[data-rl]', app).forEach(b => b.addEventListener('click', () => { st.level = b.dataset.rl; draw(); }));
    $('#rk-pt')?.addEventListener('change', e => { st.partial = e.target.checked; draw(); });
    $('#rk-all')?.addEventListener('click', () => { st.all = true; draw(); });
    $('#rk-csv').addEventListener('click', () => {
      download(`ranking_${st.kind}_${st.level}_${st.fy}_${st.stage}.csv`, toCSV(
        ['順位', '自治体コード', '都道府県', '自治体', '年度', '段階', '集計区分', '指標', '値', '多文化共生関連予算の合計（円）', '一般会計の予算総額（円）', '合計に入れた事業の数', '人口', '外国人住民数', '調査状況', '別枠の事業の金額（円・合計に入れていない）'],
        rows.map(r => { const p = popOf(r.m.code, st.fy); return [r.rank, r.m.code, r.m.pref, r.m.isPref ? '' : r.m.name, st.fy, st.stage, '基本集計：①直接給付・支援＋②行政経費＋③一般事業のうち分かった部分', k.label, k.mode === 'yoy' ? (r.v * 100).toFixed(2) + '%' : k.mode === 'ratio' ? (r.v * 100).toFixed(4) + '%' : Math.round(r.v), r.a ?? '', generalOf(r.m.code, st.fy, st.stage) ?? '', r.n, p?.population ?? '', p?.foreign ?? '', stLabel(r.st), cell(r.m.code, st.fy, st.stage)?.bw ?? '']; })));
    });
  };
  draw();
}
