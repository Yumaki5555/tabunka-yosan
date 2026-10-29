// データの表の形（列・決まり）を1か所にまとめたものです。
// サイトの画面と tools/build.mjs（データの点検と公開用データの作成）が、すべてこの定義を使います。
// CSV は公開リポジトリに置くので、文章の欄には一般の人に必要なことだけを書きます（調査の作業メモはリポジトリの外の非公開フォルダへ）。
// 列の名前（日本語）は CSV の1行目にそのまま書きます。Excel で開いて記入できます。

export const STAGES = ['当初予算', '補正後予算', '決算'];
// 分類（①〜⑤・保留）。自治体の公式な予算の区分ではなく、このサイトが資料に書かれた事業の対象と目的を読んで付けた分類です。
// 基準は docs/分類と集計の基準.md。基本集計（多文化共生関連予算）＝①＋②＋③のうち外国人関連部分の金額が資料で分かった分。
// 別枠（学校の教員の人件費と、中国残留邦人等・引揚者などの援護）は、①〜⑤とは分けて記録し、合計に入れず金額を参考として別に示す（BETSU_GROUPS）
export const RELATIONS = ['①', '②', '③', '④', '⑤', '別枠', '保留'];
export const COUNTED_RELATIONS = new Set(['①', '②', '③']);
export const TOTAL_LABEL = '多文化共生関連予算';
export const RELATION_INFO = {
  '①': {
    no: '①', label: '外国人等への直接給付・支援', short: '直接給付・支援', counted: 'all',
    desc: '外国人住民などを対象として設けられた給付金・補助金・支援事業です。事業の金額を基本集計に入れます。現金の給付だけでなく、日本語教室や学校での日本語指導のようなサービスも入ります（金額がすべて外国人個人に支払われるわけではありません）。',
    examples: '外国人高齢者・障害者福祉給付金、日本語教室、学校での日本語指導、外国人学校への補助、避難民の生活支援、外国人材本人への就労・定着支援',
  },
  '②': {
    no: '②', label: '外国人対応の行政経費', short: '行政経費', counted: 'all',
    desc: '外国人住民などに行政サービスを届けるため、または外国人の受入れのために行政が使う経費です。事業の金額を基本集計に入れます。通訳・翻訳の利用者には、外国語を使う日本国籍の人が含まれることがあります。',
    examples: '通訳・翻訳、外国人相談窓口、多言語の生活情報、職員研修、多文化共生の計画づくり・啓発、受入れ企業や医療機関への支援、海外からの人材確保',
  },
  '③': {
    no: '③', label: '一般事業に含まれる外国人関連経費', short: '一般事業の一部', counted: 'portion',
    desc: '一般の住民も対象とする事業の一部に、外国人関連の経費が含まれるものです。外国人関連の部分の金額が資料に書かれているときだけ、その部分を基本集計に入れます。分からないときは事業全体の金額を参考として示し、足しません（人口の割合などで按分しません）。',
    examples: '広報紙の発行（うち多言語版）、ホームページの運営（うち自動翻訳）、夜間中学、一般の相談窓口（外国人相談を含む）、介護人材の確保（外国人材の分を含む）',
  },
  '④': {
    no: '④', label: '関連事業・参考経費', short: '関連事業・参考', counted: 'none',
    desc: '外国人施策や国際交流に関係はありますが、外国人住民などへの支出として金額を特定できない事業です。事業全体の金額を参考として記録し、基本集計には入れません。国際交流そのものを、外国人住民の支援と同じものとは扱いません。',
    examples: '国際交流協会の運営費補助（使い道の内訳なし）、国際交流センターの施設全体の管理、姉妹都市交流、国際交流員の招致',
  },
  '⑤': {
    no: '⑤', label: '対象外', short: '対象外', counted: 'none',
    desc: '外国人との明確な関係が確認できない事業です。外国人も住民として使っている、という理由だけでは数えません。',
    examples: '外国語指導助手（ALT）、国際理解教育、外国人のための独立した経費がない一般の行政サービス',
  },
  '別枠': {
    no: '', label: '別枠：合計に入れず別に示す経費', short: '別枠（合計に入れない）', counted: 'none',
    desc: 'どの自治体でも同じ条件で比べられるよう、①〜⑤とは別の枠にして多文化共生関連予算の合計に入れず、金額を参考として別に示す経費です。実際に使われるお金なので、事業は消さずに記録します。学校の教員の人件費と、中国残留邦人等・引揚者などの援護の2つがあります。',
    examples: '日本語指導を受け持つ教員の配置（人件費）、中国残留邦人等の生活支援給付・配偶者支援金、支援・相談員、中国帰国者の日本語教室・地域生活支援、引揚者等の援護の事務',
  },
  '保留': {
    no: '保', label: '判定保留', short: '判定保留', counted: 'none',
    desc: '資料の記録から対象・目的・中身を読み取れず、分類を決められない事業です。基本集計には入れず、追加で調べます。',
    examples: '予算書に目的や中身の記載がなく、名前だけでは対象が分からない事業',
  },
};
// 類型（分類を決めるときの中身の種類）。class は「独立した金額のとき」の分類。①②の類型で一般事業の一部なら③になる
export const TYPE_INFO = {
  '1-給付金': { cls: '①', label: '外国人への福祉給付金' },
  '1-日本語': { cls: '①', label: '大人の日本語学習' },
  '1-子ども': { cls: '①', label: '外国人の子どもの教育支援' },
  '1-学校・留学生': { cls: '①', label: '外国人学校・留学生への支援' },
  '1-生活': { cls: '①', label: '暮らしの支援' },
  '1-就労': { cls: '①', label: '就労・定着の支援（本人向け）' },
  '1-医療福祉': { cls: '①', label: '医療・保健・福祉（本人向け）' },
  '2-通訳翻訳': { cls: '②', label: '通訳・翻訳' },
  '2-相談': { cls: '②', label: '外国人相談' },
  '2-情報': { cls: '②', label: '多言語の情報提供' },
  '2-研修': { cls: '②', label: '職員・支援者の研修' },
  '2-企画': { cls: '②', label: '外国人施策の企画・推進' },
  '2-啓発交流': { cls: '②', label: '共生の啓発・地域づくり' },
  '2-受入れ': { cls: '②', label: '受入れ環境の整備' },
  '2-海外確保': { cls: '②', label: '海外からの人材確保' },
  '2-拠点': { cls: '②', label: '外国人支援の拠点施設' },
  '2-協会事業': { cls: '②', label: '使い道を限った協会への補助・委託' },
  '2-法定事務': { cls: '②', label: '外国人に関する法定の事務' },
  '2-指導': { cls: '②', label: '外国人に関する指導・徴収など' },
  '4-協会運営': { cls: '④', label: '国際交流協会などの運営補助' },
  '4-施設': { cls: '④', label: '国際交流施設の管理' },
  '4-国際交流': { cls: '④', label: '国際交流・海外交流' },
  '4-JET': { cls: '④', label: '国際交流員などの招致・国際化協会' },
  '4-複合': { cls: '④', label: '国際交流と一体の事業' },
  '4-経済観光': { cls: '④', label: '経済・観光・誘致' },
  '4-その他': { cls: '④', label: 'その他の関連事業' },
  '5-一般': { cls: '⑤', label: '一般の行政サービス' },
  '5-国際': { cls: '⑤', label: '外国人と関係のない国際事業' },
  '5-無関係': { cls: '⑤', label: '外国人と関係がない事業' },
  '別-教員': { cls: '別枠', label: '学校の教員の人件費' },
  '別-援護': { cls: '別枠', label: '中国残留邦人等・引揚者などの支援給付・援護' },
  '別-生活支援': { cls: '別枠', label: '中国残留邦人等の日本語・地域生活の支援' },
  '保留': { cls: '保留', label: '判定保留' },
};
export const TYPES = Object.keys(TYPE_INFO);
// 別枠の中の種類（自治体のページで金額を分けて示す）。どの種類かは類型で決まる。why は合計に入れない理由
export const BETSU_GROUPS = [
  {
    key: 'teacher', label: '学校の教員の人件費', types: ['別-教員'],
    why: 'ほかの自治体と同じ条件で比べられるよう',
    desc: '学校に配置する教員（教職員定数で置く教諭・講師など。日本語指導を受け持つ教員を含む）の給与などの人件費です。多くの自治体では、日本語指導を受け持つ教員の人件費も教職員の人件費全体にまとめて計上され、その部分の金額が資料にありません。金額が分かる自治体だけ合計に入れると同じ条件で比べられないため、金額が分かっても合計に入れず、別に示します。日本語指導員・支援員・語学相談員・通訳など、自治体が事業の費用で雇う人の報酬や委託料は、これまでどおり合計に入れます。',
  },
  {
    key: 'engo', label: '中国残留邦人等・引揚者などの援護', types: ['別-援護', '別-生活支援'],
    why: '外国人向けの施策と性格がちがうため',
    desc: '中国残留邦人等への支援給付・援護・日本語や地域生活の支援、引揚者の援護など、戦争の影響を受けた人への援護（戦後処理）として国の制度にもとづいて行う事業です。外国人向けの施策とは性格がちがうため、合計に入れず、別に示します。対象の中国残留邦人等は日本国籍で、外国籍の配偶者・家族も対象になります。',
  },
];
export const betsuGroupOf = type => BETSU_GROUPS.find(g => g.types.includes(type)) || BETSU_GROUPS[BETSU_GROUPS.length - 1];
// 類型と分類が合っているか（①②の類型は、独立した金額なら①②、一般事業の一部なら③）
export const typeFits = (type, rel) => {
  const c = TYPE_INFO[type]?.cls;
  if (!c) return false;
  return c === rel || (rel === '③' && (c === '①' || c === '②'));
};
// 対象者の範囲（国籍・外国出生・外国にルーツ・外国語を使うことは同じではないので分けて記録する）
export const TARGETS = ['外国籍の住民・滞在者', '外国出生者', '帰化者・元外国籍者', '外国にルーツがある人', '外国人と日本人の双方', '国籍を問わない外国語利用者', '対象者の範囲が不明'];
// 事業ごとの確認状況（分類とは別に管理する）
export const CHECK_STATUSES = ['確認済み', '一部確認済み', '要確認', '調査未実施'];
export const CHECK_INFO = {
  '確認済み': '対象・目的・金額を公式資料で確認できた',
  '一部確認済み': '事業の存在や予算は確認できたが、外国人関連の部分の内訳が分からない',
  '要確認': '分類を決めるのに必要な情報が足りない（判定保留）',
  '調査未実施': 'まだ十分に調べていない',
};
export const FIELDS = ['日本語教育', '外国人相談', '教育支援', '医療・保健', '生活支援', '多言語対応', '地域交流', '外国人材支援', '団体補助金', 'その他'];
// 分野（使い道）の画面での名前と説明。1つの事業は1つの分野だけに入れる（同じお金を2つの分野に数えない）
export const FIELD_INFO = {
  '日本語教育': { label: '日本語教室・日本語学習', desc: '大人向けの日本語教室、講師、教材、学習の支援' },
  '外国人相談': { label: '外国人相談窓口', desc: '生活・法律などの相談窓口、通訳つきの相談' },
  '教育支援': { label: '学校・保育での子どもの支援', desc: '日本語指導が必要な児童生徒への日本語指導員・支援員、就学や進学の支援（学校の教員の人件費は別枠）' },
  '医療・保健': { label: '医療通訳・保健', desc: '医療通訳、多言語の医療案内、外国人向けの保健事業' },
  '生活支援': { label: '暮らし・防災・手続きの支援', desc: '生活ガイド、防災情報、役所の手続きの手伝い' },
  '多言語対応': { label: '多言語の案内・翻訳', desc: '役所の文書の翻訳、多言語の広報・ホームページ、通訳機器' },
  '地域交流': { label: '交流・理解促進・拠点施設', desc: '交流イベント、啓発、多文化共生センターなどの施設の運営' },
  '外国人材支援': { label: '外国人材の就労・定着', desc: '就労の相談、受け入れ企業の支援、地域への定着の支援' },
  '団体補助金': { label: '国際交流協会などへの補助', desc: '国際交流協会・NPOなどへの補助金・委託' },
  'その他': { label: 'その他', desc: '推進会議・計画づくり・奨学金・事務費など、上のどれにも当てはまらないもの' },
};
// 会計（一般会計に占める割合の分子には、一般会計の事業だけを入れる。特別会計・企業会計の事業は入れない）
export const ACCOUNTS = ['一般会計', '特別会計', '企業会計'];
export const STATUS_FLAGS = ['新規', '継続', '拡充', '縮小', '終了', '不明'];
export const UNITS = { '円': 1, '千円': 1000, '万円': 10000, '百万円': 1000000, '億円': 100000000 };
export const VERIFIED = ['確認済み', '要確認'];
export const SURVEY_STATUSES = ['確認済み', '一部確認', '未調査', '資料未発見', '金額非公表', '該当事業なし', '決算未公表'];
// 調査状況の画面での呼び方（データの値はそのまま）。「金額を確かめた」ことと「すべて調べ終えた」ことを混同しないように、
// 「確認済み」は「主な資料を調査済み」と表示する
export const SURVEY_LABEL = {
  '確認済み': '主な資料を調査済み', '一部確認': '一部の資料だけ調査', '未調査': '未調査', '資料未発見': '資料が見つからない',
  '金額非公表': '金額は非公表', '該当事業なし': '関係する事業なし（0円）', '決算未公表': '決算はまだ公表前',
};
export const SURVEY_INFO = {
  '確認済み': '対象年度の予算書などの主な資料を、ひととおり調べた（ほかの事業に含まれていて金額が分からない支出や、調べていない資料が残ることがある）',
  '一部確認': '一部の部署・資料だけ調べた（表示する金額は、見つかって確かめられた事業だけの合計）',
  '未調査': 'まだ調べていない',
  '資料未発見': '調べたが、金額が分かる公式資料が見つからない',
  '金額非公表': '事業はあるが、金額が公表されていない',
  '該当事業なし': '調べた結果、関連事業がないことを確認した（0円）',
  '決算未公表': '年度の途中、または決算がまだ公表されていない',
};
export const DOC_TYPES = ['当初予算書', '予算に関する説明書', '予算の概要', '補正予算書', '決算書', '主要施策の成果', '事務事業評価', '多文化共生推進計画', '議会資料', '補助金・委託資料', '国の資料', '統計', 'その他'];
export const RECIPIENT_TYPES = ['国際交流協会', 'NPO・市民団体', '市区町村', '都道府県', '民間企業', '学校法人', '個人・世帯', 'その他'];
export const PAY_KINDS = ['補助', '委託', '負担金', '指定管理', '交付金', 'その他'];
export const CHANGE_KINDS = ['追加', '訂正', '削除', '出典変更', '状況変更'];
export const NOTE_KINDS = ['合併', '名称変更', '制度変更', 'その他'];
export const LINK_SITES = ['mou-map', 'zairyu', 'karte', 'other'];

// 公開する文章に入れない、調査の作業メモの言葉（サーバーの制限・道具の名前・資料の取り方・作業日誌・以前の区分など）。
// データの文章の欄にあると、tools/build.mjs がエラーにして公開用データを作らない。作業メモはリポジトリの外の非公開フォルダに書く
export const INTERNAL_WORDS = /Incapsula|curl|WebFetch|pdf\.js|scratchpad|worktree|\bOCR\b|Claude|調査担当|点検者|外部点検|外部の点検|調査票|旧区分|見直し前の|published_date|\bnull\b|自動取得|自動アクセス|全文検索|文字化け|目視|目で読|目で確|画像にして|ブラウザで(開|保存|取得|回避)|ダウンロードし|取り込み直|登録漏れ|\bissues\b|[ABC]区分/;

// 列の型
//   id … 決まった形の記号、code … 6桁の全国地方公共団体コード、int … 0以上の整数、
//   year … 年度（西暦4桁）、date … 2026-02-13 の形、url … http(s)://～、enum … 決まった言葉のどれか、text … 自由な文
const C = (key, label, type, opt = {}) => ({ key, label, type, ...opt });

export const TABLES = {
  projects: {
    title: '事業マスタ', dir: 'projects', key: ['project_id'],
    desc: '事業1つにつき1行。年度が変わっても同じ事業なら同じ事業IDを使います。',
    cols: [
      C('project_id', '事業ID', 'id', { required: true, pattern: /^\d{6}-\d{3}$/, hint: '自治体コード-3桁の番号（例：221309-001）' }),
      C('code', '自治体コード', 'code', { required: true }),
      C('name', '事業名', 'text', { required: true, hint: '最新の年度の資料どおり' }),
      C('department', '担当部署', 'text'),
      C('purpose', '事業目的', 'text'),
      C('content', '事業内容', 'text'),
      C('field', '分野', 'enum', { required: true, values: FIELDS }),
      C('relation', '分類', 'enum', { required: true, values: RELATIONS, hint: '①・②・③・④・⑤・別枠・保留（基準は docs/分類と集計の基準.md）' }),
      C('type', '類型', 'enum', { required: true, values: TYPES, hint: '分類を決めた中身の種類（例：1-日本語・2-通訳翻訳・4-協会運営）' }),
      C('account', '会計', 'enum', { values: ACCOUNTS, hint: '事業の金額が載っている会計。資料に「○○特別会計」「○○事業会計」とある事業は特別会計・企業会計（一般会計に占める割合の分子に入れない）。①②③の事業は必ず書く' }),
      C('relation_reason', '分類の理由', 'text', { hint: '対象者・目的・この分類にした理由（③④は基本集計に入れる・入れない部分）' }),
      C('target', '対象者の範囲', 'text', { required: true, hint: `${TARGETS.join('・')} のどれか（複数は ; 区切り）` }),
      C('target_note', '対象者の説明', 'text', { hint: '資料にもとづく具体的な説明。日本国籍の人が含まれるなら必ず書く' }),
      C('check_status', '確認状況', 'enum', { required: true, values: CHECK_STATUSES }),
      C('basis_sources', '根拠の出典ID', 'text', { hint: '分類の根拠にした資料の出典ID（; 区切り）' }),
      C('classified_date', '判定日', 'date', { required: true }),
      C('included_in', '金額が含まれる事業ID', 'id', { pattern: /^\d{6}-\d{3}$/, hint: 'この事業の金額（の一部）が同じ自治体の別の事業の金額にも含まれる（再掲）とき、その事業ID。二重に数えないよう基本集計に入れない' }),
      C('predecessor', '前身の事業ID', 'id', { pattern: /^\d{6}-\d{3}$/, hint: '内容が大きく変わった別事業の前身。同じ事業なら空欄' }),
      C('mou_ids', '関連するMOU', 'text', { hint: 'MOUマップの協定ID（; 区切り）。MOUがあるだけで費用があるとは扱わない' }),
      C('note', '備考', 'text'),
    ],
  },
  budgets: {
    title: '年度別予算・決算', dir: 'budgets', key: ['project_id', 'fy', 'stage'],
    desc: '事業×年度×段階（当初予算・補正後予算・決算）ごとに1行。金額は円で書き、資料の数字と単位も残します。',
    cols: [
      C('project_id', '事業ID', 'id', { required: true, pattern: /^\d{6}-\d{3}$/ }),
      C('code', '自治体コード', 'code', { required: true }),
      C('fy', '年度', 'year', { required: true }),
      C('stage', '段階', 'enum', { required: true, values: STAGES }),
      C('name_in_year', 'その年度の事業名', 'text', { hint: '資料どおり。事業マスタと同じなら空欄でよい' }),
      C('amount_yen', '金額（円）', 'int', { required: true }),
      C('amount_raw', '資料の数字', 'text', { required: true, hint: '資料に書かれたとおり（例：12,345）' }),
      C('unit_raw', '資料の単位', 'enum', { required: true, values: Object.keys(UNITS) }),
      C('portion_yen', 'うち外国人関連（円）', 'int', { hint: '③（一般事業の一部）で、資料に外国人関連部分の金額があるときだけ。人口の割合などで按分しない' }),
      C('portion_note', 'うち外国人関連の説明', 'text'),
      C('foreign_only_yen', 'うち外国籍の人だけへの支出（円）', 'int', { hint: '外国籍の人だけに実際に使われた金額が資料で分かるときだけ（基本集計とは別の数）' }),
      C('foreign_only_note', 'うち外国籍の人だけへの支出の説明', 'text'),
      C('status_flag', '新規・継続', 'enum', { values: STATUS_FLAGS }),
      C('source_id', '出典ID', 'id', { required: true, pattern: /^\d{6}-S\d{2,3}$/ }),
      C('page', '掲載ページ', 'text', { required: true }),
      C('quote', '資料の記載', 'text', { hint: '金額を含む行を原文どおり' }),
      C('label_in_doc', '資料の列名', 'text', { hint: '例：本年度予算額・決算額' }),
      C('verified', '確認', 'enum', { required: true, values: VERIFIED, hint: '要確認の行は合計に入れません' }),
      C('checked_date', '確認日', 'date', { required: true }),
      C('note', '備考', 'text'),
    ],
  },
  funds: {
    title: '財源内訳', dir: 'funds', key: ['project_id', 'fy', 'stage'],
    desc: 'その事業だけの財源内訳が資料に書かれているときだけ1行。款・項・目の単位の財源を事業に割り振らないでください。',
    cols: [
      C('project_id', '事業ID', 'id', { required: true, pattern: /^\d{6}-\d{3}$/ }),
      C('code', '自治体コード', 'code', { required: true }),
      C('fy', '年度', 'year', { required: true }),
      C('stage', '段階', 'enum', { required: true, values: STAGES }),
      C('national', '国庫支出金（円）', 'int'),
      C('pref', '都道府県支出金（円）', 'int'),
      C('national_pref', '国・県支出金（区別なし）（円）', 'int', { hint: '資料で国と県がまとめて書かれているとき' }),
      C('bond', '地方債（円）', 'int'),
      C('other', 'その他財源（円）', 'int'),
      C('general', '一般財源（円）', 'int'),
      C('source_id', '出典ID', 'id', { required: true, pattern: /^\d{6}-S\d{2,3}$/ }),
      C('page', '掲載ページ', 'text', { required: true }),
      C('quote', '資料の記載', 'text'),
      C('verified', '確認', 'enum', { required: true, values: VERIFIED }),
      C('checked_date', '確認日', 'date', { required: true }),
      C('note', '備考', 'text'),
    ],
  },
  recipients: {
    title: '補助金・委託金の支払先', dir: 'recipients', key: ['project_id', 'fy', 'stage', 'recipient'],
    desc: '資料に支払先と金額が書かれているときだけ1行。支払先が市区町村なら「自治体間の資金移転」として扱います。',
    cols: [
      C('project_id', '事業ID', 'id', { required: true, pattern: /^\d{6}-\d{3}$/ }),
      C('code', '自治体コード', 'code', { required: true }),
      C('fy', '年度', 'year', { required: true }),
      C('stage', '段階', 'enum', { required: true, values: STAGES }),
      C('recipient', '支払先', 'text', { required: true }),
      C('recipient_type', '支払先の種類', 'enum', { required: true, values: RECIPIENT_TYPES }),
      C('kind', '支出の種類', 'enum', { required: true, values: PAY_KINDS }),
      C('amount_yen', '金額（円）', 'int'),
      C('amount_raw', '資料の数字', 'text'),
      C('unit_raw', '資料の単位', 'enum', { values: Object.keys(UNITS) }),
      C('source_id', '出典ID', 'id', { required: true, pattern: /^\d{6}-S\d{2,3}$/ }),
      C('page', '掲載ページ', 'text', { required: true }),
      C('quote', '資料の記載', 'text'),
      C('verified', '確認', 'enum', { required: true, values: VERIFIED }),
      C('checked_date', '確認日', 'date', { required: true }),
      C('note', '備考', 'text'),
    ],
  },
  sources: {
    title: '出典資料', dir: 'sources', key: ['source_id'],
    desc: '使った公式資料1つにつき1行。',
    cols: [
      C('source_id', '出典ID', 'id', { required: true, pattern: /^\d{6}-S\d{2,3}$/, hint: '自治体コード-S2桁（例：221309-S01）' }),
      C('code', '自治体コード', 'code', { required: true }),
      C('fy', '年度', 'year', { hint: '資料が対象とする年度（事業の内容を確かめるためだけの資料で年度がないときは空欄）' }),
      C('doc_type', '資料の種類', 'enum', { required: true, values: DOC_TYPES }),
      C('title', '資料名', 'text', { required: true }),
      C('publisher', '発行者', 'text'),
      C('url', '出典URL', 'url', { required: true, hint: '資料そのもの（PDFなど）のURL' }),
      C('page_url', '資料掲載ページ', 'url', { hint: '資料へのリンクがある公式ページ' }),
      C('published_date', '公表日', 'date'),
      C('accessed_date', 'データ最終確認日', 'date', { required: true }),
      C('unit_note', '単位の記載', 'text', { hint: '例：単位：千円（2ページの表頭）' }),
      C('archived_url', '保存版URL', 'url', { hint: '元の資料が削除されたときの国立国会図書館WARPなど' }),
    ],
  },
  general: {
    title: '一般会計の予算総額', dir: 'general', key: ['code', 'fy', 'stage'],
    desc: '自治体×年度×段階ごとに1行。その自治体の一般会計の予算の総額（特別会計・企業会計を含まない）を、自治体の予算書などの公式資料から写します。「一般会計に占める割合」の分母に使います。行がない組み合わせは「未確認」です。',
    cols: [
      C('code', '自治体コード', 'code', { required: true }),
      C('fy', '年度', 'year', { required: true }),
      C('stage', '段階', 'enum', { required: true, values: STAGES, hint: '多文化共生関連予算と同じ段階（当初予算どうし）で割り算します' }),
      C('amount_yen', '一般会計の総額（円）', 'int', { required: true }),
      C('amount_raw', '資料の数字', 'text', { required: true, hint: '資料に書かれたとおり（例：123,456,789）' }),
      C('unit_raw', '資料の単位', 'enum', { required: true, values: Object.keys(UNITS) }),
      C('source_id', '出典ID', 'id', { required: true, pattern: /^\d{6}-S\d{2,3}$/ }),
      C('page', '掲載ページ', 'text', { required: true }),
      C('quote', '資料の記載', 'text', { hint: '総額が書かれた文を原文どおり（例：第1条 歳入歳出予算の総額は、歳入歳出それぞれ…千円と定める）' }),
      C('verified', '確認', 'enum', { required: true, values: VERIFIED, hint: '要確認の行は割合の計算に使いません' }),
      C('checked_date', '確認日', 'date', { required: true }),
      C('note', '備考', 'text', { hint: '骨格予算・議会での修正など、比べるときに知っておくべきこと' }),
    ],
  },
  survey: {
    title: '調査状況', dir: 'survey', key: ['code', 'fy', 'stage'],
    desc: '自治体×年度×段階ごとに1行。行がない組み合わせは「未調査」（今年度の決算は「決算未公表」）として表示します。',
    cols: [
      C('code', '自治体コード', 'code', { required: true }),
      C('fy', '年度', 'year', { required: true }),
      C('stage', '段階', 'enum', { required: true, values: STAGES }),
      C('status', '調査状況', 'enum', { required: true, values: SURVEY_STATUSES }),
      C('scope', '調べた範囲', 'text', { hint: '対象にした資料・会計・部局・年度を簡潔に（検索語や作業の手順は書かない）' }),
      C('not_checked', '調べていない範囲', 'text', { hint: 'まだ確認できていない資料・会計・事業（取得の経緯ではなく、未確認という事実を書く）' }),
      C('source_ids', '使った出典ID', 'text', { hint: '; 区切り' }),
      C('checked_date', '確認日', 'date', { required: true }),
    ],
  },
  changelog: {
    title: '更新履歴', dir: 'changelog', key: null,
    desc: 'データを足した・直したときに1行。訂正は訂正前と訂正後の値を残します。',
    cols: [
      C('date', '日付', 'date', { required: true }),
      C('code', '自治体コード', 'code'),
      C('project_id', '事業ID', 'id', { pattern: /^\d{6}-\d{3}$/ }),
      C('fy', '年度', 'year'),
      C('stage', '段階', 'enum', { values: STAGES }),
      C('kind', '種類', 'enum', { required: true, values: CHANGE_KINDS }),
      C('item', '項目', 'text'),
      C('before', '訂正前', 'text'),
      C('after', '訂正後', 'text'),
      C('reason', '理由', 'text', { required: true }),
      C('source_id', '出典ID', 'text'),
    ],
  },
  notes: {
    title: '自治体の注記（合併・制度変更）', dir: 'notes', key: null,
    desc: '合併・名称変更・制度変更などで、年度の比較に注意が必要なとき1行。',
    cols: [
      C('code', '自治体コード', 'code', { required: true }),
      C('from_fy', '対象年度（から）', 'year'),
      C('to_fy', '対象年度（まで）', 'year'),
      C('kind', '種類', 'enum', { required: true, values: NOTE_KINDS }),
      C('note', '注記', 'text', { required: true }),
      C('source_url', '出典URL', 'url'),
    ],
  },
  links: {
    title: '他サイトとの連携', dir: 'links', key: null,
    desc: 'MOUマップの協定・自治体カルテなど、他のサイトのページと自治体（または事業）を結ぶとき1行。',
    cols: [
      C('code', '自治体コード', 'code', { required: true }),
      C('site', 'サイト', 'enum', { required: true, values: LINK_SITES }),
      C('url', 'URL', 'url', { required: true }),
      C('label', '表示する名前', 'text', { required: true }),
      C('project_id', '事業ID', 'id', { pattern: /^\d{6}-\d{3}$/ }),
      C('note', '備考', 'text', { hint: 'MOUへのリンクは「関連する可能性」。MOUがあるだけで費用が発生したとは扱わない' }),
    ],
  },
};

// 列名（日本語）→ 列の定義
export function headerMap(table) {
  const m = new Map();
  for (const c of TABLES[table].cols) { m.set(c.label, c); m.set(c.key, c); }
  return m;
}

// CSVの1行目から、どの表かを当てる
export function detectTable(header) {
  let best = null, bestScore = 0;
  for (const [name, t] of Object.entries(TABLES)) {
    const labels = new Set(t.cols.map(c => c.label));
    const hit = header.filter(h => labels.has(h.trim())).length;
    const req = t.cols.filter(c => c.required).every(c => header.includes(c.label));
    const score = hit / t.cols.length + (req ? 1 : 0);
    if (score > bestScore) { best = name; bestScore = score; }
  }
  return bestScore >= 1 ? best : null;
}
