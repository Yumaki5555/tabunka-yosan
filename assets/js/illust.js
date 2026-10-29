// トップページの入口に使う小さなイラスト（数字は入れない。説明の文字は絵の外に書く）
// 色はグリーンを中心に、青・黄色を少しだけ使う。ピンク・赤は使わない

const svg = (inner, vb = '0 0 160 100') => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${inner}</svg>`;
const G = '#1d7347', G2 = '#3d9a6c', G3 = '#8fcaa4', G4 = '#cfe9d7';
const B = '#2f6fae', B2 = '#cfe3f7', Y = '#f2c94c', Y2 = '#c9940f', K = '#9aa6a0';

// 吹き出し（x, y は左上。tail は 'l'（左下）か 'r'（右下））
const bubble = (x, y, tail, text, color) => {
  const w = 30, h = 20, r = 6, tx = tail === 'l' ? x + 12 : x + w - 12;
  return `<path d="M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}${tail === 'l' ? `H${tx + 6}L${tx} ${y + h + 6}V${y + h}` : `H${tx}V${y + h + 6}L${tx - 6} ${y + h}`}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z" fill="#fff" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    <text x="${x + w / 2}" y="${y + 15}" text-anchor="middle" font-size="13" font-weight="700" fill="${color}" font-family="sans-serif">${text}</text>`;
};

// コインの山（cx：中心、n：枚数）
const coins = (cx, n, mark) => {
  let s = '';
  for (let i = 0; i < n; i++) {
    const y = 84 - i * 8;
    s += `<rect x="${cx - 15}" y="${y - 6}" width="30" height="6" fill="${Y2}"/><ellipse cx="${cx}" cy="${y}" rx="15" ry="5" fill="${Y2}"/><ellipse cx="${cx}" cy="${y - 6}" rx="15" ry="5" fill="${Y}" stroke="${Y2}" stroke-width="1"/>`;
  }
  if (mark) s += `<text x="${cx}" y="${84 - (n - 1) * 8 - 2.5}" text-anchor="middle" font-size="8" font-weight="700" fill="#7a5a00" font-family="sans-serif">¥</text>`;
  return s;
};

export const ILLUST = {
  // 3分でわかる：本・電球・人・地球・まち並み
  hero: svg(`
    <ellipse cx="160" cy="165" rx="154" ry="11" fill="${G4}"/>
    <g stroke="${G}" stroke-width="2.5" stroke-linejoin="round" fill="#fff">
      <rect x="224" y="96" width="26" height="68" rx="3"/><rect x="253" y="64" width="30" height="100" rx="3"/><rect x="286" y="88" width="24" height="76" rx="3"/>
    </g>
    <g fill="${B2}">
      <rect x="229" y="104" width="6" height="8" rx="1"/><rect x="240" y="104" width="6" height="8" rx="1"/><rect x="229" y="119" width="6" height="8" rx="1"/><rect x="240" y="119" width="6" height="8" rx="1"/><rect x="229" y="134" width="6" height="8" rx="1"/><rect x="240" y="134" width="6" height="8" rx="1"/>
      <rect x="259" y="72" width="7" height="8" rx="1"/><rect x="271" y="72" width="7" height="8" rx="1"/><rect x="259" y="87" width="7" height="8" rx="1"/><rect x="271" y="87" width="7" height="8" rx="1"/><rect x="259" y="102" width="7" height="8" rx="1"/><rect x="271" y="102" width="7" height="8" rx="1"/><rect x="259" y="117" width="7" height="8" rx="1"/><rect x="271" y="117" width="7" height="8" rx="1"/>
      <rect x="291" y="96" width="5" height="8" rx="1"/><rect x="300" y="96" width="5" height="8" rx="1"/><rect x="291" y="111" width="5" height="8" rx="1"/><rect x="300" y="111" width="5" height="8" rx="1"/><rect x="291" y="126" width="5" height="8" rx="1"/><rect x="300" y="126" width="5" height="8" rx="1"/>
    </g>
    <rect x="261" y="144" width="14" height="20" rx="2" fill="${G}"/>
    <rect x="208" y="140" width="5" height="24" rx="1" fill="#8a6a3c"/><circle cx="210.5" cy="134" r="13" fill="${G3}"/>
    <circle cx="164" cy="42" r="26" fill="${B2}" stroke="${B}" stroke-width="2.5"/>
    <path d="M150 30c6-5 15-4 18 1 2 4-2 7-6 8-4 1-3 6 1 7 4 2 4 7 0 9-4 2-9 0-11-4-2-3-5-3-7-2-1-6 0-14 5-19zM172 38c4-3 10-1 12 4 2 4-1 9-4 10-3 1-3 5-1 7-4 3-9 2-10-2-1-3 1-6 1-9 0-4-1-8 2-10z" fill="${G2}"/>
    <path d="M138 42h52M164 16c11 9 11 43 0 52M164 16c-11 9-11 43 0 52" fill="none" stroke="${B}" stroke-width="1.4" opacity=".45"/>
    ${bubble(110, 60, 'r', 'A', B)}
    ${bubble(192, 72, 'l', 'あ', G)}
    <path d="M130 164v-22c0-12 8-20 18-20s18 8 18 20v22z" fill="${G2}"/>
    <circle cx="148" cy="101" r="11" fill="#f3d2ad"/><path d="M137 100c0-8 5-12 11-12s11 4 11 11c-4-4-9-5-15-3-3 1-5 2-7 4z" fill="#4a3a2a"/>
    <path d="M165 164v-18c0-11 7-18 16-18s16 7 16 18v18z" fill="${B}"/>
    <circle cx="181" cy="108" r="10" fill="#c8956a"/><path d="M171 106c1-7 5-10 10-10 6 0 10 4 10 10-5-2-13-3-20 0z" fill="#2b2420"/>
    <path d="M76 114C62 106 42 106 24 112V160C42 154 62 154 76 162Z" fill="#fff" stroke="${G}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M76 114C90 106 110 106 128 112V160C110 154 90 154 76 162Z" fill="#fff" stroke="${G}" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="36" y="138" width="7" height="13" rx="1.5" fill="${G3}"/><rect x="47" y="130" width="7" height="21" rx="1.5" fill="${G2}"/><rect x="58" y="123" width="7" height="28" rx="1.5" fill="${G}"/>
    <path d="M88 126h28M88 136h28M88 146h20" stroke="${K}" stroke-width="3" stroke-linecap="round"/>
    <g stroke="${Y2}" stroke-width="3" stroke-linecap="round"><path d="M62 22v-8M34 50h-8M90 50h8M42 30l-6-6M82 30l6-6"/></g>
    <circle cx="62" cy="50" r="17" fill="${Y}" stroke="${Y2}" stroke-width="2.5"/>
    <path d="M56 50l6 7 6-7" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="55" y="66" width="14" height="10" rx="2" fill="${K}"/><path d="M57 71h10" stroke="#fff" stroke-width="1.5"/>
    <g fill="${G3}"><circle cx="110" cy="26" r="3"/><circle cx="214" cy="28" r="4"/><circle cx="300" cy="44" r="3"/><circle cx="20" cy="84" r="3"/></g>`, '0 0 320 180'),

  // 地図から探す：たたんだ地図とピン
  map: svg(`
    <path d="M60 16l40 10v62l-40-10z" fill="${G4}"/>
    <path d="M28 26l32-10 40 10 32-10v62l-32 10-40-10-32 10z" fill="none" stroke="${G}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M60 16v62M100 26v62" stroke="${G}" stroke-width="2" opacity=".45"/>
    <path d="M40 66c10-12 22-4 30-13s18-9 28-3" fill="none" stroke="${B}" stroke-width="2.5" stroke-dasharray="4 5" stroke-linecap="round"/>
    <ellipse cx="108" cy="58" rx="8" ry="3" fill="#000" opacity=".12"/>
    <path d="M108 57s-15-14-15-25a15 15 0 0 1 30 0c0 11-15 25-15 25z" fill="${G}" stroke="#fff" stroke-width="2"/>
    <circle cx="108" cy="32" r="5.5" fill="#fff"/>`),

  // 都道府県から探す：庁舎と一覧
  pref: svg(`
    <path d="M52 22v-12l11 4-11 4" fill="${Y}" stroke="${Y2}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M20 40L52 22l32 18z" fill="${G4}" stroke="${G}" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="24" y="40" width="56" height="40" fill="#fff" stroke="${G}" stroke-width="2.5"/>
    <path d="M34 46v28M45 46v28M59 46v28M70 46v28" stroke="${G3}" stroke-width="4" stroke-linecap="round"/>
    <rect x="18" y="80" width="68" height="7" rx="2" fill="${G}"/>
    <rect x="96" y="16" width="52" height="72" rx="7" fill="#fff" stroke="${G}" stroke-width="2.5"/>
    <g fill="${G2}"><rect x="104" y="26" width="8" height="8" rx="2"/><rect x="104" y="41" width="8" height="8" rx="2"/><rect x="104" y="56" width="8" height="8" rx="2"/><rect x="104" y="71" width="8" height="8" rx="2"/></g>
    <path d="M118 30h22M118 45h22M118 60h16M118 75h20" stroke="${K}" stroke-width="3" stroke-linecap="round"/>`),

  // 使い道を見る：ドーナツの図と凡例
  donut: svg(`
    <g transform="rotate(-90 58 50)" fill="none" stroke-width="16">
      <circle cx="58" cy="50" r="26" stroke="${G}" stroke-dasharray="65.3 98.1"/>
      <circle cx="58" cy="50" r="26" stroke="${B}" stroke-dasharray="0 65.3 36 62.1"/>
      <circle cx="58" cy="50" r="26" stroke="${G3}" stroke-dasharray="0 101.3 24.5 37.6"/>
      <circle cx="58" cy="50" r="26" stroke="${Y}" stroke-dasharray="0 125.8 21.2 16.4"/>
      <circle cx="58" cy="50" r="26" stroke="${B2}" stroke-dasharray="0 147 16.4 0"/>
    </g>
    <g><rect x="100" y="30" width="9" height="9" rx="2" fill="${G}"/><rect x="100" y="46" width="9" height="9" rx="2" fill="${B}"/><rect x="100" y="62" width="9" height="9" rx="2" fill="${G3}"/></g>
    <path d="M115 34.5h26M115 50.5h20M115 66.5h16" stroke="${K}" stroke-width="3" stroke-linecap="round"/>`),

  // ランキング：表彰台のような棒と王冠
  rank: svg(`
    <path d="M30 86h100" stroke="${K}" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="40" y="48" width="24" height="38" rx="3" fill="${G3}"/>
    <rect x="68" y="32" width="24" height="54" rx="3" fill="${G}"/>
    <rect x="96" y="60" width="24" height="26" rx="3" fill="${G4}" stroke="${G3}" stroke-width="1.5"/>
    <g font-family="sans-serif" font-weight="700" font-size="13" text-anchor="middle"><text x="52" y="66" fill="#fff">2</text><text x="80" y="52" fill="#fff">1</text><text x="108" y="78" fill="${G}">3</text></g>
    <path d="M68 26l3-14 6 7 3-9 3 9 6-7 3 14z" fill="${Y}" stroke="${Y2}" stroke-width="1.5" stroke-linejoin="round"/>`),

  // 自治体を比較：並んだ庁舎と行き来する矢印
  compare: svg(`
    <path d="M18 36l22-14 22 14z" fill="${G4}" stroke="${G}" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="22" y="36" width="36" height="48" fill="#fff" stroke="${G}" stroke-width="2.5"/>
    <g fill="${G3}"><rect x="29" y="44" width="8" height="8" rx="1"/><rect x="43" y="44" width="8" height="8" rx="1"/><rect x="29" y="58" width="8" height="8" rx="1"/><rect x="43" y="58" width="8" height="8" rx="1"/></g>
    <rect x="34" y="70" width="12" height="14" rx="1" fill="${G}"/>
    <path d="M98 36l22-14 22 14z" fill="${B2}" stroke="${B}" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="102" y="36" width="36" height="48" fill="#fff" stroke="${B}" stroke-width="2.5"/>
    <g fill="${B2}"><rect x="109" y="44" width="8" height="8" rx="1"/><rect x="123" y="44" width="8" height="8" rx="1"/><rect x="109" y="58" width="8" height="8" rx="1"/><rect x="123" y="58" width="8" height="8" rx="1"/></g>
    <rect x="114" y="70" width="12" height="14" rx="1" fill="${B}"/>
    <path d="M14 84h132" stroke="${K}" stroke-width="2.5" stroke-linecap="round"/>
    <g fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M68 46h22M84 40l6 6-6 6" stroke="${G2}"/><path d="M92 64H70M76 58l-6 6 6 6" stroke="${B}"/></g>`),

  // 年度別の変化：折れ線グラフ
  trend: svg(`
    <path d="M26 40h112M26 62h112" stroke="#e1e8e3" stroke-width="2"/>
    <path d="M34 70L54 62L74 66L94 48L114 42L132 26V84H34Z" fill="${G4}" opacity=".7"/>
    <path d="M26 14v70h114" fill="none" stroke="${K}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M34 70L54 62L74 66L94 48L114 42L132 26" fill="none" stroke="${G}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    <g fill="#fff" stroke="${G}" stroke-width="2.5"><circle cx="34" cy="70" r="4"/><circle cx="54" cy="62" r="4"/><circle cx="74" cy="66" r="4"/><circle cx="94" cy="48" r="4"/><circle cx="114" cy="42" r="4"/></g>
    <circle cx="132" cy="26" r="6" fill="${G}" stroke="#fff" stroke-width="2"/>`),

  // 見えてくること：予算額（大きさのちがうコインの山）
  amount: svg(`
    <path d="M8 90h104" stroke="${G4}" stroke-width="4" stroke-linecap="round"/>
    ${coins(28, 3)}${coins(60, 7, true)}${coins(92, 5)}`, '0 0 120 100'),

  // 見えてくること：一般会計に占める割合（大きな円と、切り出した小さな一切れ）
  ratio: svg(`
    <path d="M52 52L70 20.8A36 36 0 1 1 52 16Z" fill="${G4}" stroke="${G}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M55 46L55 10A36 36 0 0 1 73 14.8Z" fill="${G}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="98" cy="70" r="15" fill="#fff" stroke="${G}" stroke-width="2.5"/>
    <text x="98" y="76" text-anchor="middle" font-size="17" font-weight="700" fill="${G}" font-family="sans-serif">%</text>`, '0 0 120 100'),
};
