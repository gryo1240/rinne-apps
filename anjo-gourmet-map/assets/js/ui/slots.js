/* ============================================================
   slots.js － 収益化の置き場（プレースホルダ）
   ------------------------------------------------------------
   【重要・先に読むこと】
   このアプリの店舗情報の出典は公式サイト（安城グルメガイド／安城市観光協会）です。
   事実情報のみを加工しているとはいえ、**広告や有料掲載を出す前に
   安城市観光協会へ確認してください**（HANDOFF-dev.md 第3章・第9章）。

   そのため既定は AGM.config.monetization の全項目が false ＝ **何も表示されません**。
   ここにあるのは「置き場所」と「出し方」だけです。
   確認が取れたら config.js のフラグを true にし、
   render() の中身を実際の内容に差し替えてください。

   PR・広告であることの明示（.slot-label）は外さないこと。
   ============================================================ */
window.AGM = window.AGM || {};
AGM.ui = AGM.ui || {};

(function(){
"use strict";

var U = AGM.util;
var SL = AGM.ui.slots = {};
var M = AGM.config.monetization;

function fill(id, on, label, body){
  var el = U.$(id);
  if(!el) return;
  el.classList.toggle("is-on", !!on);
  el.setAttribute("aria-hidden", on?"false":"true");
  if(!on){ el.innerHTML=""; return; }
  el.innerHTML = '<div class="slot-in'+(id==="slot-sponsor"?" sponsor":"")+'">'+
    '<div class="slot-label">'+U.esc(label)+'</div>'+ body + '</div>';
}

SL.render = function(){
  /* スポンサー店舗：おすすめ3軒の“下”に1枠。
     【重要】3軒の中に混ぜないこと。おすすめの信頼が崩れると
     このサービスの価値そのものが無くなります。必ず別枠・PR表記つきで。 */
  fill("slot-sponsor", M.sponsor, "スポンサー",
    'スポンサー枠です。config.js の monetization.sponsor を true にすると表示されます。'+
    '<br>おすすめ3軒の中には混ぜないこと（別枠・PR表記つきで出す）。');

  /* プレミアム掲載（PR） */
  fill("slot-promoted", M.promoted, "PR",
    'プレミアム掲載の枠です。通常の並び順とは別枠であることが分かる位置に置いてください。');

  /* 地域広告 */
  fill("slot-ad-side", M.ads, "広告", '地域広告の枠（サイド）');
  fill("slot-ad-foot", M.ads, "広告", '地域広告の枠（フッター上）');

  /* AIプレミアム */
  fill("slot-premium", M.premium, "プレミアム",
    'AI相談の詳細条件、プランの保存数上限、履歴からの学習などを解放する枠です。');

  /* 有料掲載の申し込み導線（店舗向け） */
  fill("slot-paid", M.paidListing, "掲載について",
    '店舗の方向けの掲載申し込み導線を置く枠です。');

  /* 自治体向け・企業向けの管理画面への入口。
     どちらもログインが要るので、静的サイトのままでは作れません。
     別ホストに用意して、config.js の admin.* にURLを入れてください。 */
  fill("slot-admin-city", M.cityAdmin, "自治体向け",
    '掲載店舗の追加・修正、イベント登録、閲覧数の集計を行う管理画面への入口です。'+
    '<br><a href="'+U.esc(AGM.config.admin.city)+'">管理画面へ</a>');
  fill("slot-admin-biz", M.bizAdmin, "店舗向け",
    '営業時間の修正申請、写真の登録（＝許諾のある写真をこのサイトに出せるようになります）、'+
    'クーポン配信を行う管理画面への入口です。'+
    '<br><a href="'+U.esc(AGM.config.admin.biz)+'">管理画面へ</a>');
};

/* 掲載枠が有効かどうか（他モジュールから参照する用） */
SL.enabled = function(key){ return !!M[key]; };

})();
