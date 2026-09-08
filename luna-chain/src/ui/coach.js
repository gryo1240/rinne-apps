/**
 * ルナチェイン｜対戦中の案内（コーチ）
 *
 * ★2026-09-08 オーナー指示で新設★
 *   > 遊び方は実際のプレイ画面で説明しながら進めるようにしてほしいな。
 *   > 何が起こっているか分からないから、後半は連打ゲーになっちゃう。
 *
 * ★守ること★
 *   1. **状況に反応して出す**。決まった順に読ませない（読み物にした瞬間に読まれなくなる）
 *   2. **一度出した行は二度と出さない**。全部出たら黙る。うるさい案内は必ず切られる
 *   3. **同時に出るのは1行だけ・MAX_LINE 字以内**（機械検査あり）
 *   4. **ここでルールを判断しない**。渡された状況を見るだけ。盤の理屈は core が持つ
 */

/** 1行の上限。★対戦画面に読み物を作らないための歯止め★（test-coach.mjs が検査する） */
export const MAX_LINE = 24;

export const LINES = [
  { id: 'start',   text: 'すきなマスを おしてみて' },
  { id: 'placed',  text: 'ひかりが 1つ ふえた' },
  { id: 'ready',   text: 'あと1つで はじけるマスがある' },
  { id: 'boom',    text: 'はじけて となりを うばった！' },
  { id: 'chain',   text: 'つづけて はじけると れんさ！' },
  { id: 'big',     text: 'かどから ねらうと つながりやすい' },
  // ★この行は「CPUが打ち終わった直後」に出る＝そのとき手番は自分★
  //   もとは「つぎは あいての ばん」と書いていて、意味が正反対だった（2026-09-08のレビューで発覚）
  { id: 'oppturn', text: 'あいてが おいた。つぎは きみ' },
  { id: 'taken',   text: 'とられた。とりかえそう' },
  { id: 'preview', text: 'ゆびを おいたままだと よこくが 出る' },
  { id: 'goal',    text: 'あいての色を ぜんぶ なくせば かち' },
];

const BY_ID = Object.fromEntries(LINES.map((l) => [l.id, l]));

export class Coach {
  constructor() { this.seen = new Set(); this.cur = null; }

  reset() { this.seen.clear(); this.cur = null; }

  /** まだ出していなければ、その行を返して「出した」ことにする */
  take(id) {
    if (this.seen.has(id)) return null;
    this.seen.add(id);
    this.cur = id;
    return BY_ID[id].text;
  }

  /**
   * 状況を渡し、出すべき1行を返す（無ければ null）。
   * ctx = { phase, chain, lost, hasReady }
   *   phase  … 'start'（開始）/ 'myMove'（自分が置いた直後）/ 'oppMove'（相手が置いた直後）/ 'myTurn'（自分の番になった）
   *   chain  … その手で起きたはじけの回数
   *   lost   … その手で相手に取られたマス数
   *   hasReady … 盤に「あと1つではじける自分のマス」があるか
   */
  feed(ctx = {}) {
    const { phase, chain = 0, lost = 0, hasReady = false } = ctx;
    if (phase === 'start') return this.take('start');

    if (phase === 'myMove') {
      if (chain >= 5) return this.take('big') || this.take('chain');
      if (chain >= 2) return this.take('chain');
      if (chain === 1) return this.take('boom');
      return this.take('placed') || (hasReady ? this.take('ready') : null);
    }

    if (phase === 'oppMove') {
      if (lost > 0) return this.take('taken');
      return this.take('oppturn');
    }

    if (phase === 'myTurn') {
      // ★開始の行をここでも拾う★
      //   先後はランダムなので、約半分の対戦では開始時に自分の手番でない。
      //   そのとき start を出すと「押して」と言われた瞬間に押せず、しかも
      //   出したことになって二度と出なくなる（2026-09-08のレビューで発覚）
      return this.take('start') || this.take('preview') || this.take('goal')
        || (hasReady ? this.take('ready') : null);
    }
    return null;
  }

  /** 全部出しきったか（出しきったら黙る） */
  get done() { return this.seen.size >= LINES.length; }
}
