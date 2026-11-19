// ランキング（同じ年度・同じ段階・同じ数え方で確認できた自治体だけを並べる。自治体のページの合計と同じ値を使う）
// 自治体名・値・横棒を1行にまとめる。指標は「予算の合計・一般会計に占める割合・住民1人当たり・外国人住民1人当たり・増減」を切り替える

import { db, metricOf, status, cell, loadPopulation, popOf, generalOf } from './store.js';
import { $, $$, esc, yen, yenExact, yenPer, pct, num, fyFull, download, ratioPct, toast } from './util.js';
import { href, currentYear, currentStage, yearPicker, bindYearPicker, stageSeg } from './app.js';
import { statusBadge, stLabel, exploreTabs, scopeNoteHTML } from './components.js';
import { ICON } from './icons.js';
import { toCSV } from './csv.js';
import { rankImageBlob } from './rank-image.js';

export const RANK_KINDS = {
  high: { label: '予算の合計', mode: 'total', dir: -1, fmt: v => yen(v) },
  ratio: { label: '一般会計に占める割合', mode: 'ratio', dir: -1, fmt: ratioPct },
  perCapita: { label: '住民1人当たり', mode: 'perCapita', dir: -1, fmt: yenPer },
  perForeign: { label: '外国人住民1人当たり', mode: 'perForeign', dir: -1, fmt: yenPer },
  up: { label: '前年度より増えた', mode: 'yoy', dir: -1, filter: v => v > 0, fmt: v => pct(v) },
  down: { label: '前年度より減った', mode: 'yoy', dir: 1, filter: v => v < 0, fmt: v => pct(v) },
  low: { label: '予算の合計（少ない順）', mode: 'total', dir: 1, fmt: v => yen(v) },
};
// 指標のボタン（少ない順・減った順は「並び」で切り替える）
const MAIN = [['high', '予算の合計'], ['ratio', '一般会計に占める割合'], ['perCapita', '住民1人当たり'], ['perForeign', '外国人住民1人当たり'], ['up', '前年度からの増減']];
const mainOf = k => k === 'low' ? 'high' : k === 'down' ? 'up' : k;

// pc：市区町村のランキングを1つの都道府県の中だけにしぼる（自治体コードの上2けた。空なら全国）
export function rankRows({ kind, level, fy, stage, partial, pc = '' }) {
  const k = RANK_KINDS[kind];
  const pool = db.munis.filter(m => (level === 'pref') === m.isPref && (level === 'pref' || !pc || m.pc === pc));
  const rows = [];
  for (const m of pool) {
    const v = metricOf(k.mode, m.code, fy, stage, partial);
    if (v === null || (k.filter && !k.filter(v))) continue;
    const c = cell(m.code, fy, stage);
    rows.push({ m, v, st: status(m.code, fy, stage), a: c?.a ?? (status(m.code, fy, stage) === '該当事業なし' ? 0 : null), n: c?.an ?? 0 });
  }
  rows.sort((a, b) => (a.v - b.v) * k.dir || a.m.code.localeCompare(b.m.code));
  let rank = 0, prev = null;
  rows.forEach((r, i) => { if (r.v !== prev) { rank = i + 1; prev = r.v; } r.rank = rank; });
  return rows;
}

// 比べる範囲の名前（例：市区町村・茨城県内の市区町村・都道府県庁）
const prefName = pc => db.prefs.find(p => p.pc === pc)?.name ?? '';
const scopeName = (level, pc) => level === 'pref' ? '都道府県庁' : pc && prefName(pc) ? `${prefName(pc)}内の市区町村` : '市区町村';

function condition({ kind, level, fy, stage, partial, n, pc }) {
  const k = RANK_KINDS[kind];
  if (k.mode === 'yoy') partial = false;
  const asOf = db.pop?.asOf?.[fy];
  const extra = k.mode === 'perForeign' ? `計算：予算の合計 ÷ 外国人住民数（在留外国人統計、${asOf ? asOf.for.slice(0, 4) + '年12月末' : '前年12月末'}）。外国人住民1人に支払われた金額ではありません。`
    : k.mode === 'perCapita' ? `計算：予算の合計 ÷ 住民の数（住民基本台帳、${asOf ? asOf.pop.slice(0, 4) + '年1月1日' : '1月1日'}現在）。`
      : k.mode === 'ratio' ? `計算：確認できた予算のうち一般会計の事業の金額 ÷ その自治体の一般会計の${stage === '決算' ? '決算額' : '当初予算の総額'}（同じ年度）。一般会計の総額を確かめた自治体だけ。`
        : k.mode === 'yoy' ? `${fy - 1}年度と${fy}年度の両方を、同じ段階で主な資料まで調べた自治体だけ（一部の資料だけ調べた年度があると、調べた範囲の差で増減が大きく見えるため比べません）。増減率は、両方の年度に金額がある同じ事業どうしで計算しています（新しく始まった・終わった事業、前の年度の補正予算に前倒しした事業、片方の年度だけ金額が分かった事業は入れません）。` : '';
  return `<details class="cond-box"><summary><b>比べる条件</b>：${esc(fyFull(fy))}・${esc(stage)}・${esc(scopeName(level, pc))}・${esc(stLabel('確認済み'))}${partial ? `と${esc(stLabel('一部確認'))}` : ''}の${num(n)}自治体</summary>
    <p class="small">金額は自治体のページと同じ数え方（公式資料で確認できた多文化共生関連予算）です。${extra}未調査の自治体は0円として順位に入れていません。都道府県と市区町村は別のランキングです。${partial ? '「一部の資料だけ調査」の自治体は、確認できた分だけなので実際より少ない可能性があります（割合は「確認済み分の割合」）。' : ''}</p>
    <p class="small"><b>完全な比較ではありません。</b>自治体ごとに資料の詳しさや調べた範囲がちがい、ほかの事業にまざって金額が分からない支出は入っていません。</p></details>`;
}

// 画像に入れる題・副題・注意書き（例：茨城県｜市区町村の多文化共生関連予算ランキング）
function imageText({ kind, level, fy, stage, pc, n, total, partialShown }) {
  const k = RANK_KINDS[kind];
  const area = level === 'muni' && pc ? prefName(pc) : '全国';
  const who = level === 'pref' ? '都道府県' : '市区町村';
  const what = { ratio: ' 一般会計に占める割合', perCapita: ' 住民1人当たり', perForeign: ' 外国人住民1人当たり', up: ' 前年度から増えた割合', down: ' 前年度から減った割合' }[kind] ?? '';
  const title = `${area}｜${who}の多文化共生関連予算${what}ランキング${kind === 'low' ? '（少ない順）' : ''}`;
  const sub = `${fyFull(fy)}・${stage}　調べた${num(total)}${who}${n < total ? `のうち上位${num(n)}` : ''}`;
  const g = db.meta?.generated?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const asOf = db.pop?.asOf?.[fy];
  const notes = [
    `出典：全国 多文化共生予算マップ（https://yumaki5555.github.io/tabunka-yosan/）。自治体の予算書などの公式資料で確認できた多文化共生関連予算を集計${g ? `（${g[1]}年${+g[2]}月${+g[3]}日時点）` : ''}。`,
    '外国籍の人だけに使われる予算ではありません。学校の教員の人件費と、中国残留邦人等・引揚者などの援護は入れていません。まだ調べていない自治体は順位に入れていません。',
    k.mode === 'perCapita' ? `住民1人当たり＝予算の合計÷住民の数（住民基本台帳、${asOf ? asOf.pop.slice(0, 4) + '年1月1日' : '1月1日'}現在）。`
      : k.mode === 'perForeign' ? `外国人住民1人当たり＝予算の合計÷外国人住民数（在留外国人統計、${asOf ? asOf.for.slice(0, 4) + '年12月末' : '前年12月末'}）。外国人住民1人に支払われた金額ではありません。`
        : k.mode === 'ratio' ? `一般会計に占める割合＝確認できた予算のうち一般会計の事業の金額÷一般会計の${stage === '決算' ? '決算額' : '当初予算の総額'}。`
          : k.mode === 'yoy' ? `増減率は、${fy - 1}年度と${fy}年度の両方に金額がある同じ事業どうしで計算しています。` : '',
    partialShown ? '斜線の棒は、一部の資料だけ調べた自治体です（実際より多い可能性があります）。' : '',
  ].filter(Boolean);
  return { title, sub, notes, file: `${area}_${who}_${k.label}_${fy}年度_${stage}.png` };
}

// 横棒のランキング（自治体名・値・棒を1行に）
export function rankBarsHTML(rows, { kind, fy, stage, limit }) {
  const k = RANK_KINDS[kind];
  const shown = limit ? rows.slice(0, limit) : rows;
  const max = Math.max(...rows.map(r => Math.abs(r.v)), 1e-12);
  const neg = k.mode === 'yoy';
  return `<ol class="rank-bars">${shown.map(r => {
    const w = Math.max(1.5, Math.abs(r.v) / max * 100);
    const sub = [k.mode !== 'total' ? `予算 ${yen(r.a)}` : '', k.mode === 'ratio' && generalOf(r.m.code, fy, stage) ? `一般会計 ${yen(generalOf(r.m.code, fy, stage), { approx: true })}` : '', r.st === '一部確認' ? '一部の資料だけ調査' : ''].filter(Boolean).join('・');
    return `<li><span class="rb-rank">${r.rank}</span>
      <a class="rb-name" href="${href('/m/' + r.m.code, { y: fy, s: stage === '決算' ? '決算' : '' })}">${esc(r.m.isPref ? r.m.name : r.m.name)}<small>${esc(r.m.isPref ? '' : r.m.pref)}</small></a>
      <span class="rb-bar"><i class="${neg && r.v < 0 ? 'neg' : ''}${r.st === '一部確認' ? ' part' : ''}" style="width:${w.toFixed(2)}%"></i></span>
      <span class="rb-val">${esc(k.fmt(r.v))}${sub ? `<small>${esc(sub)}</small>` : ''}</span></li>`;
  }).join('')}</ol>`;
}

// 画像に入れる数の選択肢（上位10・20・30。60以下なら「すべて」も）
const imgNs = total => [...[10, 20, 30].filter(x => x < total), ...(total <= 60 ? [total] : [])];

export async function rankingPage(ctx) {
  const { app, params } = ctx;
  await loadPopulation();
  const st = {
    kind: RANK_KINDS[params.get('k')] ? params.get('k') : 'high',
    // 最初は「都道府県」「一部の資料だけ調べた自治体も含める」
    level: params.get('lv') === 'muni' ? 'muni' : 'pref',
    fy: currentYear(params), stage: currentStage(params), partial: params.get('pt') !== '0',
    all: params.get('all') === '1',
    pc: db.prefs.some(p => p.pc === params.get('p')) ? params.get('p') : '',
  };
  const save = () => history.replaceState(null, '', href('/ranking', { k: st.kind === 'high' ? '' : st.kind, lv: st.level === 'pref' ? '' : st.level, y: st.fy, s: st.stage === '決算' ? '決算' : '', pt: st.partial ? '' : '0', all: st.all ? '1' : '', p: st.level === 'muni' ? st.pc : '' }));
  const draw = () => {
    save();
    const pc = st.level === 'muni' ? st.pc : '';
    const rows = rankRows({ ...st, pc });
    const k = RANK_KINDS[st.kind];
    const main = mainOf(st.kind);
    const desc = st.kind === 'low' || st.kind === 'down';
    const LIMIT = 30;
    app.innerHTML = `${exploreTabs('ranking', st.fy, ICON)}
      <div class="page-head"><h1>ランキング</h1>
        <p class="lead">同じ年度・同じ数え方で確認できた自治体だけを並べます。</p></div>
      <div class="ctl-row">
        <div class="ctl"><span class="label">年度</span>${yearPicker(st.fy, 'rk-fy')}</div>
        <div class="ctl"><span class="label">予算か決算か</span>${stageSeg(st.stage)}</div>
        <div class="ctl"><span class="label">比べる自治体</span><div class="seg seg-sm" role="group" aria-label="都道府県か市区町村か">${[['muni', '市区町村'], ['pref', '都道府県']].map(([key, l]) => `<button type="button" data-rl="${key}" aria-pressed="${key === st.level}">${l}</button>`).join('')}</div></div>
        ${st.level === 'muni' ? `<label class="ctl"><span class="label">都道府県</span><select id="rk-pc"><option value="">全国</option>${db.prefs.map(p => `<option value="${p.pc}"${p.pc === pc ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : ''}
      </div>
      <div class="ctl"><span class="label">指標</span><div class="seg" role="group" aria-label="指標">${MAIN.map(([key, l]) => `<button type="button" data-rk="${key}" aria-pressed="${key === main}">${esc(l)}</button>`).join('')}</div></div>
      <div class="ctl-row tight">
        ${main === 'high' || main === 'up' ? `<div class="seg seg-sm" role="group" aria-label="並び">${main === 'high' ? `<button type="button" data-rk="high" aria-pressed="${st.kind === 'high'}">多い順</button><button type="button" data-rk="low" aria-pressed="${st.kind === 'low'}">少ない順</button>` : `<button type="button" data-rk="up" aria-pressed="${st.kind === 'up'}">増えた順</button><button type="button" data-rk="down" aria-pressed="${st.kind === 'down'}">減った順</button>`}</div>` : ''}
        ${k.mode !== 'yoy' ? `<label class="check small"><input type="checkbox" id="rk-pt" ${st.partial ? 'checked' : ''}> 一部の資料だけ調べた自治体も含める（参考）</label>` : ''}
      </div>
      ${condition({ ...st, pc, n: rows.length })}
      ${rows.length ? scopeNoteHTML() : ''}
      <h2 class="rank-h">${esc(k.label)}${desc ? '' : main === 'up' ? '' : ''}<small>${esc(scopeName(st.level, pc))}・${esc(fyFull(st.fy))}・${esc(st.stage)}</small></h2>
      ${rows.length ? rankBarsHTML(rows, { kind: st.kind, fy: st.fy, stage: st.stage, limit: st.all ? 0 : LIMIT })
        : `<p class="note">この条件で比べられる自治体は、まだありません。${!st.partial && k.mode !== 'yoy' ? `「一部の資料だけ調べた自治体も含める」にすると表示される場合があります。` : ''}</p>`}
      ${rows.length > LIMIT && !st.all ? `<p><button type="button" class="btn btn-outline" id="rk-all">残りの${num(rows.length - LIMIT)}自治体も表示する</button></p>` : ''}
      <p class="next-links">${rows.length ? `<span class="img-save"><button type="button" class="linklike" id="rk-png">${ICON.download}このグラフを画像で保存</button><select id="rk-png-n" aria-label="画像に入れる自治体の数">${imgNs(rows.length).map(x => `<option value="${x}">${x === rows.length ? `すべて（${num(x)}）` : `上位${x}`}</option>`).join('')}</select></span>` : ''}<button type="button" class="linklike" id="rk-csv">${ICON.download}この順位をCSVでダウンロード</button><a href="${href('/compare', { y: st.fy, c: rows.slice(0, 3).map(r => r.m.code).join(',') })}">${ICON.compare}上位3つを比較する</a></p>`;
    bindYearPicker(app, y => { st.fy = y; draw(); });
    $$('[data-stage]', app).forEach(b => b.addEventListener('click', () => { st.stage = b.dataset.stage; draw(); }));
    $$('[data-rk]', app).forEach(b => b.addEventListener('click', () => { st.kind = b.dataset.rk; draw(); }));
    $$('[data-rl]', app).forEach(b => b.addEventListener('click', () => { st.level = b.dataset.rl; st.all = false; draw(); }));
    $('#rk-pc')?.addEventListener('change', e => { st.pc = e.target.value; st.all = false; draw(); });
    $('#rk-pt')?.addEventListener('change', e => { st.partial = e.target.checked; draw(); });
    $('#rk-all')?.addEventListener('click', () => { st.all = true; draw(); });
    $('#rk-png')?.addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const n = Number($('#rk-png-n').value) || rows.length;
        const t = imageText({ ...st, pc, n, total: rows.length, partialShown: rows.slice(0, n).some(r => r.st === '一部確認') });
        download(t.file, await rankImageBlob({ rows, n, title: t.title, sub: t.sub, notes: t.notes, fmt: k.fmt, showPref: st.level === 'muni' && !pc }), 'image/png');
      } catch { toast('画像を作れませんでした'); } finally { btn.disabled = false; }
    });
    $('#rk-csv').addEventListener('click', () => {
      download(`ranking_${st.kind}_${st.level}${pc ? '_' + pc : ''}_${st.fy}_${st.stage}.csv`, toCSV(
        ['順位', '自治体コード', '都道府県', '自治体', '年度', '段階', '集計区分', '指標', '値', '多文化共生関連予算の合計（円）', '一般会計の予算総額（円）', '合計に入れた事業の数', '人口', '外国人住民数', '調査状況', '別枠の事業の金額（円・合計に入れていない）'],
        rows.map(r => { const p = popOf(r.m.code, st.fy); return [r.rank, r.m.code, r.m.pref, r.m.isPref ? '' : r.m.name, st.fy, st.stage, '基本集計：①直接給付・支援＋②行政経費＋③一般事業のうち分かった部分', k.label, k.mode === 'yoy' ? (r.v * 100).toFixed(2) + '%' : k.mode === 'ratio' ? (r.v * 100).toFixed(4) + '%' : Math.round(r.v), r.a ?? '', generalOf(r.m.code, st.fy, st.stage) ?? '', r.n, p?.population ?? '', p?.foreign ?? '', stLabel(r.st), cell(r.m.code, st.fy, st.stage)?.bw ?? '']; })));
    });
  };
  draw();
}
