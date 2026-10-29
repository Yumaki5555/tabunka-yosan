// 地図・都道府県から探す（トップページの「自治体で調べる」から開く）
// 地図から探す：日本地図 → 都道府県を押すと市区町村の地図。都道府県から探す：地方ごとのボタン → 市区町村の一覧

import { db, loadGeo, loadPopulation, munisOfPref, status, cell, metricOf } from './store.js';
import { $, $$, esc, yen, yenPer, pct, num, fyFull, ratioPct } from './util.js';
import { href, currentYear, currentStage, yearPicker, bindYearPicker, stageSeg } from './app.js';
import { drawMap, legendHTML } from './map.js';
import { statusBadge, stLabel, prefButtons, amountOrStatus, statusLegendNote, ratioView } from './components.js';
import { ICON } from './icons.js';
import { valueOf } from './calc.js';

// 地図の色分け（初めは「予算の合計」だけ。ほかは切り替えて見る）
export const MAP_MODES = {
  total: { label: '予算の合計', long: '多文化共生関連予算の合計（確認できた分）', breaks: [3e7, 1e8, 3e8, 1e9], fmt: v => yen(v, { approx: true }), bin: ['3,000万円未満', '3,000万〜1億円', '1億〜3億円', '3億〜10億円', '10億円以上'] },
  ratio: { label: '一般会計に占める割合', long: '一般会計の予算総額に占める割合', breaks: [0.0002, 0.0005, 0.001, 0.002], fmt: ratioPct, bin: ['0.02%未満', '0.02〜0.05%', '0.05〜0.1%', '0.1〜0.2%', '0.2%以上'] },
  perCapita: { label: '住民1人当たり', long: '住民1人当たりの予算（参考の目安）', breaks: [100, 300, 1000, 3000], fmt: yenPer, bin: ['100円未満', '100〜300円', '300〜1,000円', '1,000〜3,000円', '3,000円以上'], denom: 'population' },
  perForeign: { label: '外国人住民1人当たり', long: '外国人住民1人当たりの予算（参考の目安）', breaks: [2000, 5000, 1e4, 2e4], fmt: yenPer, bin: ['2,000円未満', '2,000〜5,000円', '5,000円〜1万円', '1万〜2万円', '2万円以上'], denom: 'foreign' },
  yoy: { label: '前年度からの増減', long: '前年度からの増減率（同じ段階・同じ事業どうし）', breaks: [-0.2, -0.05, 0.05, 0.2], fmt: v => pct(v), bin: ['20%以上減', '5〜20%減', 'ほぼ同じ（±5%）', '5〜20%増', '20%以上増'] },
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
  const partialHere = st === '一部確認';
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
  items.push({ fill: NONE, label: mode === 'ratio' ? '未調査・一般会計の総額が未確認など（0%ではありません）' : mode === 'yoy' ? '比べられる2年度分のデータがない（未調査・一部の資料だけ調査など）' : '未調査など（0円ではありません）' });
  if (partial && mode !== 'yoy') items.push({ cls: 'partial', label: '斜線：一部の資料だけ調査（確認できた分）' });
  return legendHTML(`${m.long}（${fyFull(fy)}・${stage}）`, items, mode === 'perForeign' ? '外国人1人に支払われた金額ではありません。合計を外国人住民の数で割った目安です。' : mode === 'ratio' ? '分子は一般会計の事業だけ（特別会計・企業会計の事業は入れない）。分母はその自治体の一般会計の予算総額です。'
    : mode === 'yoy' ? '前の年度と選んだ年度の両方を、主な資料で調査済みの自治体だけ色をつけます（一部の資料だけ調べた年度があると、調べた範囲の差で増減が大きく見えるため）。増減率は、両方の年度に金額がある同じ事業どうしで計算します（前倒しの補正予算や、片方の年度だけの事業で合計の差がずれるため）。' : '');
}

export function findPage(ctx) {
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
  <div class="page-head find-head">
    <nav class="crumbs" aria-label="現在の場所"><a href="${href('/', { y: st.fy })}">トップ</a> › 地図・都道府県から探す</nav>
    <h1>地図・都道府県から探す</h1>
    <p class="lead">自治体名で探すときは、<a href="#/?to=find">トップページの検索</a>が便利です。</p>
  </div>
  <div class="find-tabs" role="tablist" aria-label="探し方">
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
  <p class="progress-line">調べた自治体：<b>${num(doneAll)}</b> / ${num(db.munis.length)}（${fyFull(st.fy)}・当初予算。都道府県 ${done('pref')}・市区町村 ${done('muni')}）。調べた自治体から順に公開しています。</p>`;

  const saveURL = () => {
    const p = { y: st.fy, s: st.stage === '決算' ? '決算' : '', mm: st.mode === 'total' ? '' : st.mode, ft: st.tab === 'pref' ? 'pref' : '', p: st.pc || '', sel: st.sel || '', pt: st.partial ? '' : '0' };
    history.replaceState(null, '', href('/find', p));
  };

  // ---------- 地図から探す・都道府県から探す（切り替え） ----------
  const setTab = t => {
    st.tab = t;
    $('#tab-map').setAttribute('aria-selected', String(t === 'map'));
    $('#tab-pref').setAttribute('aria-selected', String(t === 'pref'));
    $('#panel-map').hidden = t !== 'map';
    $('#panel-pref').hidden = t !== 'pref';
    saveURL();
    if (t === 'pref') drawPref(); else drawMapArea();
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
    if (st.mode === 'yoy') return esc([st.fy - 1, st.fy].some(y => status(m.code, y, st.stage) === '一部確認') ? '前年度と比べられません（一部の資料だけ調べた年度があるため）' : '前年度と比べられるデータなし');
    return esc(amountOrStatus(m.code, st.fy, st.stage).text);
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

  // 地図は「地図から探す」を開いているときだけ読み込む
  let ctlDone = false;
  const drawMapArea = async () => {
    saveURL();
    if (st.tab !== 'map') return;
    if (!ctlDone) { ctlDone = true; drawCtl(); }
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
        <div><h2 class="pref-pick-h">${esc(pref.name)}の市区町村（${num(munis.length)}）</h2><p class="small muted">調べた市区町村を上に、確認できた予算の多い順に並べています（${esc(fyFull(st.fy))}・${esc(st.stage)}）。</p>
        <ul class="muni-list tall">${sorted.map(listItem).join('')}</ul></div></div>` : '<p class="info">都道府県を選ぶと、その都道府県庁と市区町村の一覧が出ます。</p>'}`;
    $$('#panel-pref .pb').forEach(b => b.addEventListener('click', () => { st.pc = b.dataset.pc; st.sel = null; saveURL(); drawPref(); $('.pref-pick')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }));
  };

  if (st.tab === 'pref') { saveURL(); drawPref(); } else drawMapArea();
  if (st.mode === 'perForeign' || st.mode === 'perCapita') loadPopulation().then(() => { if (st.tab === 'map') drawMapArea(); }).catch(() => {});
}
