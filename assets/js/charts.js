// グラフ（SVG と HTML で自作。ライブラリは使わない）
// ・タップ／クリックでも、マウスを重ねても、正確な金額が出る（ホバー専用にしない）
// ・どのグラフも、下に同じ数字の表を出す（呼び出す側で表を作る）
// ・目盛りの文字は画面の実際の大きさで描く（スマホで小さくならないよう、幅を測って描き直す）

import { esc, yen, yenExact, num, ratioPct } from './util.js';

export const COLORS = {
  '当初予算': '#1d7347', '補正後予算': '#5b8fd1', '決算': '#e07b39',
  foreign: '#3d6f9e', bar: '#1d7347',
  fund: { national: '#2a78d6', pref: '#eb6834', national_pref: '#6250d6', general: '#3fa36b', bondOther: '#eda100', unknown: '#c9c8c2' },
  // 使い道（10分類）。全国・都道府県・市区町村のどのページでも、同じ使い道は同じ色にする。
  // 分類の決まった順（schema.js の FIELDS）に、隣どうしが色覚の多様性があっても見分けやすいことを確かめた9色を当てる
  // （ピンク・赤は使わない）。「その他」は灰色。色だけに頼らず、どのグラフにも名前と金額の一覧をつける
  field: {
    '日本語教育': '#2a78d6', '外国人相談': '#eb6834', '教育支援': '#1baf7a', '医療・保健': '#eda100', '生活支援': '#6250d6',
    '多言語対応': '#008300', '地域交流': '#184f95', '外国人材支援': '#a8590f', '団体補助金': '#0e8fa6', 'その他': '#9a9890',
  },
};

const NS = 'http://www.w3.org/2000/svg';

function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
const axisYen = v => {
  if (v === 0) return '0';
  if (v >= 1e8) return `${+(v / 1e8).toFixed(2)}億`;
  if (v >= 1e4) return `${num(+(v / 1e4).toFixed(1))}万`;
  return num(v);
};

// 共通のツールチップ（タップで固定、もう一度タップ・外をタップで閉じる）
function attachTip(wrap) {
  let tip = wrap.querySelector('.chart-tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; tip.setAttribute('role', 'status'); wrap.appendChild(tip); }
  let pinned = null;
  const place = (x, y) => {
    const r = wrap.getBoundingClientRect();
    tip.style.display = 'block';
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(4, Math.min(x - r.left - w / 2, r.width - w - 4)) + 'px';
    tip.style.top = Math.max(4, y - r.top - h - 12) + 'px';
  };
  const show = (target, ev) => {
    tip.innerHTML = target.dataset.tip;
    const b = target.getBoundingClientRect();
    if (ev && ev.clientX) place(ev.clientX, Math.min(ev.clientY, b.top + 8));
    else place(b.left + b.width / 2, b.top);
  };
  wrap.addEventListener('mousemove', ev => {
    if (pinned) return;
    const t = ev.target.closest('[data-tip]');
    if (t) show(t, ev); else tip.style.display = 'none';
  });
  wrap.addEventListener('mouseleave', () => { if (!pinned) tip.style.display = 'none'; });
  wrap.addEventListener('click', ev => {
    const t = ev.target.closest('[data-tip]');
    if (!t || pinned === t) { pinned = null; tip.style.display = 'none'; wrap.querySelectorAll('.is-on').forEach(e => e.classList.remove('is-on')); return; }
    wrap.querySelectorAll('.is-on').forEach(e => e.classList.remove('is-on'));
    pinned = t; t.classList.add('is-on'); show(t, ev);
  });
  wrap.addEventListener('focusin', ev => { const t = ev.target.closest('[data-tip]'); if (t) show(t); });
  wrap.addEventListener('focusout', () => { if (!pinned) tip.style.display = 'none'; });
}

// 幅に合わせて描き直す
function responsive(wrap, draw) {
  let last = 0;
  const run = () => {
    const w = Math.round(wrap.clientWidth);
    if (!w || w === last) return;
    last = w;
    draw(w);
  };
  run();
  if ('ResizeObserver' in window) new ResizeObserver(() => requestAnimationFrame(run)).observe(wrap);
}

// 縦の棒グラフ（年度ごと、系列を並べる）
// series: [{label, color, values:[…], missing:[…文字]}]（values は円または人）
export function columnChart(wrap, { cats, catLabel, series, unit = 'yen', highlight, height = 260, missingLabel = '未調査' }) {
  wrap.classList.add('chart');
  const holder = document.createElement('div');
  wrap.appendChild(holder);
  attachTip(wrap);
  responsive(holder, W => {
    const small = W < 520;
    const fs = small ? 13 : 14;
    const pad = { l: small ? 46 : 58, r: 8, t: 14, b: small ? 34 : 30 };
    const H = height;
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const all = series.flatMap(s => s.values.filter(v => v !== null && v !== undefined));
    const max = niceMax(Math.max(0, ...all));
    const gw = iw / cats.length;
    const n = series.length;
    const bw = Math.max(4, Math.min(28, (gw - 6) / n - 2));
    const y = v => pad.t + ih - (v / max) * ih;
    const fmt = unit === 'yen' ? (v => `${yen(v)}（${yenExact(v)}）`) : unit === 'ratio' ? ratioPct : (v => `${num(v)}人`);
    const tick = v => unit === 'yen' ? axisYen(v) : unit === 'ratio' ? (v ? `${+(v * 100).toFixed(3)}%` : '0') : num(Math.round(v));
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(wrap.dataset.title || 'グラフ')}">`;
    for (let i = 0; i <= 4; i++) {
      const v = max * i / 4, yy = y(v);
      s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}" class="grid${i === 0 ? ' base' : ''}"/>`;
      s += `<text x="${pad.l - 6}" y="${yy + 4}" text-anchor="end" class="tick" font-size="${fs - 1}">${tick(v)}</text>`;
    }
    cats.forEach((c, i) => {
      const gx = pad.l + i * gw;
      const x0 = gx + (gw - (bw + 2) * n + 2) / 2;
      if (highlight !== undefined && c === highlight) s += `<rect x="${gx + 1}" y="${pad.t}" width="${gw - 2}" height="${ih}" class="hl-band"/>`;
      series.forEach((se, j) => {
        const v = se.values[i];
        const x = x0 + j * (bw + 2);
        const lab = `${esc(catLabel ? catLabel(c) : c)} ${esc(se.label)}`;
        if (v === null || v === undefined) {
          const m = se.missing?.[i] || missingLabel;
          s += `<g data-tip="${lab}：${esc(m)}" tabindex="0" aria-label="${lab}：${esc(m)}"><rect x="${x}" y="${pad.t}" width="${bw}" height="${ih}" fill="transparent"/><line x1="${x + bw / 2}" x2="${x + bw / 2}" y1="${y(0) - 7}" y2="${y(0) - 1}" class="miss"/></g>`;
          return;
        }
        const yy = y(v), h = Math.max(v > 0 ? 2 : 0, y(0) - yy);
        const r = Math.min(4, bw / 2, h);
        const path = h > 0 ? `M${x},${y(0)}V${y(0) - h + r}Q${x},${y(0) - h} ${x + r},${y(0) - h}H${x + bw - r}Q${x + bw},${y(0) - h} ${x + bw},${y(0) - h + r}V${y(0)}Z` : '';
        s += `<g data-tip="${lab}：${esc(fmt(v))}" tabindex="0" aria-label="${lab}：${esc(fmt(v))}"><rect x="${x - 1}" y="${pad.t}" width="${bw + 2}" height="${ih}" fill="transparent"/>${path ? `<path d="${path}" fill="${se.color}" class="bar"/>` : `<line x1="${x}" x2="${x + bw}" y1="${y(0) - 1}" y2="${y(0) - 1}" stroke="${se.color}" stroke-width="3"/>`}</g>`;
      });
      const lab = catLabel ? catLabel(c, small) : c;
      s += `<text x="${gx + gw / 2}" y="${H - pad.b + fs + 6}" text-anchor="middle" class="tick${c === highlight ? ' strong' : ''}" font-size="${fs - (small ? 1 : 0)}">${esc(lab)}</text>`;
    });
    s += '</svg>';
    holder.innerHTML = s;
  });
  if (series.length > 1) {
    const lg = document.createElement('div');
    lg.className = 'chart-legend';
    lg.innerHTML = series.map(se => `<span><i style="background:${se.color}"></i>${esc(se.label)}</span>`).join('') + `<span><i class="miss-key"></i>短い縦線：${esc(missingLabel)}など（0円ではありません）</span>`;
    wrap.insertBefore(lg, holder);
  }
}

// 折れ線（外国人住民数など。円とは別のグラフにする）
export function lineChart(wrap, { cats, catLabel, values, label, unit = '人', color = COLORS.foreign, height = 220, highlight }) {
  wrap.classList.add('chart');
  const holder = document.createElement('div');
  wrap.appendChild(holder);
  attachTip(wrap);
  responsive(holder, W => {
    const small = W < 520;
    const fs = small ? 13 : 14;
    const pad = { l: small ? 52 : 62, r: 12, t: 14, b: small ? 34 : 30 };
    const H = height, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const vs = values.filter(v => v !== null && v !== undefined);
    const lo = 0, max = niceMax(Math.max(1, ...vs));
    const gw = iw / cats.length;
    const x = i => pad.l + gw * i + gw / 2;
    const y = v => pad.t + ih - ((v - lo) / (max - lo)) * ih;
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">`;
    for (let i = 0; i <= 4; i++) {
      const v = lo + (max - lo) * i / 4, yy = y(v);
      s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}" class="grid${i === 0 ? ' base' : ''}"/><text x="${pad.l - 6}" y="${yy + 4}" text-anchor="end" class="tick" font-size="${fs - 1}">${num(Math.round(v))}</text>`;
    }
    let d = '', pen = false;
    values.forEach((v, i) => {
      if (v === null || v === undefined) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i)},${y(v)}`; pen = true;
    });
    s += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>`;
    values.forEach((v, i) => {
      const lab = `${esc(catLabel ? catLabel(cats[i]) : cats[i])} ${esc(label)}`;
      if (v === null || v === undefined) return;
      s += `<g data-tip="${lab}：${num(v)}${unit}" tabindex="0" aria-label="${lab}：${num(v)}${unit}"><rect x="${x(i) - gw / 2}" y="${pad.t}" width="${gw}" height="${ih}" fill="transparent"/><circle cx="${x(i)}" cy="${y(v)}" r="${cats[i] === highlight ? 6 : 4.5}" fill="${color}" stroke="#fff" stroke-width="2"/></g>`;
    });
    cats.forEach((c, i) => {
      s += `<text x="${x(i)}" y="${H - pad.b + fs + 6}" text-anchor="middle" class="tick${c === highlight ? ' strong' : ''}" font-size="${fs - (small ? 1 : 0)}">${esc(catLabel ? catLabel(c, small) : c)}</text>`;
    });
    holder.innerHTML = s + '</svg>';
  });
}

// 横棒（分野別など。1つの系列なので凡例なし。金額は棒の横に書く）
export function hbarChart(wrap, { rows, color = COLORS.bar, fmt = v => yen(v), total }) {
  wrap.classList.add('chart', 'hbars');
  const max = Math.max(1e-12, ...rows.map(r => r.value || 0));
  wrap.innerHTML = rows.map(r => {
    const w = r.value ? Math.max(0.008, r.value / max) : 0;
    const share = total ? `（${(r.value / total * 100).toFixed(1)}%）` : '';
    const tip = `${esc(r.label)}：${esc(fmt(r.value))}${r.value >= 1e4 ? `（${yenExact(r.value)}）` : ''}${share}`;
    return `<div class="hbar" data-tip="${tip}" tabindex="0" aria-label="${tip}">
      <div class="hbar-label">${esc(r.label)}${r.sub || share ? `<small>${esc(r.sub || '')}${share ? `全体の${share.replace(/[（）]/g, '')}` : ''}</small>` : ''}</div>
      <div class="hbar-track"><span class="hbar-fill" style="width:calc((100% - 9em) * ${w.toFixed(4)});background:${r.color || color}"></span><span class="hbar-val">${esc(fmt(r.value))}</span></div>
    </div>`;
  }).join('');
  attachTip(wrap);
}

// ドーナツ形の円グラフ（使い道の内訳など）。扇形には文字を書かず、名前・金額・割合は横の一覧に書く（一覧は呼び出す側で作る）。
// rows: [{key, label, value, color, text}]（一覧と同じ大きい順。0円は扇形にしない）。12時の位置から時計回りに並べる。
// center: 真ん中に書く {k, v, sub}。扇形にマウスを重ねる・フォーカスすると金額が出て、押すと onPick(key) を呼ぶ。
// 返す select(key) で、選んだ扇形を目立たせる（null で元に戻す）
export function donutChart(wrap, { rows, center, label, onPick }) {
  wrap.classList.add('chart', 'donut');
  const R = 98, r0 = 60, C = 100;
  const live = rows.filter(x => x.value > 0);
  const total = live.reduce((s, x) => s + x.value, 0);
  const f2 = v => Math.round(v * 100) / 100;
  const pt = (a, rad) => `${f2(C + rad * Math.sin(a))},${f2(C - rad * Math.cos(a))}`;
  const arc = (a0, a1) => `M${pt(a0, R)}A${R},${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${pt(a1, R)}L${pt(a1, r0)}A${r0},${r0} 0 ${a1 - a0 > Math.PI ? 1 : 0} 0 ${pt(a0, r0)}Z`;
  let a = 0, s = '';
  for (const x of live) {
    const da = x.value / total * Math.PI * 2;
    const whole = live.length === 1;
    const d = whole ? arc(0, Math.PI) + arc(Math.PI, Math.PI * 2) : arc(a, a + da);
    s += `<path d="${d}" fill="${x.color}" class="slice${whole ? ' whole' : ''}" data-key="${esc(x.key)}" data-tip="${esc(`<b>${esc(x.label)}</b><br>${esc(x.text)}`)}" tabindex="0" role="button" aria-label="${esc(`${x.label}：${x.text}。押すと事業の一覧を開く`)}"/>`;
    a += da;
  }
  if (!live.length) s = `<circle cx="${C}" cy="${C}" r="${(R + r0) / 2}" fill="none" stroke="#e3e6e4" stroke-width="${R - r0}"/>`;
  wrap.innerHTML = `<div class="donut-fig"><svg viewBox="0 0 200 200" role="group" aria-label="${esc(label || '円グラフ')}">${s}</svg>
    ${center ? `<div class="donut-center" aria-hidden="true">${center.k ? `<small>${esc(center.k)}</small>` : ''}<b>${esc(center.v)}</b>${center.sub ? `<small>${esc(center.sub)}</small>` : ''}</div>` : ''}</div>`;
  const tip = document.createElement('div'); tip.className = 'chart-tip'; tip.setAttribute('role', 'status'); wrap.appendChild(tip);
  const show = (t, x, y) => {
    tip.innerHTML = t.dataset.tip;
    tip.style.display = 'block';
    const r = wrap.getBoundingClientRect();
    if (x === undefined) { const b = t.getBoundingClientRect(); x = b.left + b.width / 2; y = b.top + b.height / 2; }
    tip.style.left = Math.max(4, Math.min(x - r.left - tip.offsetWidth / 2, r.width - tip.offsetWidth - 4)) + 'px';
    tip.style.top = Math.max(4, y - r.top - tip.offsetHeight - 14) + 'px';
  };
  const hide = () => { tip.style.display = 'none'; };
  const svg = wrap.querySelector('svg');
  svg.addEventListener('mousemove', ev => { const t = ev.target.closest('.slice'); if (t) show(t, ev.clientX, ev.clientY); else hide(); });
  svg.addEventListener('mouseleave', hide);
  svg.addEventListener('focusin', ev => { const t = ev.target.closest('.slice'); if (t) show(t); });
  svg.addEventListener('focusout', hide);
  svg.addEventListener('click', ev => { const t = ev.target.closest('.slice'); if (t) { show(t, ev.clientX || undefined, ev.clientY || undefined); onPick?.(t.dataset.key); } });
  svg.addEventListener('keydown', ev => {
    const t = ev.target.closest('.slice');
    if (t && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); onPick?.(t.dataset.key); }
  });
  return {
    select(key) {
      svg.querySelectorAll('.slice').forEach(p => { p.classList.toggle('on', p.dataset.key === key); p.classList.toggle('dim', !!key && p.dataset.key !== key); });
      svg.classList.toggle('has-on', !!key);
    },
  };
}

// 積み上げ横棒（財源内訳など）。keys: [{key,label,color,pattern?}]
// full：どの行も同じ長さ（100%）にして、内訳の割合を比べる（大きさのちがう自治体どうしの使い道の比較など）
export function stackChart(wrap, { rows, keys, fmt = v => yen(v), full = false }) {
  wrap.classList.add('chart', 'stacks');
  const max = Math.max(1, ...rows.map(r => keys.reduce((s, k) => s + (r.parts[k.key] || 0), 0)));
  const legend = `<div class="chart-legend">${keys.map(k => `<span><i class="${k.pattern ? 'pat' : ''}" style="background:${k.color}"></i>${esc(k.label)}</span>`).join('')}</div>`;
  wrap.innerHTML = legend + rows.map(r => {
    const tot = keys.reduce((s, k) => s + (r.parts[k.key] || 0), 0);
    const segs = keys.filter(k => r.parts[k.key] > 0).map(k => {
      const v = r.parts[k.key];
      const tip = `${esc(r.label)} ${esc(k.label)}：${esc(fmt(v))}（${yenExact(v)}、${(v / tot * 100).toFixed(1)}%）`;
      return `<span class="seg${k.pattern ? ' pat' : ''}" style="flex:${v} 0 0;background:${k.color}" data-tip="${tip}" tabindex="0" aria-label="${tip}"></span>`;
    }).join('');
    return `<div class="stack-row${r.on ? ' on' : ''}">
      <div class="hbar-label">${esc(r.label)}<small>${esc(fmt(tot))}</small></div>
      <div class="stack-track"><div class="stack-bar" style="width:${full ? 100 : (tot / max) * 100}%">${segs}</div></div>
    </div>`;
  }).join('');
  attachTip(wrap);
}

// 小さな円グラフ（カードの中の飾りではなく、実際の金額の割合を描く。押せない・読み上げは呼び出す側の文で）
// rows: [{value, color}]（大きい順）
export function donutSVG(rows, { size = 120, hole = 0.6 } = {}) {
  const live = rows.filter(x => x.value > 0);
  const total = live.reduce((s, x) => s + x.value, 0);
  const R = size / 2, r0 = R * hole, C = R;
  const f2 = v => Math.round(v * 100) / 100;
  const pt = (a, rad) => `${f2(C + rad * Math.sin(a))},${f2(C - rad * Math.cos(a))}`;
  const arc = (a0, a1) => `M${pt(a0, R)}A${R},${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${pt(a1, R)}L${pt(a1, r0)}A${r0},${r0} 0 ${a1 - a0 > Math.PI ? 1 : 0} 0 ${pt(a0, r0)}Z`;
  let a = 0, s = '';
  if (!total) s = `<circle cx="${C}" cy="${C}" r="${(R + r0) / 2}" fill="none" stroke="#e3e6e4" stroke-width="${R - r0}"/>`;
  for (const x of live) {
    const da = x.value / total * Math.PI * 2;
    s += live.length === 1 ? `<path d="${arc(0, Math.PI)}${arc(Math.PI, Math.PI * 2)}" fill="${x.color}"/>` : `<path d="${arc(a, a + da)}" fill="${x.color}" stroke="#fff" stroke-width="1.5"/>`;
    a += da;
  }
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true" focusable="false">${s}</svg>`;
}
