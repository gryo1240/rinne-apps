/* ============================================================
   hours.js － 営業中かどうかの判定
   ------------------------------------------------------------
   【この機能を作る前に、100件の元データを実際に数えた結果】

   ・営業時間に改行が入っている  … 58件
   ・曜日ごとに時間が違う行がある … 「平日 11:00〜15:00／土日祝 11:00〜22:00」など約20件
   ・24時をまたぐ表記がある      … 「18:00〜26:00」「17:00〜27:00」（26時＝翌2時）
   ・終わりが決まっていない      … 「11:00〜品切れ次第終了」
   ・見出しだけの行がある        … 「平日」の次の行に時間が並ぶ書き方が1件（id:63）
   ・定休日は自由記述           … 「第3月曜日」「月〜金曜日」「無休（元旦のみ休業）」
                                   「月曜日（祝日の場合、翌水曜休）」「日曜ディナー」など59通り

   そのため、次の方針で作っている。

   1. **推測で「営業中」と言わない。** 読み取れなかったら "要確認" を出す。
      間違って「営業中」と出すのは、閉まっている店に行かせることなので最も避けたい。
   2. 括弧の中（L.O. や但し書き）は時間帯の判定に使わない。ただし表示では消さない。
   3. 「祝日」「不定休」「臨時休業」が書いてある店は、判定に必ず但し書きを添える。
      祝日カレンダーは持っていないので、祝日を平日として扱ってしまう可能性があるため。
   4. 時刻は**日本時間**で見る（util.nowJST）。端末が海外設定でも判定が狂わない。

   ------------------------------------------------------------
   返す状態は4つ。色は CSS 側（.openbadge）で当てる。
     open    緑  営業中
     closed  赤  営業時間外
     holiday 灰  定休日
     unknown 黄  要確認（読み取れない・情報が足りない）
   色だけで伝えないよう、記号と文字を必ず一緒に出すこと。
   ============================================================ */
window.AGM = window.AGM || {};

(function(){
"use strict";

var U = AGM.util;
var H = AGM.hours = {};

var WD_CHARS = "日月火水木金土";
var DASH = "[〜～~ーｰ\\-–—]";

/* ---------- 下ごしらえ ---------- */

/* 括弧の中身を落とす。L.O.・但し書きは時間帯の判定に使わないため。
   落とした中身は注記として返す（表示には元の文字をそのまま使うので、ここでは判定用のみ）。 */
function stripParen(line, notes){
  return String(line).replace(/[（(]([^）)]*)[）)]/g, function(_, inner){
    if(notes && inner) notes.push(inner);
    return " ";
  });
}

/* 全角数字・全角コロンをそろえる */
function normalize(s){
  return String(s||"")
    .replace(/[０-９]/g, function(c){ return String.fromCharCode(c.charCodeAt(0)-0xFEE0); })
    .replace(/：/g, ":")
    .replace(/／/g, "/");
}

/* 曜日の並び（日=0 … 土=6）で from→to を埋める。木〜日 のように週をまたぐ指定も通る */
function rangeDays(from, to){
  var out=[], i=from;
  for(var guard=0; guard<7; guard++){
    out.push(i);
    if(i===to) break;
    i=(i+1)%7;
  }
  return out;
}

/* 行の先頭（最初の数字より前）から曜日を読む。
   【罠】「平日」「祝日」には "日" の字が入っている。先にこの2語を取り除かないと
   日曜日が指定されたことになってしまう。 */
function parsePrefixDays(prefix, flags){
  var p = String(prefix||""), days = [];
  if(/平日/.test(p)){ days = days.concat([1,2,3,4,5]); p = p.replace(/平日/g," "); }
  if(/祝/.test(p)){ flags.holiday = true; p = p.replace(/祝祭日|祝日|祝/g," "); }
  p = p.replace(/曜日|曜/g," ");

  // 「木〜日」のような範囲指定
  var re = new RegExp("(["+WD_CHARS+"])\\s*"+DASH+"\\s*(["+WD_CHARS+"])");
  var m = p.match(re);
  if(m){
    days = days.concat(rangeDays(WD_CHARS.indexOf(m[1]), WD_CHARS.indexOf(m[2])));
    p = p.replace(m[0]," ");
  }
  // 残った曜日の字（「金土日」「月・火」）
  for(var i=0;i<p.length;i++){
    var k = WD_CHARS.indexOf(p.charAt(i));
    if(k>=0) days.push(k);
  }
  // 重複を落とす
  var seen={}, out=[];
  days.forEach(function(d){ if(!seen[d]){ seen[d]=1; out.push(d); } });
  return out;
}

/* ---------- 営業時間 ---------- */

/* 24時以降（25:00＝翌1:00）に対応する。
   終わりが始まりより小さいときも翌日にまたいだとみなす（17:00〜2:00）。 */
function pushRange(byDay, days, s, e){
  days.forEach(function(d){
    if(e == null){                       // 終わりが不明（「11:00〜品切れ次第終了」）
      byDay[d].push({s:s, e:null});
      return;
    }
    var end = e;
    if(end <= s) end += 1440;            // 日付をまたぐ
    if(end > 1440){
      byDay[d].push({s:s, e:1440});
      byDay[(d+1)%7].push({s:0, e:end-1440, carry:true});
    }else{
      byDay[d].push({s:s, e:end});
    }
  });
}

H.parseHours = function(text){
  var res = {
    byDay: [[],[],[],[],[],[],[]],
    parsed:false, weekdaySpecific:false, holiday:false, notes:[], openEnded:false
  };
  var raw = normalize(text);
  if(!raw.trim()) return res;

  var lines = raw.split(/\n+/);
  var sticky = null;    // 見出しだけの行（「平日」）が指定した曜日
  var flags = {holiday:false};

  lines.forEach(function(line0){
    var line = line0.trim();
    if(!line) return;
    if(/^[※*＊]/.test(line)){ res.notes.push(line.replace(/^[※*＊]\s*/,"")); return; }

    line = stripParen(line, res.notes);
    var head = line.match(/^([^\d]*)/)[1];       // 最初の数字より前が曜日の指定
    var days = parsePrefixDays(head, flags);

    // 時間帯（H:MM〜H:MM）を全部拾う
    var reFull = new RegExp("(\\d{1,2}):(\\d{2})\\s*"+DASH+"\\s*(\\d{1,2}):(\\d{2})","g");
    var found = [], m;
    while((m = reFull.exec(line))){
      found.push({ s:(+m[1])*60 + (+m[2]), e:(+m[3])*60 + (+m[4]) });
    }

    // 「11:00〜品切れ次第終了」のように終わりが書かれていないもの
    if(!found.length){
      var reOpen = new RegExp("(\\d{1,2}):(\\d{2})\\s*"+DASH,"");
      var mo = line.match(reOpen);
      if(mo){ found.push({ s:(+mo[1])*60 + (+mo[2]), e:null }); res.openEnded = true; }
    }

    if(!found.length){
      // 時間が無い行。曜日だけなら次の行以降の見出しとして覚える（id:63 の書き方）
      if(days.length) sticky = days;
      else if(line.trim()) res.notes.push(line.trim());
      return;
    }

    var target = days.length ? days : (sticky || [0,1,2,3,4,5,6]);
    if(days.length) res.weekdaySpecific = true;
    found.forEach(function(r){ pushRange(res.byDay, target, r.s % 1440, r.e); });
    res.parsed = true;
  });

  res.holiday = !!flags.holiday;
  // 見やすさのため開始時刻順に並べておく
  res.byDay.forEach(function(a){ a.sort(function(x,y){ return x.s-y.s; }); });
  return res;
};

/* ---------- 定休日 ---------- */

H.parseClosed = function(text){
  var res = { weekdays:[], nth:[], always:false, irregular:false,
              holiday:false, seasonal:false, partial:false, raw:String(text||"") };
  var t = normalize(text);
  if(!t.trim()) return res;

  if(/無休/.test(t)) res.always = true;
  if(/不定休/.test(t)) res.irregular = true;
  if(/臨時休業/.test(t)) res.irregular = true;
  if(/祝/.test(t)) res.holiday = true;
  if(/年末年始|お盆|夏季|冬季|GW|ゴールデンウィーク|年始|元日|元旦/.test(t)) res.seasonal = true;

  // 但し書きの括弧は落とす。
  // 【罠】「月曜日（祝日の場合、翌水曜休）」の括弧を残すと水曜まで定休日になってしまう。
  t = stripParen(t, null);

  // 「第3月曜日」「第2・4水曜日」
  var reNth = new RegExp("第([\\d・,、\\s]+)(["+WD_CHARS+"])曜","g");
  var m;
  while((m = reNth.exec(t))){
    var w = WD_CHARS.indexOf(m[2]);
    (m[1].match(/\d+/g)||[]).forEach(function(n){ res.nth.push({w:w, n:+n}); });
  }
  t = t.replace(reNth, " ");

  // 毎週の定休日。読点で区切って、曜日の書いてある区切りだけを見る
  t.split(/[、,]/).forEach(function(seg){
    if(!/曜/.test(seg)) return;
    /* 【罠】「月曜日、日曜ディナー」は日曜が終日休みではない（夜だけ）。
       時間帯を指す語が入っている区切りは、終日の定休日として数えない。 */
    if(/ディナー|ランチ|夜|昼|モーニング/.test(seg)){ res.partial = true; return; }
    var days = parsePrefixDays(seg.replace(/休.*$/,""), res);
    res.weekdays = res.weekdays.concat(days);
  });

  var seen={}, out=[];
  res.weekdays.forEach(function(d){ if(!seen[d]){ seen[d]=1; out.push(d); } });
  res.weekdays = res.always ? [] : out;     // 「無休」と曜日が同時に書かれることはない
  return res;
};

/* その日が「第n×曜日」に当たるか */
function isNthWeekday(date, w, n){
  if(date.getDay() !== w) return false;
  return Math.floor((date.getDate()-1)/7) + 1 === n;
}

/* ---------- 判定 ---------- */

/* shop に hoursInfo / closedInfo が無ければその場で解析する（shops.js が事前に入れる） */
function info(shop){
  if(!shop._hi) shop._hi = H.parseHours(shop.hours);
  if(!shop._ci) shop._ci = H.parseClosed(shop.closed);
  return shop;
}

/* いまの状態を返す。
   { code, label, sub, sign, openNow }
     code : "open" | "closed" | "holiday" | "unknown"
     sign : 記号。色が分からなくても意味が伝わるようにする */
H.state = function(shop, now){
  info(shop);
  var d = now || U.nowJST();
  var day = d.getDay();
  var min = d.getHours()*60 + d.getMinutes();
  var hi = shop._hi, ci = shop._ci;

  var caution = [];
  if(ci.irregular) caution.push("不定休あり");
  if(ci.holiday || hi.holiday) caution.push("祝日は要確認");
  if(ci.seasonal) caution.push("長期休業あり");

  function done(code, label, sub){
    var sub2 = [sub].concat(caution).filter(Boolean).join("・");
    return {
      code: code, label: label, sub: sub2,
      sign: code==="open" ? "●" : code==="closed" ? "○" : code==="holiday" ? "—" : "?",
      openNow: code==="open"
    };
  }

  /* 0. すでに閉業している店。
     【実データで発見】公式サイトの店名に【閉業】と入っている店が2件あり
     （カントリーヴレッジ／すすきのらぁめん膳 新安城北口店）、
     それでも営業時間の欄は埋まったままになっている。
     時間だけを見ると「営業中」と出てしまい、閉じた店に人を行かせることになる。
     店名の表記を最優先で見ること。 */
  if(shop.closedForGood){
    // 不定休などの注記は付けない（閉業しているのだから意味がない）
    return { code:"holiday", label:"閉業", sign:"—", openNow:false,
             sub:"公式サイトの店名に【閉業】と記載があります" };
  }

  // 1. 定休日が最優先
  var closedToday = ci.weekdays.indexOf(day) >= 0;
  if(!closedToday){
    for(var i=0;i<ci.nth.length;i++){
      if(isNthWeekday(d, ci.nth[i].w, ci.nth[i].n)){ closedToday = true; break; }
    }
  }
  if(closedToday){
    return done("holiday", "定休日", nextOpenText(shop, d));
  }

  // 2. きょうの時間帯
  var todays = hi.byDay[day];
  if(!todays.length){
    if(hi.parsed && hi.weekdaySpecific) return done("unknown","本日は要確認","この曜日の営業時間が書かれていません");
    return done("unknown","営業時間 要確認","");
  }

  var openEnded = null, nextStart = null, lastEnd = null;
  for(var j=0;j<todays.length;j++){
    var r = todays[j];
    if(r.e == null){
      if(min >= r.s) openEnded = r;
      else if(nextStart==null || r.s<nextStart) nextStart = r.s;
      continue;
    }
    if(lastEnd==null || r.e>lastEnd) lastEnd = r.e;
    if(min >= r.s && min < r.e){
      var left = r.e - min;
      var until = U.fmtTime(r.e % 1440);
      return done("open", "営業中",
        left <= 60 ? ("まもなく閉店 "+until) : (until+"まで"));
    }
    if(min < r.s && (nextStart==null || r.s<nextStart)) nextStart = r.s;
  }

  /* 「11:00〜品切れ次第終了」のように終わりが書かれていない店（実データで3件）。
     ここで「営業中」と言い切らない。閉まっている店に行かせるのがいちばん困るため。
     ただし、はっきり書かれている時間帯を過ぎているなら、その事実は添える。 */
  if(openEnded){
    return done("unknown","時間は要確認",
      (lastEnd!=null && min>=lastEnd)
        ? ("表示は"+U.fmtTime(lastEnd%1440)+"まで・以降は要確認")
        : (U.fmtTime(openEnded.s)+"開店・終了は品切れ次第など"));
  }
  if(nextStart != null) return done("closed","営業時間外", U.fmtTime(nextStart)+"から");
  return done("closed","営業時間外", nextOpenText(shop, d));
};

/* 次に開く日を探す。7日先まで見て、見つからなければ空文字 */
function nextOpenText(shop, from){
  var hi = shop._hi, ci = shop._ci;
  if(!hi.parsed) return "";
  for(var k=1;k<=7;k++){
    var d = new Date(from.getTime());
    d.setDate(d.getDate()+k);
    var day = d.getDay();
    if(ci.weekdays.indexOf(day)>=0) continue;
    var nth=false;
    for(var i=0;i<ci.nth.length;i++){ if(isNthWeekday(d, ci.nth[i].w, ci.nth[i].n)){ nth=true; break; } }
    if(nth) continue;
    var rs = hi.byDay[day].filter(function(r){ return !r.carry; });
    if(!rs.length) continue;
    var label = k===1 ? "明日" : (AGM.util.WD[day]+"曜");
    return "次は"+label+" "+U.fmtTime(rs[0].s)+"から";
  }
  return "";
}
H.nextOpenText = nextOpenText;

/* きょうの営業時間を短く（店舗ページと吹き出しで使う） */
H.todayText = function(shop, now){
  info(shop);
  if(shop.closedForGood) return "";   // 閉業した店に「本日の営業時間」を出さない
  var d = now || U.nowJST();
  var rs = shop._hi.byDay[d.getDay()].filter(function(r){ return !r.carry && r.e!=null; });
  if(!rs.length) return "";
  return rs.map(function(r){ return U.fmtTime(r.s)+"〜"+U.fmtTime(r.e%1440); }).join("／");
};

/* schema.org の openingHoursSpecification 用（店舗ページの構造化データ）。
   読み取れなかった店では空配列を返す。**推測で埋めない。** */
H.openingSpec = function(shop){
  info(shop);
  // 閉業した店の営業時間を検索結果に出さない
  if(shop.closedForGood) return [];
  var names = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  var out = [];
  shop._hi.byDay.forEach(function(rs, day){
    rs.forEach(function(r){
      if(r.carry || r.e==null) return;
      out.push({
        "@type":"OpeningHoursSpecification",
        dayOfWeek:"https://schema.org/"+names[day],
        opens: pad(r.s), closes: pad(r.e%1440)
      });
    });
  });
  return out;
};
function pad(min){
  var h=Math.floor(min/60)%24, m=min%60;
  return (h<10?"0":"")+h+":"+(m<10?"0":"")+m;
}

})();
