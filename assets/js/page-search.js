// 事業・キーワードで探す（事業名・事業の内容・支払先などの言葉で、登録済みの事業と金額を探す）
// 探し方の決まりは search.js。範囲（都道府県・市区町村）は URL の p・m で受け取り、自治体のページや地図のページからも開く

import { db, loadSearchIndex, munisOfPref } from './store.js';
import { $, esc, num } from './util.js';
import { href, go, currentYear } from './app.js';
import { searchMunis, statusBadge, fieldBadge, amountOrStatus, amountLabel } from './components.js';
import { FIELDS, FIELD_INFO } from './schema.js';
import { buildIndex, readQuery, searchRows, pickBudget, markHTML, snippetHTML, termLabel, EXAMPLES } from './search.js';

const LIMIT = 200;
let built = null;
const getIndex = async () => (built ??= buildIndex(await loadSearchIndex(), db.munis));

export async function searchPage(ctx) {
  const { app, params } = ctx;
  const fy = currentYear(params);
  const q = params.get('q') || '', f = params.get('f') || '';
  const sort = params.get('o') === 'amt' ? 'amt' : '';
  const m = db.byCode.has(params.get('m')) ? params.get('m') : '';
  const pc = m ? m.slice(0, 2) : (/^\d{2}$/.test(params.get('p') || '') ? params.get('p') : '');
  let index = null;
  try { index = await getIndex(); } catch { /* 読めないときは下で伝える */ }
  const withRows = new Set((index?.rows || []).map(r => r.code));

  const muniOptions = (p, sel) => {
    const pref = db.prefs.find(x => x.pc === p);
    if (!pref) return '<option value="">（都道府県を選ぶと選べます）</option>';
    const list = munisOfPref(p).filter(x => withRows.has(x.code) || x.code === sel);
    return `<option value="">すべて（庁と市区町村）</option><option value="${pref.code}"${pref.code === sel ? ' selected' : ''}>${esc(pref.name)}庁だけ</option>${list.map(x => `<option value="${x.code}"${x.code === sel ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}`;
  };

  // 探した後は、結果がすぐ見えるよう説明の文を出さない
  app.innerHTML = `<div class="page-head"><h1>事業・キーワードで探す</h1>
    ${q || pc || f ? '' : '<p class="lead">事業名や、チラシにある行事・施設の名前から、どの事業で、いくらかかっているかを探せます。自治体の名前を一緒に入れると、その自治体だけにしぼれます。</p>'}</div>
    <form id="s-form" class="search-filters" role="search" aria-label="事業を探す">
      <div class="kw-q"><label for="s-q">事業名・キーワード</label><div class="kw-row"><input id="s-q" type="search" name="q" value="${esc(q)}" autocomplete="off" placeholder="例：法律相談、日本語教室"><button class="btn" type="submit">探す</button></div></div>
      <label>都道府県<select name="p" id="s-p"><option value="">すべて</option>${db.prefs.map(p => `<option value="${p.pc}"${p.pc === pc ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label>市区町村<select name="m" id="s-m">${muniOptions(pc, m)}</select></label>
      <label>使い道<select name="f"><option value="">すべて</option>${FIELDS.map(x => `<option value="${esc(x)}"${x === f ? ' selected' : ''}>${esc(FIELD_INFO[x].label)}</option>`).join('')}</select></label>
      <label>並び順<select name="o"><option value="">言葉が合う順</option><option value="amt"${sort ? ' selected' : ''}>金額の大きい順</option></select></label>
    </form>
    <div id="s-res"></div>`;
  $('#s-p').addEventListener('change', e => { $('#s-m').innerHTML = muniOptions(e.target.value, ''); });
  $('#s-form').addEventListener('submit', ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    go('/search', { q: String(fd.get('q') || '').trim(), p: fd.get('p'), m: fd.get('m'), f: fd.get('f'), o: fd.get('o'), y: fy });
  });

  const res = $('#s-res');
  if (!index) {
    res.innerHTML = '<p class="info">事業の一覧を読み込めませんでした。少し待ってから、もう一度開いてください。</p>';
    return;
  }
  if (!q && !pc && !f) {
    res.innerHTML = `<div class="kw-tips"><h2>チラシから探すときは</h2>
      <ol>
        <li><b>行事の名前</b>を入れます（例：法律相談、日本語教室）。チラシの題名をそのまま入れてもかまいません。</li>
        <li>見つからないときは、<b>施設や団体の名前</b>を入れます（例：多文化共生総合相談センター）。</li>
        <li>多いときは、<b>自治体の名前</b>を足してしぼります（例：横浜 相談）。</li>
      </ol>
      <div class="kw-chips" aria-label="入力の例">${EXAMPLES.map(x => `<a href="${href('/search', { q: x, y: fy })}">${esc(x)}</a>`).join('')}</div></div>`;
    return;
  }

  const parsed = readQuery(q, index);
  const { exact, near } = searchRows(index, parsed, {
    filter: r => (!m || r.code === m) && (!pc || r.code.startsWith(pc)) && (!f || r.field === f),
    sort, fy,
  });

  const card = ({ row: r, terms }) => {
    const b = pickBudget(r.buds, fy);
    const a = b ? amountLabel({ relation: r.rel, included_in: r.included }, b) : { main: '金額の記録なし', sub: '' };
    const link = href('/m/' + r.code, { y: b?.fy ?? fy, s: b?.stage === '決算' ? '決算' : '', pj: r.id });
    const rel = ['①', '②', '③'].includes(r.rel) ? '' : r.rel === '別枠' ? '<span class="badge rel-b">別枠・合計に入れていない</span>' : '<span class="badge rel-4">参考・合計に入れていない</span>';
    const snip = snippetHTML(r, terms);
    return `<article class="result kw-res">
      <div class="kw-body">
        <h3><a href="${link}">${markHTML(r.name, terms)}</a></h3>
        <div class="meta"><b>${esc(r.muniFull)}</b>${fieldBadge(r.field)}${rel}${r.dept ? `<span>${esc(r.dept)}</span>` : ''}</div>
        ${snip ? `<p class="kw-snip">${snip}</p>` : ''}
      </div>
      <div class="kw-amt"><b>${esc(a.main)}</b>${b ? `<small>${b.fy}年度・${esc(b.stage)}</small>` : ''}${a.sub ? `<small>${esc(a.sub)}</small>` : ''}</div>
    </article>`;
  };
  const list = hits => hits.length ? `<div class="result-list">${hits.slice(0, LIMIT).map(card).join('')}</div>${hits.length > LIMIT ? `<p class="muted">${LIMIT}件まで表示しています。自治体の名前や使い道でしぼってください。</p>` : ''}` : '';

  // 自治体の一覧：自治体名の言葉が入っていればその自治体、都道府県だけを選んだときはその都道府県の全部
  const areaWords = parsed.words.filter(w => w.area);
  const areaMunis = [...new Map(areaWords.flatMap(w => searchMunis(w.text, { limit: 50, prefOnly: pc || null })).map(x => [x.code, x])).values()];
  const munis = m ? [] : (!q && pc && !f ? [db.prefs.find(p => p.pc === pc), ...munisOfPref(pc)] : areaMunis);
  const muniHTML = munis.length ? `<h2>自治体（${num(munis.length)}）</h2>
    <ul class="muni-list">${munis.map(x => { const a = amountOrStatus(x.code, fy, '当初予算'); return `<li><a href="${href('/m/' + x.code, { y: fy })}">${esc(x.full)}</a><span class="amt">${a.value !== undefined || a.text === '0円' ? esc(a.text) : statusBadge(a.st)}</span><span class="small muted">${esc(x.kind)}・${esc(x.code)}</span></li>`; }).join('')}</ul>` : '';

  const scopeName = m ? db.byCode.get(m).full : pc ? db.prefs.find(p => p.pc === pc)?.name : '';
  const labels = parsed.words.map(w => `「${esc(w.label)}」`).join('');
  const nearWords = [...new Set(parsed.words.flatMap(w => w.near))];
  const nearLead = nearWords.length ? `${nearWords.slice(0, 8).map(x => esc(termLabel(x))).join('・')}などの言葉で広げて探しました。` : '';
  const none = !exact.length && !near.length;

  res.innerHTML = `
    ${parsed.changed && parsed.words.length ? `<p class="small muted">入力を${labels}として探しました。</p>` : ''}
    ${q && !none ? `<p class="kw-note"><b>金額は事業の金額で、行事1回分の費用ではありません。</b>チラシの行事ごとの費用は、予算の資料にはふつう載っていません。事業を押すと、中身と公式資料を確かめられます。</p>` : ''}
    <h2>${q ? `言葉がそのまま載っている事業` : '登録済みの事業'}（${num(exact.length)}）${scopeName ? `<small class="kw-scope">${esc(scopeName)}</small>` : ''}</h2>
    ${exact.length ? list(exact) : `<p class="muted">${q ? `${labels}がそのまま載っている事業はありません。` : '当てはまる事業はありません。'}</p>`}
    ${near.length && !exact.length ? `<h2>近い言葉の事業（${num(near.length)}）</h2><p class="small muted">${nearLead}チラシの行事がこの事業で行われているとは限りません。</p>${list(near)}` : ''}
    ${near.length && exact.length ? `<details class="grp kw-near"><summary>近い言葉の事業も見る（${num(near.length)}）</summary><p class="small muted">${nearLead}</p>${list(near)}</details>` : ''}
    ${none && q ? `<p class="info">短い言葉（例：相談、通訳、日本語）や、施設・団体の名前で試してください。</p>` : ''}
    <p class="small muted">調査済みの自治体の事業だけが出ます。まだ調べていない自治体の事業は出ません（0円という意味ではありません）。</p>
    ${muniHTML}`;
}
