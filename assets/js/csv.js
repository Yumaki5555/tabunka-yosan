// CSV の読み書き（Excel で保存した CSV も読めるように、先頭の BOM と CRLF に対応）

export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', q = false, i = 0, line = 1, rowLine = 1;
  const lines = [];
  const pushRow = () => {
    row.push(field); field = '';
    if (!(row.length === 1 && row[0] === '')) { rows.push(row); lines.push(rowLine); }
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      if (ch === '\n') line++;
      field += ch; i++; continue;
    }
    if (ch === '"' && field === '') { q = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { pushRow(); line++; rowLine = line; i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length) pushRow();
  return { rows, lines };
}

// 1行目を見出しにして、オブジェクトの配列にする。_line に元の行番号を入れる
export function csvToObjects(text) {
  const { rows, lines } = parseCSV(text);
  if (!rows.length) return { header: [], records: [] };
  const header = rows[0].map(h => h.trim());
  const records = rows.slice(1).map((r, n) => {
    const o = { _line: lines[n + 1] };
    header.forEach((h, j) => { o[h] = (r[j] ?? '').trim(); });
    o._extra = r.length > header.length ? r.slice(header.length).filter(x => x.trim() !== '') : [];
    return o;
  });
  return { header, records };
}

const needQuote = /[",\r\n]/;
export function toCSV(header, rows, { bom = true } = {}) {
  const cell = v => {
    const s = v === null || v === undefined ? '' : String(v);
    return needQuote.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const body = [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
  return (bom ? '﻿' : '') + body;
}
