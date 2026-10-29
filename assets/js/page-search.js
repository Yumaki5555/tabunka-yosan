// 事業の詳細検索（事業名・使い道・都道府県で、登録済みの事業を探す。自治体名で探す欄はトップページの1か所だけ）

import { db, loadProjectsIndex, status, munisOfPref } from './store.js';
import { $, esc, normQ, num, fyFull } from './util.js';
import { href, go, currentYear } from './app.js';
import { searchMunis, statusBadge, fieldBadge, amountOrStatus } from './components.js';
import { FIELDS, FIELD_INFO } from './schema.js';

export async function searchPage(ctx) {
  const { app, params } = ctx;
  const fy = currentYear(params);
  const q = params.get('q') || '', pc = params.get('p') || '', f = params.get('f') || '';
  const idx = await loadProjectsIndex().catch(() => []);
  app.innerHTML = `<div class="page-head"><h1>事業の詳細検索</h1>
    <p class="lead">事業名・使い道・都道府県で、全国の登録済みの事業を探せます。自治体名で探すときは<a href="#/?to=find">トップページの検索</a>が便利です。</p></div>
    <form id="s-form" class="search-filters" role="search" aria-label="条件を指定して探す">
      <label>都道府県<select name="p"><option value="">すべて</option>${db.prefs.map(p => `<option value="${p.pc}"${p.pc === pc ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label>事業名・自治体名<input type="search" name="q" value="${esc(q)}" placeholder="例：日本語、相談窓口、浜松"></label>
      <label>使い道<select name="f"><option value="">すべて</option>${FIELDS.map(x => `<option value="${esc(x)}"${x === f ? ' selected' : ''}>${esc(FIELD_INFO[x].label)}</option>`).join('')}</select></label>
      <div style="align-self:end"><button class="btn" type="submit">探す</button></div>
    </form>
    <div id="s-res"></div>`;
  $('#s-form').addEventListener('submit', ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    go('/search', { q: fd.get('q'), p: fd.get('p'), f: fd.get('f'), y: fy });
  });
  const res = $('#s-res');
  if (!q && !pc && !f) {
    res.innerHTML = `<p class="info">条件を入れて「探す」を押してください。都道府県だけを選ぶと、その都道府県の自治体の一覧が出ます。</p>`;
    return;
  }
  const n = normQ(q);
  const munis = q ? searchMunis(q, { limit: 50, prefOnly: pc || null }) : (pc && !f ? [db.prefs.find(p => p.pc === pc), ...munisOfPref(pc)] : []);
  const projs = idx.filter(([id, code, name, field, rel, dept]) =>
    (!pc || code.startsWith(pc)) && (!f || field === f) && (!n || normQ(name).includes(n) || normQ(dept).includes(n) || normQ(db.byCode.get(code)?.full).includes(n)));
  res.innerHTML = `
    <h2>自治体（${num(munis.length)}）</h2>
    ${munis.length ? `<ul class="muni-list">${munis.map(m => { const a = amountOrStatus(m.code, fy, '当初予算'); return `<li><a href="${href('/m/' + m.code, { y: fy })}">${esc(m.full)}</a><span class="amt">${a.value !== undefined || a.text === '0円' ? esc(a.text) : statusBadge(a.st)}</span><span class="small muted">${esc(m.kind)}・${esc(m.code)}</span></li>`; }).join('')}</ul>` : '<p class="muted">当てはまる自治体はありません。</p>'}
    <h2>登録済みの事業（${num(projs.length)}）</h2>
    <p class="small muted">調査済みの自治体の事業だけが出ます。未調査の自治体の事業は、まだ登録されていません。</p>
    ${projs.length ? `<div class="result-list">${projs.slice(0, 300).map(([id, code, name, field, rel, dept]) => `<div class="result"><h3><a href="${href('/m/' + code, { y: fy, pj: id })}">${esc(name)}</a></h3><div class="meta"><b>${esc(db.byCode.get(code)?.full || code)}</b>${fieldBadge(field)}${['①', '②', '③'].includes(rel) ? '' : '<span class="badge rel-4">参考・合計に入れていない</span>'}${dept ? `<span>${esc(dept)}</span>` : ''}</div></div>`).join('')}</div>${projs.length > 300 ? '<p class="muted">300件まで表示しています。条件をしぼってください。</p>' : ''}` : '<p class="muted">当てはまる事業はありません。</p>'}`;
}
