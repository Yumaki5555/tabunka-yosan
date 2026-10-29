// 調査票（JSON）を、サイトの CSV（事業マスタ・予算・財源・支払先・出典・調査状況・更新履歴）に変えるプログラム
//
//   node tools/import_research.mjs 調査票.json [調査票2.json …]
//
// ・調査票の形は、非公開フォルダ（リポジトリの外の ../共生費用_非公開/）の「調査票の書き方.md」を見てください（自治体ごとに1ファイル）
// ・CSV は公開リポジトリに置くので、調査票の調査メモ（survey.notes）や、決まった言葉にない資料の種類は CSV に入れず、
//   非公開フォルダの「取り込み時の調査メモ.csv」に書き足します。
// ・取り込んだ金額は、すべて「確認＝要確認」になります（合計には入りません）。
//   公式資料のページで金額を確かめてから「確認済み」に書きかえてください（tools/verify_pages.py が手伝います）。
// ・同じ自治体の CSV がすでにあるときは、上書きせずに止まります（--force で上書き）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLES, FIELDS, DOC_TYPES, RELATIONS, TARGETS, CHECK_STATUSES, typeFits } from '../assets/js/schema.js';
import { toCSV } from '../assets/js/csv.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE = path.join(ROOT, '..', '共生費用_非公開');
const memos = [];
const args = process.argv.slice(2);
const force = args.includes('--force');
const files = args.filter(a => !a.startsWith('--'));
if (!files.length) { console.log('使い方：node tools/import_research.mjs 調査票.json'); process.exit(1); }

const STAGE = { initial: '当初予算', revised: '補正後予算', settlement: '決算', '当初予算': '当初予算', '補正後予算': '補正後予算', '決算': '決算' };

export function docType(t) {
  const s = String(t || '');
  if (DOC_TYPES.includes(s)) return s;
  if (/成果|行政報告|実績報告/.test(s)) return '主要施策の成果';
  if (/決算/.test(s)) return '決算書';
  if (/附属説明書|予算に関する説明書|予算説明書/.test(s)) return '予算に関する説明書';
  if (/補正/.test(s)) return '補正予算書';
  if (/事項別明細書|予算書/.test(s)) return '当初予算書';
  if (/予算概要|予算の概要|主要事業|重点施策|予算編成/.test(s)) return '予算の概要';
  if (/補助金|委託/.test(s)) return '補助金・委託資料';
  if (/事務事業評価|行政評価/.test(s)) return '事務事業評価';
  if (/推進計画|共生計画|プラン/.test(s)) return '多文化共生推進計画';
  if (/議会|委員会/.test(s)) return '議会資料';
  return 'その他';
}

export function recipientType(name) {
  const s = String(name || '');
  if (/国際交流協会|国際センター|国際交流財団/.test(s)) return '国際交流協会';
  if (/市町村|[市区町村]（|^\S+[市町村]$/.test(s)) return '市区町村';
  if (/都道府県|県$/.test(s)) return '都道府県';
  if (/特非|NPO|ＮＰＯ|自治会|団体|ＩＡＰＥ/.test(s)) return 'NPO・市民団体';
  if (/保護者|申請者|避難民|^個人$|^中国残留邦人等$/.test(s)) return '個人・世帯';
  if (/学校法人|外国人学校|学校.*設置者/.test(s)) return '学校法人';
  if (/株式会社|企業|事業者|法人|施設|医療機関/.test(s)) return '民間企業';
  return 'その他';
}
const payKind = k => (['補助', '委託', '負担金', '指定管理', '交付金'].includes(k) ? k : 'その他');
const settlementDoc = t => /決算|成果|行政報告|実績報告/.test(t || '');

// 調査票の中の「S7」のような資料の番号を、画面と同じ「資料7」に書きかえる
const srcRef = v => typeof v === 'string' ? v.replace(/(?<![A-Za-z0-9])S(\d{1,2})(?![0-9])/g, (m, n) => `資料${Number(n)}`) : v;
const deepRef = o => Array.isArray(o) ? o.map(deepRef) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'sid' ? v : deepRef(v)])) : srcRef(o);

function convert(raw) {
  const r = { ...deepRef(raw), sources: raw.sources.map(s => ({ ...s, unit_note: srcRef(s.unit_note) })) };
  const code = String(r.muni_code).padStart(6, '0');
  const date = r.researched_at;
  const sid = new Map(r.sources.map((s, i) => [s.sid, `${code}-S${String(i + 1).padStart(2, '0')}`]));
  const pid = new Map(r.projects.map((p, i) => [p.pid, `${code}-${String(i + 1).padStart(3, '0')}`]));
  const srcFy = new Map(r.sources.map(s => [s.sid, s.fy]));
  const srcType = new Map(r.sources.map(s => [s.sid, s.doc_type]));
  const out = {};

  out.sources = r.sources.map(s => ({
    source_id: sid.get(s.sid), code, fy: s.fy, doc_type: docType(s.doc_type), title: s.title, publisher: s.publisher || '',
    url: s.url, page_url: s.page_url || '', published_date: s.published_date || '', accessed_date: date, unit_note: s.unit_note || '',
    archived_url: '',
  }));
  for (const s of r.sources) if (docType(s.doc_type) !== s.doc_type) memos.push([date, code, sid.get(s.sid), '資料の種類', s.doc_type]);
  // 分類は docs/分類と集計の基準.md の①〜⑤・保留（2026-10-29 から。以前の A・B・C は受け付けない）
  const portionOf = new Map();
  for (const a of r.amounts) if (a.portion_yen !== null && a.portion_yen !== undefined) portionOf.set(a.pid, true);
  out.projects = r.projects.map(p => {
    if (!FIELDS.includes(p.field)) throw new Error(`${p.pid} の分野「${p.field}」は決められた10分野にありません`);
    if (!RELATIONS.includes(p.relation)) throw new Error(`${p.pid} の分類「${p.relation}」は ${RELATIONS.join('・')} のどれかにしてください（以前の A・B・C は使いません。docs/分類と集計の基準.md）`);
    if (!typeFits(p.type, p.relation)) throw new Error(`${p.pid} の類型「${p.type}」と分類「${p.relation}」が合いません`);
    const tg = (Array.isArray(p.target) ? p.target : String(p.target || '').split(/[;；]/)).map(s => s.trim()).filter(Boolean);
    if (!tg.length || tg.some(t => !TARGETS.includes(t))) throw new Error(`${p.pid} の対象者の範囲「${tg.join(';')}」は ${TARGETS.join('・')} から選んでください`);
    const check = p.check_status || (p.relation === '保留' ? '要確認' : p.relation === '④' || (p.relation === '③' && !portionOf.has(p.pid)) ? '一部確認済み' : '確認済み');
    if (!CHECK_STATUSES.includes(check)) throw new Error(`${p.pid} の確認状況「${check}」は ${CHECK_STATUSES.join('・')} のどれかにしてください`);
    return {
      project_id: pid.get(p.pid), code, name: p.name, department: p.department || '', purpose: p.purpose || '', content: p.content || '',
      field: p.field, relation: p.relation, type: p.type, relation_reason: p.relation_reason || '', target: tg.join(';'), target_note: p.target_note || '',
      check_status: check, basis_sources: '', classified_date: date, predecessor: '', mou_ids: '', note: '',
    };
  });
  const flagOf = new Map(r.projects.map(p => [p.pid, p.status_flag && p.status_flag !== '不明' ? p.status_flag : '']));
  const latest = Math.max(...r.amounts.map(a => a.fy));
  out.budgets = r.amounts.map(a => ({
    project_id: pid.get(a.pid), code, fy: a.fy, stage: STAGE[a.stage], name_in_year: a.name_in_year || '',
    amount_yen: a.amount_yen, amount_raw: a.amount_raw, unit_raw: a.unit_raw, portion_yen: a.portion_yen ?? '', portion_note: a.portion_note || '',
    status_flag: a.fy === latest && STAGE[a.stage] === '当初予算' ? flagOf.get(a.pid) : '',
    source_id: sid.get(a.sid), page: a.page, quote: a.quote || '', label_in_doc: a.label_in_doc || '',
    verified: '要確認', checked_date: date, note: '',
  }));
  out.funds = r.amounts.filter(a => a.fund && Object.values(a.fund).some(v => v !== null && v !== undefined)).map(a => ({
    project_id: pid.get(a.pid), code, fy: a.fy, stage: STAGE[a.stage],
    national: a.fund.national ?? '', pref: a.fund.pref ?? '', national_pref: a.fund.national_pref_combined ?? '', bond: a.fund.bond ?? '', other: a.fund.other ?? '', general: a.fund.general ?? '',
    source_id: sid.get(a.sid), page: a.page, quote: '', verified: '要確認', checked_date: date, note: a.fund_note || '',
  }));
  out.recipients = r.projects.flatMap(p => (p.recipients || []).map(x => ({
    project_id: pid.get(p.pid), code, fy: srcFy.get(x.sid), stage: settlementDoc(srcType.get(x.sid)) ? '決算' : '当初予算',
    recipient: x.name, recipient_type: recipientType(x.name), kind: payKind(x.kind),
    amount_yen: x.amount_yen ?? '', amount_raw: x.amount_raw || '', unit_raw: x.unit_raw || '',
    source_id: sid.get(x.sid), page: x.page || '', quote: x.quote || '', verified: '要確認', checked_date: date, note: '',
  })));
  const combos = [...new Set(out.budgets.map(b => `${b.fy}|${b.stage}`))];
  out.survey = combos.map(k => {
    const [fy, stage] = k.split('|');
    const main = Number(fy) === latest && stage === '当初予算';
    const st = main ? ({ confirmed: '確認済み', partial: '一部確認', not_found: '資料未発見', undisclosed: '金額非公表' }[r.survey.status_initial_2026] || '一部確認') : '一部確認';
    return {
      code, fy: Number(fy), stage, status: st,
      scope: main ? r.survey.scope : `${fy}年度${stage}は、${latest}年度の調査で見つけた事業について、同じ資料の前年度欄や決算資料で確認した分だけ`,
      not_checked: main ? r.survey.not_checked : `${fy}年度${stage}の資料をひととおりは確認していない`,
      source_ids: [...new Set(out.budgets.filter(b => `${b.fy}|${b.stage}` === k).map(b => b.source_id))].join(';'),
      checked_date: date,
    };
  });
  if (r.survey.notes) memos.push([date, code, '', '調査メモ', r.survey.notes]);
  out.changelog = [{ date, code, project_id: '', fy: latest, stage: '当初予算', kind: '追加', item: `${latest}年度の関連事業を初めて登録（事業${out.projects.length}件・金額${out.budgets.length}行）`, before: '', after: '', reason: '公式資料による調査', source_id: '' }];
  return { code, out, issues: r.issues || [] };
}

// 自治体コードと自治体名が自治体マスタと合っているか（コードの取り違えを防ぐ）
const master = new Map(fs.readFileSync(path.join(ROOT, 'data', 'master', 'municipalities.csv'), 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map(l => l.split(',')).map(c => [c[0], c[4]]));

for (const f of files) {
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  const mc = String(r.muni_code).padStart(6, '0');
  if (!master.has(mc)) { console.log(`止めました：${f} の自治体コード ${mc} は自治体マスタにありません`); process.exitCode = 1; continue; }
  if (master.get(mc) !== r.muni_name) { console.log(`止めました：${f} の自治体コード ${mc} は「${master.get(mc)}」ですが、調査票の自治体名は「${r.muni_name}」です。コードを確かめてください`); process.exitCode = 1; continue; }
  const { code, out, issues } = convert(r);
  for (const [table, rows] of Object.entries(out)) {
    const spec = TABLES[table];
    const fp = path.join(ROOT, 'data', spec.dir, `${code}.csv`);
    if (fs.existsSync(fp) && !force) { console.log(`すでにあります（上書きしません）：${path.relative(ROOT, fp)}。上書きするときは --force`); continue; }
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, toCSV(spec.cols.map(c => c.label), rows.map(o => spec.cols.map(c => o[c.key] ?? ''))));
  }
  console.log(`${r.muni_name}（${code}）：事業 ${out.projects.length}・金額 ${out.budgets.length}行・財源 ${out.funds.length}行・支払先 ${out.recipients.length}行・出典 ${out.sources.length}件`);
  for (const i of issues) console.log(`  調査票のメモ：${i}`);
}
// 調査メモは公開リポジトリの外に書く
if (memos.length) {
  fs.mkdirSync(PRIVATE, { recursive: true });
  const fp = path.join(PRIVATE, '取り込み時の調査メモ.csv');
  const body = toCSV(['日付', '自治体コード', '出典ID', '種類', '内容'], memos);
  fs.appendFileSync(fp, fs.existsSync(fp) ? body.split('\n').slice(1).join('\n') : body);
  console.log(`調査メモ ${memos.length}件を非公開フォルダに書きました：${fp}`);
}
