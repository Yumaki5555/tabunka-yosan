// CSV の書き出し（金額だけでなく、出典URL・資料名・調査状況・年度・分類・対象者の範囲・基本集計に入れた金額も入れる）

import { db, status, generalOf, ratio } from './store.js';
import { toCSV } from './csv.js';
import { RELATION_INFO, TYPE_INFO } from './schema.js';
import { countedAmount } from './calc.js';

export const BUDGET_CSV_HEADER = [
  '自治体コード', '都道府県', '自治体', '年度', '段階', '調査状況', '事業ID', '事業名', 'その年度の事業名', '担当部署', '分野', '分類', '分類の名前', '類型', '分類の理由', '対象者の範囲', '対象者の説明', '確認状況',
  '事業全体の金額（円）', '基本集計に入れた金額（円）', '足していない事業全体の金額（③で外国人関連部分が不明・④・別枠）（円）', '資料の数字', '資料の単位', 'うち外国人関連の部分（円）', 'うち外国籍の人だけへの支出（円）', '国庫支出金（円）', '都道府県支出金（円）', '国・県支出金（区別なし）（円）', '地方債（円）', 'その他財源（円）', '一般財源（円）',
  '新規・継続', '資料名', '資料の種類', '出典URL', '資料掲載ページ', '掲載ページ', '公表日', 'データ最終確認日', '確認', '備考',
];

// detail（都道府県ごとのデータ）から、条件に合う予算・決算の行を CSV の行にする
export function budgetRows(detail, filter = () => true) {
  const proj = new Map(detail.projects.map(p => [p.project_id, p]));
  const src = new Map(detail.sources.map(s => [s.source_id, s]));
  const fund = new Map(detail.funds.map(f => [`${f.project_id}|${f.fy}|${f.stage}`, f]));
  const out = [];
  for (const b of detail.budgets) {
    const p = proj.get(b.project_id);
    if (!p || !filter(b, p)) continue;
    const m = db.byCode.get(b.code);
    const s = src.get(b.source_id) || {};
    const f = fund.get(`${b.project_id}|${b.fy}|${b.stage}`) || {};
    out.push([
      b.code, m?.pref || '', m?.isPref ? '' : m?.name || '', b.fy, b.stage, status(b.code, b.fy, b.stage), p.project_id, p.name, b.name_in_year || '', p.department || '', p.field, p.relation, RELATION_INFO[p.relation]?.label || '', TYPE_INFO[p.type]?.label || p.type || '', p.relation_reason || '', p.target || '', p.target_note || '', p.check_status || '',
      b.amount_yen, countedAmount(p, b) ?? '', b.verified === '確認済み' && ((p.relation === '③' && (b.portion_yen === null || b.portion_yen === undefined)) || p.relation === '④' || p.relation === '別枠') ? b.amount_yen : '', b.amount_raw, b.unit_raw, b.portion_yen ?? '', b.foreign_only_yen ?? '', f.national ?? '', f.pref ?? '', f.national_pref ?? '', f.bond ?? '', f.other ?? '', f.general ?? '',
      b.status_flag || '', s.title || '', s.doc_type || '', s.archived_url || s.url || '', s.page_url || '', b.page || '', s.published_date || '', s.accessed_date || '', b.verified, b.note || '',
    ]);
  }
  out.sort((a, b) => a[0].localeCompare(b[0]) || a[3] - b[3] || a[4].localeCompare(b[4]) || a[6].localeCompare(b[6]));
  return out;
}

export const budgetCSV = (detail, filter) => toCSV(BUDGET_CSV_HEADER, budgetRows(detail, filter));

// 自治体×年度の調査状況と合計（比較・年度別のダウンロード用）
export const SUMMARY_CSV_HEADER = ['自治体コード', '都道府県', '自治体', '年度', '段階', '調査状況', '集計の範囲', '多文化共生関連予算の合計（円）', '合計に入れた事業の数', 'うち①直接給付・支援（円）', 'うち②行政経費（円）', 'うち③一般事業の外国人関連部分（円）', '③で部分の金額が分からない事業数', '③で部分の金額が分からない事業全体の金額（円・足していない）', '④関連事業・参考経費の事業数', '④の事業全体の金額（円・足していない）', '⑤対象外の事業数', '判定保留の事業数', '別枠（学校の教員の人件費、中国残留邦人等・引揚者などの援護）の事業数', '別枠の事業の金額（円・足していない）', '要確認で合計に入れていない行数', '財源の内訳を確認できた金額（円）', 'うち一般会計の事業の金額（円）', '一般会計の予算総額（円）', '一般会計に占める割合（%）', '割合の注意', '人口', '人口の時点', '外国人住民数', '外国人住民数の時点'];
export function summaryRow(m, fy, stage, c, p) {
  return [m.code, m.pref, m.isPref ? '' : m.name, fy, stage, status(m.code, fy, stage), '基本集計：①直接給付・支援＋②行政経費＋③一般事業のうち分かった部分',
    c?.a ?? (status(m.code, fy, stage) === '該当事業なし' ? 0 : ''), c?.an ?? '', c?.d1 ?? '', c?.d2 ?? '', c?.d3 ?? '', c?.u3n ?? '', c?.u3w ?? '', c?.c4n ?? '', c?.c4w ?? '', c?.n5 ?? '', c?.hn ?? '', c ? c.bn || 0 : '', c ? c.bw || 0 : '', c?.pend ?? '', c?.fd && c.a ? c.a - c.fd.unknown : '',
    ...(r => [r.v !== null ? r.num : '', generalOf(m.code, fy, stage) ?? '', r.v !== null ? (r.v * 100).toFixed(4) : '', r.v !== null ? (r.partial ? '確認済み分の割合（一部の資料だけ調査）' : '') : (r.why || '')])(ratio(m.code, fy, stage)),
    p?.population ?? '', p?.asOf?.pop ?? '', p?.foreign ?? '', p?.asOf?.for ?? ''];
}
