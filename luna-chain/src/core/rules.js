/**
 * ルナチェイン｜ルールの本体（純粋ロジック・DOMを一切触らない）
 *
 * ここはブラウザとNode（テスト・シミュレーター）で同じものを読む。
 * ★画面側でルールを再計算しないこと★——同じ判定を2か所に書くと必ずズレる。
 *
 * 停止性についての考え方は board.js の冒頭を読むこと（「光が増えない」だけでは止まらない）。
 */

import { N, T_CLOUD, T_NORMAL, T_STARDUST, buildGeometry, orthOf } from './board.js';

/** 1手の連鎖で許すはじけの最大回数（安全弁）。テストで発火0を確認している */
export const MAX_EXPLOSIONS = 3000;

export function newGame(opts = {}) {
  const terrain = opts.terrain ? Int8Array.from(opts.terrain) : new Int8Array(N);
  const cloud = new Int8Array(N);
  for (let i = 0; i < N; i++) if (terrain[i] === T_CLOUD) cloud[i] = 3;
  const s = {
    owner: new Int8Array(N),
    count: new Int8Array(N),
    terrain, cloud,
    wrapX: !!opts.wrapX,   // 盤の左右がつながっているか（旧「鏡」・盤単位の属性）
    geo: null,
    player: 1,
    turn: 0,               // 完了した手番の数
    moves: [0, 0],         // 各プレイヤーの完了手番数
    // ★komi（後手の初手だけ2回置ける）は 2026-09-08 に廃止★
    //   先手勝率を55%→44.7%に均す効果はあったが、画面に説明が無く
    //   **オーナーに「バグ？」と言われた**。ルールを1つ減らすほうを取った。
    //   先後は1戦ごとにランダムなので、遊び続ければ差は均される（§2-5）。
    //   ★「先手が有利だから」と言ってこれを復活させないこと。復活させるなら画面で説明すること★
    maxTurns: opts.maxTurns ?? 120,   // 手番（片方の1手）の上限。実測で決着は平均75〜90手番=37〜45ラウンド
    winner: 0,
    endReason: '',
    overflow: false,       // 安全弁が発火したら true（発火してはいけない）
  };
  rebuildGeometry(s);
  return s;
}

/** 地形が変わったら必ず呼ぶ */
export function rebuildGeometry(s) {
  s.geo = buildGeometry(s.terrain, s.wrapX);
}

export function cloneState(s) {
  return {
    ...s,
    owner: Int8Array.from(s.owner),
    count: Int8Array.from(s.count),
    terrain: Int8Array.from(s.terrain),
    cloud: Int8Array.from(s.cloud),
    moves: [s.moves[0], s.moves[1]],
    geo: s.geo,   // 地形が変わらない限り共有してよい（変えるときは rebuildGeometry を呼ぶ）
  };
}

export const isCloudy = (s, i) => s.cloud[i] > 0;
export const isWallAt = (s, i) => s.terrain[i] === T_STARDUST;

/** いま実際に効いている地形（雲は晴れたらふつうのマスに戻る） */
export function effTerrain(s, i) {
  if (s.terrain[i] === T_STARDUST) return T_STARDUST;
  if (s.cloud[i] > 0) return T_CLOUD;
  return s.terrain[i] === T_CLOUD ? T_NORMAL : s.terrain[i];
}

export const capAt = (s, i) => s.geo.cap[i];
export const targetsAt = (s, i) => s.geo.targets[i];

export function countCells(s, p) {
  let n = 0;
  for (let i = 0; i < N; i++) if (s.owner[i] === p) n++;
  return n;
}

export function totalLight(s, p) {
  let n = 0;
  for (let i = 0; i < N; i++) if (s.owner[i] === p) n += s.count[i];
  return n;
}

/** 置けるか＝星屑でも雲でもなく、空きマスか自分のマス */
export function canPlace(s, i, player = s.player) {
  if (i < 0 || i >= N) return false;
  if (isWallAt(s, i) || isCloudy(s, i)) return false;
  return s.owner[i] === 0 || s.owner[i] === player;
}

export function legalMoves(s, player = s.player) {
  const a = [];
  for (let i = 0; i < N; i++) if (canPlace(s, i, player)) a.push(i);
  return a;
}

/**
 * 1手打つ。連鎖の解決までまとめて行い、演出用のイベント列を返す。
 * events: [{t:'place', i}, {t:'boom', i, to:[...], chain:n}, ...]
 *   to の要素が -1 なら「雲に吸われた／盤の外へ抜けた」光
 */
export function applyMove(s, i) {
  if (s.winner) return { ok: false, reason: 'finished', events: [], chain: 0 };
  if (!canPlace(s, i)) return { ok: false, reason: 'illegal', events: [], chain: 0 };

  const player = s.player;
  const events = [{ t: 'place', i, player }];

  s.count[i]++;
  s.owner[i] = player;

  const chain = resolveChain(s, player, i, events);

  endTurn(s);          // ★1手番＝必ず1回置く★（komi 廃止）
  checkEnd(s, player);
  return { ok: true, events, chain, winner: s.winner };
}

function endTurn(s) {
  s.moves[s.player - 1]++;
  s.turn++;
  for (let k = 0; k < N; k++) if (s.cloud[k] > 0) s.cloud[k]--;
  s.player = 3 - s.player;
}

/** 両者が1手以上打ったか（開幕は相手のマスが0なので、これを見ないと初手で勝ちになる） */
const bothMoved = (s) => s.moves[0] > 0 && s.moves[1] > 0;

function resolveChain(s, player, start, events) {
  const queue = [];
  if (s.count[start] >= capAt(s, start)) queue.push(start);

  let chain = 0, guard = 0, head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    const cap = capAt(s, i);
    if (s.count[i] < cap) continue;

    const tg = targetsAt(s, i);
    s.count[i] -= tg.length;            // ★飛び先の数ちょうどを失う
    if (s.count[i] === 0) s.owner[i] = 0;
    chain++;

    const landed = [];
    for (const j of tg) {
      if (j < 0 || isCloudy(s, j)) { landed.push(-1); continue; }  // 外へ抜けた／雲に吸われた
      s.count[j]++;
      s.owner[j] = player;
      landed.push(j);
      if (s.count[j] >= capAt(s, j)) queue.push(j);
    }
    events.push({ t: 'boom', i, to: landed, chain, player });

    // 相手のマスが0になった瞬間に打ち切る（片方が盤を埋めた状態での無限連鎖を防ぐ）
    if (bothMoved(s) && countCells(s, 3 - player) === 0) break;

    if (++guard > MAX_EXPLOSIONS) { s.overflow = true; break; }
  }
  return chain;
}

/** 決着したかを見る */
export function checkEnd(s, lastPlayer) {
  if (s.winner) return;
  if (bothMoved(s)) {
    const oppCells = countCells(s, 3 - lastPlayer);
    const ownCells = countCells(s, lastPlayer);
    // 相手を全部奪ったら勝ち
    if (oppCells === 0) { s.winner = lastPlayer; s.endReason = 'wipe'; return; }
    // ★打った側が自滅するケースも定義しておく（雲や盤の外へ光が抜けて自分が0になる形がある）
    if (ownCells === 0) { s.winner = 3 - lastPlayer; s.endReason = 'self'; return; }
  }
  if (s.turn >= s.maxTurns) {
    const a = totalLight(s, 1), b = totalLight(s, 2);
    s.winner = a > b ? 1 : 2;   // 同数なら後手（先手有利の是正を兼ねる・§2-4）
    s.endReason = 'limit';
  }
}

/**
 * 「あと1手で逆転できたか」を調べる（§3-5）。煽りの演出ではなく実際に計算する。
 * 見つからなければ -1 を返し、何も出さない。
 */
export function findWinningMove(s, player) {
  for (const i of legalMoves(s, player)) {
    const t = cloneState(s);
    t.player = player;
    const r = applyMove(t, i);
    if (r.ok && t.winner === player) return i;
  }
  return -1;
}

/**
 * 「このマスを押したら、どこがはじけるか」を先に計算する（連鎖の予告・2026-09-08 追加）。
 *
 * ★なぜ必要か★ オーナーが実際に遊んで「何が起こっているか分からないから、
 *   後半は連打ゲーになっちゃう」と言った。終盤は連鎖が大きくなり、
 *   結果が読めないまま画面が光るだけになっていた。
 *
 * ★ここで盤を絶対に変えないこと★ 必ずクローンの上で試す。
 * ★連鎖のルールを書き直さないこと★ applyMove をそのまま呼んで、起きた出来事を数える。
 *
 * 返り値 { ok, cells, chain }
 *   cells … はじけるマス（はじけた順・重複あり）。同じマスが2回はじけることもある
 *   chain … はじけた回数
 */
export function previewChain(s, i, player = s.player) {
  const t = cloneState(s);
  t.player = player;
  const r = applyMove(t, i);
  if (!r.ok) return { ok: false, cells: [], chain: 0 };
  const cells = [];
  for (const ev of r.events) if (ev.t === 'boom') cells.push(ev.i);
  return { ok: true, cells, chain: r.chain };
}

/**
 * 盤ぜんぶの「押したら何連鎖するか」を作る（2026-09-08）。
 *
 * ★なぜ盤ぜんぶなのか★
 *   最初は「指を置いたマスだけ」を予告していた。だが実測すると、
 *   **押すとはじける手は序盤で5.7%・全体でも21%しかない**（60局・66,475手を計測）。
 *   つまり4回に3回以上は押しても何も光らず、遊ぶ側からは「予告が動いていない」としか見えない。
 *   探すには42マスを1つずつ長押しするしかなく、それは予告ではなく宝探しだった。
 *   一方で**96.7%の手番には「押せばはじける場所」が必ずある**。情報はあるのに見せていなかった。
 *   → オーナーに「全然予告が機能してない。連打・運ゲーになってる」と言われた。当然だった。
 *
 * ★コスト★ 1手番あたり中央値0.02ms・最大0.41ms（944手番で計測）。毎手番作り直してよい。
 *
 * 返り値: 長さNの Int16Array。置けないマスと、はじけないマスは 0。
 */
export function chainMap(s, player = s.player) {
  const out = new Int16Array(N);
  if (s.winner) return out;
  for (const i of legalMoves(s, player)) out[i] = previewChain(s, i, player).chain;
  return out;
}

/**
 * 記録したイベントを1つだけ盤に反映する（★演出のための再生専用★）。
 *
 * 画面は「1手ぶんの結果」をいきなり描くのではなく、はじけを1つずつ見せたい。
 * そのための途中経過を作る関数をここに置く——**画面側で連鎖のルールを書き直さないため**。
 * 判断（どこがはじけるか）はしない。記録済みの出来事をなぞるだけ。
 */
export function applyEvent(disp, ev) {
  if (ev.t === 'place') {
    disp.count[ev.i]++;
    disp.owner[ev.i] = ev.player;
  } else if (ev.t === 'boom') {
    disp.count[ev.i] -= ev.to.length;
    if (disp.count[ev.i] < 0) disp.count[ev.i] = 0;
    if (disp.count[ev.i] === 0) disp.owner[ev.i] = 0;
    for (const j of ev.to) {
      if (j < 0) continue;                    // 雲に吸われた／盤の外へ抜けた
      disp.count[j]++;
      disp.owner[j] = ev.player;
    }
  }
  return disp;
}

/** 盤の状態を1つの文字列に（golden test で棋譜のハッシュを取るため） */
export function boardSignature(s) {
  let out = '';
  for (let i = 0; i < N; i++) out += `${s.owner[i]}${s.count[i]}${effTerrain(s, i)}|`;
  return out + `#p${s.player}t${s.turn}w${s.winner}x${s.wrapX ? 1 : 0}`;
}

export { orthOf };
