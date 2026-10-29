// 公開用データを作るプログラム
//
//   node tools/build.mjs
//
// data/ の下の CSV（事業マスタ・予算・決算・財源・支払先・出典・調査状況・更新履歴など）を読み、
// 点検（形式・重複・つながり・金額と財源の整合性）をしてから、サイトが読む data/dist/ を作ります。
// 「エラー」が1つでもあれば data/dist/ は作り直しません。
// 点検の結果（エラー・注意の一覧）は公開しないので、data/dist/ ではなく tools/build_report.local.json（.gitignore で公開しない）に書きます。
// data/dist/ には、画面で使う列だけを書き出します（管理用の列は書き出さない）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLES } from '../assets/js/schema.js';
import { csvToObjects } from '../assets/js/csv.js';
import { Checker } from '../assets/js/validate.js';
import { aggregate, breakdown, fieldTotals, valueOf, generalTotals, FUND_KEYS } from '../assets/js/calc.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const DIST = path.join(DATA, 'dist');
const REPORT = path.join(ROOT, 'tools', 'build_report.local.json');
// 公開用データ（data/dist/）に書き出さない列（画面で使わない管理用の列）
const NOT_PUBLISHED = { projects: ['classified_date'] };
const read = p => fs.readFileSync(p, 'utf8');
const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');
const writeJSON = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o)); };

const config = JSON.parse(read(path.join(DATA, 'config.json')));
const master = csvToObjects(read(path.join(DATA, 'master', 'municipalities.csv'))).records;
const codes = new Map(master.map(m => [m.code, m]));
const checker = new Checker({ codes, years: config.years });

// 表ごとに、フォルダの中の CSV を全部読んでつなげる
const d = {};
const files = {};
for (const [name, spec] of Object.entries(TABLES)) {
  const dir = path.join(DATA, spec.dir);
  d[name] = [];
  files[name] = [];
  if (!fs.existsSync(dir)) continue;
  for (const fn of fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.csv')).sort()) {
    const fp = path.join(dir, fn);
    const { header, records } = csvToObjects(read(fp));
    files[name].push({ file: rel(fp), rows: records.length });
    d[name].push(...checker.normalize(name, header, records, rel(fp)));
  }
}
checker.crossCheck(d, { settlementLatestFy: config.settlement_latest_fy });
const count = checker.summary();
const now = new Date();
const stamp = new Date(now.getTime() + 9 * 3600e3).toISOString().replace('T', ' ').slice(0, 16);

const sum = aggregate(d);
// 一般会計の予算総額（一般会計に占める割合の分母。確認済みの行だけ）
const gen = generalTotals(d.general);

// 検算：自治体×年度×段階ごとに、事業ごとの内訳（自治体のページの「この金額はどう計算した？」と同じ計算）を作り、
// 集計と一致するか・二重計上や換算ミスの点検に通るかを確かめる。合わなければ公開用データを作らない
// あわせて、使い道（10分類）の円グラフで分類を押したときに出す、全国の事業の一覧（基本集計に入れた行だけ）を作る
let audited = 0;
const uses = {};
const usesSrc = {};
const srcById = new Map(d.sources.map(s => [s.source_id, s]));
for (const [code, ys] of Object.entries(sum)) for (const [fy, sts] of Object.entries(ys)) for (const [stage, c] of Object.entries(sts)) {
  const bd = breakdown(d, code, Number(fy), stage, c.a ?? 0);
  audited++;
  if (valueOf(c)) for (const r of bd.inc) {
    (uses[`${fy}|${stage}`] ??= []).push([code, r.p.project_id, r.p.name, r.p.field, r.amt, r.k, r.b.source_id, r.b.page]);
    const s = srcById.get(r.b.source_id);
    if (s) usesSrc[s.source_id] ??= [s.title, s.archived_url || s.url];
  }
  const where = { _file: `検算 ${code} ${fy}年度 ${stage}`, _line: 0 };
  const bad = [];
  if ((c.a ?? 0) !== bd.total) bad.push(`基本集計（集計 ${c.a ?? 0}円・内訳の足し算 ${bd.total}円）`);
  if (c.d1 !== bd.t1 || c.d2 !== bd.t2 || c.d3 !== bd.t3) bad.push(`①②③の内訳（集計 ${c.d1}・${c.d2}・${c.d3}円、内訳 ${bd.t1}・${bd.t2}・${bd.t3}円）`);
  if (c.a !== null && c.a !== 0 && c.st !== '該当事業なし' && c.d1 + c.d2 + c.d3 !== c.a) bad.push(`①＋②＋③（${c.d1 + c.d2 + c.d3}円）と基本集計（${c.a}円）`);
  if (c.an !== bd.inc.length) bad.push(`事業の数（集計 ${c.an}・内訳 ${bd.inc.length}）`);
  if (c.u3n !== bd.u3.filter(r => r.b).length || c.u3w !== bd.w3) bad.push(`③の部分の金額が分からない事業（集計 ${c.u3n}件・内訳 ${bd.u3.filter(r => r.b).length}件）`);
  if (c.c4n !== bd.c4.filter(r => r.b).length || c.c4w !== bd.w4) bad.push(`④の事業（集計 ${c.c4n}件・内訳 ${bd.c4.filter(r => r.b).length}件）`);
  if (c.rn !== bd.dup.filter(r => r.b).length || c.rw !== bd.wd) bad.push(`再掲の事業（集計 ${c.rn}件・内訳 ${bd.dup.filter(r => r.b).length}件）`);
  if (c.hn !== bd.hold.filter(r => r.b).length) bad.push(`判定保留の事業（集計 ${c.hn}件・内訳 ${bd.hold.filter(r => r.b).length}件）`);
  for (const g of bd.fields) if ((c.f[g.field] || 0) !== g.amount || (c.fn[g.field] || 0) !== g.list.length) bad.push(`分野「${g.field}」の金額・事業の数`);
  if (Object.keys(c.f).some(f => !bd.fields.some(g => g.field === f))) bad.push('内訳にない分野の金額が集計にある');
  if ((c.xn || 0) !== bd.noAmt.length + bd.u3.filter(r => !r.b).length) bad.push(`金額の記録がない①②③の事業（集計 ${c.xn || 0}件・内訳 ${bd.noAmt.length + bd.u3.filter(r => !r.b).length}件）`);
  if (c.fd) for (const k of [...FUND_KEYS, 'unknown']) if (c.fd[k] !== bd.fund[k]) bad.push(`財源「${k}」の金額`);
  if ((c.g || 0) !== bd.tg || (c.sx || 0) !== bd.ts || (c.gx || 0) !== bd.ux.length) bad.push(`会計ごとの金額（集計 一般会計${c.g || 0}円・特別会計など${c.sx || 0}円・会計不明${c.gx || 0}件、内訳 ${bd.tg}円・${bd.ts}円・${bd.ux.length}件）`);
  if (c.st !== '該当事業なし' && (c.g || 0) + (c.sx || 0) > (c.a ?? 0)) bad.push('一般会計と特別会計などの金額の合計が、基本集計をこえています');
  for (const ck of bd.checks) if (!ck.ok) bad.push(`点検「${ck.label}」：${ck.detail}`);
  if (bad.length) checker.add('error', 'budgets', where, `検算が合いません：${bad.join('／')}`);
}
// 使い道の検算：年度・段階ごとに、全国の事業の一覧の使い道ごとの足し算が、自治体ごとの集計を足したもの（円グラフの金額）と一致するか
for (const [k, rows] of Object.entries(uses)) {
  const [fy, stage] = k.split('|');
  const ft = fieldTotals(Object.values(sum).map(ys => ys[fy]?.[stage]));
  const where = { _file: `検算 全国 ${fy}年度 ${stage}（使い道）`, _line: 0 };
  if (ft.total !== ft.sum) checker.add('error', 'budgets', where, `使い道の合計 ${ft.total}円と基本集計の合計 ${ft.sum}円が合いません`);
  for (const f of Object.keys(ft.amount)) {
    const list = rows.filter(r => r[3] === f);
    if (list.reduce((s, r) => s + r[4], 0) !== ft.amount[f] || list.length !== ft.count[f]) checker.add('error', 'budgets', where, `使い道「${f}」の事業の一覧（${list.length}件）と集計（${ft.count[f]}件）が合いません`);
  }
  if (new Set(rows.map(r => r[1])).size !== rows.length) checker.add('error', 'budgets', where, '同じ事業が全国の事業の一覧に2回入っています');
}
count.error = checker.summary().error;

// 調査の進み具合（当初予算）
const progress = {};
for (const fy of config.years) {
  const c = { pref: {}, muni: {} };
  for (const m of master) {
    const lv = m.kind === '都道府県' ? 'pref' : 'muni';
    const st = sum[m.code]?.[fy]?.['当初予算']?.st || '未調査';
    c[lv][st] = (c[lv][st] || 0) + 1;
  }
  // 一般会計の総額を確認できた自治体の数（当初予算）
  c.gen = { pref: 0, muni: 0 };
  for (const m of master) if (gen[m.code]?.[fy]?.['当初予算']) c.gen[m.kind === '都道府県' ? 'pref' : 'muni']++;
  progress[fy] = c;
}

const report = {
  generated: stamp,
  ok: count.error === 0,
  count,
  files,
  rows: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.length])),
  progress,
  issues: checker.issues,
};
writeJSON(REPORT, report);

console.log(`点検：エラー ${count.error}件・注意 ${count.warn}件・お知らせ ${count.info}件（検算 ${audited}件）`);
for (const i of checker.issues.filter(i => i.level !== 'info')) console.log(`  [${i.level === 'error' ? 'エラー' : '注意'}] ${i.file}${i.line ? ' ' + i.line + '行目' : ''}：${i.msg}`);
if (count.error) {
  console.log('\nエラーがあるため、公開用データ（data/dist/）は作り直していません。上の行を直してからもう一度実行してください。');
  process.exit(1);
}

const strip = r => { const o = {}; for (const [k, v] of Object.entries(r)) if (!k.startsWith('_') && v !== null && v !== '') o[k] = v; return o; };

// 自治体マスタ（画面用に小さく）
writeJSON(path.join(DIST, 'master.json'), {
  generated: stamp,
  source: config.master_source,
  rows: master.map(m => [m.code, m.name, m.kana, m.kind, m.geo_file, m.geo_key, m.zairyu_url]),
});

// 集計（地図・ランキング・比較用）
writeJSON(path.join(DIST, 'summary.json'), { generated: stamp, years: config.years, sum, gen });

// 都道府県ごとの詳しいデータ（自治体のページ用）
// フォルダごと消すと Dropbox の同期と重なって失敗し、フォルダが空のまま残ることがあるので、
// ファイルを上書きしてから、使わなくなったファイルだけを1つずつ消す
const DETAIL = path.join(DIST, 'detail');
fs.mkdirSync(DETAIL, { recursive: true });
const byPref = {};
for (const [name, list] of Object.entries(d)) for (const r of list) {
  const pc = r.code.slice(0, 2);
  byPref[pc] ??= Object.fromEntries(Object.keys(TABLES).map(t => [t, []]));
  const o = strip(r);
  for (const k of NOT_PUBLISHED[name] || []) delete o[k];
  byPref[pc][name].push(o);
}
for (const [pc, obj] of Object.entries(byPref)) writeJSON(path.join(DETAIL, `${pc}.json`), obj);
for (const f of fs.readdirSync(DETAIL)) if (!byPref[f.replace(/\.json$/, '')]) fs.rmSync(path.join(DETAIL, f), { force: true });

// 事業名の検索用の索引
writeJSON(path.join(DIST, 'projects-index.json'), d.projects.map(p => [p.project_id, p.code, p.name, p.field, p.relation, p.department || '']));

// 使い道の円グラフで分類を押したときの、全国の事業の一覧（押したときだけ読む）。
// rows["2026|当初予算"] = [[自治体コード, 事業ID, 事業名, 使い道, 数えた金額, 分類, 出典ID, 掲載ページ], …]、src[出典ID] = [資料名, URL]
writeJSON(path.join(DIST, 'uses.json'), { generated: stamp, rows: uses, src: usesSrc });

// 年度ごとの人口・外国人住民数
const pop = csvToObjects(read(path.join(DATA, 'population.csv'))).records;
const statSources = csvToObjects(read(path.join(DATA, 'master', 'stat_sources.csv'))).records;
const yi = new Map(config.years.map((y, i) => [y, i]));
const pd = {};
for (const r of pop) {
  const i = yi.get(Number(r.fy));
  if (i === undefined) continue;
  pd[r.code] ??= [config.years.map(() => null), config.years.map(() => null)];
  if (r.population) pd[r.code][0][i] = Number(r.population);
  if (r.foreign) pd[r.code][1][i] = Number(r.foreign);
}
const asOf = {};
for (const r of pop) if (!asOf[r.fy] && r.population_as_of && r.foreign_as_of) asOf[r.fy] = { pop: r.population_as_of, for: r.foreign_as_of, ps: r.population_source, fs: r.foreign_source };
writeJSON(path.join(DIST, 'population.json'), { years: config.years, asOf, sources: statSources.map(strip), d: pd });

// 更新履歴（全体）
writeJSON(path.join(DIST, 'changelog.json'), d.changelog.map(strip).sort((a, b) => (b.date || '').localeCompare(a.date || '')));

const meta = { generated: stamp, rows: report.rows, progress };
writeJSON(path.join(DIST, 'meta.json'), meta);
console.log(`\n公開用データを作りました（${stamp}）：事業 ${d.projects.length}件・予算/決算 ${d.budgets.length}行・出典 ${d.sources.length}件・調査状況 ${d.survey.length}行`);
