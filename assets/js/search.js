// 事業名・キーワードで探すときの決まり（入力の読み取り・当てはまりの判定・並べ替え・文字の強調）。画面は page-search.js
//
// 1. 入力を言葉に分ける。チラシの題名をそのまま入れても探せるよう、資料に見つからない言葉は
//    「自治体名＋残り」に分けたり、「外国人のための」「無料」「〜会」などを外したりする
// 2. 全部の言葉が載っている事業を「そのまま載っている事業」にする
// 3. 言葉を近い言葉に広げて当てはまる事業を「近い言葉の事業」として分けて出す（自治体名は広げない）

import { normQ, esc } from './util.js';

// 探す場所ごとの重み（事業名に載っている事業を上に出す）
const WEIGHTS = [['name', 10], ['content', 5], ['field', 4], ['purpose', 3], ['extra', 2], ['dept', 1], ['muni', 1]];

// 区切りとして扱う文字
const SPLIT = /[\s,、。・/|]+/;
// これだけ単独で入っていたら探す言葉にしない（ほかの言葉があるときだけ）
const STOP_TOKEN = /^(無料|外国人|外国籍|事業|予算|費用|金額|お金|いくら|開催|ちらし|\d{1,4}年?度?)$/;
// チラシの題名につきやすく、資料には載らない言葉（資料に見つからない言葉からだけ外す）
const FLYER_WORDS = /20\d\d年?度?|令和\d+年?度?|第\d+回|\d+月\d+日|外国人のための|外国人向けの?|外国人の方へ?|外国籍の方へ?|外国人の|外国人|外国籍|在住|無料|のご案内|ご案内|のお知らせ|お知らせ|開催/g;
// 言葉の後ろについても意味が変わらないもの
const TAIL = /(相談会|大会|講座|事業費|事業|補助金|の会|会)$/;

// 近い言葉。左の言葉を含む入力を、右の言葉にも広げる
const NEAR = [
  [['法律', '弁護士', '行政書士', '司法書士', '在留資格', 'ビザ', '入管', '労災', '離婚'], ['法律', '弁護士', '行政書士', '専門相談', '在留', '相談']],
  [['相談', '窓口', 'ワンストップ', 'ホットライン'], ['相談', '窓口', 'ワンストップ']],
  [['通訳', '翻訳', '多言語', 'タブレット'], ['通訳', '翻訳', '多言語']],
  [['日本語', 'にほんご', '識字', '夜間中学', '夜間学級'], ['日本語', '識字', '夜間']],
  [['子ども', '子供', 'こども', '児童', '生徒', '学習支援', '学校', '外国につながる', '外国ルーツ', '就学', '進学', '帰国'], ['子ども', '子供', 'こども', '児童', '生徒', '学習支援', '就学', '外国につながる', '外国ルーツ']],
  [['保育', '子育て', '母子', '妊婦', '妊産婦', '乳幼児', '健診'], ['保育', '子育て', '母子', '妊産婦', '乳幼児', '健診']],
  [['医療', '病院', '健康', '診療', '救急', '医師'], ['医療', '健康', '救急', '病院']],
  [['防災', '災害', '避難', '地震', 'ハザード'], ['防災', '災害', '避難']],
  [['仕事', '就労', '就職', '雇用', '職業', '求人', '外国人材', '技能実習', '特定技能', '労働', '残業'], ['就労', '就職', '雇用', '外国人材', '技能実習', '特定技能', '人材']],
  [['留学'], ['留学']],
  [['交流', 'フェスタ', 'フェスティバル', '祭り', 'イベント', 'ラウンジ', 'サロン'], ['交流', 'フェスタ', 'フェスティバル', 'イベント', 'ラウンジ']],
  [['ボランティア', 'サポーター'], ['ボランティア', 'サポーター']],
  [['住宅', '住まい', '賃貸', '入居'], ['住宅', '住まい', '入居']],
  [['生活ガイド', 'ハンドブック', 'ガイドブック', '生活ルール', 'ごみ', '情報紙', '情報提供', '情報発信', 'やさしい日本語', 'ホームページ'], ['情報提供', '情報発信', '生活ガイド', 'ハンドブック', 'ガイドブック', '生活ルール', 'やさしい日本語']],
  [['協会', '国際センター', '国際交流センター', '財団'], ['協会', '国際センター', '国際交流センター', '財団']],
  [['ウクライナ', '避難民', '難民'], ['ウクライナ', '避難民', '難民']],
  [['残留邦人', '中国帰国', '引揚'], ['残留邦人', '帰国者', '引揚']],
  [['外国人学校', '朝鮮学校', 'ブラジル学校', 'インターナショナルスクール'], ['外国人学校', '朝鮮', '各種学校']],
];
const GROUPS = NEAR.map(([terms, near]) => [terms.map(normQ), near.map(normQ)]);
// 近い言葉を画面に出すときの書き方（探すときはカタカナをひらがなにそろえているので、元の書き方に戻す）
const LABEL = new Map(NEAR.flatMap(([, near]) => near.map(x => [normQ(x), x])));
export const termLabel = t => LABEL.get(t) || t;

// 入力の例（トップページ・検索のページに出す）
export const EXAMPLES = ['法律相談', '日本語教室', '医療通訳', '多文化共生総合相談センター', '横浜 相談', '防災'];

// 索引を探しやすい形にする。raw は build.mjs が作る search.json の rows
export function buildIndex(raw, munis) {
  const byCode = new Map(munis.map(m => [m.code, m]));
  const rows = raw.map(([id, code, name, field, rel, dept, purpose, content, extra, included, buds]) => {
    const m = byCode.get(code);
    const n = {
      name: normQ(name), field: normQ(field), dept: normQ(dept), purpose: normQ(purpose),
      content: normQ(content), extra: normQ(extra), muni: normQ(m?.full), kana: normQ(m?.kana),
    };
    return { id, code, name, field, rel, dept, purpose, content, extra, included: !!included, buds, muniFull: m?.full || code, n, all: [n.name, n.field, n.dept, n.purpose, n.content, n.extra, n.muni].join('\n') };
  });
  const names = munis.flatMap(m => [normQ(m.name), normQ(m.full)]);
  const areas = munis.map(m => [normQ(m.full), normQ(m.kana)]);
  return { rows, names, areas };
}

// 入力を、探す言葉の並びにする。{ words: [{ label, text, area, near }], changed }
export function readQuery(q, index) {
  const { rows, names, areas } = index;
  const exists = t => rows.some(r => r.all.includes(t));
  const seen = new Set(), found = [];
  const add = label => {
    const text = normQ(label);
    if (text && !seen.has(text)) { seen.add(text); found.push({ label, text }); }
  };
  const expand = (label, depth = 0) => {
    const t = normQ(label);
    if (!t) return;
    if (depth > 5 || exists(t)) { add(label); return; }
    // 自治体名から始まる言葉（横浜市多文化共生総合相談センター）は、自治体名と残りに分ける
    let head = '';
    for (const n of names) if (n.length > head.length && n.length < t.length && t.startsWith(n)) head = n;
    if (head) { add(label.slice(0, head.length)); expand(label.slice(head.length), depth + 1); return; }
    // チラシの題名につく言葉を外す
    const stripped = label.replace(FLYER_WORDS, ' ').split(/\s+/).filter(Boolean);
    if (stripped.length && stripped.join('') !== label) { stripped.forEach(p => expand(p, depth + 1)); return; }
    // 後ろの「会」「事業」などを外す（「相談会」は「相談」にする）
    const cut = label.endsWith('相談会') ? label.slice(0, -1) : label.replace(TAIL, '');
    if (cut && cut !== label) { expand(cut, depth + 1); return; }
    add(label);
  };
  const tokens = String(q || '').normalize('NFKC').split(SPLIT).filter(Boolean);
  const kept = tokens.filter(t => !STOP_TOKEN.test(normQ(t)));
  (kept.length ? kept : tokens).forEach(t => expand(t));
  const words = found.map(w => {
    const near = [];
    for (const [terms, list] of GROUPS) if (terms.some(x => w.text.includes(x))) for (const x of list) if (x !== w.text && !near.includes(x)) near.push(x);
    const area = w.text.length >= 2 && areas.some(([full, kana]) => full.includes(w.text) || kana.startsWith(w.text));
    return { ...w, area, near: area ? [] : near };
  });
  return { words, changed: words.map(w => w.label).join('') !== tokens.join('') };
}

const hitIn = (r, t) => r.all.includes(t) || (t.length >= 2 && r.n.kana.startsWith(t));
const scoreOf = (r, t) => {
  let s = 0;
  for (const [k, w] of WEIGHTS) if (r.n[k].includes(t)) s += w;
  return s || (hitIn(r, t) ? 1 : 0);
};
// 自治体名の言葉は、ほかの自治体の資料に名前が出ているだけの事業より、その自治体の事業を上に出す
const scoreWord = (r, w, t) => scoreOf(r, t) + (w.area && (r.n.muni.includes(t) || r.n.kana.startsWith(t)) ? 12 : 0);

// 金額を選ぶ。buds = [[年度, 段階, 金額, うち外国人関連, 要確認なら1], …]
// 選んだ年度の当初予算 → いちばん新しい当初予算 → いちばん新しい記録 の順
export function pickBudget(buds, fy) {
  if (!buds?.length) return null;
  const toB = x => ({ fy: x[0], stage: x[1], amount_yen: x[2], portion_yen: x[3] ?? null, verified: x[4] ? '要確認' : '' });
  const first = buds.filter(x => x[1] === '当初予算');
  const hit = first.find(x => x[0] === fy) || [...first].sort((a, b) => b[0] - a[0])[0] || [...buds].sort((a, b) => b[0] - a[0])[0];
  return toB(hit);
}

// 並べ替えに使う金額（画面に大きく出す額と同じ。③は外国人関連の部分の額で、分からなければ金額のある事業の後ろへ）
const amountOf = (r, fy) => {
  const b = pickBudget(r.buds, fy);
  if (!b) return -1;
  if (r.rel === '③') return b.portion_yen ?? -0.5;
  return b.amount_yen;
};
// 言葉の合い方が同じくらいなら、外国人に向けた事業（①②）を上に出す
const relBonus = r => (r.rel === '①' || r.rel === '②' ? 1 : 0);

// exact：全部の言葉が載っている事業／near：近い言葉まで広げると当てはまる事業
// それぞれ { row, score, terms }（terms は文字を強調する言葉）
export function searchRows(index, { words }, { filter = () => true, sort = '', fy } = {}) {
  const scoped = index.rows.filter(filter);
  const exact = [], near = [];
  for (const row of scoped) {
    if (words.every(w => hitIn(row, w.text))) {
      exact.push({ row, score: words.reduce((s, w) => s + scoreWord(row, w, w.text), relBonus(row)), terms: words.map(w => w.text) });
      continue;
    }
    if (!words.some(w => w.near.length)) continue;
    let score = relBonus(row), ok = true;
    const terms = [];
    for (const w of words) {
      const list = [w.text, ...w.near];
      const i = list.findIndex(t => hitIn(row, t));
      if (i < 0) { ok = false; break; }
      terms.push(list[i]);
      score += scoreWord(row, w, list[i]) + (list.length - i) * 0.1;
    }
    if (ok) near.push({ row, score, terms });
  }
  const order = (a, b) => (sort === 'amt' ? 0 : b.score - a.score) || amountOf(b.row, fy) - amountOf(a.row, fy) || a.row.id.localeCompare(b.row.id);
  return { exact: exact.sort(order), near: near.sort(order) };
}

// 元の文字のどこに言葉があるか（全角・半角やカタカナ・ひらがなの違いを無視して探し、元の文字の位置を返す）
function locate(text, terms) {
  let norm = '';
  const map = [];
  let pos = 0;
  // 半角カナの濁点（ﾌﾟ）は前の字と合わせて1字に読む
  for (const ch of String(text || '').match(/[\s\S][ﾞﾟ゙゚]?/gu) || []) {
    const nc = normQ(ch);
    for (let i = 0; i < nc.length; i++) map.push(pos);
    norm += nc;
    pos += ch.length;
  }
  map.push(pos);
  const out = [];
  for (const t of terms) {
    if (!t) continue;
    for (let i = norm.indexOf(t); i >= 0; i = norm.indexOf(t, i + t.length)) out.push([map[i], map[i + t.length]]);
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

// 言葉に印をつけた HTML（文字はエスケープする）
export function markHTML(text, terms) {
  const s = String(text || '');
  let out = '', at = 0;
  for (const [a, b] of locate(s, terms)) {
    out += `${esc(s.slice(at, a))}<mark>${esc(s.slice(a, b))}</mark>`;
    at = b;
  }
  return out + esc(s.slice(at));
}

// 事業の内容などから、言葉のまわりだけを抜き出す（言葉がなければ、事業の内容の始めのほう）
export function snippetHTML(row, terms, before = 30, after = 80) {
  for (const key of ['content', 'purpose', 'extra']) {
    const s = String(row[key] || '');
    const hit = locate(s, terms)[0];
    if (!hit) continue;
    const a = Math.max(0, hit[0] - before), b = Math.min(s.length, hit[1] + after);
    return `${a > 0 ? '…' : ''}${markHTML(s.slice(a, b), terms)}${b < s.length ? '…' : ''}`;
  }
  const s = String(row.content || row.purpose || '');
  return s.length > before + after ? `${esc(s.slice(0, before + after))}…` : esc(s);
}
