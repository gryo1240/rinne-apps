"use strict";
/*
 * 月うさぎのすみか - 純関数ロジック層
 * 設計書: .company/game/planning/tsuki-usagi-sumika-design.md
 * 設計条件: ①内部で Date.now()/Math.random() を読まない（now はすべて引数で受ける）
 *           ②時計戻し(now < lastVisit)は clamp して罰なし
 *           ③長期不在でも O(1)
 * すべて端末ローカル時刻基準（読者はほぼ国内=JST想定。決定事項として設計書に明記済み）
 * node検算: node apps/tsuki-usagi/test.js
 */

var TSUKI = (function () {
  // ===== 定数 =====
  var SYNODIC = 29.530589; // 平均朔望月(日)。±1日程度の誤差は幅判定で吸収する
  var NEW_MOON_EPOCH_UTC = Date.UTC(2000, 0, 6, 18, 14, 0); // 基準新月 2000-01-06 18:14 UTC
  var DAY_MS = 86400000;
  var SCHEMA_VERSION = 1;
  var AFFECTION_DAILY_CAP = 25; // 1日に増やせるなつき度の上限
  var SULK_GAP_DAYS = 3; // この日数以上空くと拗ねる
  var RECONCILE_PETS = 3; // 仲直りに必要ななでる回数
  var ADULT_DAYS = 7; // 成長: 子うさぎ→おとな

  // ===== 月齢 =====
  function moonAge(nowMs) {
    var days = (nowMs - NEW_MOON_EPOCH_UTC) / DAY_MS;
    var age = days % SYNODIC;
    if (age < 0) age += SYNODIC;
    return age; // 0〜29.53
  }

  // 8区分。満月は幅(13.8〜15.8)で判定し平均朔望月のズレを吸収する
  function moonPhase(age) {
    if (age < 1.0 || age >= 28.5) return "new";
    if (age < 6.0) return "crescent";
    if (age < 9.0) return "firstQuarter";
    if (age < 13.8) return "gibbous";
    if (age < 15.8) return "full";
    if (age < 21.0) return "waningGibbous";
    if (age < 24.0) return "lastQuarter";
    return "waningCrescent";
  }

  var PHASE_NAMES = {
    new: "新月",
    crescent: "三日月",
    firstQuarter: "上弦の月",
    gibbous: "十三夜",
    full: "満月",
    waningGibbous: "十六夜",
    lastQuarter: "下弦の月",
    waningCrescent: "有明の月"
  };

  // 月の出入りの目安(新月はほぼ日の出と同時=6時ごろ、1日あたり約50分遅れる概算)
  function moonRiseSetText(age) {
    var rise = (6 + age * 0.84) % 24;
    var set = (rise + 12) % 24;
    return "月の出 " + Math.round(rise) % 24 + "時ごろ・月の入り " + Math.round(set) % 24 + "時ごろ（目安）";
  }

  // 満月(月齢14.8)まであと何日か(0=今夜が満月)
  function daysToFullMoon(age) {
    var FULL = 14.8;
    if (moonPhase(age) === "full") return 0;
    var d = FULL - age;
    if (d < 0) d += SYNODIC;
    return Math.ceil(d);
  }

  // ===== 時間帯(半開区間・端末ローカル時刻) =====
  // 朝[6,10) 昼[10,16) 夕[16,19) 夜[19,24)∪[0,1) 深夜[1,6)
  function timeBand(hour) {
    if (hour >= 6 && hour < 10) return "morning";
    if (hour >= 10 && hour < 16) return "noon";
    if (hour >= 16 && hour < 19) return "evening";
    if (hour >= 19 || hour < 1) return "night";
    return "latenight";
  }

  var BAND_NAMES = { morning: "朝", noon: "昼", evening: "夕方", night: "夜", latenight: "深夜" };

  // だんごをあげられる帯(昼・深夜はだんご無し)
  var DANGO_BANDS = ["morning", "evening", "night"];

  // ===== ローカル日付ユーティリティ =====
  function localDayNum(nowMs, tzOffsetMin) {
    // tzOffsetMin: Date#getTimezoneOffset() の値(JST=-540)。引数で受けて純関数化
    return Math.floor((nowMs - tzOffsetMin * 60000) / DAY_MS);
  }
  function weekNum(dayNum) {
    return Math.floor(dayNum / 7);
  }

  // ===== 初期状態 =====
  function newState(nowMs, tzOffsetMin) {
    var day = localDayNum(nowMs, tzOffsetMin);
    return {
      v: SCHEMA_VERSION,
      name: "つき",
      born: nowMs,
      lastVisit: nowMs,
      affection: 0,
      affDay: day, // なつき度の日次カウント対象日
      affToday: 0,
      streak: { count: 1, lastDay: day, insWeek: -1 }, // insWeek: お休み保険を使った週
      sulking: false,
      petsSinceSulk: 0,
      feeds: { day: day, bands: [] },
      greets: { day: day, morning: false, night: false },
      blanket: { day: day, done: false },
      napPeek: { day: day, done: false },
      talkIdx: 0,
      // v1.1の図鑑用に取得記録だけv1から残す(設計書: 遡及反映)
      records: { napFaces: [], sleepTalks: [], phasesSeen: [], reconciled: 0 },
      tutorialDone: false
    };
  }

  // ===== 名前のサニタイズ(引っ越しコード等の外部入力にも適用) =====
  function sanitizeName(name) {
    if (typeof name !== "string") return "つき";
    // 制御文字とHTML特殊文字を除去し8文字まで
    var s = name.replace(/[\u0000-\u001F\u007F<>&"'`]/g, "").trim().slice(0, 8);
    return s.length >= 1 ? s : "つき";
  }

  // ===== マイグレーション(将来の版上げ用+形状検証) =====
  // 完全な形のstateはそのまま返す。欠損があればデフォルトへマージして返す(破損localStorage・不正コードでの起動不能を防ぐ)
  function isComplete(s) {
    return s && typeof s === "object" &&
      typeof s.name === "string" && typeof s.born === "number" && typeof s.lastVisit === "number" &&
      typeof s.affection === "number" && s.streak && typeof s.streak.count === "number" &&
      typeof s.streak.lastDay === "number" && s.feeds && Array.isArray(s.feeds.bands) &&
      s.greets && s.blanket && s.napPeek && typeof s.talkIdx === "number" &&
      s.records && Array.isArray(s.records.phasesSeen);
  }
  function migrate(state, nowMs, tzOffsetMin) {
    if (!state || typeof state !== "object") return null;
    if (state.v !== SCHEMA_VERSION) return null; // 未知バージョンは受け入れない
    if (isComplete(state)) return state;
    // 欠損フィールドをデフォルトで補完(参照時刻が無ければ既存値か0を使う)
    var ref = typeof nowMs === "number" ? nowMs : (typeof state.lastVisit === "number" ? state.lastVisit : 0);
    var def = newState(ref, typeof tzOffsetMin === "number" ? tzOffsetMin : 0);
    for (var k in state) {
      if (!Object.prototype.hasOwnProperty.call(state, k)) continue;
      if (k === "v") continue;
      if (typeof state[k] === typeof def[k] && state[k] !== null) def[k] = state[k];
    }
    def.name = sanitizeName(def.name);
    return isComplete(def) ? def : null;
  }

  // ===== 不在シミュレーション(核・O(1)) =====
  function simulate(state, nowMs, tzOffsetMin) {
    var s = state;
    // 時計戻しは clamp して罰なし
    if (nowMs < s.lastVisit) nowMs = s.lastVisit;
    var today = localDayNum(nowMs, tzOffsetMin);
    var gap = today - s.streak.lastDay;

    if (gap > 0) {
      // 日次リセット
      s.feeds = { day: today, bands: [] };
      s.greets = { day: today, morning: false, night: false };
      s.blanket = { day: today, done: false };
      s.napPeek = { day: today, done: false };
      s.affDay = today;
      s.affToday = 0;

      if (gap === 1) {
        s.streak.count += 1;
      } else if (gap === 2 && weekNum(today) !== s.streak.insWeek) {
        // 1日休み → 週1回の「お休み保険」でストリーク継続・拗ねも免除
        s.streak.count += 1;
        s.streak.insWeek = weekNum(today);
      } else {
        s.streak.count = 1;
        if (gap >= SULK_GAP_DAYS) {
          s.sulking = true;
          s.petsSinceSulk = 0;
        }
      }
      s.streak.lastDay = today;
    }
    s.lastVisit = nowMs;
    // 月相の目撃記録(図鑑用)
    var ph = moonPhase(moonAge(nowMs));
    if (s.records.phasesSeen.indexOf(ph) < 0) s.records.phasesSeen.push(ph);
    return s;
  }

  // ===== なつき度(日次上限つき) =====
  function addAffection(state, amount, nowMs, tzOffsetMin) {
    var day = localDayNum(nowMs, tzOffsetMin);
    if (state.affDay !== day) {
      state.affDay = day;
      state.affToday = 0;
    }
    var room = AFFECTION_DAILY_CAP - state.affToday;
    var add = Math.max(0, Math.min(amount, room));
    state.affection += add;
    state.affToday += add;
    return add;
  }

  function affectionLevel(affection) {
    if (affection >= 150) return { key: "family", label: "かぞく", hearts: 4 };
    if (affection >= 50) return { key: "bestfriend", label: "しんゆう", hearts: 3 };
    if (affection >= 10) return { key: "friend", label: "なかよし", hearts: 2 };
    return { key: "start", label: "ふれあいはじめ", hearts: 1 };
  }

  // ===== 成長 =====
  function growthStage(state, nowMs) {
    return nowMs - state.born >= ADULT_DAYS * DAY_MS ? "adult" : "child";
  }

  // ===== アクション判定 =====
  function canFeed(state, nowMs, tzOffsetMin) {
    var band = timeBand(new Date(nowMs).getHours());
    if (DANGO_BANDS.indexOf(band) < 0) return { ok: false, reason: "band" };
    var day = localDayNum(nowMs, tzOffsetMin);
    if (state.feeds.day === day && state.feeds.bands.indexOf(band) >= 0) return { ok: false, reason: "done" };
    return { ok: true, band: band };
  }

  function doFeed(state, nowMs, tzOffsetMin) {
    var c = canFeed(state, nowMs, tzOffsetMin);
    if (!c.ok) return false;
    var day = localDayNum(nowMs, tzOffsetMin);
    if (state.feeds.day !== day) state.feeds = { day: day, bands: [] };
    state.feeds.bands.push(c.band);
    addAffection(state, 5, nowMs, tzOffsetMin);
    return true;
  }

  function doPet(state, nowMs, tzOffsetMin) {
    var result = { reconciled: false };
    if (state.sulking) {
      state.petsSinceSulk += 1;
      if (state.petsSinceSulk >= RECONCILE_PETS) {
        state.sulking = false;
        state.petsSinceSulk = 0;
        state.records.reconciled += 1;
        addAffection(state, 3, nowMs, tzOffsetMin); // 仲直りボーナス
        result.reconciled = true;
      }
    } else {
      addAffection(state, 1, nowMs, tzOffsetMin);
    }
    return result;
  }

  // 次のだんご帯の開始時刻テキスト("17時から"等)。今日3回済みなら明日の朝
  function nextDangoText(state, nowMs, tzOffsetMin) {
    var d = new Date(nowMs);
    var hour = d.getHours();
    var day = localDayNum(nowMs, tzOffsetMin);
    var feedsToday = state.feeds.day === day ? state.feeds.bands : [];
    // 帯の開始時刻: 朝6 夕16 夜19
    var slots = [
      { band: "morning", start: 6 },
      { band: "evening", start: 16 },
      { band: "night", start: 19 }
    ];
    var band = timeBand(hour);
    // いまの帯でまだあげられる
    if (DANGO_BANDS.indexOf(band) >= 0 && feedsToday.indexOf(band) < 0) return "いま、だんごの時間だよ";
    for (var i = 0; i < slots.length; i++) {
      if (hour < slots[i].start && feedsToday.indexOf(slots[i].band) < 0) {
        return "次のだんごは" + slots[i].start + "時から";
      }
    }
    return "次のだんごは明日の朝6時から";
  }

  // アポイントメント表示(次に来る理由を毎回持ち帰らせる)
  function appointments(state, nowMs, tzOffsetMin) {
    var list = [];
    list.push(nextDangoText(state, nowMs, tzOffsetMin));
    var dtf = daysToFullMoon(moonAge(nowMs));
    if (dtf === 0) list.push("今夜は満月！");
    else list.push("満月まで あと" + dtf + "日");
    return list;
  }

  // ===== セリフ選択(決定論: 日付シードで開始位置をずらし順繰り) =====
  function pickTalk(pools, state, nowMs, tzOffsetMin) {
    var band = timeBand(new Date(nowMs).getHours());
    var pool = state.sulking ? pools.sulk : pools[band];
    if (!pool || pool.length === 0) return "……";
    var seed = localDayNum(nowMs, tzOffsetMin);
    var idx = (seed + state.talkIdx) % pool.length;
    state.talkIdx += 1;
    return pool[idx];
  }

  // ===== 引っ越しコード(バージョン+チェックサム付き) =====
  function checksum(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function b64encodeUtf8(str) {
    // ブラウザ/nodeどちらでも動くUTF-8安全base64
    if (typeof Buffer !== "undefined") return Buffer.from(str, "utf8").toString("base64");
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64decodeUtf8(b64) {
    if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf8");
    return decodeURIComponent(escape(atob(b64)));
  }
  function encodeState(state) {
    var json = JSON.stringify(state);
    var body = b64encodeUtf8(json);
    return "TU" + SCHEMA_VERSION + "." + body + "." + checksum(body);
  }
  function decodeState(code) {
    try {
      var m = /^TU(\d+)\.([A-Za-z0-9+/=]+)\.([a-z0-9]+)$/.exec(String(code).trim());
      if (!m) return null;
      if (checksum(m[2]) !== m[3]) return null;
      var state = JSON.parse(b64decodeUtf8(m[2]));
      var out = migrate(state);
      if (out) out.name = sanitizeName(out.name); // 外部入力の名前は必ずサニタイズ(XSS対策)
      return out;
    } catch (e) {
      return null;
    }
  }

  return {
    SYNODIC: SYNODIC,
    SCHEMA_VERSION: SCHEMA_VERSION,
    AFFECTION_DAILY_CAP: AFFECTION_DAILY_CAP,
    RECONCILE_PETS: RECONCILE_PETS,
    sanitizeName: sanitizeName,
    moonRiseSetText: moonRiseSetText,
    moonAge: moonAge,
    moonPhase: moonPhase,
    PHASE_NAMES: PHASE_NAMES,
    daysToFullMoon: daysToFullMoon,
    timeBand: timeBand,
    BAND_NAMES: BAND_NAMES,
    DANGO_BANDS: DANGO_BANDS,
    localDayNum: localDayNum,
    newState: newState,
    migrate: migrate,
    simulate: simulate,
    addAffection: addAffection,
    affectionLevel: affectionLevel,
    growthStage: growthStage,
    canFeed: canFeed,
    doFeed: doFeed,
    doPet: doPet,
    nextDangoText: nextDangoText,
    appointments: appointments,
    pickTalk: pickTalk,
    encodeState: encodeState,
    decodeState: decodeState
  };
})();

if (typeof module !== "undefined") module.exports = TSUKI;
