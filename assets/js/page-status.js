// 調査状況（どの自治体・年度まで調べたか）と、更新履歴・訂正

import { db, status, loadChangelog } from './store.js';
import { $, esc, num, fyFull, fmtDate } from './util.js';
import { href, currentYear, yearPicker, bindYearPicker } from './app.js';
import { statusBadge, REGIONS } from './components.js';
import { SURVEY_STATUSES, SURVEY_INFO } from './schema.js';

// 出典ID（221309-S07）を、自治体のページの資料の番号（資料7）にする
const srcName = id => /-S\d+$/.test(id) ? `資料${parseInt(id.split('-S')[1], 10)}` : '';

export function statusPage(ctx) {
  const { app, params } = ctx;
  const fy = currentYear(params);
  const sts = SURVEY_STATUSES.filter(s => s !== '決算未公表');
  const count = (list, stage) => { const c = {}; for (const m of list) { const s = status(m.code, fy, stage); c[s] = (c[s] || 0) + 1; } return c; };
  const prefs = db.prefs, munis = db.munis.filter(m => !m.isPref);
  const cP = count(prefs, '当初予算'), cM = count(munis, '当初予算');
  const surveyed = db.munis.filter(m => db.sum[m.code]);
  app.innerHTML = `<div class="page-head"><h1>調査状況</h1>
    <p class="lead">全国の都道府県と市区町村（${num(db.munis.length)}）のうち、どこまで調べたかを示します。一度に全国のデータがそろったように見せず、調べた自治体から順に公開しています。</p></div>
    <div class="ctl"><span class="label">年度</span>${yearPicker(fy, 'sv-fy')}</div>
    <h2>${fyFull(fy)}・当初予算の調査状況</h2>
    <div class="table-wrap"><table class="prog-table"><thead><tr><th>調査状況</th><th class="num">都道府県</th><th class="num">市区町村</th><th>意味</th></tr></thead><tbody>
      ${sts.map(s => `<tr><td>${statusBadge(s)}</td><td class="num">${num(cP[s] || 0)}</td><td class="num">${num(cM[s] || 0)}</td><td><small>${esc(SURVEY_INFO[s])}</small></td></tr>`).join('')}
      <tr><td><b>合計</b></td><td class="num">${prefs.length}</td><td class="num">${num(munis.length)}</td><td></td></tr>
    </tbody></table></div>
    <p>一般会計の予算総額（一般会計に占める割合の分母）を公式資料で確認した自治体：都道府県 <b>${num(db.meta.progress?.[fy]?.gen?.pref || 0)}</b> / ${prefs.length}・市区町村 <b>${num(db.meta.progress?.[fy]?.gen?.muni || 0)}</b> / ${num(munis.length)}（${fyFull(fy)}・当初予算）。</p>
    <p class="small muted">「該当事業なし」は、調べた結果、関連事業がないことを確認できた場合だけです（このときだけ0円と表示）。決算は年度が終わった次の秋ごろに公表されるので、${db.config.settlement_latest_fy + 1}年度以降の決算は「決算未公表」です。</p>

    <h2>都道府県ごとの進み具合（${fyFull(fy)}・当初予算）</h2>
    <div class="table-wrap"><table><thead><tr><th>地方</th><th>都道府県</th><th>県庁</th><th class="num">市区町村（調査済み／全体）</th></tr></thead><tbody>
      ${REGIONS.flatMap(([r, pcs]) => pcs.map((pc, i) => { const p = prefs.find(x => x.pc === pc); const ms = munis.filter(m => m.pc === pc); const done = ms.filter(m => status(m.code, fy, '当初予算') !== '未調査').length; return `<tr>${i === 0 ? `<td rowspan="${pcs.length}">${esc(r)}</td>` : ''}<td><a href="${href('/', { y: fy, p: pc, to: 'map' })}">${esc(p.name)}</a></td><td>${statusBadge(status(p.code, fy, '当初予算'))}</td><td class="num">${done} / ${ms.length}</td></tr>`; })).join('')}
    </tbody></table></div>

    <h2>調査した自治体（全年度）</h2>
    ${surveyed.length ? `<div class="table-wrap"><table><thead><tr><th>自治体</th>${db.years.map(y => `<th class="num">${String(y).slice(2)}</th>`).join('')}</tr></thead><tbody>
      ${surveyed.map(m => `<tr><td><a href="${href('/m/' + m.code, { y: fy })}">${esc(m.full)}</a></td>${db.years.map(y => { const a = status(m.code, y, '当初予算'), s = status(m.code, y, '決算'); return `<td class="num" title="${y}年度 当初予算：${esc(a)}／決算：${esc(s)}">${mark(a)}${s !== '未調査' && s !== '決算未公表' ? '<br>' + mark(s, true) : ''}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div>
    <p class="small muted">上の段：当初予算、下の段：決算。● 主な資料を調査済み　◐ 一部の資料だけ調査　○ 関係する事業なし（0円）　× 資料が見つからない・金額は非公表　空欄 未調査。年度は西暦の下2けた（16＝2016年度）。</p>` : '<p class="note">まだ調査した自治体はありません。</p>'}

    <p><a href="#/about">調べ方・出典のルール</a>　／　<a href="#/changes">更新履歴・訂正</a></p>`;
  bindYearPicker(app, y => { location.hash = href('/status', { y }).slice(1); });
}

function mark(s, small) {
  const t = { '確認済み': '●', '一部確認': '◐', '該当事業なし': '○', '資料未発見': '×', '金額非公表': '×' }[s] || '';
  return small ? `<small>${t}</small>` : t;
}

export async function changesPage(ctx) {
  const { app } = ctx;
  const log = await loadChangelog().catch(() => []);
  app.innerHTML = `<div class="page-head"><h1>更新履歴・訂正</h1>
    <p class="lead">データの追加と、金額・分類・調査状況など利用者に影響する訂正の記録です。数字の訂正は、訂正前と訂正後の値・理由・根拠の資料を残しています。</p></div>
    <div class="info"><p><b>数字の誤りを見つけたら</b>：自治体名・年度・事業名と、正しい数字が載っている公式資料（URLとページ）をお知らせください。資料で確かめてから直し、この一覧に記録します。</p></div>
    ${log.length ? `<div class="table-wrap"><table><thead><tr><th>日付</th><th>自治体</th><th>種類</th><th>内容</th><th>理由</th></tr></thead><tbody>${log.map(c => `<tr><td class="nowrap">${esc(fmtDate(c.date))}</td><td>${c.code ? `<a href="${href('/m/' + c.code, { y: c.fy || undefined })}">${esc(db.byCode.get(c.code)?.full || c.code)}</a>` : '全体'}${c.fy ? `<br><small>${c.fy}年度 ${esc(c.stage || '')}</small>` : ''}</td><td>${esc(c.kind)}</td><td>${esc(c.item || '')}${c.before ? `<br><small>訂正前：${esc(c.before)}</small>` : ''}${c.after ? `<br><small>訂正後：${esc(c.after)}</small>` : ''}</td><td><small>${esc(c.reason)}${c.source_id ? `<br>根拠：${esc(String(c.source_id).split(/[;；]/).map(x => srcName(x.trim())).filter(Boolean).join('、'))}（自治体のページの「使った公式資料」）` : ''}</small></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">まだ記録はありません。</p>'}`;
}
