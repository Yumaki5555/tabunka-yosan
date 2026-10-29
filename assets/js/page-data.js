// データのダウンロード（自治体別・年度別・分野別・すべて）

import { db, loadDetail, loadPopulation, popOf, cell, status } from './store.js';
import { $, esc, download, num, fyFull } from './util.js';
import { href, currentYear } from './app.js';
import { muniPicker } from './components.js';
import { budgetCSV, BUDGET_CSV_HEADER, SUMMARY_CSV_HEADER, summaryRow } from './export.js';
import { toCSV } from './csv.js';
import { FIELDS, FIELD_INFO, TABLES } from './schema.js';

async function allDetails() {
  const pcs = [...new Set(Object.keys(db.sum).map(c => c.slice(0, 2)))];
  const ds = await Promise.all(pcs.map(pc => loadDetail(pc)));
  const merged = Object.fromEntries(Object.keys(TABLES).map(t => [t, []]));
  for (const d of ds) for (const t of Object.keys(merged)) merged[t].push(...(d[t] || []));
  return merged;
}

export function dataPage(ctx) {
  const { app, params } = ctx;
  const fy = currentYear(params);
  app.innerHTML = `<div class="page-head"><h1>データのダウンロード</h1>
    <p class="lead">このサイトのデータを CSV（Excel で開ける形式）でダウンロードできます。金額だけでなく、出典URL・資料名・調査状況・年度・分類（①〜⑤）も入っています。</p></div>
    <div class="info"><p>金額はすべて円です。「確認」が「要確認」の行（資料で確認している途中の金額）は、サイトの合計に入れていません。「調査状況」が未調査の自治体・年度は、ファイルに行がありません（0円ではありません）。</p></div>

    <h2>自治体別</h2>
    <div id="d-muni"></div>

    <h2>年度別</h2>
    <div class="ctl-row"><label class="ctl"><span class="label">年度</span><select id="d-fy">${[...db.years].reverse().map(y => `<option value="${y}"${y === fy ? ' selected' : ''}>${fyFull(y)}</option>`).join('')}</select></label>
      <div class="ctl"><span class="label">&nbsp;</span><button type="button" class="btn" id="d-fy-btn">事業ごとの金額（CSV）</button></div>
      <div class="ctl"><span class="label">&nbsp;</span><button type="button" class="btn btn-outline" id="d-fy-sum">全自治体の調査状況と合計（CSV）</button></div></div>

    <h2>分野別</h2>
    <div class="ctl-row"><label class="ctl"><span class="label">分野</span><select id="d-field">${FIELDS.map(f => `<option value="${esc(f)}">${esc(FIELD_INFO[f].label)}</option>`).join('')}</select></label>
      <div class="ctl"><span class="label">&nbsp;</span><button type="button" class="btn" id="d-field-btn">この分野の事業（CSV）</button></div></div>

    <h2>すべて</h2>
    <p class="btn-row"><button type="button" class="btn" id="d-all">すべての事業の金額（CSV）</button></p>
    <p class="small muted">元の表（事業マスタ・年度別予算・決算・財源内訳・支払先・出典資料・調査状況・更新履歴・自治体マスタ・人口統計）は、公開しているリポジトリの <code>data/</code> フォルダにあります。表の形の説明は <code>docs/データの説明.md</code> にあります。</p>

    <h2>CSVの列</h2>
    <p class="small">${BUDGET_CSV_HEADER.map(esc).join('／')}</p>
    <p class="small muted">「分野」は使い道（10分類）、「分類」は①〜⑤・判定保留です。「事業全体の金額」と「基本集計に入れた金額」は別の列で、③は外国人関連の部分だけを基本集計に入れています。</p>`;

  muniPicker($('#d-muni'), {
    id: 'd-q', label: '自治体を選ぶと、その自治体の全年度のCSVをダウンロードします', fy,
    onPick: async (m, input) => {
      const d = await loadDetail(m.pc);
      download(`${m.code}_${m.full}_多文化共生予算.csv`, budgetCSV(d, b => b.code === m.code));
      input.value = '';
    },
  });
  $('#d-fy-btn').addEventListener('click', async () => {
    const y = Number($('#d-fy').value);
    download(`${y}年度_多文化共生予算_事業別.csv`, budgetCSV(await allDetails(), b => b.fy === y));
  });
  $('#d-fy-sum').addEventListener('click', async () => {
    await loadPopulation();
    const y = Number($('#d-fy').value);
    const rows = [];
    for (const m of db.munis) for (const s of ['当初予算', '決算']) rows.push(summaryRow(m, y, s, cell(m.code, y, s), popOf(m.code, y)));
    download(`${y}年度_全自治体_調査状況と合計.csv`, toCSV(SUMMARY_CSV_HEADER, rows));
  });
  $('#d-field-btn').addEventListener('click', async () => {
    const f = $('#d-field').value;
    download(`分野_${f}_多文化共生予算.csv`, budgetCSV(await allDetails(), (b, p) => p.field === f));
  });
  $('#d-all').addEventListener('click', async () => download('多文化共生予算_すべて.csv', budgetCSV(await allDetails())));
}
