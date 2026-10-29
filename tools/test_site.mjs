// サイトの決まり（点検・集計・金額の書き方）が正しく働くかを確かめるテスト
//
//   node tools/test_site.mjs
//
// 公開しているデータは使わず、テスト用の小さなデータで確かめます。

import { Checker, rawToYen } from '../assets/js/validate.js';
import { aggregate, statusOf, valueOf, metric, breakdown, fundCoverage, fieldTotals, fieldShares, ratioOf, generalTotals } from '../assets/js/calc.js';
import { parseCSV, toCSV, csvToObjects } from '../assets/js/csv.js';
import { detectTable, TABLES } from '../assets/js/schema.js';

let ok = 0, ng = 0;
const t = (name, cond) => { if (cond) ok++; else { ng++; console.log('  失敗：' + name); } };

// ---------- 金額の読み取り ----------
t('千円', rawToYen('12,345', '千円') === 12345000);
t('円', rawToYen('80,687,727', '円') === 80687727);
t('億と万の書き方', rawToYen('1億360万円', '万円') === 103600000);
t('億のあとが単位の数', rawToYen('1億5,030', '万円') === 150300000);
t('百万円', rawToYen('352', '百万円') === 352000000);
t('全角数字', rawToYen('１２，３４５', '千円') === 12345000);
t('読めない', rawToYen('不明', '千円') === null);

// ---------- CSV ----------
const csv = toCSV(['a', 'b'], [['x,y', '改行\nあり'], ['"引用"', '']]);
const back = parseCSV(csv).rows;
t('CSVの往復', back[1][0] === 'x,y' && back[1][1] === '改行\nあり' && back[2][0] === '"引用"');
t('BOMつきCSV', csvToObjects('﻿事業ID,自治体コード\n221309-001,221309\n').records[0]['事業ID'] === '221309-001');
t('表の判定', detectTable(TABLES.budgets.cols.map(c => c.label)) === 'budgets');

// ---------- 点検 ----------
const codes = new Map([['221309', { kind: '政令指定都市' }], ['220001', { kind: '都道府県' }]]);
const years = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const lab = table => TABLES[table].cols.map(c => c.label);
const row = (table, o) => Object.fromEntries(TABLES[table].cols.map(c => [c.label, o[c.key] ?? '']));
const mk = (table, list) => ({ header: lab(table), records: list.map((o, i) => ({ ...row(table, o), _line: i + 2, _extra: [] })) });

function check(input, latest = 2025) {
  const ck = new Checker({ codes, years });
  const d = {};
  for (const tb of Object.keys(TABLES)) {
    const { header, records } = mk(tb, input[tb] || []);
    d[tb] = ck.normalize(tb, header, records, tb + '.csv');
  }
  ck.crossCheck(d, { settlementLatestFy: latest });
  return { ck, d };
}
const TY = { '①': '1-日本語', '②': '2-相談', '③': '2-情報', '④': '4-協会運営', '⑤': '5-国際', '保留': '保留' };
const P = (id, rel = '①', field = '日本語教育', type) => ({ project_id: id, code: id.slice(0, 6), name: '事業' + id, field, relation: rel, type: type || TY[rel], target: '外国籍の住民・滞在者', check_status: rel === '保留' ? '要確認' : '確認済み', classified_date: '2026-10-29' });
const S = { source_id: '221309-S01', code: '221309', fy: 2026, doc_type: '予算の概要', title: '資料', url: 'https://example.lg.jp/a.pdf', accessed_date: '2026-10-28' };
const B = (id, fy, stage, yen, raw, unit = '千円', extra = {}) => ({ project_id: id, code: id.slice(0, 6), fy, stage, amount_yen: yen, amount_raw: raw, unit_raw: unit, source_id: '221309-S01', page: '1', verified: '確認済み', checked_date: '2026-10-28', ...extra });
const has = (ck, level, re) => ck.issues.some(i => i.level === level && re.test(i.msg));

{
  const { ck } = check({ projects: [P('221309-001')], sources: [S], budgets: [B('221309-001', 2026, '当初予算', 12345000, '12,345')], survey: [{ code: '221309', fy: 2026, stage: '当初予算', status: '確認済み', checked_date: '2026-10-28' }] });
  t('正しいデータはエラーなし', ck.summary().error === 0);
}
{
  const { ck } = check({ projects: [P('221309-001')], sources: [S], budgets: [B('221309-001', 2026, '当初予算', 1234500, '12,345')] });
  t('単位の取り違えを見つける', has(ck, 'error', /円にすると/));
}
{
  const { ck } = check({ projects: [P('221309-001')], sources: [S], budgets: [B('221309-001', 2026, '当初予算', 1000, '1', '千円'), B('221309-001', 2026, '当初予算', 1000, '1', '千円')] });
  t('重複した記録を見つける', has(ck, 'error', /重複した記録/));
}
{
  const { ck } = check({ projects: [P('221309-001')], sources: [S], budgets: [B('221309-001', 2026, '決算', 1000, '1')] });
  t('まだ出ていない年度の決算を止める', has(ck, 'error', /まだ公表されていない/));
}
{
  const { ck } = check({ projects: [P('221309-001')], sources: [S], budgets: [B('221309-001', 2026, '当初予算', 5000000, '5,000')], funds: [{ project_id: '221309-001', code: '221309', fy: 2026, stage: '当初予算', national: 3000000, pref: 0, national_pref: 0, bond: 0, other: 0, general: 3000000, source_id: '221309-S01', page: '1', verified: '確認済み', checked_date: '2026-10-28' }] });
  t('財源の合計が事業費をこえるのを止める', has(ck, 'error', /財源内訳の合計/));
}
{
  const { ck } = check({ projects: [P('221309-001'), P('221309-002')], sources: [S], budgets: [B('221309-001', 2026, '当初予算', 5000000, '5,000'), B('221309-002', 2026, '当初予算', 5000000, '5,000')] });
  t('同じページ・同じ金額の二重計上の疑いを知らせる', has(ck, 'warn', /二重計上/));
}
{
  const { ck } = check({ projects: [P('221309-001')], sources: [S], budgets: [B('221309-001', 2026, '当初予算', 1000, '1')], survey: [{ code: '221309', fy: 2026, stage: '当初予算', status: '該当事業なし', checked_date: '2026-10-28' }] });
  t('0円（該当なし）なのに記録があるのを止める', has(ck, 'error', /該当事業なし/));
}
{
  const { ck } = check({ projects: [P('221309-001')], sources: [S], budgets: [B('221309-001', 2015, '当初予算', 1000, '1')] });
  t('対象外の年度を止める', has(ck, 'error', /調査対象の年度ではありません/));
}
{
  const { ck } = check({ projects: [{ ...P('221309-001'), code: '999999' }] });
  t('マスタにない自治体コードを止める', has(ck, 'error', /自治体マスタにありません/));
}

{
  const { ck } = check({ projects: [{ ...P('221309-001', '①'), type: '4-協会運営' }] });
  t('分類と類型の食い違いを止める', has(ck, 'error', /類型「4-協会運営」と分類「①」が合いません/));
}
{
  const { ck } = check({ projects: [{ ...P('221309-001', '③'), type: '1-日本語' }, { ...P('221309-002', '①'), target: '外国人' }] });
  t('①の類型で一般事業の一部なら③でよい', !has(ck, 'error', /221309-001|類型「1-日本語」/));
  t('決まっていない対象者の範囲を止める', has(ck, 'error', /対象者の範囲「外国人」/));
}
{
  const { ck } = check({ projects: [{ ...P('221309-001', '保留'), check_status: '確認済み' }] });
  t('判定保留なのに確認済みを止める', has(ck, 'error', /判定保留の事業は確認状況を「要確認」/));
}
{
  const { ck } = check({ projects: [P('221309-001', '④')], sources: [S], budgets: [B('221309-001', 2026, '当初予算', 1000, '1', '千円', { portion_yen: 500 })] });
  t('④に部分の金額があれば③への分け直しを知らせる', has(ck, 'warn', /③（一般事業に含まれる外国人関連経費）の事業だけ/));
}
{
  const { ck } = check({ projects: [P('221309-001')], sources: [S], budgets: [B('221309-001', 2026, '当初予算', 12345000, '12,345')], survey: [{ code: '221309', fy: 2026, stage: '当初予算', status: '確認済み', checked_date: '2026-10-28', not_checked: '県サイトはcurlで取得できずブラウザで保存したPDFで確認' }] });
  t('公開する文章に作業メモ（道具・資料の取り方）があれば止める', has(ck, 'error', /調査の作業メモの言葉「curl」/));
}
{
  const { ck } = check({ projects: [{ ...P('221309-001'), note: '外部点検の指摘で追加', content: '翻訳ツールとAI通訳機を窓口に置く' }] });
  t('作業日誌は止め、事業の中身の言葉（翻訳ツール・AI）は止めない', has(ck, 'error', /外部点検/) && !has(ck, 'error', /「(翻訳ツール|AI)」/));
}

// ---------- 集計 ----------
{
  const { d } = check({
    projects: [P('221309-001', '①', '日本語教育'), P('221309-002', '②', '外国人相談'), P('221309-003', '③', '多言語対応'), P('221309-004', '③', '多言語対応'), P('221309-005', '④', 'その他'), P('221309-006', '①', '外国人相談'), P('221309-007', '⑤', 'その他'), P('221309-008', '保留', 'その他')],
    sources: [S],
    budgets: [
      B('221309-001', 2026, '当初予算', 10000000, '10,000'),
      B('221309-002', 2026, '当初予算', 20000000, '20,000', '千円', { page: '2' }),
      B('221309-003', 2026, '当初予算', 300000000, '300,000', '千円', { portion_yen: 1000000, page: '3' }),
      B('221309-004', 2026, '当初予算', 50000000, '50,000', '千円', { page: '4' }),
      B('221309-005', 2026, '当初予算', 7000000, '7,000', '千円', { page: '5' }),
      B('221309-006', 2026, '当初予算', 9000000, '9,000', '千円', { page: '6', verified: '要確認' }),
      B('221309-007', 2026, '当初予算', 4000000, '4,000', '千円', { page: '8' }),
      B('221309-008', 2026, '当初予算', 3000000, '3,000', '千円', { page: '9' }),
      B('221309-001', 2026, '決算', 0, '0'),
      B('221309-001', 2025, '当初予算', 8000000, '8,000', '千円', { page: '7' }),
    ],
    funds: [{ project_id: '221309-001', code: '221309', fy: 2026, stage: '当初予算', national: 5000000, general: 5000000, source_id: '221309-S01', page: '1', verified: '確認済み', checked_date: '2026-10-28' }],
    survey: [{ code: '221309', fy: 2026, stage: '当初予算', status: '確認済み', checked_date: '2026-10-28' }, { code: '221309', fy: 2025, stage: '当初予算', status: '確認済み', checked_date: '2026-10-28' }],
  }, 2026);
  const sum = aggregate(d);
  const c = sum['221309'][2026]['当初予算'];
  t('①②と③の分かった部分を基本集計に入れ、要確認は入れない', c.a === 31000000 && c.an === 3 && c.apend === 1);
  t('①と②と③を別々にも数える', c.d1 === 10000000 && c.d2 === 20000000 && c.d3 === 1000000 && c.n1 === 1 && c.n2 === 1 && c.n3 === 1);
  t('③で部分の金額が分からない事業は全体額を参考にするだけ', c.u3n === 1 && c.u3w === 50000000);
  t('④・⑤・判定保留は合計しない', c.c4n === 1 && c.c4w === 7000000 && c.n5 === 1 && c.hn === 1 && c.hw === 3000000);
  t('分野別の合計（③は部分の金額）', c.f['日本語教育'] === 10000000 && c.f['外国人相談'] === 20000000 && c.f['多言語対応'] === 1000000);
  t('財源の内訳と内訳不明', c.fd.national === 5000000 && c.fd.general === 5000000 && c.fd.unknown === 21000000);
  t('予算と決算を足さない', sum['221309'][2026]['決算'].a === 0 && c.a === 31000000);
  t('調査状況の行がない決算は「一部確認」', sum['221309'][2026]['決算'].st === '一部確認');
  t('記録のない年度は未調査', statusOf(sum, '221309', 2020, '当初予算', 2025) === '未調査');
  t('今年度の決算は決算未公表', statusOf(sum, '220001', 2026, '決算', 2025) === '決算未公表');
  t('未調査は値なし（0円にしない）', valueOf(null) === null);
  t('前年度比', Math.abs(metric('yoy', { sum, code: '221309', fy: 2026, stage: '当初予算', pop: null }) - (31000000 - 8000000) / 8000000) < 1e-9);
  t('外国人住民1人当たり', metric('perForeign', { sum, code: '221309', fy: 2026, stage: '当初予算', pop: { foreign: 1000, population: 100000 } }) === 31000);

  // 「この金額はどう計算した？」の内訳
  const bd = breakdown(d, '221309', 2026, '当初予算', c.a);
  t('内訳の足し算が集計と一致', bd.total === c.a && bd.inc.length === c.an && bd.ok);
  t('内訳：③は外国人関連の部分だけ・全体額は別', bd.t3 === 1000000 && bd.inc.filter(r => r.k === '③').length === 1 && bd.u3.length === 1 && bd.w3 === 50000000);
  const dd = { ...d, projects: d.projects.map(p => p.project_id === '221309-002' ? { ...p, included_in: '221309-001' } : p) };
  const cd = aggregate(dd)['221309'][2026]['当初予算'];
  t('ほかの事業に含まれる再掲は合計に入れない', cd.a === 11000000 && cd.rn === 1 && cd.rw === 20000000 && breakdown(dd, '221309', 2026, '当初予算', cd.a).dup.length === 1);
  t('内訳：④⑤・保留・要確認は合計に入れない', bd.c4.length === 1 && bd.ex.length === 1 && bd.hold.length === 1 && bd.pend.length === 1 && bd.inc.every(r => ['①', '②', '③'].includes(r.p.relation)));
  t('内訳：使い道の合計＝合計（重複なし）', bd.fields.reduce((s, g) => s + g.amount, 0) === bd.total && bd.fields[0].field === '外国人相談');
  t('内訳：財源が分からない分を自治体の負担にしない', bd.fund.general === 5000000 && bd.fund.unknown === 21000000);
  t('財源を確認できた割合', Math.abs(fundCoverage(c).rate - 10000000 / 31000000) < 1e-9);
  t('内訳：集計とちがえば点検で止まる', !breakdown(d, '221309', 2026, '当初予算', c.a + 1).ok);
  const bad = { ...d, budgets: d.budgets.map(b => b.project_id === '221309-001' && b.fy === 2026 && b.stage === '当初予算' ? { ...b, amount_yen: 1000000 } : b) };
  t('内訳：千円と円の取り違えを点検で見つける', breakdown(bad, '221309', 2026, '当初予算').checks.find(x => x.key === 'unit').ok === false);
  const twin = { ...d, budgets: [...d.budgets, B('221309-006', 2026, '当初予算', 10000000, '10,000', '千円', { page: '1' })].filter(b => !(b.project_id === '221309-006' && b.verified === '要確認')) };
  t('内訳：同じページ・同じ金額・同じ記載の二重計上を見つける', breakdown(twin, '221309', 2026, '当初予算').checks.find(x => x.key === 'parent').ok === false);
  const twin2 = { ...twin, budgets: twin.budgets.map(b => b.page === '1' && b.fy === 2026 && b.stage === '当初予算' ? { ...b, quote: b.project_id + 'の行' } : b) };
  t('内訳：記載がちがう同じ金額の行は別の事業として数える', breakdown(twin2, '221309', 2026, '当初予算').checks.find(x => x.key === 'parent').ok === true);

  // 使い道（10分類）の円グラフ（全国・都道府県・市区町村で同じ計算）
  t('使い道ごとの事業の数', c.fn['日本語教育'] === 1 && c.fn['外国人相談'] === 1 && c.fn['多言語対応'] === 1 && !c.fn['その他']);
  const ft = fieldTotals([c]);
  t('円グラフ：使い道の合計＝基本集計の合計', ft.total === c.a && ft.sum === c.a && ft.n === 1 && ft.an === 3);
  t('円グラフ：③は外国人関連の部分だけ・④⑤保留は入れない', ft.amount['多言語対応'] === 1000000 && ft.amount['その他'] === 0);
  t('円グラフ：金額が分からない事業と照らし合わせ中の行を数える（0円にしない）', ft.unknown === 1 && ft.pend === 1);
  const notYet = { st: '未調査', a: 5000000, an: 1, f: { その他: 5000000 }, fn: { その他: 1 } };
  const zero = { st: '該当事業なし', a: 0, an: 0, f: {}, fn: {} };
  const ft2 = fieldTotals([c, notYet, zero, null]);
  t('円グラフ：未調査の自治体は足さない・0円の自治体は別に数える', ft2.total === c.a && ft2.n === 1 && ft2.zero === 1);
  const sh = fieldShares(ft.amount);
  t('円グラフ：10分類すべてを金額の大きい順に並べ、0円の分類も残す', sh.length === 10 && sh[0].field === '外国人相談' && sh.every((r, i) => !i || sh[i - 1].amount >= r.amount) && sh.filter(r => !r.amount).length === 7);
  t('円グラフ：割合の合計が100%（小数第1位の丸めの誤差のみ）', Math.abs(sh.reduce((s, r) => s + r.share, 0) - 1) < 1e-9 && Math.abs(sh.reduce((s, r) => s + Number((r.share * 100).toFixed(1)), 0) - 100) <= 0.5);
  const d9 = { ...d, projects: [...d.projects, P('221309-009', '②', '生活支援')] };
  const c9 = aggregate(d9)['221309'][2026]['当初予算'];
  t('円グラフ：金額の記録がない①②③の事業も「金額が分からない事業」に数える', c9.xn === 1 && fieldTotals([c9]).unknown === 2 && breakdown(d9, '221309', 2026, '当初予算', c9.a).noAmt.length === 1 && c9.a === c.a);
}

// ---------- 一般会計に占める割合 ----------
t('兆・億・万の書き方', rawToYen('1兆2,345億6,789', '万円') === 1234567890000);
{
  const SG = { code: '221309', fy: 2026, stage: '当初予算', amount_yen: 400000000000, amount_raw: '400,000,000', unit_raw: '千円', source_id: '221309-S01', page: 'PDFの3ページ目', verified: '確認済み', checked_date: '2026-10-29' };
  const acc = (p, a) => ({ ...p, account: a });
  const { ck, d } = check({
    projects: [acc(P('221309-001', '①'), '一般会計'), acc(P('221309-002', '②', '外国人相談'), '特別会計'), acc(P('221309-003', '③', '多言語対応'), '一般会計'), acc(P('221309-004', '④', 'その他'), '')],
    sources: [S],
    budgets: [
      B('221309-001', 2026, '当初予算', 10000000, '10,000'),
      B('221309-002', 2026, '当初予算', 2000000, '2,000', '千円', { page: '2' }),
      B('221309-003', 2026, '当初予算', 300000000, '300,000', '千円', { portion_yen: 4000000, page: '3' }),
      B('221309-004', 2026, '当初予算', 7000000, '7,000', '千円', { page: '4' }),
    ],
    general: [SG],
    survey: [{ code: '221309', fy: 2026, stage: '当初予算', status: '確認済み', checked_date: '2026-10-29' }],
  });
  t('一般会計の総額の正しい行はエラーなし', ck.summary().error === 0);
  const c = aggregate(d)['221309'][2026]['当初予算'];
  t('分子は一般会計の事業だけ（特別会計は入れない・③は部分の金額）', c.a === 16000000 && c.g === 14000000 && c.sx === 2000000 && !c.gx);
  const gen = generalTotals(d.general);
  const r = ratioOf(c, gen['221309'][2026]['当初予算']);
  t('割合＝一般会計の事業の金額 ÷ 一般会計の総額', Math.abs(r.v - 14000000 / 400000000000) < 1e-15 && !r.partial);
  t('同じ年度・同じ段階の総額だけを使う（決算・ほかの年度の総額では割らない）', metric('ratio', { sum: aggregate(d), code: '221309', fy: 2026, stage: '決算', gen }) === null && metric('ratio', { sum: aggregate(d), code: '221309', fy: 2025, stage: '当初予算', gen }) === null);
  t('一般会計の総額が未確認なら割合を出さない', ratioOf(c, null).v === null && ratioOf(c, null).why === '一般会計の総額が未確認');
  t('要確認の総額は使わない', !generalTotals([{ ...SG, verified: '要確認' }])['221309']);
  t('未調査は割合を出さない（0%にしない）', ratioOf(null, 1e9).v === null);
  t('一部の資料だけ調べた自治体は「確認済み分の割合」', ratioOf({ ...c, st: '一部確認' }, 4e11).partial === true);
  t('関係する事業がない自治体は0%', ratioOf({ st: '該当事業なし', a: 0 }, 4e11).v === 0);
  const noAcc = aggregate({ ...d, projects: d.projects.map(p => p.project_id === '221309-001' ? { ...p, account: null } : p) })['221309'][2026]['当初予算'];
  t('会計が分からない事業があれば「算出不可」', noAcc.gx === 1 && ratioOf(noAcc, 4e11).v === null && ratioOf(noAcc, 4e11).why === '算出不可');
  const bd = breakdown(d, '221309', 2026, '当初予算', c.a);
  t('内訳：一般会計と特別会計の金額', bd.tg === 14000000 && bd.ts === 2000000 && bd.sp.length === 1 && bd.ux.length === 0);
  const { ck: ck2 } = check({ sources: [S, { ...S, source_id: '220001-S01', code: '220001' }], general: [{ ...SG, amount_yen: 400000000 }, { ...SG, code: '220001', source_id: '221309-S01' }] });
  t('一般会計の総額：単位の取り違えと、ほかの自治体の資料を止める', has(ck2, 'error', /総額（円）は/) && has(ck2, 'error', /別の自治体/));
  const { ck: ck3 } = check({ projects: [P('221309-009', '②')] });
  t('①②③の事業の会計が空欄なら知らせる', has(ck3, 'warn', /会計」が空欄/));
}

console.log(`テスト：${ok + ng}項目のうち 合格 ${ok}・不合格 ${ng}`);
process.exit(ng ? 1 : 0);
