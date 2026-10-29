// 地図（あらかじめ投影した SVG の形を使う。「数でみる在留外国人」と同じ形のデータ）
//
// 地図の形：国土地理院「地球地図日本」（第2.1版 行政界、2015年1月1日時点）を加工して作成。
// タップ（クリック）で選べる。ホバーしないと読めない情報は置かない（選ぶと下に詳しく出る）。

import { esc } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

// opts:
//   shape     … {w, h, prefs|areas, inset?}
//   style(key) → {fill, pattern:'partial'|'dots'|null}
//   name(key), tip(key) → 文字（ツールチップ。選ぶと同じ内容が画面に出る）
//   onSelect(key)、selected
export function drawMap(holder, opts) {
  const { shape } = opts;
  const parts = shape.prefs || shape.areas;
  holder.innerHTML = '';
  holder.classList.add('map-box');
  const svg = el('svg', { viewBox: `0 0 ${shape.w} ${shape.h}`, role: 'group', 'aria-label': opts.label || '地図' });
  svg.innerHTML = `<defs>
    <pattern id="pat-partial" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><rect width="7" height="7" fill="transparent"/><line x1="0" y1="0" x2="0" y2="7" stroke="#ffffff" stroke-width="2.6" stroke-opacity=".85"/></pattern>
    <pattern id="pat-dots" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="#eceae4"/><circle cx="3" cy="3" r="1.2" fill="#8d8a80"/></pattern>
  </defs>`;
  const g = el('g');
  const tip = document.createElement('div');
  tip.className = 'map-tip';
  tip.setAttribute('aria-hidden', 'true');
  const paths = {};
  const showTip = (ev, key) => {
    const r = holder.getBoundingClientRect();
    tip.innerHTML = opts.tip(key);
    tip.style.display = 'block';
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    tip.style.left = Math.min(x + 14, r.width - tip.offsetWidth - 6) + 'px';
    tip.style.top = Math.max(y - tip.offsetHeight - 12, 4) + 'px';
  };
  const hideTip = () => { tip.style.display = 'none'; };
  const select = key => {
    for (const p of Object.values(paths)) p.classList.remove('selected');
    if (paths[key]) { paths[key].classList.add('selected'); paths[key].parentNode.appendChild(paths[key]); }
    opts.onSelect?.(key);
  };

  if (shape.inset) {
    const [x0, y0, x1, y1] = shape.inset;
    const r = el('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 6, class: 'inset' });
    const ik = shape.inset_key;
    r.addEventListener('click', () => select(ik));
    r.addEventListener('mousemove', ev => showTip(ev, ik));
    r.addEventListener('mouseleave', hideTip);
    g.appendChild(r);
  }
  for (const [key, d] of Object.entries(parts)) {
    if (key.startsWith('none:')) {
      g.appendChild(el('path', { d, class: 'area none' }));
      continue;
    }
    const st = opts.style(key);
    const p = el('path', { d, class: 'area', fill: st.fill, tabindex: '0', role: 'button', 'aria-label': opts.aria ? opts.aria(key) : opts.name(key) });
    p.addEventListener('click', () => select(key));
    p.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(key); } });
    p.addEventListener('mousemove', ev => showTip(ev, key));
    p.addEventListener('mouseleave', hideTip);
    g.appendChild(p);
    paths[key] = p;
    if (st.pattern) g.appendChild(el('path', { d, class: 'area-pat', fill: `url(#pat-${st.pattern})` }));
  }
  svg.appendChild(g);
  holder.appendChild(svg);
  holder.appendChild(tip);
  if (opts.selected && paths[opts.selected]) { paths[opts.selected].classList.add('selected'); paths[opts.selected].parentNode.appendChild(paths[opts.selected]); }

  // 拡大・縮小（小さな市区町村を押しやすくする）
  let vb = [0, 0, shape.w, shape.h];
  const setVB = () => { svg.setAttribute('viewBox', vb.join(' ')); holder.classList.toggle('zoomed', vb[2] < shape.w - 1); };
  const zoom = (f, cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2) => {
    const w = Math.min(shape.w, Math.max(shape.w / 8, vb[2] * f)), h = w * shape.h / shape.w;
    vb = [Math.min(Math.max(cx - w / 2, 0), shape.w - w), Math.min(Math.max(cy - h / 2, 0), shape.h - h), w, h];
    setVB();
  };
  const zb = document.createElement('div');
  zb.className = 'map-zoom';
  zb.innerHTML = `<button type="button" data-z="in" aria-label="地図を拡大">＋</button><button type="button" data-z="out" aria-label="地図を縮小">－</button><button type="button" data-z="reset" class="reset" aria-label="地図を元の大きさに戻す">全体</button>`;
  zb.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.z === 'in') zoom(0.6); else if (b.dataset.z === 'out') zoom(1 / 0.6); else { vb = [0, 0, shape.w, shape.h]; setVB(); }
  });
  holder.appendChild(zb);
  // 拡大中はドラッグで動かす
  let drag = null;
  svg.addEventListener('pointerdown', ev => {
    if (vb[2] >= shape.w - 1) return;
    drag = { x: ev.clientX, y: ev.clientY, vb: [...vb], moved: false };
  });
  svg.addEventListener('pointermove', ev => {
    if (!drag) return;
    const r = svg.getBoundingClientRect();
    const dx = (ev.clientX - drag.x) * vb[2] / r.width, dy = (ev.clientY - drag.y) * vb[3] / r.height;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    vb = [Math.min(Math.max(drag.vb[0] - dx, 0), shape.w - vb[2]), Math.min(Math.max(drag.vb[1] - dy, 0), shape.h - vb[3]), vb[2], vb[3]];
    setVB();
  });
  const end = () => { setTimeout(() => { drag = null; }, 0); };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointerleave', end);
  svg.addEventListener('click', ev => { if (drag?.moved) { ev.stopPropagation(); ev.preventDefault(); } }, true);
  return { select };
}

// 凡例
export function legendHTML(title, items, note) {
  return `<div class="legend" role="list" aria-label="地図の色の説明">
    <div class="legend-title">${esc(title)}</div>
    ${items.map(i => `<span class="legend-item" role="listitem"><span class="sw${i.cls ? ' ' + i.cls : ''}" style="${i.fill ? 'background:' + i.fill : ''}"></span>${esc(i.label)}</span>`).join('')}
    ${note ? `<div class="legend-note">${note}</div>` : ''}
  </div>`;
}
