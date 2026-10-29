// 画面の切り替え（URL の # 以降でページを決める。年度・自治体などは ?y=2026 のように URL に残す）
// 主なメニューは4つ：自治体を探す（トップ）・全国を見る（使い道・ランキング・比較・年度別）・3分でわかる・メニュー（ほかのページ）

import { loadCore, db } from './store.js';
import { $, $$, esc, toast } from './util.js';
import { homePage } from './page-home.js';
import { muniPage } from './page-muni.js';
import { searchPage } from './page-search.js';
import { nationalPage } from './page-national.js';
import { rankingPage } from './page-ranking.js';
import { comparePage } from './page-compare.js';
import { trendPage } from './page-trend.js';
import { guidePage } from './page-guide.js';
import { statusPage, changesPage } from './page-status.js';
import { aboutPage } from './page-about.js';
import { dataPage } from './page-data.js';

// [道, 作る関数, 題名, メニューのどれを光らせるか]
const ROUTES = [
  [/^\/$/, ctx => homePage(ctx), null, 'home'],
  [/^\/m\/(\d{6})$/, (ctx, m) => muniPage(ctx, m[1]), null, 'home'],
  [/^\/national$/, ctx => nationalPage(ctx), '全国の使い道', 'explore'],
  [/^\/ranking$/, ctx => rankingPage(ctx), 'ランキング', 'explore'],
  [/^\/compare$/, ctx => comparePage(ctx), '自治体を比較', 'explore'],
  [/^\/trend$/, ctx => trendPage(ctx), '年度別の変化', 'explore'],
  [/^\/guide$/, ctx => guidePage(ctx), '3分でわかる 多文化共生予算', 'guide'],
  [/^\/search$/, ctx => searchPage(ctx), '事業の詳細検索', 'menu'],
  [/^\/status$/, ctx => statusPage(ctx), '調査状況', 'menu'],
  [/^\/changes$/, ctx => changesPage(ctx), '更新履歴・訂正', 'menu'],
  [/^\/about$/, ctx => aboutPage(ctx), '調査方法・集計基準', 'menu'],
  [/^\/data$/, ctx => dataPage(ctx), 'データのダウンロード', 'menu'],
];

const SITE = '全国 多文化共生予算マップ';

export function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const i = h.indexOf('?');
  const path = (i >= 0 ? h.slice(0, i) : h) || '/';
  return { path: path.startsWith('/') ? path : '/' + path, params: new URLSearchParams(i >= 0 ? h.slice(i + 1) : '') };
}

// URL を作る（空の値は書かない）
export function href(path, params = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '' && v !== false) p.set(k, v);
  const qs = p.toString();
  return '#' + path + (qs ? '?' + qs : '');
}

export function go(path, params = {}, { replace = false } = {}) {
  const h = href(path, params);
  if (location.hash === h) { render(); return; }
  if (replace) { history.replaceState(null, '', h); render(); } else location.hash = h;
}

// 選んでいる年度（URL の y、なければ前に選んだ年度、なければ最新）。ページを移っても引き継ぐ
export function currentYear(params) {
  const y = Number(params?.get('y'));
  if (db.years.includes(y)) { try { sessionStorage.setItem('fy', y); } catch { /* 保存できなくてもよい */ } return y; }
  try { const s = Number(sessionStorage.getItem('fy')); if (db.years.includes(s)) return s; } catch { /* なし */ }
  return db.config.default_year;
}
export function currentStage(params) {
  const s = params?.get('s');
  return s === '決算' ? '決算' : '当初予算';
}

// 年度を選ぶ部品（前・次ボタンつき）
export function yearPicker(fy, id = 'fy') {
  const ys = db.years;
  return `<div class="year-pick" role="group" aria-label="年度を選ぶ">
    <button type="button" class="yp-step" data-step="-1" aria-label="前の年度" ${fy === ys[0] ? 'disabled' : ''}>◀</button>
    <label class="visually-hidden" for="${id}">年度</label>
    <select id="${id}" class="yp-sel">${[...ys].reverse().map(y => `<option value="${y}"${y === fy ? ' selected' : ''}>${y}年度（${y >= 2019 ? '令和' + (y - 2018 === 1 ? '元' : y - 2018) : '平成' + (y - 1988)}年度）</option>`).join('')}</select>
    <button type="button" class="yp-step" data-step="1" aria-label="次の年度" ${fy === ys[ys.length - 1] ? 'disabled' : ''}>▶</button>
  </div>`;
}
export function bindYearPicker(root, onChange) {
  const sel = root.querySelector('.yp-sel');
  if (!sel) return;
  sel.addEventListener('change', () => onChange(Number(sel.value)));
  root.querySelectorAll('.yp-step').forEach(b => b.addEventListener('click', () => {
    const ys = db.years, i = ys.indexOf(Number(sel.value)) + Number(b.dataset.step);
    if (i >= 0 && i < ys.length) onChange(ys[i]);
  }));
}
// 予算か決算か（2つのボタン）
export function stageSeg(stage, attr = 'data-stage') {
  return `<div class="seg seg-sm" role="group" aria-label="予算か決算か">${['当初予算', '決算'].map(s => `<button type="button" ${attr}="${s}" aria-pressed="${stage === s}">${s}</button>`).join('')}</div>`;
}

// 以前のURL（トップページの中の見出しへの移動）を、今のページに読みかえる
const LEGACY = { sanpun: '/guide', what: '/guide', uses: '/national', ranking: '/ranking' };

let lastPath = null;
function render() {
  const app = $('#app');
  let { path, params } = parseHash();
  const to = params.get('to');
  if (path === '/' && to && (LEGACY[to] || /^s3-\d$/.test(to))) {
    const p = new URLSearchParams(params); p.delete('to');
    history.replaceState(null, '', href(LEGACY[to] || '/guide', Object.fromEntries(p)));
    ({ path, params } = parseHash());
  }
  const samePath = path === lastPath;
  lastPath = path;
  for (const [re, fn, title, nav] of ROUTES) {
    const m = path.match(re);
    if (!m) continue;
    $$('.main-nav [data-nav]').forEach(a => a.removeAttribute('aria-current'));
    const cur = $(`.main-nav a[data-nav="${nav}"]`);
    if (cur) cur.setAttribute('aria-current', 'page');
    document.title = title ? `${title}｜${SITE}` : `${SITE}｜自治体は、外国人に関係する事業にいくら使っている？`;
    try {
      const ret = fn({ app, path, params, samePath }, m);
      Promise.resolve(ret).then(() => afterRender(params, samePath)).catch(showError);
    } catch (e) { showError(e); }
    closeMenu();
    return;
  }
  app.innerHTML = `<div class="page-head"><h1>ページが見つかりません</h1><p><a href="#/">トップページへ戻る</a></p></div>`;
}

function afterRender(params, samePath) {
  const to = params.get('to');
  if (to) {
    const t = document.getElementById(to);
    if (t) {
      if (t.tagName === 'DETAILS') t.open = true;
      t.scrollIntoView({ block: 'start' }); t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true });
      if (to === 'find') $('#find-q')?.focus({ preventScroll: true });
      return;
    }
  }
  if (!samePath) { window.scrollTo(0, 0); $('#app').focus({ preventScroll: true }); }
}

function showError(e) {
  console.error(e);
  $('#app').innerHTML = `<div class="error"><p><b>表示できませんでした。</b>${esc(e.message || e)}</p><p><a href="#/">トップページへ戻る</a></p></div>`;
}

function closeMenu() {
  const b = $('#menu-btn');
  b.setAttribute('aria-expanded', 'false');
  $('#site-menu').hidden = true;
  document.body.classList.remove('menu-open');
}

function setupChrome() {
  const b = $('#menu-btn');
  b.addEventListener('click', () => {
    const open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(open));
    $('#site-menu').hidden = !open;
    document.body.classList.toggle('menu-open', open);
    // メニューの「全国を見る」などは、選んでいる年度のまま開く
    if (open) {
      const y = currentYear(parseHash().params);
      $$('#site-menu a[data-keep-year]').forEach(a => { a.href = a.getAttribute('href').split('?')[0] + `?y=${y}`; });
    }
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('#site-menu').hidden) { closeMenu(); b.focus(); } });
  document.addEventListener('click', ev => { if (!$('#site-menu').hidden && !ev.target.closest('#site-menu, #menu-btn')) closeMenu(); });
  // トップページの中の見出しへ移動（同じ URL をもう一度押しても移動する）
  document.addEventListener('click', ev => {
    const a = ev.target.closest('a[href^="#/?to="]');
    if (!a || parseHash().path !== '/') return;
    const id = new URLSearchParams(a.getAttribute('href').split('?')[1]).get('to');
    const t = document.getElementById(id);
    if (!t) return;
    ev.preventDefault();
    history.replaceState(null, '', `#/?to=${id}`);
    t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (id === 'find') $('#find-q')?.focus({ preventScroll: true });
    closeMenu();
  });
  const top = $('#to-top');
  const onScroll = () => top.classList.toggle('show', window.scrollY > 600);
  window.addEventListener('scroll', onScroll, { passive: true });
  top.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); $('#app').focus({ preventScroll: true }); });
  onScroll();
}

async function start() {
  setupChrome();
  try {
    await loadCore();
  } catch (e) {
    showError(e);
    return;
  }
  const g = db.meta?.generated;
  $('#footer-updated').textContent = g ? `データの更新：${g.replace(/^(\d{4})-(\d{2})-(\d{2}).*/, (m, y, mo, d) => `${y}年${Number(mo)}月${Number(d)}日`)}` : '';
  window.addEventListener('hashchange', render);
  render();
}

window.__toast = toast;
start();
