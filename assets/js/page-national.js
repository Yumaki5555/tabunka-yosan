// 全国を見る：使い道（10分類の円グラフ）。上に「使い道・ランキング・比較・年度別」の切り替えを出す
// 金額は calc.js の fieldTotals（地図・ランキング・自治体のページの合計と同じ数え方）。分類を押すと全国の事業の一覧（uses.json）を読む

import { db, cell } from './store.js';
import { $, $$, esc, yen, num, fyFull } from './util.js';
import { href, currentYear, currentStage, yearPicker, bindYearPicker, stageSeg } from './app.js';
import { exploreTabs, scopeNoteHTML } from './components.js';
import { ICON } from './icons.js';
import { fieldTotals } from './calc.js';
import { renderUses, coverageHTML, overlapHTML, nationalItems } from './uses.js';

// 集計の範囲（都道府県庁と市区町村を足すのは、重複の調整をしない単純合計）
const USE_SCOPES = { all: '都道府県庁＋市区町村（単純合計）', pref: '都道府県庁だけ', muni: '市区町村だけ' };

export function nationalPage(ctx) {
  const { app, params } = ctx;
  const st = { fy: currentYear(params), stage: currentStage(params), us: USE_SCOPES[params.get('us')] ? params.get('us') : 'all' };
  const save = () => history.replaceState(null, '', href('/national', { y: st.fy, s: st.stage === '決算' ? '決算' : '', us: st.us === 'all' ? '' : st.us }));
  const draw = () => {
    save();
    const when = `${fyFull(st.fy)}・${st.stage}`;
    const list = st.us === 'pref' ? db.prefs : st.us === 'muni' ? db.munis.filter(m => !m.isPref) : db.munis;
    const cellsOf = ms => ms.map(m => cell(m.code, st.fy, st.stage));
    const ft = fieldTotals(cellsOf(list));
    const inScope = new Set(list.map(m => m.code));
    const sQ = st.stage === '決算' ? '決算' : '';
    app.innerHTML = `${exploreTabs('national', st.fy, ICON)}
      <div class="page-head"><h1>全国の使い道</h1>
        <p class="lead">調べた自治体の多文化共生関連予算が、何に使われているか（10分類）。</p></div>
      <div class="ctl-row">
        <div class="ctl"><span class="label">年度</span>${yearPicker(st.fy, 'nu-fy')}</div>
        <div class="ctl"><span class="label">予算か決算か</span>${stageSeg(st.stage)}</div>
        <div class="ctl"><span class="label">集計の範囲</span><div class="seg seg-sm" role="group" aria-label="集計の範囲">${Object.entries(USE_SCOPES).map(([k, t]) => `<button type="button" data-us="${k}" aria-pressed="${st.us === k}">${esc(t)}</button>`).join('')}</div></div>
      </div>
      <div class="kpi-row">
        <div class="kpi-mini"><span class="k">確認できた関連予算${st.us === 'all' ? '（単純合計）' : ''}</span><b>${ft.total ? esc(yen(ft.total, { approx: true })) : '—'}</b><small>${esc(when)}</small></div>
        <div class="kpi-mini"><span class="k">金額を確かめた自治体</span><b>${num(ft.n)}</b><small>${esc(USE_SCOPES[st.us])}</small></div>
        <div class="kpi-mini"><span class="k">金額を確かめた事業</span><b>${num(ft.an)}</b><small>公式資料の該当ページで確認</small></div>
      </div>
      ${ft.total ? scopeNoteHTML() : ''}
      <section class="section" aria-labelledby="nu-h"><h2 id="nu-h" class="visually-hidden">使い道の円グラフ</h2><div id="nu-box"></div></section>
      <details class="more-box"><summary>集計の範囲と注意（どこまで調べた？）</summary><div id="nu-cov"></div></details>
      <p class="next-links"><a href="${href('/ranking', { y: st.fy })}">${ICON.bars}ランキングで比べる</a><a href="${href('/find', { y: st.fy })}">${ICON.map}地図で見る</a></p>`;
    bindYearPicker(app, y => { st.fy = y; draw(); });
    $$('[data-stage]', app).forEach(b => b.addEventListener('click', () => { st.stage = b.dataset.stage; draw(); }));
    $$('[data-us]', app).forEach(b => b.addEventListener('click', () => { st.us = b.dataset.us; draw(); }));
    renderUses($('#nu-box'), {
      cells: cellsOf(list),
      label: `多文化共生関連予算の使い道の円グラフ（${when}・${USE_SCOPES[st.us]}）`,
      centerK: st.us === 'all' ? '単純合計' : '合計',
      empty: st.stage === '決算' && st.fy > db.config.settlement_latest_fy ? `${fyFull(st.fy)}の決算は、まだ公表されていません（決算は、年度が終わった翌年の秋ごろに公表されます）。` : '',
      items: field => nationalItems({ fy: st.fy, stage: st.stage, field, byCode: db.byCode, codeOk: c => inScope.has(c), linkOf: (c, pj) => href('/m/' + c, { y: st.fy, s: sQ, pj }) }),
      foot: '',
    });
    $('#nu-cov').innerHTML = `<p class="cond"><b>対象年度：</b>${esc(when)}　<b>集計の範囲：</b>${esc(USE_SCOPES[st.us])}。資料で確認できた多文化共生関連予算（自治体のページ・地図・ランキングの合計と同じ数え方）。</p>
      ${st.us === 'all' ? overlapHTML(cellsOf(db.prefs), cellsOf(db.munis.filter(m => !m.isPref))) : ''}
      ${coverageHTML({ munis: list, fy: st.fy, stage: st.stage, ft, when, scopeName: st.us === 'pref' ? '都道府県' : st.us === 'muni' ? '市区町村' : '都道府県と市区町村' })}
      <p class="small"><a href="#/about?to=fields">10分類の説明（それぞれに入るもの）</a></p>`;
  };
  draw();
}
