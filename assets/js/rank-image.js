// ランキングの横棒グラフを画像（PNG）にする
// 形：大きな題（地域｜何のランキング）・副題（年度・段階・何自治体のうち）・順位・名前・横棒・値・区切り線・出典と注意書き

const C = { bg: '#ffffff', text: '#17211c', muted: '#55645b', bar: '#1d7347', neg: '#a8590f', line: '#d5dfd8' };
const W = 1600, L = 48, R = 48, ROW = 62, TOP = 176, BAR_H = 32;

// 日本語の文を、決まった幅で折り返す
function wrap(ctx, text, maxW) {
  const lines = [];
  let cur = '';
  for (const ch of text) {
    if (cur && ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch === ' ' ? '' : ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

// 「一部の資料だけ調査」の棒の斜線（画面の横棒と同じ見た目）
function stripes(ctx, color) {
  const t = document.createElement('canvas');
  t.width = t.height = 14;
  const g = t.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 14, 14);
  g.strokeStyle = 'rgba(255,255,255,.55)';
  g.lineWidth = 4;
  g.beginPath();
  for (const o of [-14, 0, 14]) { g.moveTo(o, 14); g.lineTo(o + 14, 0); }
  g.stroke();
  return ctx.createPattern(t, 'repeat');
}

// rows：rankRows の結果（上から n 件を描く）。fmt：値の書き方。showPref：名前の後ろに（都道府県）を付ける
export async function rankImageBlob({ rows, n, title, sub, notes, fmt, showPref }) {
  try { await document.fonts?.ready; } catch { /* 文字の読み込みを待てなくても描く */ }
  const font = getComputedStyle(document.body).fontFamily;
  const f = (px, bold) => `${bold ? '700 ' : ''}${px}px ${font}`;
  const shown = rows.slice(0, n);
  const c = document.createElement('canvas');
  c.width = W; c.height = 10;
  let ctx = c.getContext('2d');

  // 先に幅と高さを測る
  ctx.font = f(34, true);
  const nameW = shown.map(r => ctx.measureText(r.m.name).width);
  ctx.font = f(24);
  const prefText = shown.map(r => showPref && !r.m.isPref ? `（${r.m.pref}）` : '');
  const prefW = prefText.map(t => t ? ctx.measureText(t).width + 4 : 0);
  ctx.font = f(36, true);
  const vals = shown.map(r => fmt(r.v));
  const valW = Math.max(...vals.map(v => ctx.measureText(v).width), 0);
  ctx.font = f(22);
  const noteLines = notes.flatMap(t => wrap(ctx, t, W - L - R));
  const rankX = L + 34, nameX = rankX + 22;
  const barX = nameX + Math.max(...shown.map((r, i) => nameW[i] + prefW[i]), 0) + 32;
  const barMax = Math.max(120, W - R - valW - 28 - barX);
  const max = Math.max(...shown.map(r => Math.abs(r.v)), 1e-12);
  const lineY = TOP + shown.length * ROW + 14;
  c.height = Math.ceil(lineY + 22 + noteLines.length * 34 + 26);
  ctx = c.getContext('2d');

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, c.height);

  // 題（長いときは文字を小さくして1行に収める）
  let size = 56;
  ctx.font = f(size, true);
  while (size > 34 && ctx.measureText(title).width > W - L - R) { size -= 2; ctx.font = f(size, true); }
  ctx.fillStyle = C.text;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, L, 96);
  ctx.font = f(28);
  ctx.fillStyle = C.muted;
  ctx.fillText(sub, L, 144);

  // 1行ずつ：順位・名前・横棒・値
  ctx.textBaseline = 'middle';
  const pat = { [C.bar]: stripes(ctx, C.bar), [C.neg]: stripes(ctx, C.neg) };
  shown.forEach((r, i) => {
    const y = TOP + i * ROW + ROW / 2;
    ctx.textAlign = 'right';
    ctx.font = f(26);
    ctx.fillStyle = C.muted;
    ctx.fillText(String(r.rank), rankX, y);
    ctx.textAlign = 'left';
    ctx.font = f(34, true);
    ctx.fillStyle = C.text;
    ctx.fillText(r.m.name, nameX, y);
    if (prefText[i]) {
      ctx.font = f(24);
      ctx.fillStyle = C.muted;
      ctx.fillText(prefText[i], nameX + nameW[i] + 4, y + 2);
    }
    const color = r.v < 0 ? C.neg : C.bar;
    ctx.fillStyle = r.st === '一部確認' ? pat[color] : color;
    ctx.fillRect(barX, y - BAR_H / 2, Math.max(3, Math.abs(r.v) / max * barMax), BAR_H);
    ctx.textAlign = 'right';
    ctx.font = f(36, true);
    ctx.fillStyle = C.text;
    ctx.fillText(vals[i], W - R, y);
  });

  // 区切り線と出典・注意書き
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(L, lineY); ctx.lineTo(W - R, lineY); ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = f(22);
  ctx.fillStyle = C.muted;
  noteLines.forEach((t, i) => ctx.fillText(t, L, lineY + 18 + i * 34));

  return new Promise((ok, ng) => c.toBlob(b => b ? ok(b) : ng(new Error('画像を作れませんでした')), 'image/png'));
}
