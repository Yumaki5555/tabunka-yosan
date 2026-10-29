// トップページ（目的別の入口）：① 3分でわかる（はじめての方向け）→ ② 自治体で調べる｜全国を見る（横に並べる）
// → ③ 見えてくること（このサイトでわかることの要約）→ ④ 詳しい情報・資料
// 地図・都道府県の一覧は別のページ（#/find）に分け、トップページでは読み込まない。検索の欄はこのページの「自治体で調べる」だけに置く

import { db, loadProjectsIndex } from './store.js';
import { $, esc, num, fyFull, normQ } from './util.js';
import { href, go, currentYear } from './app.js';
import { muniPicker } from './components.js';
import { ICON } from './icons.js';
import { ILLUST } from './illust.js';
import { COLORS } from './charts.js';

// 全国を見る（使い道・ランキング・比較・年度別）
const VIEWS = [
  ['/national', 'donut', '使い道を見る', 'どのような事業に予算が使われている？'],
  ['/ranking', 'rank', 'ランキング', '予算額・割合などのランキングを確認'],
  ['/compare', 'compare', '自治体を比較', '複数の自治体の予算を並べて比較'],
  ['/trend', 'trend', '年度別の変化', '過去からの推移をグラフで見る'],
];
// 見えてくること（使い道の絵は、10分類のうち身近な6つ）
const USE_TILES = [['日本語教育', 'class'], ['外国人相談', 'talk'], ['教育支援', 'school'], ['医療・保健', 'medical'], ['生活支援', 'life'], ['多言語対応', 'lang']];

export function homePage(ctx) {
  const { app, params } = ctx;
  const fy = currentYear(params);
  const prog = db.meta.progress?.[fy] || { pref: {}, muni: {} };
  const done = lv => Object.entries(prog[lv] || {}).filter(([k]) => k !== '未調査').reduce((s, [, v]) => s + v, 0);
  const doneAll = done('pref') + done('muni');
  const door = (path, ill, title, sub, extra = {}) => `<a class="door" href="${href(path, { y: fy, ...extra })}"><span class="door-illu">${ILLUST[ill]}</span><b>${esc(title)}</b><small>${esc(sub)}</small></a>`;

  app.innerHTML = `
  <h1 class="visually-hidden">全国 多文化共生予算マップ</h1>
  <div class="home">
    <a class="hero3" href="${href('/guide', { y: fy })}">
      <span class="hero3-text">
        <span class="hero3-k">はじめての方向け</span>
        <span class="hero3-t">3分でわかる<br>多文化共生予算</span>
        <span class="hero3-d">このサイトでわかること、使い方、データの見方をやさしく解説します。</span>
      </span>
      <span class="hero3-art">${ILLUST.hero}</span>
      <span class="hero3-go" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h13M12 5l7 7-7 7"/></svg></span>
    </a>

    <div class="home-cols">
      <section class="hcard" id="find" aria-labelledby="find-h">
        <div class="hcard-head"><span class="hcard-ic">${ICON.search}</span><h2 id="find-h">自治体で調べる</h2><p>自治体ごとの多文化共生関連予算を確認できます。</p></div>
        <div id="find-picker"></div>
        <div class="doors doors-2">
          ${door('/find', 'map', '地図から探す', '日本地図から自治体を選択')}
          ${door('/find', 'pref', '都道府県から探す', '都道府県の一覧から選択', { ft: 'pref' })}
        </div>
        <p class="hcard-foot">調べた自治体：<b>${num(doneAll)}</b> / ${num(db.munis.length)}（${esc(fyFull(fy))}・当初予算）。調べた自治体から順に公開しています。</p>
      </section>

      <section class="hcard" id="explore" aria-labelledby="explore-h">
        <div class="hcard-head"><span class="hcard-ic">${ICON.bars}</span><h2 id="explore-h">全国を見る</h2><p>全国の多文化共生予算をいろいろな切り口で見てみましょう。</p></div>
        <div class="doors doors-4">${VIEWS.map(([path, ill, t, sub]) => door(path, ill, t, sub)).join('')}</div>
      </section>
    </div>

    <section class="insight" aria-labelledby="insight-h">
      <h2 id="insight-h" class="sec-h">見えてくること</h2>
      <p class="sec-sub">データから、こんなことがわかります。</p>
      <ul class="insight-list">
        <li><span class="ins-illu">${ILLUST.amount}</span><span class="ins-t"><b>予算額</b>自治体ごとの多文化共生関連予算の規模がわかる</span></li>
        <li><span class="ins-illu">${ILLUST.ratio}</span><span class="ins-t"><b>一般会計に占める割合</b>自治体の予算全体（一般会計）の中での位置づけがわかる</span></li>
        <li><span class="ins-illu ins-tiles">${USE_TILES.map(([f, ic]) => `<i style="color:${COLORS.field[f]};background:${COLORS.field[f]}1f">${ICON[ic]}</i>`).join('')}</span><span class="ins-t"><b>10分類の使い道</b>どのような分野の事業に予算が使われているかがわかる</span></li>
      </ul>
      <p class="insight-note">金額は、予算書などの公式資料で確かめた分だけです。まだ調べていない自治体は「未調査」と表示し、0円としては扱いません。</p>
    </section>

    <section class="more" aria-labelledby="more-h">
      <h2 id="more-h" class="sec-h">詳しい情報・資料</h2>
      <ul class="more-links">
        <li><a href="#/search">${ICON.search}<span>事業検索<small>事業名・使い道・都道府県で探す</small></span></a></li>
        <li><a href="#/about?to=method">${ICON.book}<span>調査方法<small>何を・どの資料で調べたか</small></span></a></li>
        <li><a href="#/about?to=src-rule">${ICON.doc}<span>出典・公式資料<small>出典の決まり。資料は各自治体のページに</small></span></a></li>
        <li><a href="#/changes">${ICON.history}<span>更新履歴<small>データの追加・訂正の記録</small></span></a></li>
      </ul>
    </section>
  </div>`;

  // ---------- 自治体名で探す（候補に事業名も出す。事業の一覧は欄を使い始めたときに読む） ----------
  const projIdx = { list: null, loading: false };
  const input = muniPicker($('#find-picker'), {
    id: 'find-q', label: '自治体名で探す', placeholder: '自治体名を入力（例：横浜市、豊田市、札幌市）', fy, big: true, button: '検索',
    onPick: m => go('/m/' + m.code, { y: fy }),
    extra: q => {
      const n = normQ(q);
      if (!n || n.length < 2 || !projIdx.list) return [];
      return projIdx.list.filter(p => normQ(p[2]).includes(n)).slice(0, 4).map(p => ({ label: p[2], sub: `事業・${db.byCode.get(p[1])?.full || ''}`, href: href('/m/' + p[1], { y: fy, pj: p[0] }) }));
    },
  });
  const loadIdx = () => {
    if (projIdx.loading) return;
    projIdx.loading = true;
    loadProjectsIndex().then(l => {
      projIdx.list = l;
      if (document.activeElement === input && input.value) input.dispatchEvent(new Event('input'));
    }).catch(() => { projIdx.list = []; });
  };
  input.addEventListener('focus', loadIdx);
  input.addEventListener('input', loadIdx);
  // 欄がせまい（スマホなど）ときは、入りきる長さの例にして文字が切れないようにする
  const HINTS = ['自治体名を入力（例：横浜市、豊田市、札幌市）', '自治体名を入力（例：横浜市）', '自治体名（例：横浜市）'];
  const pen = document.createElement('canvas').getContext('2d');
  const fit = () => {
    if (!input.isConnected) { removeEventListener('resize', fit); return; }
    const cs = getComputedStyle(input);
    pen.font = `${parseFloat(cs.fontSize) * 0.92}px ${cs.fontFamily}`;
    const room = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    input.placeholder = HINTS.find(t => pen.measureText(t).width <= room) || HINTS[HINTS.length - 1];
  };
  fit();
  addEventListener('resize', fit, { passive: true });
}
