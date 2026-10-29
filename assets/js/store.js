// データの読み込み（必要になったときに、必要な分だけ読みます）

import { metric, cellOf, statusOf, ratioOf } from './calc.js';

const cache = new Map();
async function getJSON(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url, { cache: 'no-cache' }).then(r => {
      if (!r.ok) throw new Error(`${url} を読み込めませんでした（${r.status}）`);
      return r.json();
    }).catch(e => { cache.delete(url); throw e; }));
  }
  return cache.get(url);
}

export const db = {
  config: null, munis: [], byCode: new Map(), prefs: [], sum: {}, gen: {}, cmp: {}, meta: null, years: [],
  pop: null, popYears: null,
};

export async function loadCore() {
  const [config, master, summary, meta] = await Promise.all([
    getJSON('data/config.json'), getJSON('data/dist/master.json'), getJSON('data/dist/summary.json'), getJSON('data/dist/meta.json'),
  ]);
  db.config = config;
  db.years = config.years;
  db.sum = summary.sum;
  db.gen = summary.gen || {};
  db.cmp = summary.cmp || {};
  db.meta = meta;
  db.masterSource = master.source;
  const prefName = {};
  for (const [code, name, , kind] of master.rows) if (kind === '都道府県') prefName[code.slice(0, 2)] = name;
  db.munis = master.rows.map(([code, name, kana, kind, geoFile, geoKey, zairyu]) => {
    const pc = code.slice(0, 2);
    const isPref = kind === '都道府県';
    return { code, name, kana, kind, geoFile, geoKey, zairyu, pc, pref: prefName[pc], isPref, full: isPref ? name : prefName[pc] + name };
  });
  db.byCode = new Map(db.munis.map(m => [m.code, m]));
  db.prefs = db.munis.filter(m => m.isPref);
  return db;
}

export async function loadPopulation() {
  if (db.pop) return db.pop;
  const p = await getJSON('data/dist/population.json');
  db.pop = p;
  db.popYears = new Map(p.years.map((y, i) => [y, i]));
  db.statSources = new Map(p.sources.map(s => [s.source_id, s]));
  return p;
}

// その年度の人口・外国人住民数（なければ null）
export function popOf(code, fy) {
  if (!db.pop) return null;
  const r = db.pop.d[code];
  const i = db.popYears.get(fy);
  if (!r || i === undefined) return null;
  return { population: r[0][i], foreign: r[1][i], asOf: db.pop.asOf[fy] };
}

export const loadDetail = pc => getJSON(`data/dist/detail/${pc}.json`).catch(() => ({ projects: [], budgets: [], funds: [], recipients: [], sources: [], general: [], survey: [], changelog: [], notes: [], links: [] }));
export const loadProjectsIndex = () => getJSON('data/dist/projects-index.json');
// 使い道の円グラフで分類を押したときの、全国の事業の一覧（押したときだけ読む）
export const loadUses = () => getJSON('data/dist/uses.json');
export const loadGeo = file => getJSON(`data/geo/${file}.json`);
export const loadChangelog = () => getJSON('data/dist/changelog.json');

export function status(code, fy, stage) {
  return statusOf(db.sum, code, fy, stage, db.config.settlement_latest_fy);
}
export function cell(code, fy, stage) {
  return cellOf(db.sum, code, fy, stage);
}
export function metricOf(mode, code, fy, stage, includePartial) {
  return metric(mode, { sum: db.sum, code, fy, stage, pop: popOf(code, fy), includePartial, gen: db.gen });
}
// 一般会計の予算総額（確認済みのものだけ。未確認なら null）
export function generalOf(code, fy, stage = '当初予算') {
  return db.gen?.[code]?.[fy]?.[stage] ?? null;
}
// 比べるときの注意（その年度にかかるもの。対象の事業があるときは、その事業が合計に入っている年度・段階だけ）。amt：対象の事業を数えた金額
export function cmpNotes(code, fy, stage) {
  return (db.cmp?.[code] || [])
    .filter(n => (!n.from || n.from <= fy) && (!n.to || n.to >= fy) && (!n.pid || n.x?.[fy]?.[stage] > 0))
    .map(n => ({ ...n, amt: n.x?.[fy]?.[stage] ?? null }));
}
// 一般会計に占める割合（calc.js の ratioOf。{v, num, den, partial, why}）
export function ratio(code, fy, stage) {
  return ratioOf(cellOf(db.sum, code, fy, stage), generalOf(code, fy, stage));
}
export function munisOfPref(pc) {
  return db.munis.filter(m => m.pc === pc && !m.isPref);
}
// 調査データがある自治体（どこかの年度に記録があるもの）
export function surveyedCodes() {
  return Object.keys(db.sum);
}
