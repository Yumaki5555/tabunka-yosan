// トップページ：① 自治体を探す（名前・地図・都道府県）→ ② 3分でわかる（5つの図への入口）→ ③ 全国の予算を見る・比べる（4枚の図のカード）
// → ④ 詳しい情報・資料。検索の欄はこのページの①だけに置く（ほかの場所に同じ欄を重ねない）

import { db, loadGeo, loadPopulation, munisOfPref, status, cell, metricOf, ratio, generalOf } from './store.js';
import { $, $$, esc, yen, yenPer, pct, num, fyFull, normQ, ratioPct } from './util.js';
import { href, go, currentYear, currentStage, yearPicker, bindYearPicker, stageSeg } from './app.js';
import { drawMap, legendHTML } from './map.js';
import { statusBadge, stLabel, muniPicker, prefButtons, amountOrStatus, statusLegendNote, ratioView, fieldLabel } from './components.js';
import { loadProjectsIndex } from './store.js';
import { ICON } from './icons.js';
import { COLORS, donutSVG } from './charts.js';
import { valueOf, fieldTotals, fieldShares } from './calc.js';
import { GUIDE_STEPS } from './page-guide.js';

// 地図の色分け（初めは「予算の合計」だけ。ほかは切り替えて見る）
export const MAP_MODES = {
  total: { label: '予算の合計', long: '多文化共生関連予算の合計（確認できた分）', breaks: [3e7, 1e8, 3e8, 1e9], fmt: v => yen(v, { approx: true }), bin: ['3,000万円未満', '3,000万〜1億円', '1億〜3億円', '3億〜10億円', '10億円以上'] },
  ratio: { label: '一般会計に占める割合', long: '一般会計の予算総額に占める割合', breaks: [0.0002, 0.0005, 0.001, 0.002], fmt: ratioPct, bin: ['0.02%未満', '0.02〜0.05%', '0.05〜0.1%', '0.1〜0.2%', '0.2%以上'] },
  perCapita: { label: '住民1人当たり', long: '住民1人当たりの予算（参考の目安）', breaks: [100, 300, 1000, 3000], fmt: yenPer, bin: ['100円未満', '100〜300円', '300〜1,000円', '1,000〜3,000円', '3,000円以上'], denom: 'population' },
  perForeign: { label: '外国人住民1人当たり', long: '外国人住民1人当たりの予算（参考の目安）', breaks: [2000, 5000, 1e4, 2e4], fmt: yenPer, bin: ['2,000円未満', '2,000〜5,000円', '5,000円〜1万円', '1万〜2万円', '2万円以上'], denom: 'foreign' },
  yoy: { label: '前年度からの増減', long: '前年度からの増減率（同じ段階どうし）', breaks: [-0.2, -0.05, 0.05, 0.2], fmt: v => pct(v), bin: ['20%以上減', '5〜20%減', 'ほぼ同じ（±5%）', '5〜20%増', '20%以上増'] },
  status: { label: '調査状況', long: '調査状況' },
};
const SEQ = ['#cfe9d7', '#8fcaa4', '#4ea676', '#1d7347', '#0b4127'];
const DIV = ['#a8590f', '#e8b07a', '#e3e2de', '#8fcaa4', '#1d7347'];
const ST_FILL = { '確認済み': '#3d9a6c', '一部確認': '#86b6ef', '資料未発見': 'url(#pat-dots)', '金額非公表': 'url(#pat-dots)', '該当事業なし': '#ffffff', '未調査': '#d6d8d6', '決算未公表': '#e9ecef' };
const NONE = '#d6d8d6';

function binOf(mode, v) {
  const b = MAP_MODES[mode].breaks;
  let i = 0; while (i < b.length && v >= b[i]) i++;
  return i;
}

// 地図の色（未調査は灰色、0円は白、資料未発見・金額非公表は点の模様、一部確認は斜線）
export function areaStyle(code, { mode, fy, stage, partial }) {
  const st = status(code, fy, stage);
  if (mode === 'status') return { fill: ST_FILL[st] || NONE };
  if (st === '資料未発見' || st === '金額非公表') return { fill: 'url(#pat-dots)' };
  if (st === '該当事業なし') return { fill: mode === 'yoy' ? NONE : '#ffffff' };
  const v = metricOf(mode, code, fy, stage, partial);
  if (v === null) return { fill: NONE };
  if (mode !== 'yoy' && v === 0) return { fill: '#ffffff' };
  const pal = mode === 'yoy' ? DIV : SEQ;
  const partialHere = st === '一部確認' || (mode === 'yoy' && status(code, fy - 1, stage) === '一部確認');
  return { fill: pal[binOf(mode, v)], pattern: partialHere ? 'partial' : null };
}

export function mapLegend(mode, { fy, stage, partial }) {
  const m = MAP_MODES[mode];
  if (mode === 'status') {
    return legendHTML('調査状況', [
      { fill: ST_FILL['確認済み'], label: stLabel('確認済み') }, { fill: ST_FILL['一部確認'], label: stLabel('一部確認') },
      { fill: '#fff', label: stLabel('該当事業なし') }, { cls: 'dots', label: '資料が見つからない・金額は非公表' }, { fill: NONE, label: '未調査' },
    ], statusLegendNote());
  }
  const pal = mode === 'yoy' ? DIV : SEQ;
  const items = m.bin.map((label, i) => ({ fill: pal[i], label }));
  if (mode !== 'yoy') items.push({ fill: '#fff', label: mode === 'ratio' ? '0%（関係する事業なし）' : '0円（関係する事業なし）' });
  items.push({ fill: NONE, label: mode === 'ratio' ? '未調査・一般会計の総額が未確認など（0%ではありません）' : mode === 'yoy' ? '比べられる2年度分のデータがない' : '未調査など（0円ではありません）' });
  if (partial) items.push({ cls: 'partial', label: '斜線：一部の資料だけ調査（確認できた分）' });
  return legendHTML(`${m.long}（${fyFull(fy)}・${stage}）`, items, mode === 'perForeign' ? '外国人1人に支払われた金額ではありません。合計を外国人住民の数で割った目安です。' : mode === 'ratio' ? '分子は一般会計の事業だけ（特別会計・企業会計の事業は入れない）。分母はその自治体の一般会計の予算総額です。' : '');
}

const short = name => name.replace(/(都|府|県)$/, '');

export function homePage(ctx) {
  const { app, params } = ctx;
  const st = {
    fy: currentYear(params), stage: currentStage(params),
    mode: MAP_MODES[params.get('mm')] ? params.get('mm') : 'total',
    tab: params.get('ft') === 'pref' ? 'pref' : 'map',
    pc: /^\d{2}$/.test(params.get('p') || '') ? params.get('p') : null,
    sel: params.get('sel') || null,
    partial: params.get('pt') !== '0',
  };
  const prog = db.meta.progress?.[st.fy] || { pref: {}, muni: {} };
  const done = lv => Object.entries(prog[lv] || {}).filter(([k]) => k !== '未調査').reduce((s, [, v]) => s + v, 0);
  const doneAll = done('pref') + done('muni');

  app.innerHTML = `
  <section class="find" id="find" aria-labelledby="find-h">
    <h1 id="find-h">自治体の多文化共生予算を調べる</h1>
    <p class="find-lead">外国人に関係する事業に<b>いくら</b>使う？　<b>一般会計の何％</b>？　<b>何に</b>使う？　公式資料で確かめた金額で見られます。</p>
    <div id="find-picker"></div>
    <div class="find-tabs" role="tablist" aria-label="ほかの探し方">
      <button type="button" role="tab" id="tab-map" aria-controls="panel-map" aria-selected="${st.tab === 'map'}">${ICON.map}<span>地図から探す</span></button>
      <button type="button" role="tab" id="tab-pref" aria-controls="panel-pref" aria-selected="${st.tab === 'pref'}">${ICON.list}<span>都道府県から探す</span></button>
    </div>
    <div id="panel-map" role="tabpanel" aria-labelledby="tab-map"${st.tab === 'map' ? '' : ' hidden'}>
      <div class="map-ctl" id="map-ctl"></div>
      <div class="map-layout" id="map">
        <div><div id="map-box"></div><div id="map-legend"></div></div>
        <div id="map-side"></div>
      </div>
    </div>
    <div id="panel-pref" role="tabpanel" aria-labelledby="tab-pref"${st.tab === 'pref' ? '' : ' hidden'}></div>
    <p class="progress-line">調べた自治体：<b>${num(doneAll)}</b> / ${num(db.munis.length)}（${fyFull(st.fy)}・当初予算。都道府県 ${done('pref')}・市区町村 ${done('muni')}）。調べた自治体から順に公開しています。</p>
  </section>

  <section class="gt" aria-labelledby="gt-h">
    <div class="gt-head"><span class="kicker">初めての方へ</span><h2 id="gt-h">3分でわかる 多文化共生予算</h2><p>5つの図で、何のお金か・数字の見方をつかめます。</p></div>
    <ol class="gt-steps">${GUIDE_STEPS.map(([id, t, ic], i) => `<li><a href="${href('/guide', { to: id })}"><span class="gt-no">${i + 1}</span>${ICON[ic] || ''}<span class="gt-t">${esc(t)}</span></a></li>`).join('')}</ol>
    <p class="gt-go"><a class="btn" href="#/guide">5つの図で見る</a></p>
  </section>

  <section class="ex" aria-labelledby="ex-h">
    <h2 id="ex-h" class="sec-h">全国の予算を見る・比べる</h2>
    <p class="sec-sub" id="ex-sub"></p>
    <div class="ex-cards" id="ex-cards"></div>
  </section>

  <section class="more" aria-labelledby="more-h">
    <h2 id="more-h" class="sec-h">詳しい情報・資料</h2>
    <ul class="more-links">
      <li><a href="#/search">${ICON.search}<span>事業の詳細検索<small>事業名・使い道・都道府県で探す</small></span></a></li>
      <li><a href="#/about?to=method">${ICON.book}<span>調査方法<small>何を・どの資料で調べたか</small></span></a></li>
      <li><a href="#/about?to=rule">${ICON.ruler}<span>集計基準<small>合計に入れるもの・入れないもの</small></span></a></li>
      <li><a href="#/about?to=src-rule">${ICON.doc}<span>公式資料・出典<small>出典の決まり。資料は各自治体のページに</small></span></a></li>
      <li><a href="${href('/status', { y: st.fy })}">${ICON.check}<span>調査状況<small>どの自治体・年度まで調べたか</small></span></a></li>
      <li><a href="#/changes">${ICON.history}<span>更新履歴<small>データの追加・訂正の記録</small></span></a></li>
      <li><a href="#/data">${ICON.download}<span>データのダウンロード<small>CSV。出典URLつき</small></span></a></li>
    </ul>
    <p class="rel-links">関連サイト：<a href="https://yumaki5555.github.io/zairyu/" target="_blank" rel="noopener">数でみる在留外国人</a>・<a href="https://yumaki5555.github.io/mou-map/" target="_blank" rel="noopener">日本と世界のMOU・協定マップ</a>・<a href="https://yumaki5555.github.io/" target="_blank" rel="noopener">日本を知る。（総合入口）</a></p>
  </section>`;

  const saveURL = () => {
    const p = { y: st.fy, s: st.stage === '決算' ? '決算' : '', mm: st.mode === 'total' ? '' : st.mode, ft: st.tab === 'pref' ? 'pref' : '', p: st.pc || '', sel: st.sel || '', pt: st.partial ? '' : '0' };
    history.replaceState(null, '', href('/', p));
  };

  // ---------- ① 自治体名で探す（候補に事業名も出す） ----------
  const projIdx = { list: null };
  loadProjectsIndex().then(l => { projIdx.list = l; }).catch(() => { projIdx.list = []; });
  muniPicker($('#find-picker'), {
    id: 'find-q', label: '自治体名で探す', placeholder: '例：浜松市／しんじゅく／愛知県', fy: st.fy, big: true,
    onPick: m => go('/m/' + m.code, { y: st.fy }),
    extra: q => {
      const n = normQ(q);
      if (!n || n.length < 2 || !projIdx.list) return [];
      return projIdx.list.filter(p => normQ(p[2]).includes(n)).slice(0, 4).map(p => ({ label: p[2], sub: `事業・${db.byCode.get(p[1])?.full || ''}`, href: href('/m/' + p[1], { y: st.fy, pj: p[0] }) }));
    },
  });

  // ---------- 地図から探す・都道府県から探す（切り替え） ----------
  const setTab = t => {
    st.tab = t;
    $('#tab-map').setAttribute('aria-selected', String(t === 'map'));
    $('#tab-pref').setAttribute('aria-selected', String(t === 'pref'));
    $('#panel-map').hidden = t !== 'map';
    $('#panel-pref').hidden = t !== 'pref';
    saveURL();
    if (t === 'pref') drawPref();
  };
  $('#tab-map').addEventListener('click', () => setTab('map'));
  $('#tab-pref').addEventListener('click', () => setTab('pref'));
  $('.find-tabs').addEventListener('keydown', ev => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    const t = st.tab === 'map' ? 'pref' : 'map'; setTab(t); $(`#tab-${t}`).focus();
  });

  const drawCtl = () => {
    $('#map-ctl').innerHTML = `
      <div class="ctl"><span class="label">年度</span>${yearPicker(st.fy, 'map-fy')}</div>
      <div class="ctl"><span class="label">予算か決算か</span>${stageSeg(st.stage)}</div>
      <label class="ctl"><span class="label">色分け</span><select id="map-mode">${Object.entries(MAP_MODES).map(([k, m]) => `<option value="${k}"${st.mode === k ? ' selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>
      <label class="check small"><input type="checkbox" id="map-partial" ${st.partial ? 'checked' : ''}> 一部の資料だけ調べた自治体にも色をつける</label>`;
    bindYearPicker($('#map-ctl'), y => { st.fy = y; drawCtl(); drawMapArea(); });
    $$('#map-ctl [data-stage]').forEach(b => b.addEventListener('click', () => { st.stage = b.dataset.stage; drawCtl(); drawMapArea(); }));
    $('#map-mode').addEventListener('change', async e => {
      st.mode = e.target.value;
      if (MAP_MODES[st.mode].denom) await loadPopulation();
      drawMapArea();
    });
    $('#map-partial').addEventListener('change', e => { st.partial = e.target.checked; drawMapArea(); });
  };

  const valueLine = m => {
    if (st.mode === 'status') return esc(stLabel(status(m.code, st.fy, st.stage)));
    const v = metricOf(st.mode, m.code, st.fy, st.stage, st.partial);
    if (v !== null) return `${esc(MAP_MODES[st.mode].label)}：<b>${esc(MAP_MODES[st.mode].fmt(v))}</b>`;
    if (st.mode === 'ratio') { const r = ratioView(m.code, st.fy, st.stage); return `一般会計に占める割合：${esc(r.sub || r.text)}`; }
    return esc(st.mode === 'yoy' ? '前年度と比べられるデータなし' : amountOrStatus(m.code, st.fy, st.stage).text);
  };
  const tipOf = m => {
    const a = amountOrStatus(m.code, st.fy, st.stage);
    return `<b>${esc(m.name)}</b><br>${st.mode === 'total' ? esc(a.value !== undefined ? '予算の合計：' + a.text : a.text) : valueLine(m)}${a.st === '一部確認' ? '<br>（一部の資料だけ調査）' : ''}`;
  };
  // 選んだ自治体の小さなカード（金額・割合・詳しいページへ）
  const pickCard = m => {
    const a = amountOrStatus(m.code, st.fy, st.stage);
    const r = ratioView(m.code, st.fy, st.stage);
    return `<div class="pick-card" aria-live="polite">
      <p class="pc-name">${esc(m.full)}${m.isPref ? '<small>（都道府県庁の予算）</small>' : ''}</p>
      <p class="pc-when">${esc(fyFull(st.fy))}・${esc(st.stage)} ${statusBadge(a.st)}</p>
      <div class="pc-nums"><div><span class="k">多文化共生関連予算</span><b>${esc(a.text)}</b></div>
        <div><span class="k">一般会計に占める割合</span><b>${esc(r.text)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</div></div>
      <a class="btn btn-block" href="${href('/m/' + m.code, { y: st.fy, s: st.stage === '決算' ? '決算' : '' })}">${esc(m.name)}のページを見る</a>
    </div>`;
  };
  const listItem = m => {
    const a = amountOrStatus(m.code, st.fy, st.stage);
    const known = a.value !== undefined || a.text === '0円';
    return `<li><a href="${href('/m/' + m.code, { y: st.fy })}">${esc(m.name)}</a><span class="amt">${known ? esc(a.text) : statusBadge(a.st)}</span>${known && st.mode !== 'total' && st.mode !== 'status' ? `<span class="small muted">${valueLine(m)}</span>` : ''}</li>`;
  };
  const byValue = list => [...list].sort((a, b) => {
    const va = valueOf(cell(a.code, st.fy, st.stage)), vb = valueOf(cell(b.code, st.fy, st.stage));
    if ((va !== null) !== (vb !== null)) return va !== null ? -1 : 1;
    if (va !== null && vb !== null && va !== vb) return vb - va;
    return a.code.localeCompare(b.code);
  });

  const drawMapArea = async () => {
    saveURL();
    $('#map-legend').innerHTML = mapLegend(st.mode, { fy: st.fy, stage: st.stage, partial: st.partial });
    const side = $('#map-side');
    const sopt = { mode: st.mode, fy: st.fy, stage: st.stage, partial: st.partial };
    if (!st.pc) {
      const shape = await loadGeo('japan');
      const byName = new Map(db.prefs.map(p => [p.name, p]));
      drawMap($('#map-box'), {
        shape, label: '日本地図（都道府県）。押すとその都道府県の市区町村の地図へ',
        style: key => areaStyle(byName.get(key).code, sopt),
        name: key => key, aria: key => `${key}：${amountOrStatus(byName.get(key).code, st.fy, st.stage).text}。押すと市区町村の地図へ`,
        tip: key => tipOf(byName.get(key)),
        onSelect: key => { st.pc = byName.get(key).pc; st.sel = null; drawMapArea(); },
      });
      const surveyed = byValue(db.prefs.filter(p => !['未調査', '決算未公表'].includes(status(p.code, st.fy, st.stage))));
      side.innerHTML = `<p class="map-hint">${ICON.pin}<span>都道府県を押すと、その都道府県の<b>市区町村の地図</b>に切り替わります。都道府県の色は都道府県庁の予算です。</span></p>
        ${surveyed.length ? `<details class="side-list"><summary>調べた都道府県（${surveyed.length}）</summary><ul class="muni-list">${surveyed.map(listItem).join('')}</ul></details>` : ''}`;
    } else {
      const pref = db.prefs.find(p => p.pc === st.pc);
      const munis = munisOfPref(st.pc);
      const shape = await loadGeo(`pref-${pref.geoFile}`);
      const byKey = new Map(munis.filter(m => m.geoKey).map(m => [m.geoKey, m]));
      drawMap($('#map-box'), {
        shape, label: `${pref.name}の市区町村の地図`, selected: munis.find(m => m.code === st.sel)?.geoKey,
        style: key => byKey.has(key) ? areaStyle(byKey.get(key).code, sopt) : { fill: '#f2f2f0' },
        name: key => byKey.get(key)?.name || key,
        aria: key => byKey.has(key) ? `${byKey.get(key).name}：${amountOrStatus(byKey.get(key).code, st.fy, st.stage).text}` : key,
        tip: key => byKey.has(key) ? tipOf(byKey.get(key)) : esc(key),
        onSelect: key => { const m = byKey.get(key); if (!m) return; st.sel = m.code; saveURL(); $('#map-sel').innerHTML = pickCard(m); $('#map-sel').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
      });
      const surveyed = byValue(munis.filter(m => !['未調査', '決算未公表'].includes(status(m.code, st.fy, st.stage))));
      const noShape = munis.filter(m => !m.geoKey);
      side.innerHTML = `<p class="map-back"><button type="button" class="btn btn-outline btn-small" id="map-up">← 全国の地図に戻る</button></p>
        <div id="map-sel">${st.sel && db.byCode.get(st.sel) ? pickCard(db.byCode.get(st.sel)) : pickCard(pref)}</div>
        <p class="small muted">地図の市区町村を押すと、上のカードが切り替わります。${noShape.length ? `${noShape.map(m => m.name).join('・')}は地図に形がないため、下の一覧から選んでください。` : ''}</p>
        <details class="side-list"${surveyed.length ? ' open' : ''}><summary>${esc(pref.name)}の調べた市区町村（${surveyed.length} / ${munis.length}）</summary>${surveyed.length ? `<ul class="muni-list">${surveyed.map(listItem).join('')}</ul>` : '<p class="small muted">まだありません（未調査）。</p>'}</details>`;
      $('#map-up').addEventListener('click', () => { st.pc = null; st.sel = null; drawMapArea(); });
    }
  };

  // 都道府県から探す：地方ごとのボタン → その都道府県の市区町村の一覧
  const drawPref = () => {
    const box = $('#panel-pref');
    const pref = st.pc ? db.prefs.find(p => p.pc === st.pc) : null;
    const munis = pref ? munisOfPref(pref.pc) : [];
    const sorted = byValue(munis);
    box.innerHTML = `${prefButtons(st.fy, st.pc)}
      ${pref ? `<div class="pref-pick"><div>${pickCard(pref)}</div>
        <div><h3>${esc(pref.name)}の市区町村（${num(munis.length)}）</h3><p class="small muted">調べた市区町村を上に、確認できた予算の多い順に並べています（${esc(fyFull(st.fy))}・${esc(st.stage)}）。</p>
        <ul class="muni-list tall">${sorted.map(listItem).join('')}</ul></div></div>` : '<p class="info">都道府県を選ぶと、その都道府県庁と市区町村の一覧が出ます。</p>'}`;
    $$('#panel-pref .pb').forEach(b => b.addEventListener('click', () => { st.pc = b.dataset.pc; st.sel = null; saveURL(); drawPref(); $('.pref-pick')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }));
  };

  // ---------- ③ 全国の予算を見る・比べる（4枚のカード。中の図は実際のデータ） ----------
  const drawCards = () => {
    const fy = st.fy, stage = '当初予算';
    const when = `${fyFull(fy)}・当初予算`;
    $('#ex-sub').textContent = `${when}。調べた自治体のうち、公式資料で金額を確かめた分です。`;
    // 使い道：全国（都道府県庁＋市区町村の単純合計）の上位3分類
    const ft = fieldTotals(db.munis.map(m => cell(m.code, fy, stage)));
    const sh = fieldShares(ft.amount).filter(r => r.amount > 0);
    const donut = donutSVG(sh.map(r => ({ value: r.amount, color: COLORS.field[r.field] })), { size: 104 });
    // ランキング：一般会計に占める割合の高い市区町村（主な資料を調査済みのものだけ）
    const rk = db.munis.filter(m => !m.isPref).map(m => ({ m, v: metricOf('ratio', m.code, fy, stage, false) })).filter(x => x.v !== null).sort((a, b) => b.v - a.v).slice(0, 3);
    const rmax = rk[0]?.v || 1;
    // 年度別：前の年度と両方を同じ条件（主な資料を調査済み）で確かめた自治体の例（予算の大きい順に1つ）
    const both = db.munis.filter(m => metricOf('total', m.code, fy, stage, false) !== null && metricOf('total', m.code, fy - 1, stage, false) !== null);
    const exm = both.sort((a, b) => (metricOf('total', b.code, fy, stage, false) || 0) - (metricOf('total', a.code, fy, stage, false) || 0))[0];
    const s0 = exm ? metricOf('total', exm.code, fy - 1, stage, false) : 0, s1 = exm ? metricOf('total', exm.code, fy, stage, false) : 0;
    const tmax = Math.max(s0, s1, 1);
    const card = (path, ic, title, viz, text, extra = {}) => `<a class="ex-card" href="${href(path, { y: fy, ...extra })}"><div class="ex-viz">${viz}</div><div class="ex-text"><h3>${ICON[ic]}<span>${title}</span></h3><p>${text}</p></div></a>`;
    $('#ex-cards').innerHTML = [
      card('/national', 'donut', '使い道を見る', `<div class="ex-donut">${donut}</div>`,
        sh.length ? `多いのは ${sh.slice(0, 3).map(r => `<b>${esc(fieldLabel(r.field))}</b> ${(r.share * 100).toFixed(0)}%`).join('・')}（全国・10分類）` : '確認できた金額がまだありません'),
      card('/ranking', 'bars', 'ランキング', rk.length ? `<ul class="ex-bars">${rk.map(x => `<li><span>${esc(x.m.name)}</span><b>${esc(ratioPct(x.v))}</b><i style="width:${Math.max(6, x.v / rmax * 100).toFixed(1)}%"></i></li>`).join('')}</ul>` : '',
        '予算の合計・<b>一般会計に占める割合</b>・1人当たりで並べる（上は一般会計に占める割合の高い市区町村）', { k: 'ratio' }),
      card('/compare', 'compare', '自治体を比較', `<div class="ex-cmp" aria-hidden="true"><span style="height:46%"></span><span style="height:88%"></span><span style="height:62%"></span></div>`,
        '2〜3の自治体を選んで、予算額・一般会計に占める割合・使い道を並べて比べる'),
      card('/trend', 'trend', '年度別の変化', exm ? `<div class="ex-yoy"><span><i style="height:${(s0 / tmax * 100).toFixed(1)}%"></i><small>${fy - 1}</small></span><span><i style="height:${(s1 / tmax * 100).toFixed(1)}%"></i><small>${fy}</small></span></div>` : '',
        exm ? `自治体ごとに、予算額や一般会計に占める割合の変化を見る（例：${esc(exm.full)} ${esc(yen(s0, { approx: true }))} → <b>${esc(yen(s1, { approx: true }))}</b>）` : '自治体ごとに、予算額や一般会計に占める割合の変化をグラフで見る', exm ? { c: exm.code } : {}),
    ].join('');
  };

  drawCtl();
  drawCards();
  drawMapArea();
  if (st.tab === 'pref') drawPref();
  if (st.mode === 'perForeign' || st.mode === 'perCapita') loadPopulation().then(drawMapArea).catch(() => {});
}
