// データの点検（形式・重複・つながり・金額と財源の整合性）
// tools/build.mjs が使います（公開用データを作る前の点検）。
//
// 結果の level
//   error … 公開用データを作らない（直すまで止める）
//   warn  … 公開はするが、確かめてほしいこと
//   info  … お知らせ（要確認の行は合計に入れない、など）

import { TABLES, UNITS, TARGETS, INTERNAL_WORDS, headerMap, typeFits } from './schema.js';

const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const isUrl = s => /^https?:\/\/\S+$/.test(s);

export function normName(s) {
  return String(s || '').normalize('NFKC').replace(/[\s　・･()（）「」【】\[\]〔〕、,。.\-－ー―‐]/g, '').toLowerCase();
}

// 「12,345」「△1,000」などを数にする（△・▲はマイナス）
export function parseRaw(s) {
  const t = String(s || '').normalize('NFKC').replace(/[,\s]/g, '').replace(/円$/, '');
  const neg = /^[△▲-]/.test(t);
  const n = Number(t.replace(/^[△▲-]/, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

// 資料の数字と単位から円を出す。「1億360万円」のように数字の中に億・万があるときは、その書き方どおりに読む
// （「1億5,030」と単位「万円」のように、最後の数字に単位が書かれていないときは、その数字を単位の数とみなす）
export function rawToYen(raw, unit) {
  const t = String(raw || '').normalize('NFKC').replace(/[,\s]/g, '').replace(/円$/, '');
  if (/[兆億万]/.test(t)) {
    const m = t.match(/^(?:([\d.]+)兆)?(?:([\d.]+)億)?(?:([\d.]+)万)?(?:([\d.]+)千)?(\d+)?$/);
    if (!m) return null;
    const [, cho, oku, man, sen, rest] = m;
    const restUnit = man || sen ? 1 : (UNITS[unit] || 1);
    return Math.round((Number(cho || 0) * 1e12) + (Number(oku || 0) * 1e8) + (Number(man || 0) * 1e4) + (Number(sen || 0) * 1e3) + Number(rest || 0) * restUnit);
  }
  const n = parseRaw(t);
  return n === null || !UNITS[unit] ? null : Math.round(n * UNITS[unit]);
}

export class Checker {
  constructor({ codes, years }) {
    this.codes = codes;            // Map 自治体コード → {name, pref, kind}
    this.years = new Set(years);
    this.issues = [];
  }
  add(level, table, rec, msg) {
    this.issues.push({ level, table, file: rec?._file || '', line: rec?._line || 0, msg });
  }

  // 1つの表の CSV（見出しと行）を、型をそろえた記録にする
  normalize(table, header, records, file) {
    const spec = TABLES[table];
    const hm = headerMap(table);
    const out = [];
    const missing = spec.cols.filter(c => c.required && !header.some(h => hm.get(h) === c));
    for (const c of missing) this.add('error', table, { _file: file, _line: 1 }, `必ず必要な列「${c.label}」がありません`);
    for (const h of header) if (!hm.has(h)) this.add('warn', table, { _file: file, _line: 1 }, `知らない列「${h}」は読み飛ばします`);
    if (missing.length) return out;
    for (const r of records) {
      const o = { _file: file, _line: r._line };
      let bad = false;
      if (r._extra?.length) this.add('error', table, o, `列の数が見出しより多い行です（「,」を含む文は " で囲んでください）`);
      for (const h of header) {
        const c = hm.get(h);
        if (!c) continue;
        const v = String(r[h] ?? '').trim();
        if (v === '') {
          if (c.required) { this.add('error', table, o, `「${c.label}」が空欄です`); bad = true; }
          o[c.key] = null;
          continue;
        }
        const val = this.cast(table, o, c, v);
        if (val === undefined) bad = true; else o[c.key] = val;
        // 公開する文章に作業メモが混ざっていないか（CSV もサイトも誰でも見られる）
        if (c.type === 'text') {
          const w = v.match(INTERNAL_WORDS);
          if (w) this.add('error', table, o, `「${c.label}」に調査の作業メモの言葉「${w[0]}」があります。公開する文章には調査結果・根拠・未確認の範囲だけを書き、作業メモはリポジトリの外の非公開フォルダに書いてください`);
        }
      }
      for (const c of spec.cols) if (!(c.key in o)) o[c.key] = null;
      if (!bad) out.push(o);
    }
    return out;
  }

  cast(table, o, c, v) {
    switch (c.type) {
      case 'int': {
        const s = v.normalize('NFKC').replace(/[,\s]/g, '');
        if (!/^\d+$/.test(s)) { this.add('error', table, o, `「${c.label}」は0以上の整数（円）で書いてください：${v}`); return undefined; }
        return Number(s);
      }
      case 'year': {
        const n = Number(v);
        if (!Number.isInteger(n)) { this.add('error', table, o, `「${c.label}」は西暦4桁で書いてください：${v}`); return undefined; }
        if (!this.years.has(n)) { this.add('error', table, o, `「${c.label}」${n} は調査対象の年度ではありません（data/config.json の years に追加してください）`); return undefined; }
        return n;
      }
      case 'date':
        if (!isDate(v)) { this.add('error', table, o, `「${c.label}」は 2026-02-13 の形で書いてください：${v}`); return undefined; }
        return v;
      case 'url':
        if (!isUrl(v)) { this.add('error', table, o, `「${c.label}」は http:// か https:// で始まるURLにしてください：${v}`); return undefined; }
        return v;
      case 'code': {
        const s = v.padStart(6, '0');
        if (!this.codes.has(s)) { this.add('error', table, o, `自治体コード ${v} は自治体マスタにありません（6桁の全国地方公共団体コード）`); return undefined; }
        return s;
      }
      case 'enum':
        if (!c.values.includes(v)) { this.add('error', table, o, `「${c.label}」は ${c.values.join('・')} のどれかにしてください：${v}`); return undefined; }
        return v;
      case 'id':
        if (c.pattern && !c.pattern.test(v)) { this.add('error', table, o, `「${c.label}」の形が違います：${v}（${c.hint || ''}）`); return undefined; }
        return v;
      default:
        return v;
    }
  }

  // 表をまたいだ点検
  crossCheck(d, { settlementLatestFy }) {
    const projects = new Map();
    const dupKey = (table, list, keyCols) => {
      const seen = new Map();
      const kept = [];
      for (const r of list) {
        const k = keyCols.map(c => r[c]).join('|');
        if (seen.has(k)) {
          const p = seen.get(k);
          this.add('error', table, r, `重複した記録です（${keyCols.map(c => TABLES[table].cols.find(x => x.key === c).label).join('・')}が同じ：${k}）。先の記録 ${p._file} ${p._line}行目`);
          continue;
        }
        seen.set(k, r); kept.push(r);
      }
      return kept;
    };
    for (const t of Object.keys(TABLES)) if (TABLES[t].key && d[t]) d[t] = dupKey(t, d[t], TABLES[t].key);

    for (const p of d.projects) {
      projects.set(p.project_id, p);
      if (p.project_id.slice(0, 6) !== p.code) this.add('error', 'projects', p, `事業ID ${p.project_id} の先頭6桁が自治体コード ${p.code} と違います`);
    }
    for (const p of d.projects) {
      if (p.predecessor && !projects.has(p.predecessor)) this.add('warn', 'projects', p, `前身の事業ID ${p.predecessor} が事業マスタにありません`);
      if (p.predecessor === p.project_id) this.add('error', 'projects', p, '前身の事業IDが自分自身です');
      if (p.included_in) {
        const host = projects.get(p.included_in);
        if (!host) this.add('error', 'projects', p, `金額が含まれる事業ID ${p.included_in} が事業マスタにありません`);
        else if (host.code !== p.code || p.included_in === p.project_id) this.add('error', 'projects', p, `金額が含まれる事業ID ${p.included_in} は、同じ自治体の別の事業にしてください`);
        else if (host.included_in) this.add('error', 'projects', p, `金額が含まれる事業 ${p.included_in} も、さらに別の事業に含まれています（含まれる先は1段にしてください）`);
      }
      // 分類と類型・対象者の範囲・確認状況の整合性
      if (p.type && !typeFits(p.type, p.relation))
        this.add('error', 'projects', p, `類型「${p.type}」と分類「${p.relation}」が合いません（①②の類型は独立した金額なら①②、一般事業の一部なら③。④⑤の類型はそのまま④⑤）`);
      const tg = String(p.target || '').split(/[;；]/).map(s => s.trim()).filter(Boolean);
      for (const t of tg) if (!TARGETS.includes(t)) this.add('error', 'projects', p, `対象者の範囲「${t}」は ${TARGETS.join('・')} のどれかにしてください`);
      if ((p.relation === '保留') !== (p.check_status === '要確認'))
        this.add('error', 'projects', p, '判定保留の事業は確認状況を「要確認」に、「要確認」の事業は分類を「保留」にしてください');
      if (p.relation === '④' && p.check_status === '確認済み')
        this.add('warn', 'projects', p, '④（関連事業・参考経費）は、外国人関連の部分の金額が分からない事業なので、ふつう確認状況は「一部確認済み」です');
      if (['①', '②', '③'].includes(p.relation) && !p.account)
        this.add('warn', 'projects', p, '①②③の事業の「会計」が空欄です（一般会計・特別会計・企業会計）。空欄の事業がある年度は、一般会計に占める割合を「算出不可」として出しません');
    }
    // 名前がほぼ同じ別IDの事業（同じ事業の重複登録の疑い）
    const byName = new Map();
    for (const p of d.projects) {
      const k = p.code + '|' + normName(p.name);
      if (byName.has(k)) this.add('warn', 'projects', p, `同じ自治体に同じ名前の事業があります（${byName.get(k).project_id}）。同じ事業なら1つの事業IDにまとめてください`);
      else byName.set(k, p);
    }

    const sources = new Map(d.sources.map(s => [s.source_id, s]));
    for (const s of d.sources) {
      if (s.source_id.slice(0, 6) !== s.code) this.add('warn', 'sources', s, `出典ID ${s.source_id} の先頭6桁が自治体コード ${s.code} と違います`);
      if (s.published_date && s.accessed_date && s.published_date > s.accessed_date) this.add('warn', 'sources', s, '公表日が最終確認日より後になっています');
    }

    const checkRef = (table, r) => {
      const p = projects.get(r.project_id);
      if (!p) { this.add('error', table, r, `事業ID ${r.project_id} が事業マスタにありません`); return null; }
      if (p.code !== r.code) this.add('error', table, r, `自治体コード ${r.code} が事業マスタ（${p.code}）と違います`);
      if (r.source_id && !sources.has(r.source_id)) this.add('error', table, r, `出典ID ${r.source_id} が出典資料にありません`);
      const s = sources.get(r.source_id);
      if (s && s.code !== r.code && !(this.codes.get(s.code)?.kind === '都道府県' && s.code.slice(0, 2) === r.code.slice(0, 2)))
        this.add('warn', table, r, `出典 ${r.source_id} は別の自治体（${s.code}）の資料です`);
      if (r.stage === '決算' && r.fy > settlementLatestFy) this.add('error', table, r, `${r.fy}年度の決算はまだ公表されていない年度です（config.json の settlement_latest_fy）`);
      return p;
    };

    // 予算・決算
    const budgetByKey = new Map();
    const sameCite = new Map();
    for (const b of d.budgets) {
      const p = checkRef('budgets', b);
      const k = `${b.project_id}|${b.fy}|${b.stage}`;
      budgetByKey.set(k, b);
      // 資料の数字×単位＝円の金額か（転記ミスの点検）
      const ry = rawToYen(b.amount_raw, b.unit_raw);
      if (ry === null) this.add('error', 'budgets', b, `「資料の数字」を数として読めません：${b.amount_raw}`);
      else if (ry !== b.amount_yen)
        this.add('error', 'budgets', b, `資料の数字 ${b.amount_raw}（${b.unit_raw}）を円にすると ${ry.toLocaleString()}円ですが、金額（円）は ${b.amount_yen.toLocaleString()}円です`);
      if (p && b.portion_yen !== null) {
        if (p.relation !== '③' && b.portion_yen !== b.amount_yen) this.add('warn', 'budgets', b, '「うち外国人関連」は③（一般事業に含まれる外国人関連経費）の事業だけに使います（④の事業で部分の金額が分かったら③に分け直す）');
        if (b.portion_yen > b.amount_yen) this.add('error', 'budgets', b, '「うち外国人関連」が事業の金額より大きくなっています');
      }
      if (b.foreign_only_yen !== null && b.foreign_only_yen > (b.portion_yen ?? b.amount_yen))
        this.add('error', 'budgets', b, '「うち外国籍の人だけへの支出」が、事業の金額（③は外国人関連の部分）より大きくなっています');
      if (b.verified === '要確認') this.add('info', 'budgets', b, `要確認の行は合計に入れていません（${b.project_id} ${b.fy}年度 ${b.stage}）`);
      // 同じ資料の同じページ・同じ金額を、別の事業に入れていないか（二重計上の疑い）
      const ck = `${b.code}|${b.fy}|${b.stage}|${b.source_id}|${b.page}|${b.amount_yen}`;
      if (sameCite.has(ck) && sameCite.get(ck).project_id !== b.project_id && b.amount_yen > 0)
        this.add('warn', 'budgets', b, `同じ資料・同じページ・同じ金額の記録が別の事業（${sameCite.get(ck).project_id}）にもあります。二重計上になっていないか確かめてください`);
      else sameCite.set(ck, b);
    }
    // 予算と決算が逆転・極端な差（転記ミスの手がかり）
    for (const b of d.budgets) {
      if (b.stage !== '決算') continue;
      const ini = budgetByKey.get(`${b.project_id}|${b.fy}|当初予算`);
      if (ini && ini.amount_yen > 0 && (b.amount_yen > ini.amount_yen * 3 || b.amount_yen * 10 < ini.amount_yen))
        this.add('warn', 'budgets', b, `決算額が当初予算額と大きく違います（当初 ${ini.amount_yen.toLocaleString()}円、決算 ${b.amount_yen.toLocaleString()}円）。単位を確かめてください`);
    }
    // 前の年度と1000倍前後違う（千円と円の取り違えの手がかり）
    const byProj = new Map();
    for (const b of d.budgets) {
      const k = b.project_id + '|' + b.stage;
      if (!byProj.has(k)) byProj.set(k, []);
      byProj.get(k).push(b);
    }
    for (const list of byProj.values()) {
      list.sort((a, b) => a.fy - b.fy);
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1].amount_yen, c = list[i].amount_yen;
        if (a > 0 && c > 0 && (c / a > 300 || a / c > 300))
          this.add('warn', 'budgets', list[i], `前の年度（${list[i - 1].fy}年度）と300倍以上違います。単位（円・千円）を確かめてください`);
      }
    }

    // 財源内訳
    for (const f of d.funds) {
      checkRef('funds', f);
      const b = budgetByKey.get(`${f.project_id}|${f.fy}|${f.stage}`);
      if (!b) { this.add('error', 'funds', f, `同じ事業・年度・段階の予算・決算の記録がありません（${f.project_id} ${f.fy} ${f.stage}）`); continue; }
      const parts = ['national', 'pref', 'national_pref', 'bond', 'other', 'general'].map(k => f[k]);
      if (parts.every(v => v === null)) { this.add('error', 'funds', f, '財源の金額が1つも書かれていません'); continue; }
      const sum = parts.reduce((s, v) => s + (v || 0), 0);
      if (sum > b.amount_yen) this.add('error', 'funds', f, `財源内訳の合計 ${sum.toLocaleString()}円が、事業の金額 ${b.amount_yen.toLocaleString()}円より大きくなっています`);
      else if (sum !== b.amount_yen && parts.every(v => v !== null)) this.add('error', 'funds', f, `財源内訳の合計 ${sum.toLocaleString()}円が、事業の金額 ${b.amount_yen.toLocaleString()}円と合いません`);
      else if (sum !== b.amount_yen) this.add('warn', 'funds', f, `財源内訳の合計 ${sum.toLocaleString()}円が事業の金額 ${b.amount_yen.toLocaleString()}円より少なく、空欄の財源があります（空欄は「不明」として表示）`);
      if (f.national_pref !== null && (f.national !== null || f.pref !== null)) this.add('warn', 'funds', f, '「国・県支出金（区別なし）」と「国庫支出金」「都道府県支出金」の両方に書かれています');
      if (f.pref !== null && this.codes.get(f.code)?.kind === '都道府県') this.add('warn', 'funds', f, '都道府県の事業に「都道府県支出金」が書かれています');
    }

    // 支払先
    const recSum = new Map();
    for (const r of d.recipients) {
      checkRef('recipients', r);
      const b = budgetByKey.get(`${r.project_id}|${r.fy}|${r.stage}`);
      if (!b) { this.add('error', 'recipients', r, `同じ事業・年度・段階の予算・決算の記録がありません（${r.project_id} ${r.fy} ${r.stage}）`); continue; }
      if (r.amount_yen !== null && r.amount_raw && r.unit_raw) {
        const ry = rawToYen(r.amount_raw, r.unit_raw);
        if (ry !== null && ry !== r.amount_yen)
          this.add('error', 'recipients', r, `資料の数字 ${r.amount_raw}${r.unit_raw} と金額（円）${r.amount_yen.toLocaleString()}円が合いません`);
      }
      const k = `${r.project_id}|${r.fy}|${r.stage}`;
      recSum.set(k, (recSum.get(k) || 0) + (r.amount_yen || 0));
      if (recSum.get(k) > b.amount_yen) this.add('warn', 'recipients', r, `支払先の金額の合計が、事業の金額 ${b.amount_yen.toLocaleString()}円をこえています`);
    }

    // 一般会計の予算総額（一般会計に占める割合の分母）
    for (const g of d.general || []) {
      if (g.source_id && !sources.has(g.source_id)) this.add('error', 'general', g, `出典ID ${g.source_id} が出典資料にありません`);
      const s = sources.get(g.source_id);
      if (s && s.code !== g.code) this.add('error', 'general', g, `出典 ${g.source_id} は別の自治体（${s.code}）の資料です。一般会計の総額は、その自治体自身の資料から写してください`);
      if (s && s.fy && s.fy !== g.fy) this.add('warn', 'general', g, `出典 ${g.source_id} は${s.fy}年度の資料です（総額は${g.fy}年度）`);
      if (g.stage === '決算' && g.fy > settlementLatestFy) this.add('error', 'general', g, `${g.fy}年度の決算はまだ公表されていない年度です`);
      const ry = rawToYen(g.amount_raw, g.unit_raw);
      if (ry === null) this.add('error', 'general', g, `「資料の数字」を数として読めません：${g.amount_raw}`);
      else if (ry !== g.amount_yen) this.add('error', 'general', g, `資料の数字 ${g.amount_raw}（${g.unit_raw}）を円にすると ${ry.toLocaleString()}円ですが、総額（円）は ${g.amount_yen.toLocaleString()}円です`);
      if (!(g.amount_yen > 0)) this.add('error', 'general', g, '一般会計の総額が0円です');
      if (g.verified === '要確認') this.add('info', 'general', g, `要確認の一般会計の総額は割合の計算に使いません（${g.code} ${g.fy}年度 ${g.stage}）`);
    }

    // 調査状況
    const surveyKey = new Set();
    for (const s of d.survey) {
      surveyKey.add(`${s.code}|${s.fy}|${s.stage}`);
      const rows = d.budgets.filter(b => b.code === s.code && b.fy === s.fy && b.stage === s.stage);
      if (s.status === '該当事業なし' && rows.length) this.add('error', 'survey', s, '「該当事業なし（0円）」なのに、予算・決算の記録があります');
      if ((s.status === '確認済み' || s.status === '一部確認') && !rows.some(b => b.verified === '確認済み'))
        this.add('warn', 'survey', s, `「${s.status}」ですが、確認済みの予算・決算の記録がありません`);
      if (s.status === '決算未公表' && s.stage !== '決算') this.add('error', 'survey', s, '「決算未公表」は段階が「決算」の行だけに使います');
      if (s.stage === '決算' && s.fy > settlementLatestFy && s.status !== '決算未公表') this.add('error', 'survey', s, `${s.fy}年度の決算はまだ公表されていない年度です`);
      for (const sid of String(s.source_ids || '').split(/[;；\s]+/).filter(Boolean))
        if (!sources.has(sid)) this.add('warn', 'survey', s, `使った出典ID ${sid} が出典資料にありません`);
    }
    const warned = new Set();
    for (const b of d.budgets) {
      const k = `${b.code}|${b.fy}|${b.stage}`;
      if (!surveyKey.has(k) && !warned.has(k)) {
        warned.add(k);
        this.add('warn', 'budgets', b, `${b.code} の ${b.fy}年度 ${b.stage} の調査状況の行がありません（「一部確認」として表示します）`);
      }
    }
    for (const n of d.notes || []) {
      if (n.from_fy && n.to_fy && n.from_fy > n.to_fy) this.add('error', 'notes', n, '対象年度（から）が（まで）より後です');
      if (n.project_id) {
        const p = projects.get(n.project_id);
        if (!p) this.add('error', 'notes', n, `対象の事業ID ${n.project_id} が事業マスタにありません`);
        else if (p.code !== n.code) this.add('error', 'notes', n, `対象の事業ID ${n.project_id} はほかの自治体の事業です`);
        if (n.kind !== '比べるときの注意') this.add('warn', 'notes', n, '対象の事業IDは、種類が「比べるときの注意」の注記でだけ使います');
      }
    }
    return d;
  }

  summary() {
    const c = { error: 0, warn: 0, info: 0 };
    for (const i of this.issues) c[i.level]++;
    return c;
  }
}
