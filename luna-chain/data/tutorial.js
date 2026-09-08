/**
 * ルナチェイン｜れんしゅう（あそびかたの中身）
 *
 * ★ここが「あそびかた画面」の本体★
 *   文章で説明せず、1手ずつ叩かせて体で覚えてもらう。だから読ませる説明は
 *   各段1行の「たね明かし」だけにし、それも遊び終えてから見せる。
 *
 * ★段の設計で守ること★
 *   - 1段につき教えるのは1つだけ（かどの容量／まんなかの容量／れんさ）
 *   - 相手は動かない。負ける道を作らない（罰を与えると入口が壊れる）
 *   - taps（叩く回数）と hand（叩く場所）で必ず勝てること。
 *     ★test/test-tutorial.mjs が実際に叩いて決着まで確かめている★
 *     盤を書き換えたらテストが落ちる。落ちたら盤のほうを直すこと。
 *
 * 2026-09-08: オーナーが実際に遊んで「ルールがよくわからん」と言ったため新設。
 *   それまでの練習は「まんなかを3回叩いて勝つ」1本だけで、
 *   **容量がマスの位置で違うことも、連鎖も、一度も出てこなかった**。
 */
import { idx } from '../src/core/board.js';

export const TUTORIALS = [
  {
    id: 'corner',
    name: 'かどで はじけさせる',
    goal: 'ひかりの わくを うめよう',
    tip: 'かどのマスは わくが 2つ。うまると はじける',
    hand: idx(0, 0),
    taps: 1,
    setup(s) {
      s.owner[idx(0, 0)] = 1; s.count[idx(0, 0)] = 1;
      for (const j of [idx(1, 0), idx(0, 1)]) { s.owner[j] = 2; s.count[j] = 1; }
    },
  },
  {
    id: 'center',
    name: 'まんなかは おもい',
    goal: 'おなじように わくを うめよう',
    tip: 'まんなかは わくが 4つ。かどより 時間がかかる',
    hand: idx(2, 3),
    taps: 3,
    setup(s) {
      s.owner[idx(2, 3)] = 1; s.count[idx(2, 3)] = 1;
      for (const j of [idx(2, 2), idx(2, 4), idx(1, 3), idx(3, 3)]) { s.owner[j] = 2; s.count[j] = 1; }
    },
  },
  {
    id: 'chain',
    name: 'れんさ',
    goal: 'かどを 1回 おすだけ',
    tip: 'はじけた先が また はじけると れんさ。これが このゲームの キモ',
    hand: idx(0, 0),
    taps: 1,
    setup(s) {
      s.owner[idx(0, 0)] = 1; s.count[idx(0, 0)] = 1;
      s.owner[idx(1, 0)] = 1; s.count[idx(1, 0)] = 2;
      s.owner[idx(2, 0)] = 1; s.count[idx(2, 0)] = 2;
      for (const j of [idx(0, 1), idx(1, 1), idx(2, 1), idx(3, 0)]) { s.owner[j] = 2; s.count[j] = 1; }
    },
  },
];

export const TUTORIAL_COUNT = TUTORIALS.length;
