// 集計の決まり（tools/build.mjs と画面の両方が使います）。基準は docs/分類と集計の基準.md
//
// ・合計に入れるのは「確認＝確認済み」の行だけ（要確認の行は入れない）
// ・基本集計（多文化共生関連予算）＝ ①外国人等への直接給付・支援 ＋ ②外国人対応の行政経費 ＋ ③一般事業のうち外国人関連部分の金額が資料で分かった分
//   ①と②は別々にも数える（d1・d2）。③は「うち外国人関連」の金額だけを足す（事業全体の金額は足さない）
// ・③で部分の金額が分からない事業・④関連事業・参考経費は、事業全体の金額を参考として別に数える（足さない）。⑤対象外と判定保留も足さない
// ・別枠（学校の教員の人件費、中国残留邦人等・引揚者などの援護）も足さず、事業の金額を参考として別に数える（bn・bw）
// ・予算（当初・補正後）と決算は足さない（段階ごとに別の数）
// ・都道府県と市区町村の合計は足さない（県から市町村への補助が二重に数えられるおそれがあるため）

import { FIELDS, betsuGroupOf } from './schema.js';
import { rawToYen } from './validate.js';

export const FUND_KEYS = ['national', 'pref', 'national_pref', 'bond', 'other', 'general'];
export const FUND_LABELS = {
  national: '国からの補助（国庫支出金）', pref: '都道府県からの補助（都道府県支出金）', national_pref: '国・都道府県からの補助（区別なし）',
  bond: '地方債（借入れ）', other: 'その他（使用料・基金など）', general: '自治体自身のお金（一般財源）', unknown: '財源が分からない分',
};
export const COUNTED = new Set(['確認済み', '一部確認']);

// 基本集計に入れる金額（入れないときは null）。①②は事業の金額、③は「うち外国人関連」の金額だけ。
// ほかの事業の金額に含まれる事業（再掲。「金額が含まれる事業ID」がある）は、二重に数えないよう入れない
export function countedAmount(p, b) {
  if (!p || !b || b.verified !== '確認済み' || p.included_in) return null;
  if (p.relation === '①' || p.relation === '②') return b.amount_yen;
  if (p.relation === '③') return b.portion_yen ?? null;
  return null;
}

export function aggregate(d) {
  const projects = new Map(d.projects.map(p => [p.project_id, p]));
  const fundBy = new Map(d.funds.filter(f => f.verified === '確認済み').map(f => [`${f.project_id}|${f.fy}|${f.stage}`, f]));
  const recBy = new Map();
  for (const r of d.recipients) {
    if (r.verified !== '確認済み' || r.amount_yen === null) continue;
    const k = `${r.project_id}|${r.fy}|${r.stage}`;
    if (!recBy.has(k)) recBy.set(k, []);
    recBy.get(k).push(r);
  }
  const out = {};
  const cell = (code, fy, stage) => {
    out[code] ??= {};
    out[code][fy] ??= {};
    // g：基本集計のうち一般会計の事業の金額（一般会計に占める割合の分子）、sx・sxn：特別会計・企業会計の事業の金額と数（分子に入れない）、gx：会計が記録されていない事業の数
    // bn・bw：別枠の事業の数と金額（合計に入れない）
    return (out[code][fy][stage] ??= { st: null, a: 0, an: 0, d1: 0, n1: 0, d2: 0, n2: 0, d3: 0, n3: 0, u3n: 0, u3w: 0, c4n: 0, c4w: 0, n5: 0, hn: 0, hw: 0, rn: 0, rw: 0, bn: 0, bw: 0, pend: 0, apend: 0, f: {}, fn: {}, fd: null, tr: 0, rc: {}, g: 0, sx: 0, sxn: 0, gx: 0 });
  };
  for (const b of d.budgets) {
    const p = projects.get(b.project_id);
    if (!p) continue;
    const c = cell(b.code, b.fy, b.stage);
    if (b.verified !== '確認済み') { c.pend++; if (!p.included_in && (p.relation === '①' || p.relation === '②' || (p.relation === '③' && b.portion_yen !== null))) c.apend++; continue; }
    const k = `${b.project_id}|${b.fy}|${b.stage}`;
    const amt = countedAmount(p, b);
    if (amt !== null) {
      c.a += amt; c.an++;
      if (p.relation === '①') { c.d1 += amt; c.n1++; } else if (p.relation === '②') { c.d2 += amt; c.n2++; } else { c.d3 += amt; c.n3++; }
      c.f[p.field] = (c.f[p.field] || 0) + amt;
      c.fn[p.field] = (c.fn[p.field] || 0) + 1;
      if (p.account === '一般会計') c.g += amt; else if (p.account) { c.sx += amt; c.sxn++; } else c.gx++;
      c.fd ??= { national: 0, pref: 0, national_pref: 0, bond: 0, other: 0, general: 0, unknown: 0, cov: 0 };
      // 財源は①②の事業だけ（③は事業全体の財源なので、部分の金額には当てはめず「分からない分」にする）
      const f = p.relation !== '③' ? fundBy.get(k) : null;
      if (f) {
        let s = 0;
        for (const fk of FUND_KEYS) { c.fd[fk] += f[fk] || 0; s += f[fk] || 0; }
        c.fd.unknown += amt - s;
        c.fd.cov += amt;
      } else {
        c.fd.unknown += amt;
      }
      if (p.relation !== '③') for (const r of recBy.get(k) || []) {
        c.rc[r.recipient_type] = (c.rc[r.recipient_type] || 0) + r.amount_yen;
        if (r.recipient_type === '市区町村') c.tr += r.amount_yen;
      }
    } else if (p.included_in) { c.rn++; c.rw += b.amount_yen; }
    else if (p.relation === '③') { c.u3n++; c.u3w += b.amount_yen; }
    else if (p.relation === '④') { c.c4n++; c.c4w += b.amount_yen; }
    else if (p.relation === '⑤') c.n5++;
    else if (p.relation === '別枠') { c.bn++; c.bw += b.amount_yen; }
    else { c.hn++; c.hw += b.amount_yen; }
  }
  for (const s of d.survey) cell(s.code, s.fy, s.stage).st = s.status;
  // どの年度にも金額の記録がない①②③の事業（事業があることだけ分かっている）の数。その自治体のどの年度・段階でも「金額が分からない事業」として数える
  const hasBudget = new Set(d.budgets.map(b => b.project_id));
  const noAmt = {};
  for (const p of d.projects) if (['①', '②', '③'].includes(p.relation) && !p.included_in && !hasBudget.has(p.project_id)) noAmt[p.code] = (noAmt[p.code] || 0) + 1;
  for (const code of Object.keys(out)) for (const fy of Object.keys(out[code])) for (const stage of Object.keys(out[code][fy])) {
    const c = out[code][fy][stage];
    if (noAmt[code]) c.xn = noAmt[code];
    if (!c.st) c.st = '一部確認';
    // 基本集計に入る行が1つもないとき：調査状況が「確認済み」で要確認の行もなければ 0円（該当する事業なし）、それ以外は不明
    if (c.an === 0 && !(c.st === '確認済み' && c.apend === 0)) c.a = null;
    if (c.st === '該当事業なし') c.a = 0;
    if (!Object.keys(c.rc).length) delete c.rc;
    if (!c.tr) delete c.tr;
    if (!c.sx) { delete c.sx; delete c.sxn; }
    if (!c.gx) delete c.gx;
    if (!c.bn) { delete c.bn; delete c.bw; }
  }
  return out;
}

// 一般会計の予算総額（分母）を、自治体×年度×段階の表にする。確認済みの行だけ（要確認・未確認は使わない）
export function generalTotals(rows) {
  const out = {};
  for (const r of rows || []) {
    if (r.verified !== '確認済み' || !(r.amount_yen > 0)) continue;
    ((out[r.code] ??= {})[r.fy] ??= {})[r.stage] = r.amount_yen;
  }
  return out;
}

// 一般会計に占める割合（確認済みの多文化共生関連予算のうち一般会計の事業の金額 ÷ 同じ自治体・同じ年度・同じ段階の一般会計の予算総額）。
// 返す値：{ v：割合（0〜1。出せないときは null）, num：分子, den：分母, partial：一部の資料だけ調べた自治体（確認済み分の割合）, why：出せない理由 }
// ・分子は基本集計（①②③の分かった部分）のうち、会計が「一般会計」の事業だけ。特別会計・企業会計の事業は入れない
// ・会計が記録されていない事業が1つでもあれば、一般会計の分を分けられないので「算出不可」
// ・未調査・資料が見つからないなどの自治体は、分子が分からないので出さない（0%にしない）
// ・分母がない（一般会計の総額が未確認）なら出さない
export function ratioOf(c, den) {
  const st = c?.st;
  const v0 = valueOf(c);
  if (v0 === null) return { v: null, why: c ? (c.apend ? '確認中' : '予算額が分からない') : '未調査' };
  if (!(den > 0)) return { v: null, num: c.g ?? 0, why: '一般会計の総額が未確認' };
  if (c.gx) return { v: null, num: null, den, why: '算出不可' };
  const num = st === '該当事業なし' ? 0 : (c.g || 0);
  return { v: num / den, num, den, partial: st === '一部確認' };
}

// 調査状況（行がなければ未調査。まだ決算が出ない年度の決算は「決算未公表」）
export function statusOf(sum, code, fy, stage, settlementLatestFy) {
  const c = sum?.[code]?.[fy]?.[stage];
  if (c) return c.st;
  if (stage === '決算' && fy > settlementLatestFy) return '決算未公表';
  return '未調査';
}

export function cellOf(sum, code, fy, stage) {
  return sum?.[code]?.[fy]?.[stage] || null;
}

// 地図・ランキングに出す基本集計（多文化共生関連予算）。分からないときは null（0円と区別）
export function valueOf(c) {
  if (!c) return null;
  if (c.st === '該当事業なし') return 0;
  if (!COUNTED.has(c.st)) return null;
  return c.a;
}

// 前の年度との増減に使える集計か（主な資料を調査済み、または関係する事業なし）
export const comparableYoy = c => !!c && (c.st === '確認済み' || c.st === '該当事業なし');

// 指標の計算。pop は {population, foreign}（年度ごと）、gen は一般会計の予算総額の表（generalTotals の結果）
export function metric(mode, { sum, code, fy, stage, pop, includePartial, gen }) {
  const c = cellOf(sum, code, fy, stage);
  const ok = c && (c.st === '確認済み' || c.st === '該当事業なし' || (includePartial && c.st === '一部確認'));
  const v = ok ? valueOf(c) : null;
  if (mode === 'total') return v;
  if (mode === 'ratio') return ok ? ratioOf(c, gen?.[code]?.[fy]?.[stage]).v : null;
  if (mode === 'perForeign') return v !== null && pop?.foreign ? v / pop.foreign : null;
  if (mode === 'perCapita') return v !== null && pop?.population ? v / pop.population : null;
  // 増減は、両方の年度を主な資料で調査済みのときだけ出す。一部の資料だけ調べた年度があると、調べた範囲の差で増減が大きく見えるので、
  // includePartial（一部の資料だけ調べた自治体も含める）のときも比べない
  if (mode === 'yoy') {
    const p = cellOf(sum, code, fy - 1, stage);
    if (!comparableYoy(c) || !comparableYoy(p)) return null;
    const v1 = valueOf(c), pv = valueOf(p);
    if (v1 === null || pv === null || pv === 0) return null;
    return (v1 - pv) / pv;
  }
  return null;
}

export function fieldOrder(f) {
  return FIELDS.map(k => [k, f?.[k] || 0]).filter(([, v]) => v > 0);
}

// 使い道（10分類）ごとの金額を、いくつかの自治体×年度×段階の集計から足し合わせる（全国・都道府県・市区町村のどれも、この計算を使う）。
// ・足すのは基本集計の金額が分かる集計（valueOf が null でない＝主な資料を調査済み・一部の資料だけ調査・該当事業なし）だけ。
//   未調査・資料が見つからない・金額は非公表の自治体は足さない（0円とはみなさない）
// ・1つの事業は1つの使い道にだけ入っているので、使い道の金額を足すと基本集計の合計と同じになる（同じ金額を2つの使い道に数えない）
// ・同じ年度・同じ段階の集計だけを渡す（予算と決算、ほかの年度を混ぜない）
// 返す値：amount・count（使い道ごとの金額・事業の数）、total（合計）、sum（基本集計の合計。total と一致するはず）、
//   n（金額のある自治体の数）、zero（0円の自治体の数）、an（金額を確認できた事業の数）、
//   unknown（①②③のうち、この年度・段階の外国人関連の金額が分からない事業の数）、pend（照らし合わせ中の行の数）
export function fieldTotals(cells) {
  const amount = Object.fromEntries(FIELDS.map(f => [f, 0]));
  const count = Object.fromEntries(FIELDS.map(f => [f, 0]));
  const o = { amount, count, total: 0, sum: 0, n: 0, zero: 0, an: 0, unknown: 0, pend: 0 };
  for (const c of cells) {
    if (!c) continue;
    o.unknown += (c.u3n || 0) + (c.xn || 0);
    o.pend += c.apend || 0;
    const v = valueOf(c);
    if (v === null) continue;
    if (v === 0) { o.zero++; continue; }
    o.n++; o.sum += v; o.an += c.an || 0;
    for (const f of FIELDS) { amount[f] += c.f?.[f] || 0; count[f] += c.fn?.[f] || 0; }
  }
  o.total = FIELDS.reduce((s, f) => s + amount[f], 0);
  return o;
}

// 使い道の金額を、金額の大きい順に10分類すべて並べる（0円の分類も最後に並べる。同じ金額なら分類の決まった順）。
// share は合計に対する割合（0〜1）。合計が0なら0
export function fieldShares(amount) {
  const total = FIELDS.reduce((s, f) => s + (amount[f] || 0), 0);
  return FIELDS.map(f => ({ field: f, amount: amount[f] || 0, share: total ? (amount[f] || 0) / total : 0 }))
    .sort((a, b) => b.amount - a.amount || FIELDS.indexOf(a.field) - FIELDS.indexOf(b.field));
}

// 財源の内訳を確認できた金額と割合（財源が分からない分を自治体の負担とはみなさない）
export function fundCoverage(c) {
  if (!c?.fd || !c.a) return null;
  const known = c.a - c.fd.unknown;
  return { known, unknown: c.fd.unknown, rate: known / c.a };
}

// 1つの自治体・年度・段階の合計を、事業ごとに分けて示す（自治体のページの「この金額はどう計算した？」と、build の検算に使う）。
// d は projects・budgets・funds・recipients・sources を持つデータ（全国分でも都道府県分でもよい）。
// expected に集計（aggregate）の結果を渡すと、事業ごとの金額の足し算が集計と一致するかも確かめる。
// inc：基本集計に入れた行（k＝分類、amt＝数えた金額）。u3：③で部分の金額が分からない行。c4：④。ex：⑤。hold：判定保留。bk：別枠（wb＝その金額）。dup：ほかの事業に含まれる再掲。
export function breakdown(d, code, fy, stage, expected) {
  const byId = new Map(d.projects.filter(p => p.code === code).map(p => [p.project_id, p]));
  const src = new Map(d.sources.map(s => [s.source_id, s]));
  const fundBy = new Map(d.funds.filter(f => f.code === code && f.fy === fy && f.stage === stage && f.verified === '確認済み').map(f => [f.project_id, f]));
  const recBy = new Map();
  for (const r of d.recipients) if (r.code === code && r.fy === fy && r.stage === stage && r.verified === '確認済み' && r.amount_yen !== null && r.amount_yen !== undefined) {
    if (!recBy.has(r.project_id)) recBy.set(r.project_id, []);
    recBy.get(r.project_id).push(r);
  }
  const o = { inc: [], u3: [], c4: [], ex: [], hold: [], bk: [], dup: [], pend: [], noRow: [], noAmt: [], total: 0, t1: 0, t2: 0, t3: 0, w3: 0, w4: 0, wh: 0, wb: 0, wd: 0 };
  const seen = new Map();
  const dupIds = new Set();
  for (const b of d.budgets) {
    if (b.code !== code || b.fy !== fy || b.stage !== stage) continue;
    const p = byId.get(b.project_id);
    if (!p) continue;
    if (seen.has(p.project_id)) dupIds.add(p.project_id);
    seen.set(p.project_id, b);
    const s = src.get(b.source_id) || null;
    if (b.verified !== '確認済み') { o.pend.push({ p, b, s }); continue; }
    const amt = countedAmount(p, b);
    if (amt !== null) {
      const f = p.relation !== '③' ? fundBy.get(p.project_id) || null : null;
      o.inc.push({ p, b, s, k: p.relation, amt, f, recs: p.relation !== '③' ? recBy.get(p.project_id) || [] : [] });
      o.total += amt;
      if (p.relation === '①') o.t1 += amt; else if (p.relation === '②') o.t2 += amt; else o.t3 += amt;
    } else if (p.included_in) { o.dup.push({ p, b, s, host: byId.get(p.included_in) || null }); o.wd += b.amount_yen; }
    else if (p.relation === '③') { o.u3.push({ p, b, s }); o.w3 += b.amount_yen; }
    else if (p.relation === '④') { o.c4.push({ p, b, s }); o.w4 += b.amount_yen; }
    else if (p.relation === '⑤') o.ex.push({ p, b, s });
    else if (p.relation === '別枠') { o.bk.push({ p, b, s }); o.wb += b.amount_yen; }
    else { o.hold.push({ p, b, s }); o.wh += b.amount_yen; }
  }
  // 記録のない事業：どの年度にも金額の記録がない事業（事業があることだけ分かっている）は、③④⑤・保留ならそれぞれの一覧に、
  // ①②なら「金額の記録がない事業」に入れる。ほかの年度・段階にだけ記録がある事業は「この年度・段階の記録なし」に入れる
  const hasAny = new Set(d.budgets.filter(b => b.code === code).map(b => b.project_id));
  const listOf = { '③': o.u3, '④': o.c4, '⑤': o.ex, '別枠': o.bk, '保留': o.hold };
  for (const p of byId.values()) {
    if (seen.has(p.project_id)) continue;
    const r = { p, b: null, s: null };
    if (hasAny.has(p.project_id)) o.noRow.push(r);
    else if (p.included_in) o.dup.push({ ...r, host: byId.get(p.included_in) || null });
    else (listOf[p.relation] || o.noAmt).push(r);
  }
  const amtOf = x => x.b?.amount_yen ?? -1;
  for (const k of ['u3', 'c4', 'ex', 'hold', 'bk', 'dup', 'pend', 'noRow', 'noAmt']) o[k].sort((x, y) => amtOf(y) - amtOf(x));
  o.inc.sort((x, y) => y.amt - x.amt);

  // 使い道（分野）。1つの事業は1つの分野だけに入れる
  const fm = new Map();
  for (const r of o.inc) {
    if (!fm.has(r.p.field)) fm.set(r.p.field, { field: r.p.field, amount: 0, list: [] });
    const g = fm.get(r.p.field); g.amount += r.amt; g.list.push(r);
  }
  o.fields = [...fm.values()].sort((x, y) => y.amount - x.amount || FIELDS.indexOf(x.field) - FIELDS.indexOf(y.field));

  // 財源（その事業だけの財源が資料にある①②の事業だけ。③の部分の金額と、分からない分は「財源が分からない分」）
  const fd = { national: 0, pref: 0, national_pref: 0, bond: 0, other: 0, general: 0, unknown: 0 };
  for (const r of o.inc) {
    let s = 0;
    if (r.f) for (const k of FUND_KEYS) { fd[k] += r.f[k] || 0; s += r.f[k] || 0; }
    fd.unknown += r.amt - s;
  }
  o.fund = fd;

  // 会計（一般会計に占める割合の分子は一般会計の事業だけ）。sp：特別会計・企業会計の事業、ux：会計が記録されていない事業
  o.sp = o.inc.filter(r => r.p.account && r.p.account !== '一般会計');
  o.ux = o.inc.filter(r => !r.p.account);
  o.ts = o.sp.reduce((s, r) => s + r.amt, 0);
  o.tg = o.inc.filter(r => r.p.account === '一般会計').reduce((s, r) => s + r.amt, 0);

  // 点検（二重計上・計算ミス）
  const ok = (key, label, pass, detail) => ({ key, label, ok: pass, detail });
  const n = o.inc.length;
  const checks = [];
  const fieldSum = o.fields.reduce((s, g) => s + g.amount, 0);
  const sumOk = expected === undefined || expected === null ? fieldSum === o.total : (expected === o.total && fieldSum === o.total);
  checks.push(ok('sum', '事業ごとの金額の足し算と、表示している合計が一致する', sumOk,
    sumOk ? `${n}事業の金額を足すと ${o.total.toLocaleString()}円で、表示している合計と一致します（①${o.t1.toLocaleString()}円・②${o.t2.toLocaleString()}円・③の分かった部分${o.t3.toLocaleString()}円）。使い道（分野）ごとの金額の合計も同じです。`
      : `事業ごとの足し算 ${o.total.toLocaleString()}円・分野ごとの合計 ${fieldSum.toLocaleString()}円・集計 ${expected === undefined || expected === null ? '—' : expected.toLocaleString() + '円'} が一致しません。`));
  checks.push(ok('dup', '同じ事業を2回数えていない', dupIds.size === 0,
    dupIds.size ? `同じ事業IDの記録が2つあります：${[...dupIds].join('、')}` : `1つの事業は、1つの年度・段階につき1行だけ記録しています（同じ事業IDが2回入ると公開用データを作らない仕組みです）。${o.dup.length ? `ほかの事業の金額に含まれる再掲の${o.dup.length}件（${o.wd.toLocaleString()}円）は、二重に数えないよう足していません。` : ''}`));
  // 同じ資料・同じページ・同じ金額の行が2つあるとき、資料の記載（引用した行）も同じか空なら二重計上の疑い。
  // 記載がちがえば、資料の別々の行（たまたま同じ金額の別の事業）として数える
  const pageKey = new Map();
  const samePage = [];
  let sameAmountLines = 0;
  const qn = q => String(q || '').normalize('NFKC').replace(/\s/g, '');
  for (const r of o.inc) {
    const k = `${r.b.source_id}|${r.b.page}|${r.b.amount_yen}`;
    if (r.b.amount_yen > 0 && pageKey.has(k)) {
      const a = pageKey.get(k);
      if (!qn(a.b.quote) || !qn(r.b.quote) || qn(a.b.quote) === qn(r.b.quote)) samePage.push(`${a.p.name} と ${r.p.name}`); else sameAmountLines++;
    } else pageKey.set(k, r);
  }
  checks.push(ok('parent', '親事業とその内訳を両方数えていない', samePage.length === 0,
    samePage.length ? `同じ資料・同じページ・同じ金額で、資料の記載も同じ記録があります（${samePage.join('／')}）。`
      : `同じ資料の同じページに、同じ記載・同じ金額の記録が2つないことを、プログラムで確かめました。${sameAmountLines ? `同じページに同じ金額の事業が${sameAmountLines}組ありますが、資料の別々の行（記載がちがう事業）です。` : ''}予算書のまとまり（款・項・目）の金額と、その中の事業の金額を両方入れていないかは、調査のときに資料で確かめています。`));
  const badUnit = o.inc.filter(r => rawToYen(r.b.amount_raw, r.b.unit_raw) !== r.b.amount_yen);
  const units = {};
  for (const r of o.inc) units[r.b.unit_raw] = (units[r.b.unit_raw] || 0) + 1;
  checks.push(ok('unit', '円・千円・万円の換算が合っている', badUnit.length === 0,
    badUnit.length ? `資料の数字と単位から計算した円と合わない事業：${badUnit.map(r => r.p.name).join('、')}`
      : `${n}事業すべて、資料に書かれた数字と単位（${Object.entries(units).map(([u, c]) => `${u} ${c}事業`).join('・')}）から計算した円の金額と一致します。`));
  const older = o.inc.filter(r => r.s?.fy && r.s.fy < fy);
  const later = o.inc.filter(r => r.s?.fy && r.s.fy > fy);
  checks.push(ok('year', 'ほかの年度・段階の金額が混ざっていない', older.length === 0,
    older.length ? `対象年度より前の資料から取った金額があります：${older.map(r => r.p.name).join('、')}`
      : `合計に入れた金額はすべて${fy}年度の${stage}の金額です。${later.length ? `そのうち${later.length}事業は、次の年度の資料にある「前年度」の欄から取りました。` : ''}予算と決算、当初予算と補正後の予算は足していません。`));
  const k3 = o.inc.filter(r => r.k === '③');
  checks.push(ok('whole', '一般事業や関連事業の全体の金額を足していない', k3.every(r => r.amt <= r.b.amount_yen),
    `${k3.length ? `③一般事業のうち、外国人関連の部分の金額が資料で分かった${k3.length}件は、その部分（${o.t3.toLocaleString()}円）だけを足しています。` : ''}${o.u3.length ? `③で部分の金額が分からない${o.u3.length}件（事業全体 ${o.w3.toLocaleString()}円）` : ''}${o.u3.length && o.c4.length ? 'と、' : ''}${o.c4.length ? `④関連事業・参考経費${o.c4.length}件（事業全体 ${o.w4.toLocaleString()}円）` : ''}${o.u3.length || o.c4.length ? 'は、参考として示すだけで足していません。' : ''}${!k3.length && !o.u3.length && !o.c4.length ? '一般事業・関連事業は、この年度・段階には登録されていません。' : ''}人口の割合などで按分した金額は使っていません。`));
  const overFund = o.inc.filter(r => r.f && FUND_KEYS.reduce((s, k) => s + (r.f[k] || 0), 0) > r.b.amount_yen);
  const toMuni = o.inc.flatMap(r => r.recs.filter(x => x.recipient_type === '市区町村'));
  checks.push(ok('subsidy', '国・都道府県の補助金を二重に数えていない', overFund.length === 0,
    overFund.length ? `財源の合計が事業の金額をこえる事業があります：${overFund.map(r => r.p.name).join('、')}`
      : `国や都道府県からの補助金は、事業の金額の「財源の内訳」として示すだけで、事業の金額に上乗せしていません。${toMuni.length ? `都道府県から市区町村への補助（${toMuni.reduce((s, x) => s + x.amount_yen, 0).toLocaleString()}円）は市区町村の予算にも出てくるので、都道府県と市区町村の合計は足しません。` : '都道府県と市区町村の合計は足しません。'}`));
  const notIn = o.inc.filter(r => !['①', '②', '③'].includes(r.p.relation) || r.b.verified !== '確認済み' || (r.p.relation === '③' && (r.b.portion_yen === null || r.b.portion_yen === undefined)));
  checks.push(ok('scope', '基本集計の対象ではない金額が混ざっていない', notIn.length === 0,
    `基本集計に入れたのは、①②の事業の金額と③の外国人関連部分の金額で、資料の該当ページで金額を照らし合わせた行だけです。${[
      o.u3.length ? `③で部分の金額が分からない ${o.u3.length}件` : '',
      o.c4.length ? `④関連事業・参考経費 ${o.c4.length}件` : '',
      o.ex.length ? `⑤対象外 ${o.ex.length}件` : '',
      o.hold.length ? `判定保留 ${o.hold.length}件` : '',
      o.bk.length ? `別枠（${[...new Set(o.bk.map(r => betsuGroupOf(r.p.type).label))].join('・')}）${o.bk.length}件` : '',
      o.dup.length ? `ほかの事業に含まれる再掲 ${o.dup.length}件` : '',
      o.pend.length ? `照らし合わせ中（要確認）の ${o.pend.length}行` : '',
    ].filter(Boolean).join('・') || '対象外の事業はありません'}${o.u3.length || o.c4.length || o.ex.length || o.hold.length || o.bk.length || o.dup.length || o.pend.length ? 'は入れていません。' : '。'}`));
  o.checks = checks;
  o.ok = checks.every(c => c.ok);
  return o;
}
