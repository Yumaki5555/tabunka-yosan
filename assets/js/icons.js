// 図やボタンに使う小さな絵（線画。色は文字の色 currentColor を使う）
const s = (inner, vb = '0 0 48 48') => `<svg viewBox="${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const ICON = {
  map: s('<path d="M6 12l11-4 14 4 11-4v28l-11 4-14-4-11 4z"/><path d="M17 8v28M31 12v28"/>'),
  search: s('<circle cx="21" cy="21" r="12"/><path d="M30 30l11 11"/>'),
  compare: s('<rect x="6" y="22" width="9" height="18" rx="2"/><rect x="20" y="12" width="9" height="28" rx="2"/><rect x="34" y="28" width="9" height="12" rx="2"/>'),
  trend: s('<path d="M6 38l10-12 9 7 16-19"/><path d="M33 14h8v8"/>'),
  donut: s('<circle cx="24" cy="24" r="16"/><path d="M24 8v16l13 9"/><circle cx="24" cy="24" r="7"/>'),
  bars: s('<path d="M8 10h22M8 20h32M8 30h16M8 40h26"/>'),
  list: s('<path d="M17 12h24M17 24h24M17 36h24"/><circle cx="9" cy="12" r="2"/><circle cx="9" cy="24" r="2"/><circle cx="9" cy="36" r="2"/>'),
  pin: s('<path d="M24 42s13-12.5 13-22a13 13 0 1 0-26 0c0 9.5 13 22 13 22z"/><circle cx="24" cy="20" r="5"/>'),
  check: s('<rect x="7" y="7" width="34" height="34" rx="6"/><path d="M15 24l7 7 12-14"/>'),
  history: s('<path d="M8 24a16 16 0 1 0 5-11.6"/><path d="M8 8v8h8M24 15v10l7 4"/>'),
  download: s('<path d="M24 8v22M15 21l9 9 9-9"/><path d="M8 34v6h32v-6"/>'),
  ruler: s('<rect x="6" y="16" width="36" height="16" rx="3"/><path d="M13 16v6M20 16v9M27 16v6M34 16v9"/>'),
  percent: s('<circle cx="15" cy="15" r="5"/><circle cx="33" cy="33" r="5"/><path d="M36 10L12 38"/>'),
  book: s('<path d="M24 12c-5-4-12-4-17-2v28c5-2 12-2 17 2 5-4 12-4 17-2V10c-5-2-12-2-17 2z"/><path d="M24 12v28"/>'),
  // 使い道
  class: s('<rect x="6" y="8" width="36" height="22" rx="3"/><path d="M13 16h14M13 22h20"/><circle cx="16" cy="38" r="4"/><circle cx="32" cy="38" r="4"/>'),
  talk: s('<path d="M7 10h24v15H17l-7 6v-6H7z"/><path d="M27 29v5h8l6 5v-5h2V19h-8"/>'),
  school: s('<path d="M6 20L24 9l18 11"/><path d="M10 18v20h28V18"/><path d="M20 38v-9h8v9"/>'),
  medical: s('<rect x="8" y="8" width="32" height="32" rx="6"/><path d="M24 15v18M15 24h18"/>'),
  life: s('<path d="M8 22L24 9l16 13"/><path d="M12 19v20h24V19"/><path d="M19 39v-9h10v9"/>'),
  lang: s('<rect x="6" y="9" width="22" height="18" rx="3"/><path d="M11 15h12M17 15v8M13 23c3-1 6-4 7-8"/><rect x="22" y="23" width="20" height="16" rx="3"/><path d="M27 35l5-9 5 9M29 32h6"/>'),
  people: s('<circle cx="16" cy="16" r="6"/><circle cx="33" cy="17" r="5"/><path d="M5 40c1-7 6-11 11-11s10 4 11 11"/><path d="M27 31c2-2 4-3 6-3 5 0 9 4 10 11"/>'),
  work: s('<rect x="6" y="15" width="36" height="24" rx="3"/><path d="M18 15v-4h12v4M6 25h36"/>'),
  org: s('<path d="M6 40h36M10 40V20h28v20M8 20L24 9l16 11"/><path d="M17 26v8M24 26v8M31 26v8"/>'),
  // 財源
  nation: s('<path d="M6 40h36M9 40V22h30v18M6 22L24 10l18 12"/><path d="M15 27v8M21 27v8M27 27v8M33 27v8"/>'),
  pref: s('<rect x="10" y="12" width="28" height="28" rx="2"/><path d="M16 18h4M28 18h4M16 25h4M28 25h4M16 32h4M28 32h4M22 40v-7h4v7"/>'),
  city: s('<path d="M6 40h36"/><rect x="9" y="18" width="13" height="22" rx="1"/><rect x="26" y="10" width="13" height="30" rx="1"/><path d="M13 24h5M13 30h5M30 16h5M30 22h5M30 28h5"/>'),
  yen: s('<circle cx="24" cy="24" r="17"/><path d="M17 14l7 10 7-10M24 24v12M18 26h12M18 31h12"/>'),
  doc: s('<path d="M12 6h16l9 9v27H12z"/><path d="M28 6v9h9M17 24h15M17 30h15M17 36h10"/>'),
};
