/* ネタ診断「あなたを○○に例えると」 純ロジック（DOM非依存）
 *
 * ★★★ 重要・変更禁止 ★★★
 * 結果の選択は `ハッシュ % 配列長` 方式のため、data.js の results / rare 配列を
 * 追加・削除・並び替えすると、すでに診断した全員の結果が変わってしまう。
 * 公開後にテーブルを変更してはいけない。
 * 結果を増やす場合は、下の VERSION_SALT を "v2" に変えた新テーブルへ切り替える設計にすること
 * （saltを変えれば「v1時代の結果」と「v2の結果」を意図的に別物として扱える）。
 *
 * 出典: .company/game/planning/neta-shindan-spec.md §3
 */

/* バージョンsalt。テーブル構成を変えるときだけ上げる（公開後の安易な変更は禁止） */
var VERSION_SALT = "v1";
/* レア判定用salt（本salt自体も変更禁止） */
var RARE_SALT = "rare1";
/* レア出現率のしきい値（h2 % 100 < RARE_THRESHOLD）。約4% */
var RARE_THRESHOLD = 4;

/**
 * 名前の正規化。表記ゆれ（全角/半角・空白・大文字小文字）で結果が変わらないようにする。
 * 「たろう」「た ろう」「たろう␣」「ＴＡＲＯ」「taro」は全て同じ結果になる。
 * @param {*} raw 入力された名前
 * @returns {string} 正規化後の文字列（空文字なら「無効な名前」）
 */
function normalizeName(raw) {
  if (raw === null || raw === undefined) return "";
  var s = String(raw);
  // 1. NFKC正規化（全角英数・半角カナ等を統一）
  s = s.normalize("NFKC");
  // 2. 空白の全除去（半角/全角スペース・タブ・改行）
  //    NFKC後は全角スペースがU+0020になるが、環境差を考慮して全角も明示的に除去する
  s = s.replace(/\s|　/g, "");
  // 3. 英字は小文字化
  s = s.toLowerCase();
  return s;
}

/**
 * 名前が診断可能か（空文字・空白のみでないか）
 * @param {*} raw
 * @returns {boolean}
 */
function isValidName(raw) {
  return normalizeName(raw).length > 0;
}

/**
 * FNV-1a 32bit ハッシュ（UTF-16コードユニット単位）
 * @param {string} str
 * @returns {number} 符号なし32bit整数
 */
function fnv(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // h *= 16777619 を32bitで行う（Math.imulでオーバーフローを正しく処理）
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * テーマIDからテーマ定義を取得
 * @param {Array} themes THEMES配列
 * @param {string} themeId
 * @returns {Object|null}
 */
function findTheme(themes, themeId) {
  for (var i = 0; i < themes.length; i++) {
    if (themes[i].id === themeId) return themes[i];
  }
  return null;
}

/**
 * 診断本体。同じ名前+同じテーマなら、いつ誰の端末でも必ず同じ結果になる（日付は混ぜない）。
 * テーマIDとバージョンsaltを混ぜることで、テーマ間の結果連動（和菓子で3番目の人は妖怪でも3番目）を防ぐ。
 *
 * @param {string} rawName 入力された名前
 * @param {string} themeId テーマID（yokai / bungu / tenshu）
 * @param {Array} [themes] テーマ配列（省略時はグローバルのTHEMES）
 * @returns {Object|null} { theme, result, isRare, index } / 無効な名前・不明テーマならnull
 */
function diagnose(rawName, themeId, themes) {
  var list = themes || (typeof THEMES !== "undefined" ? THEMES : null);
  if (!list) return null;

  var n = normalizeName(rawName);
  if (!n) return null; // 空文字・空白のみは無効

  var theme = findTheme(list, themeId);
  if (!theme) return null;

  var h1 = fnv(n + "|" + themeId + "|" + VERSION_SALT);
  var h2 = fnv(n + "|" + themeId + "|" + RARE_SALT);

  if (h2 % 100 < RARE_THRESHOLD) {
    var ri = h2 % theme.rare.length;
    return { theme: theme, result: theme.rare[ri], isRare: true, index: ri };
  }
  var i = h1 % theme.results.length;
  return { theme: theme, result: theme.results[i], isRare: false, index: i };
}

/* module.exports / window の両対応 */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    normalizeName: normalizeName,
    isValidName: isValidName,
    fnv: fnv,
    findTheme: findTheme,
    diagnose: diagnose,
    VERSION_SALT: VERSION_SALT,
    RARE_SALT: RARE_SALT,
    RARE_THRESHOLD: RARE_THRESHOLD
  };
} else if (typeof window !== "undefined") {
  window.NetaLogic = {
    normalizeName: normalizeName,
    isValidName: isValidName,
    fnv: fnv,
    findTheme: findTheme,
    diagnose: diagnose,
    VERSION_SALT: VERSION_SALT,
    RARE_SALT: RARE_SALT,
    RARE_THRESHOLD: RARE_THRESHOLD
  };
}
