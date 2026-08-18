/**
 * 階層マップの生成（spec §4-1 / §4-2）
 *
 * 1階＝ノード5〜7個の小さな有向グラフ。
 * 「開始 → 2〜3分岐 → 合流 → 階段」の層構造にすることで、
 * SVGで丸と線を描くだけで表現でき、絵が要らない。
 *
 * 一度通ったノードには戻れない（一方通行）＝選択に重みが出る。
 * 未踏ノードの種別は隠されているが、**隣接ノードの種別だけは見える**（＝選べる）。
 */

import { makeRng } from '../core/rng.js';
import { PHASE_EFFECT } from '../core/time.js';
import { isBossFloor, TOWERS } from './towers.js';

export const NODE = {
  START: 'start', BATTLE: 'battle', TREASURE: 'treasure', KAII: 'kaii',
  HOKORA: 'hokora', TRAP: 'trap', AKINDO: 'akindo', EMPTY: 'empty',
  STAIRS: 'stairs', BOSS: 'boss',
  // 還りの陣（2026-08-11 オーナー要望）。そこまで歩けば、札も灯も使わずに引き上げられる。
  // ★灯を「5階ぶん進むまで使えない」に変えたので、序盤に戻る道がこれ
  KAERI: 'kaeri',
};

export const NODE_LABEL = {
  start: '入口', battle: '戦闘', treasure: '宝', kaii: '怪異',
  hokora: '祠', trap: '罠', akindo: '商人', empty: '空', stairs: '階段', boss: 'ボス',
  kaeri: '還りの陣',
};

export const NODE_ICON = {
  start: '●', battle: '⚔', treasure: '○', kaii: '◇',
  hokora: '✦', trap: '✖', akindo: '商', empty: '・', stairs: '▲', boss: '☖',
  kaeri: '還',
};

/**
 * 地図の丸に添える短い名前。
 *
 * ★丸の直径は40pxしかない。ここに `NODE_LABEL` をそのまま出すと、
 *   4文字以上の名前（「還りの陣」）が円からはみ出して隣に重なる
 *   （実機のスクショで確認）。**2文字まで**に収めること。
 *   長い名前は凡例（探索画面の「？」）の側で見せる。
 */
export const NODE_SHORT = { ...NODE_LABEL, kaeri: '還り' };

/** 基本の出現率（spec §4-2）。月齢で倍率が掛かる */
const BASE_WEIGHTS = {
  battle: 45, treasure: 15, kaii: 15, hokora: 8, trap: 7, akindo: 5, empty: 5,
  /**
   * ★還りの陣は祠と同じく**1階に1つまで**。多いと「いつでも無料で帰れる」に戻ってしまう。
   *
   * 2026-08-12 オーナー指示で 5 → 2 に下げ、あわせて
   * 「灯が灯る前の階には必ず1つ置く」という保証（旧 `needKaeri`）を**やめた**。
   * 「戻る手段がゼロの階が生まれても良い」＝陣は当てにするものではなく、
   * 見つけたら儲けもの、という位置づけにする。
   * 戻る手段が本当に要る人のために還り札があり、それが札の役割になる。
   */
  kaeri: 2,
};

/**
 * 階層マップを生成する
 * @param {object} o
 * @param {number|string} o.seed
 * @param {string} o.tower
 * @param {number} o.floor
 * @param {string} o.phase  月齢フェーズ
 * @param {number} o.luk    主人公の運（先のノードが見える距離に影響）
 */
export function generateFloor({ seed, tower = 'main', floor = 1, phase = 'new', luk = 10 }) {
  const rng = makeRng(`${seed}:${tower}:${floor}`);

  if (isBossFloor(tower, floor)) {
    // ボス階は分岐なし。祠で立て直してからボスへ。
    // ★ボスの先に必ず階段を置く（これが無いと倒しても先へ進めなくなる。
    //   2026-08-02 シミュレーターで「クリア率0%」として検出した実バグ）
    const nodes = [
      { id: 0, type: NODE.START, layer: 0, next: [1], visited: true, resolved: true },
      { id: 1, type: NODE.HOKORA, layer: 1, next: [2], visited: false, resolved: false },
      { id: 2, type: NODE.BOSS, layer: 2, next: [3], visited: false, resolved: false },
      { id: 3, type: NODE.STAIRS, layer: 3, next: [], visited: false, resolved: false },
    ];
    return { tower, floor, phase, nodes, current: 0, cleared: false, isBoss: true };
  }

  // 月齢によるノード出現率の変化（有利不利ではなく「内容の変化」・spec §5）
  const mod = (PHASE_EFFECT[phase] && PHASE_EFFECT[phase].node) || {};
  const weights = { ...BASE_WEIGHTS };
  for (const [k, m] of Object.entries(mod)) {
    if (k === 'tokoyami') continue;                 // 常闇は別処理
    if (weights[k] != null) weights[k] = weights[k] * m;
  }

  /**
   * 支塔だけ祠を増やす（2026-08-03 追加）。
   *
   * 支塔の「印」は10階だけなので、途中で引き上げると**次はまた1階から**になる。
   * 本編と同じ祠の出現率（8）だと10階もたず、実測で
   * 疾風廊は20回中0回しか主に届かなかった（半分以上が5〜7階で引き際判断）。
   * spec §4-7-2 の「10階1セット・10〜15分で完結」を成り立たせるための調整。
   * ★強さは下げていない。**立て直せる回数**を増やしているだけ
   */
  if (TOWERS[tower]?.kind === 'side') weights.hokora = 20;

  const midLayers = rng.int(2, 3);                  // 中間の層数
  const nodes = [{ id: 0, type: NODE.START, layer: 0, next: [], visited: true, resolved: true }];
  let prevLayer = [0];
  let hokoraUsed = false;
  let kaeriUsed = false;

  for (let L = 1; L <= midLayers; L++) {
    const width = rng.int(2, 3);
    const layerIds = [];
    for (let i = 0; i < width; i++) {
      let type = pickType(rng, weights, hokoraUsed, kaeriUsed);
      if (type === NODE.HOKORA) hokoraUsed = true;
      if (type === NODE.KAERI) kaeriUsed = true;
      const id = nodes.length;
      nodes.push({ id, type, layer: L, next: [], visited: false, resolved: false });
      layerIds.push(id);
    }
    // 前の層から必ず1本以上つなぐ（行き止まりを作らない）
    for (const p of prevLayer) {
      const shuffled = rng.shuffle(layerIds);
      const count = Math.min(shuffled.length, rng.int(1, 2));
      nodes[p].next = shuffled.slice(0, count);
    }
    // どこからも繋がっていないノードを救済する
    for (const id of layerIds) {
      if (!prevLayer.some((p) => nodes[p].next.includes(id))) {
        nodes[rng.pick(prevLayer)].next.push(id);
      }
    }
    prevLayer = layerIds;
  }

  const stairsId = nodes.length;
  nodes.push({ id: stairsId, type: NODE.STAIRS, layer: midLayers + 1, next: [], visited: false, resolved: false });
  for (const p of prevLayer) nodes[p].next = [stairsId];

  /**
   * ★かつてここに「灯が灯る前の階には還りの陣を必ず1つ置く」という保証があった
   *   （2026-08-11 の `needKaeri`）。2026-08-12 オーナー指示で**廃止**。
   *   「戻る手段がゼロの階が生まれても良い」＝そのための還り札であり、
   *   保証してしまうと札の役割がまた消える。出現は上の重み（2）に任せる。
   */

  return { tower, floor, phase, nodes, current: 0, cleared: false, isBoss: false, luk };
}

function pickType(rng, weights, hokoraUsed, kaeriUsed) {
  const items = Object.entries(weights)
    .filter(([k]) => !(k === 'hokora' && hokoraUsed))     // 祠は1階に1つまで
    .filter(([k]) => !(k === 'kaeri' && kaeriUsed))       // 還りの陣も1階に1つまで
    .map(([k, w]) => ({ w, v: k }));
  return rng.weighted(items).v;
}

/**
 * そのノードと道でつながっているノードのid（前にも**後ろにも**）。
 *
 * ★2026-08-12 オーナー指示で**一方通行をやめた**
 *   （「戻って同じ階の他ルートにもいけるようにしませんか？
 *     同じ階層を全て網羅できない理由はないはずです」）。
 *   道はもともと有向グラフだが、**歩く向きだけを双方向にする**。
 *   グラフの生成（層構造・接続）には一切手を入れていないので、
 *   地図の形も、どのマスが出るかも、以前とまったく同じ。
 * ★戻るぶんにも灯は要る（`explore.advance` が毎回引く）。
 *   これが「網羅すると引き際が早まる」という対価になっていて、
 *   ただで全部見て回れるわけではない。
 */
export function adjacentOf(map, id) {
  const out = new Set(map.nodes[id]?.next || []);
  for (const n of map.nodes) if (n.next.includes(id)) out.add(n.id);
  return [...out];
}

/** いま選べる進み先（前後どちらへも歩ける） */
export function choicesOf(map) {
  const cur = map.nodes[map.current];
  if (!cur) return [];
  return adjacentOf(map, cur.id).map((id) => map.nodes[id]).filter(Boolean);
}

/**
 * 表示用のノード情報。
 * 隣接ノードは種別が見える。運が高いと2つ先まで薄く見える（spec §4-1）
 *
 * @param {boolean} blind 常闇（灯0）。**先が一切見えない**（2026-08-12 オーナー指示）
 *
 * ★2026-08-16 オーナー指示で、常闇では**通った道も見えなくする**。
 *
 *   > 「灯が0になったときにこれまで攻略した道も見えなくすることで、どこを通ったか
 *   >   分からなくすることで対処しましょう。こうすることで、ユーザーの意図しない戦闘に
 *   >   なって苦慮することになり、還りの札の必要性が担保できるはずです」
 *
 *   同日に「入口まで歩いて帰れる」道を足したため、還り札が要らなくなりかけていた。
 *   灯が尽きた状態で歩いて帰ろうとすると、**どのマスをもう片付けたのか分からない**ので、
 *   まだ解決していないマスを踏んで戦闘になる。そこが札を持つ理由になる。
 *
 * ★消すのは**見え方だけ**。`map.nodes` の `visited`/`resolved` は本物のまま残す。
 *   だから油壺で灯を足せば記憶は戻るし、通り直したマスで二重に戦闘は起きない
 *   （`advance` は本物の `resolved` を見ている）。
 * ★いま立っているマスだけは常闇でも分かる。足元まで分からないのは道理に合わないし、
 *   「自分がどこに居るか」まで消すと地図が操作不能になる。
 */
export function viewOf(map, blind = false) {
  const visible = new Set();
  const cur = map.nodes[map.current];
  const adj = adjacentOf(map, cur.id);
  if (!blind) {
    for (const id of adj) {
      visible.add(id);
      if ((map.luk || 0) >= 40) for (const id2 of adjacentOf(map, id)) visible.add(id2);
    }
  }
  const adjSet = new Set(adj);
  return map.nodes.map((n) => {
    const isCur = n.id === map.current;
    // revealed は怪異の効果（この階の道が見える）でだけ立つ。常闇では効かない
    const seen = isCur || (!blind && (n.visited || n.revealed || visible.has(n.id)));
    return {
      id: n.id, layer: n.layer, next: n.next,
      // ★常闇では「通った」ことも見せない（足元を除く）。地図の色や破線で足跡が読めてしまう
      visited: blind ? isCur : n.visited,
      resolved: !!n.resolved, current: isCur,
      type: seen ? n.type : null,   // null = 「？」表示
      dim: !blind && !n.visited && !adjSet.has(n.id) && (visible.has(n.id) || n.revealed),
    };
  });
}

/** ノードへ移動する。移動できたら true */
export function moveTo(map, nodeId) {
  if (!adjacentOf(map, map.current).includes(nodeId)) return false;
  map.current = nodeId;
  map.nodes[nodeId].visited = true;
  if (map.nodes[nodeId].type === NODE.STAIRS) map.cleared = true;
  return true;
}

/**
 * 何度でも効くマス（＝出来事ではなく「場所」）。
 *
 * ★オーナー指示は「一度通った場所の**効果**はないものとしましょう」。
 *   戦闘・宝・怪異・罠・祠・商人は**出来事**なので一度きり。
 *   階段と還りの陣と入口は**構造物**で、そこに在り続けるものなので、
 *   通り直しても使える（でないと、陣を素通りしただけで帰れなくなる）。
 */
export const REPEATABLE = new Set([NODE.START, NODE.STAIRS, NODE.KAERI]);
