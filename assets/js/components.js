// 画面の部品（調査状況の札・自治体を探す入力欄・出典リンクなど）

import { db, status, cell, ratio } from './store.js';
import { esc, normQ, yen, fmtDate, ratioPct } from './util.js';
import { href } from './app.js';
import { SURVEY_INFO, SURVEY_LABEL, RELATION_INFO, FIELD_INFO } from './schema.js';

const ST_CLASS = {
  '確認済み': 'st-ok', '一部確認': 'st-part', '未調査': 'st-none', '資料未発見': 'st-nf',
  '金額非公表': 'st-nf', '該当事業なし': 'st-zero', '決算未公表': 'st-wait',
};
export const stLabel = st => SURVEY_LABEL[st] || st;
export function statusBadge(st, { big = false } = {}) {
  return `<span class="st ${ST_CLASS[st] || 'st-none'}${big ? ' st-big' : ''}" title="${esc(SURVEY_INFO[st] || '')}">${esc(stLabel(st))}</span>`;
}
const REL_CLASS = { '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5', '保留': 'h' };
export const relBadge = r => `<span class="badge rel rel-${REL_CLASS[r] || 'h'}">${esc(RELATION_INFO[r]?.no === '保' ? '' : RELATION_INFO[r]?.no || '')}${esc(RELATION_INFO[r]?.short || r)}</span>`;
export const relName = r => `${RELATION_INFO[r]?.no === '保' ? '' : RELATION_INFO[r]?.no || ''}${RELATION_INFO[r]?.label || r}`;
export const fieldLabel = f => FIELD_INFO[f]?.label || f;
export const fieldBadge = f => `<span class="badge fld">${esc(fieldLabel(f))}</span>`;

// 金額の表示（未調査などは金額の代わりに状況を出す）
export function amountOrStatus(code, fy, stage) {
  const st = status(code, fy, stage);
  const c = cell(code, fy, stage);
  if (st === '該当事業なし') return { text: '0円', st, sub: '関係する事業がないことを確認' };
  if ((st === '確認済み' || st === '一部確認') && c && c.a !== null) return { text: yen(c.a), st, value: c.a, sub: st === '一部確認' ? '一部の資料で確認できた事業だけの合計' : '' };
  if ((st === '確認済み' || st === '一部確認') && c && c.a === null) return { text: '—', st, sub: c.apend ? '金額を確認中' : '基本集計に入る金額なし' };
  return { text: stLabel(st), st, sub: '' };
}

export const muniLink = (m, fy) => `<a href="${href('/m/' + m.code, { y: fy })}">${esc(m.full)}</a>`;

// 出典の番号（221309-S07 → 資料7）。事業の説明の中の「資料7」と同じ番号
export const srcNo = s => `資料${parseInt(String(s.source_id).split('-S')[1], 10)}`;

export function sourceLink(s, page) {
  if (!s) return '';
  const url = s.archived_url || s.url;
  return `<span class="src-no">${srcNo(s)}</span> <a href="${esc(url)}" target="_blank" rel="noopener">${esc(s.title)}</a>${page ? `（${esc(page)}）` : ''}${s.archived_url ? '<small>（元の資料が削除されたため保存版）</small>' : ''}`;
}

export function sourceMeta(s) {
  const bits = [s.publisher, s.published_date ? `公表 ${fmtDate(s.published_date)}` : '', s.accessed_date ? `最終確認 ${fmtDate(s.accessed_date)}` : '', s.unit_note].filter(Boolean);
  return bits.map(esc).join('／');
}

// 自治体名・読みがな・自治体コードで探す
export function searchMunis(q, { limit = 12, prefOnly = null } = {}) {
  const n = normQ(q);
  if (!n) return [];
  const out = [];
  for (const m of db.munis) {
    if (prefOnly && m.pc !== prefOnly) continue;
    const name = normQ(m.name), full = normQ(m.full);
    let score = 0;
    if (/^\d+$/.test(n)) {
      if (m.code.startsWith(n) || m.code.slice(0, 5) === n) score = 100;
    } else if (name === n || full === n) score = 100;
    else if (name.startsWith(n)) score = 80;
    else if (m.kana.startsWith(n)) score = 70;
    else if (full.includes(n)) score = 50;
    else if (m.kana.includes(n)) score = 30;
    if (score) out.push([score + (m.isPref ? 5 : 0) + (m.kind === '政令指定都市' ? 3 : 0), m]);
  }
  out.sort((a, b) => b[0] - a[0] || a[1].code.localeCompare(b[1].code));
  return out.slice(0, limit).map(x => x[1]);
}

// 入力するたびに候補を出す欄。onPick(m) で選んだ自治体を受け取る
export function muniPicker(root, { id, label, placeholder = '例：浜松市／しんじゅく／221309', fy, onPick, big = false, extra }) {
  root.innerHTML = `<div class="picker${big ? ' picker-big' : ''}">
    <label for="${id}" class="picker-label">${esc(label)}</label>
    <div class="picker-box">
      <input id="${id}" type="search" autocomplete="off" placeholder="${esc(placeholder)}" role="combobox" aria-expanded="false" aria-controls="${id}-list" aria-autocomplete="list">
      <ul id="${id}-list" class="picker-list" role="listbox" hidden></ul>
    </div>
  </div>`;
  const input = root.querySelector('input');
  const list = root.querySelector('ul');
  let items = [], act = -1;
  const draw = () => {
    const q = input.value;
    items = searchMunis(q);
    const ex = extra ? extra(q) : [];
    if (!items.length && !ex.length) {
      list.innerHTML = q.trim() ? `<li class="picker-empty">見つかりません。漢字・ひらがな・自治体コードで入れてください</li>` : '';
      list.hidden = !q.trim(); input.setAttribute('aria-expanded', String(!list.hidden));
      return;
    }
    list.innerHTML = items.map((m, i) => {
      const st = status(m.code, fy, '当初予算');
      return `<li role="option" id="${id}-o${i}" data-i="${i}" aria-selected="${i === act}"><span class="po-name">${esc(m.isPref ? m.name : m.name)}</span><span class="po-sub">${esc(m.isPref ? '都道府県' : m.pref + '・' + m.kind)}</span>${statusBadge(st)}</li>`;
    }).join('') + ex.map(e => `<li role="option" class="po-extra" data-href="${esc(e.href)}"><span class="po-name">${esc(e.label)}</span><span class="po-sub">${esc(e.sub)}</span></li>`).join('');
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
  };
  const pick = i => {
    const m = items[i];
    if (!m) return;
    list.hidden = true; input.setAttribute('aria-expanded', 'false');
    onPick(m, input);
  };
  input.addEventListener('input', () => { act = -1; draw(); });
  input.addEventListener('focus', () => { if (input.value) draw(); });
  input.addEventListener('keydown', ev => {
    const n = list.querySelectorAll('li[role=option]').length;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); act = Math.min(n - 1, act + 1); draw(); input.setAttribute('aria-activedescendant', `${id}-o${act}`); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); act = Math.max(0, act - 1); draw(); input.setAttribute('aria-activedescendant', `${id}-o${act}`); }
    else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (act < 0 && items.length) act = 0;
      const li = list.querySelectorAll('li[role=option]')[act];
      if (li?.dataset.href) location.hash = li.dataset.href.slice(1); else pick(act);
    } else if (ev.key === 'Escape') { list.hidden = true; }
  });
  list.addEventListener('click', ev => {
    const li = ev.target.closest('li[role=option]');
    if (!li) return;
    if (li.dataset.href) { location.hash = li.dataset.href.slice(1); return; }
    pick(Number(li.dataset.i));
  });
  document.addEventListener('click', ev => { if (!root.contains(ev.target)) list.hidden = true; });
  return input;
}

// 都道府県のボタン（地方ごと。スマホで地図が押しにくいときのため）
export const REGIONS = [
  ['北海道・東北', ['01', '02', '03', '04', '05', '06', '07']],
  ['関東', ['08', '09', '10', '11', '12', '13', '14']],
  ['中部', ['15', '16', '17', '18', '19', '20', '21', '22', '23']],
  ['近畿', ['24', '25', '26', '27', '28', '29', '30']],
  ['中国・四国', ['31', '32', '33', '34', '35', '36', '37', '38', '39']],
  ['九州・沖縄', ['40', '41', '42', '43', '44', '45', '46', '47']],
];
export function prefButtons(fy, current) {
  return `<div class="pref-btns">${REGIONS.map(([r, pcs]) => `<div class="pb-row"><span class="pb-region">${esc(r)}</span><div class="pb-list">${pcs.map(pc => {
    const p = db.prefs.find(x => x.pc === pc);
    const short = p.name.replace(/(都|府|県)$/, '');
    return `<button type="button" class="pb" data-pc="${pc}" aria-pressed="${pc === current}">${esc(p.name === '北海道' ? '北海道' : short)}</button>`;
  }).join('')}</div></div>`).join('')}</div>`;
}

export function statusLegendNote() {
  return '灰色は「未調査」で、0円ではありません。0円は、調べた結果、関連する事業がないことを確認できた自治体だけです。';
}

// 一般会計に占める割合の表示（出せないときは理由を書く。0%とは書かない）
//   text：大きく出す文字、sub：小さく添える説明、v：割合（出せないとき null）
export function ratioView(code, fy, stage) {
  const r = ratio(code, fy, stage);
  if (r.v !== null) return { ...r, text: ratioPct(r.v), sub: r.partial ? '確認済み分の割合（一部の資料だけ調査）' : '' };
  const sub = { '一般会計の総額が未確認': `${fy}年度の一般会計の${stage === '決算' ? '決算額' : '予算総額'}は未確認`, '算出不可': '一般会計の分を分けられないため算出不可', '確認中': '予算額を確認中', '予算額が分からない': '予算額が分からないため出していません', '未調査': '未調査' }[r.why] || '';
  return { ...r, text: r.why === '算出不可' ? '算出不可' : r.why === '一般会計の総額が未確認' ? '未確認' : '—', sub };
}

// 「全国を見る」の4つの見方（使い道・ランキング・比較・年度別）。どのページの上にも同じ並びで出す
export const EXPLORE = [
  ['national', '/national', '使い道', 'donut'],
  ['ranking', '/ranking', 'ランキング', 'bars'],
  ['compare', '/compare', '自治体を比較', 'compare'],
  ['trend', '/trend', '年度別の変化', 'trend'],
];
export function exploreTabs(active, fy, icons) {
  return `<nav class="ex-tabs" aria-label="全国を見る">${EXPLORE.map(([k, path, label, ic]) => `<a class="ex-tab" href="${href(path, { y: fy })}"${k === active ? ' aria-current="page"' : ''}>${icons?.[ic] || ''}<span>${esc(label)}</span></a>`).join('')}</nav>`;
}
