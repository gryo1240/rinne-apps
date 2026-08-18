/**
 * 薬を「誰に使うか」の判定（2026-08-16 新設・オーナー指示
 * 「探索パートの話ですが、薬を使う場合、対象はユーザーが選べるようにしてください。
 *   戦闘パートも同様にしてください」）
 *
 * 【この部品の役割】薬1つ × 仲間1人 について、**効くかどうかと、効かない理由**を返す。
 *
 * ★探索画面と戦闘画面の両方から使う。判定を二重に書くと、
 *   片方だけ直したときに「塔では押せるのに戦闘では押せない」がすぐ生まれる。
 * ★ここは DOM に触らない・乱数を引かない。渡されるのは
 *   探索の `run.party` の1人か、戦闘の `b.allies` の1人（どちらも同じ形）。
 * ★効き目そのものは `battle/engine.js` の `useItem` と
 *   `dungeon/explore.js` の `useMedicine` が持っている。ここは**押せるかどうか**だけ。
 */

/**
 * @returns {{ok:boolean, why:string}} `why` は押せないときに右へ出す一言
 */
export function medFit(it, u) {
  if (!it || !u) return { ok: false, why: '' };

  // ★蘇生だけ条件が**逆**（倒れている人にしか使えない）
  if (it.revive) return u.alive ? { ok: false, why: '起きている' } : { ok: true, why: '' };

  if (!u.alive) return { ok: false, why: '倒れている' };
  if (it.heal && it.heal.hp) {
    return u.hp >= u.max.hp ? { ok: false, why: 'HPは満ちている' } : { ok: true, why: '' };
  }
  if (it.heal && it.heal.ki) {
    return u.ki >= u.max.ki ? { ok: false, why: '気は満ちている' } : { ok: true, why: '' };
  }
  if (it.cure) {
    const ail = Object.values(u.ailments || {}).some((v) => v > 0);
    return ail ? { ok: true, why: '' } : { ok: false, why: '異常はない' };
  }
  if (it.buff) {
    const already = (u.buffs || []).some((bf) => bf.key === it.buff.key);
    return already ? { ok: false, why: 'もう効いている' } : { ok: true, why: '' };
  }
  return { ok: true, why: '' };
}

/** その薬を使える相手が1人でもいるか（道具の一覧で「使えない薬」を灰色にするのに使う） */
export function anyFit(it, units) {
  return (units || []).some((u) => medFit(it, u).ok);
}
