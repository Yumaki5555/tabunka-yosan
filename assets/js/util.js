// 小さな道具（文字の書き方・金額の書き方・ダウンロードなど）

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 年度の書き方：2026 → 2026年度（令和8年度）
export function wareki(fy) {
  if (fy >= 2019) return `令和${fy - 2018 === 1 ? '元' : fy - 2018}年度`;
  return `平成${fy - 1988}年度`;
}
export const fyLabel = fy => `${fy}年度`;
export const fyFull = fy => `${fy}年度（${wareki(fy)}）`;

const nf = new Intl.NumberFormat('ja-JP');
export const num = n => (n === null || n === undefined || Number.isNaN(n)) ? '—' : nf.format(n);

// 金額（円）を、万円・億円で読みやすく。正確な円は yenExact で
export function yen(n, { approx = false } = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (n === 0) return '0円';
  const neg = n < 0; let v = Math.abs(n);
  let s;
  if (v >= 1e8) {
    const oku = Math.floor(v / 1e8);
    const man = (v - oku * 1e8) / 1e4;
    const manS = approx ? nf.format(Math.round(man)) : fmtMan(man);
    s = `${nf.format(oku)}億${man > 0 ? manS + '万' : ''}円`;
  } else if (v >= 1e4) {
    s = `${approx ? nf.format(Math.round(v / 1e4)) : fmtMan(v / 1e4)}万円`;
  } else {
    s = `${nf.format(Math.round(v))}円`;
  }
  return (neg ? '−' : '') + (approx && v % 1e4 ? '約' : '') + s;
}
function fmtMan(m) {
  // 千円単位までは正確に（例：1,234.5万円）。それより細かいときは小数2桁まで
  const r1 = Math.round(m * 10) / 10;
  if (Math.abs(r1 - m) < 1e-9) return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 }).format(m);
  return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 }).format(m);
}
export const yenExact = n => (n === null || n === undefined) ? '—' : `${nf.format(n)}円`;
export const yenPer = n => (n === null || n === undefined || Number.isNaN(n)) ? '—' : `${nf.format(Math.round(n))}円`;
export function pct(r, digits = 1) {
  if (r === null || r === undefined || !Number.isFinite(r)) return '—';
  const v = r * 100;
  return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}%`;
}
export function diffYen(n) {
  if (n === null || n === undefined) return '—';
  return (n > 0 ? '+' : n < 0 ? '−' : '±') + yen(Math.abs(n)).replace(/^−/, '');
}

export function fmtDate(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日` : s;
}

export function download(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* 失敗 */ }
    ta.remove(); return ok;
  }
}

// ひらがな・カタカナ・全角半角をそろえて比べる（検索用）
export function normQ(s) {
  return String(s || '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s　]/g, '');
}

export function debounce(fn, ms = 150) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// 一般会計に占める割合（0〜1）を「0.20%」の形に。0より大きく0.01%未満は「0.01%未満」と書く
export function ratioPct(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (v === 0) return '0%';
  const p = v * 100;
  return p < 0.01 ? '0.01%未満' : `${p.toFixed(2)}%`;
}
// 大きな金額を短く（グラフの目盛り・カードの数字。正確な円は yenExact で）：4億円・2,000億円・1兆2,345億円
export function yenShort(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (n >= 1e12) { const cho = Math.floor(n / 1e12), oku = Math.round((n - cho * 1e12) / 1e8); return `${num(cho)}兆${oku ? num(oku) + '億' : ''}円`; }
  if (n >= 1e8) return `${num(Math.round(n / 1e8))}億円`;
  return yen(n, { approx: true });
}
