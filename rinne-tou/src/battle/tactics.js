/**
 * 作戦（戦い方の方針。戦闘はこれに沿って自動で進む）
 *
 * ★表示名は和風に寄せてある（2026-08-04 オーナー指示）。**id は変えないこと**。
 *   セーブ（`party.tacticParty` / `party.tacticChars`）とシミュレーターが id を持っている。
 *
 * 実体は「AIの評価関数の重みプリセット」（spec §3-8-6）。
 * 作戦を1つ足す = この表に1行足す、で済むようにしてある。
 *
 * w_atk    : 期待ダメージの重み
 * w_heal   : 回復量の重み
 * w_crush  : 崩し成立の重み
 * w_debuff : 状態異常付与の重み
 * w_combo  : 崩しゲージを溜めること自体の重み
 * w_cost   : 気の消費のペナルティ
 * w_risk   : 味方の危険度（HPが減っている）への反応
 * healAt   : このHP割合以下の味方がいたら回復を強く優先する
 * useItem  : 道具（回復薬等）を自動使用するか
 * noSkill  : スキルを使わず通常攻撃だけにするか
 * focus    : 'weakest'（HPの低い敵）| 'threat'（脅威度の高い敵）| null（自動）
 */

export const TACTICS = {
  omakase: {
    id: 'omakase', name: '臨機応変', unlock: 0,
    desc: '崩しを狙いつつ、傷が深くなった仲間を癒やす。気は半分まで使う',
    w_atk: 1.0, w_heal: 1.0, w_crush: 1.0, w_debuff: 0.6, w_combo: 0.5, w_cost: 0.4, w_risk: 0.8,
    healAt: 0.50, useItem: false, noSkill: false, focus: null,
  },
  gangan: {
    id: 'gangan', name: '攻めに徹しろ', unlock: 0,
    desc: '与える傷を最優先。癒やすのは瀕死のときだけ。気を惜しまない',
    w_atk: 1.4, w_heal: 0.3, w_crush: 0.8, w_debuff: 0.2, w_combo: 0.3, w_cost: 0.1, w_risk: 0.2,
    healAt: 0.25, useItem: false, noSkill: false, focus: null,
  },
  inochi: {
    id: 'inochi', name: '命を惜しめ', unlock: 0,
    desc: '早めに癒やし、守りを固める。攻めは控えめ',
    w_atk: 0.6, w_heal: 1.8, w_crush: 0.7, w_debuff: 0.5, w_combo: 0.2, w_cost: 0.6, w_risk: 1.5,
    healAt: 0.70, useItem: true, noSkill: false, focus: null,
  },
  kuzushi: {
    id: 'kuzushi', name: '崩しを狙え', unlock: 1,
    desc: '相性を突いて崩しにいく。相手の手を鈍らせるが、気の減りは早い',
    w_atk: 0.8, w_heal: 0.8, w_crush: 2.0, w_debuff: 0.4, w_combo: 1.5, w_cost: 0.3, w_risk: 0.7,
    healAt: 0.45, useItem: false, noSkill: false, focus: null,
  },
  kitame: {
    id: 'kitame', name: '気を練れ', unlock: 2,
    desc: '通常の攻撃を主に。気を温存して、要所で技を使う',
    w_atk: 0.7, w_heal: 0.9, w_crush: 1.2, w_debuff: 0.2, w_combo: 1.0, w_cost: 1.6, w_risk: 0.8,
    healAt: 0.45, useItem: false, noSkill: false, focus: null,
  },
  yowai: {
    id: 'yowai', name: '手薄から討て', unlock: 2,
    desc: '弱っている敵から確実に減らす。結果として受ける傷が減る',
    w_atk: 1.1, w_heal: 1.0, w_crush: 0.9, w_debuff: 0.3, w_combo: 0.4, w_cost: 0.4, w_risk: 0.8,
    healAt: 0.50, useItem: false, noSkill: false, focus: 'weakest',
  },
  tegowai: {
    id: 'tegowai', name: '強敵から討て', unlock: 3,
    desc: 'いちばん危ない敵から狙う',
    w_atk: 1.1, w_heal: 1.0, w_crush: 1.1, w_debuff: 0.5, w_combo: 0.4, w_cost: 0.4, w_risk: 0.8,
    healAt: 0.50, useItem: false, noSkill: false, focus: 'threat',
  },
  dougu: {
    id: 'dougu', name: '道具を惜しむな', unlock: 3,
    desc: '臨機応変に加えて、薬も自分の判断で使う',
    w_atk: 1.0, w_heal: 1.1, w_crush: 1.0, w_debuff: 0.6, w_combo: 0.5, w_cost: 0.4, w_risk: 1.0,
    healAt: 0.60, useItem: true, noSkill: false, focus: null,
  },
  kitsukau: {
    id: 'kitsukau', name: '気を温存しろ', unlock: 4,
    desc: 'わざを使わず、通常の攻撃だけで戦う',
    w_atk: 1.0, w_heal: 0.5, w_crush: 0.0, w_debuff: 0.0, w_combo: 0.0, w_cost: 9.9, w_risk: 0.5,
    healAt: 0.30, useItem: false, noSkill: true, focus: null,
  },

  // ── 上級作戦（やりこみで解放。spec §3-8-2） ──
  yomikire: {
    id: 'yomikire', name: '読み切れ', unlock: 'dex50',
    // ★「載せていない敵には効かない」ことまで書く（2026-08-16 オーナー指示）。
    //   図鑑100%を前提にしないので、効く相手と効かない相手が混ざるのが常態
    desc: '図鑑に載せた敵に限り、癖まで読んで動く。載っていない敵には臨機応変と同じ',
    w_atk: 1.0, w_heal: 1.0, w_crush: 1.6, w_debuff: 0.6, w_combo: 0.8, w_cost: 0.4, w_risk: 0.8,
    healAt: 0.50, useItem: true, noSkill: false, focus: 'threat', foresight: true,
  },
  todome: {
    // ★旧名「とどめは合わせ技」。合わせ技が未実装なので、実際の効き方に合わせた名前にした
    id: 'todome', name: '崩しで押し切れ', unlock: 'pairs5',
    desc: '崩しをいちばん重く見る。相手に手を出させないまま押し切る',
    w_atk: 0.9, w_heal: 1.0, w_crush: 1.4, w_debuff: 0.3, w_combo: 2.2, w_cost: 0.3, w_risk: 0.8,
    healAt: 0.50, useItem: false, noSkill: false, focus: null, forceCombo: true,
  },
  mukizu: {
    id: 'mukizu', name: '傷を負うな', unlock: 'board',
    desc: '受ける傷を最小に。長引くので灯を余分に使う',
    w_atk: 0.5, w_heal: 2.0, w_crush: 1.8, w_debuff: 0.9, w_combo: 0.3, w_cost: 0.5, w_risk: 2.2,
    healAt: 0.85, useItem: true, noSkill: false, focus: 'threat',
  },
};

/** キャラ個別の役割作戦（spec §3-8-3） */
export const ROLE_TACTICS = {
  follow:  { id: 'follow',  name: '全体にしたがう' },
  kabae:   { id: 'kabae',   name: '守りにつけ',    override: { w_atk: 0.4, w_heal: 0.6, w_risk: 2.5, preferTaunt: true } },
  kaifuku: { id: 'kaifuku', name: '癒やしに回れ',  override: { w_atk: 0.0, w_heal: 2.5, w_risk: 1.8, healAt: 0.90 } },
  karame:  { id: 'karame',  name: '搦め手',        override: { w_atk: 0.6, w_debuff: 2.2, w_crush: 1.0 } },
  manual:  { id: 'manual',  name: '自分で決める',  manual: true },
};

export const TACTIC_LIST = Object.values(TACTICS);

/** 進行状況から、いま選べる作戦のidを返す */
export function availableTactics({ chapter = 0, dexPct = 0, pairsFound = 0, boardUnlocked = false } = {}) {
  return TACTIC_LIST.filter((t) => {
    if (typeof t.unlock === 'number') return chapter >= t.unlock;
    if (t.unlock === 'dex50') return dexPct >= 50;
    if (t.unlock === 'pairs5') return pairsFound >= 5;
    if (t.unlock === 'board') return boardUnlocked;
    return true;
  }).map((t) => t.id);
}
