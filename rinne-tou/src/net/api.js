/**
 * 影闘の通信（Firebase Realtime Database を REST で叩く・2026-10-11）
 *
 * 設計: tech-design §5（SDKは読み込まない＝外部CDNなし。素の fetch だけ）
 *
 * 【約束】
 *  - **失敗前提で書く**。すべて try/catch ＋ 5秒で打ち切り。失敗しても本編の進行を1ミリも止めない
 *    （tech-design §5-6）。戻り値は必ず `{ok:true,...}` か `{ok:false, reason}`。
 *  - APIキーは「秘密」ではない（Firebase の設計上クライアントに載る）。守るのはセキュリティルール
 *    （`.company/game/planning/rinne-tou-firebase-setup.md` のルール v3）。
 *  - 送るのは `meta/arena.js` の snapshotOf が作った**戦闘データだけ**。セーブ全体は送らない。
 *  - 時刻 `t` は**サーバーの時計**（`{".sv":"timestamp"}`）。端末の時計がずれていても
 *    ルールの「30秒に1回」と「未来の時刻の詐称」に引っかからない。
 *
 * 端末ごとの身元（匿名UID・トークン）と同意は、セーブとは別のキーに置く
 * （セーブの枠を消しても、自分の影を消す手段＝トークンを失わないため）。
 */

const API_KEY = 'AIzaSyDmpFrgFVyF7MIZb8T2d2k2bgW3-p88uwo';
const DB_URL = 'https://rinne-tou-default-rtdb.asia-southeast1.firebasedatabase.app';
const TIMEOUT_MS = 5000;
const NET_KEY = 'rinnetou:net';

// ── 端末の状態（UID・トークン・同意） ─────────────────────

/** storage を差し替えられるのは Node でテストするため（save.js と同じ考え方） */
let STORE = null;
function store() {
  if (STORE) return STORE;
  try { if (typeof window !== 'undefined' && window.localStorage) return window.localStorage; } catch (_) { /* 使えない環境 */ }
  const m = new Map();
  STORE = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  return STORE;
}
export function setNetStorage(s) { STORE = s; }

export function loadNet() {
  try {
    const v = JSON.parse(store().getItem(NET_KEY) || 'null');
    return v && typeof v === 'object' ? v : {};
  } catch (_) { return {}; }
}
export function saveNet(patch) {
  const next = { ...loadNet(), ...patch };
  try { store().setItem(NET_KEY, JSON.stringify(next)); } catch (_) { /* 書けなくても続行 */ }
  return next;
}

// ── 低レベル ──────────────────────────────────────────────

let fetchImpl = (...a) => fetch(...a);
/** テスト用に fetch を差し替える */
export function setFetch(f) { fetchImpl = f; }

async function call(url, init = {}) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(url, { ...init, signal: ctrl ? ctrl.signal : undefined });
    let body = null;
    try { body = await res.json(); } catch (_) { body = null; }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: null, reason: e && e.name === 'AbortError' ? 'timeout' : 'offline' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── 匿名ログイン ──────────────────────────────────────────

/**
 * 使えるトークンを用意する（無ければ匿名で作る・期限切れなら更新）。
 * @returns {Promise<{ok:true, uid:string, token:string} | {ok:false, reason:string}>}
 */
export async function ensureAuth(nowMs = Date.now()) {
  const st = loadNet();
  if (st.uid && st.idToken && st.exp && st.exp - 60_000 > nowMs) return { ok: true, uid: st.uid, token: st.idToken };
  if (st.refreshToken) {
    const r = await call(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(st.refreshToken)}`,
    });
    if (r.ok && r.body && r.body.id_token) {
      saveNet({
        uid: r.body.user_id || st.uid, idToken: r.body.id_token, refreshToken: r.body.refresh_token || st.refreshToken,
        exp: nowMs + (Number(r.body.expires_in) || 3600) * 1000,
      });
      return { ok: true, uid: r.body.user_id || st.uid, token: r.body.id_token };
    }
    // ★更新に失敗しても、ここで新しいUIDを作らない（前の影を消せなくなる）。
    //   回線の問題なら次の機会に直る。トークンが無効化されたときだけ作り直す
    if (r.status !== 400) return { ok: false, reason: r.reason || 'auth' };
  }
  const r = await call(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!r.ok || !r.body || !r.body.idToken) return { ok: false, reason: r.reason || 'auth' };
  saveNet({
    uid: r.body.localId, idToken: r.body.idToken, refreshToken: r.body.refreshToken,
    exp: nowMs + (Number(r.body.expiresIn) || 3600) * 1000,
  });
  return { ok: true, uid: r.body.localId, token: r.body.idToken };
}

// ── 影の読み書き ──────────────────────────────────────────

/** 自分の影を置く（上書き）。`t` はサーバー時刻 */
export async function putGhost(snapshot) {
  const a = await ensureAuth();
  if (!a.ok) return a;
  const body = JSON.stringify({ ...snapshot, t: { '.sv': 'timestamp' } });
  const r = await call(`${DB_URL}/ghost/${encodeURIComponent(a.uid)}.json?auth=${encodeURIComponent(a.token)}`, { method: 'PUT', body });
  if (r.ok) return { ok: true, uid: a.uid };
  // 401 はトークンの期限切れ。1回だけ取り直して送り直す
  if (r.status === 401) {
    saveNet({ exp: 0 });
    const b = await ensureAuth();
    if (!b.ok) return b;
    const r2 = await call(`${DB_URL}/ghost/${encodeURIComponent(b.uid)}.json?auth=${encodeURIComponent(b.token)}`, { method: 'PUT', body });
    return r2.ok ? { ok: true, uid: b.uid } : { ok: false, reason: r2.reason || `http${r2.status}` };
  }
  return { ok: false, reason: r.reason || `http${r.status}` };
}

/** 自分の影を消す（公開をやめる） */
export async function deleteGhost() {
  const st = loadNet();
  if (!st.uid) return { ok: true };            // そもそも置いていない
  const a = await ensureAuth();
  if (!a.ok) return a;
  // ★トークンが失効して新しいUIDが作られていたら、前の影は**この端末からは消せない**。
  //   新しいUIDの場所を消して「消した」と言うのは嘘になる（レビュー指摘 2026-10-11）
  if (a.uid !== st.uid) return { ok: false, reason: 'lost' };
  const r = await call(`${DB_URL}/ghost/${encodeURIComponent(a.uid)}.json?auth=${encodeURIComponent(a.token)}`, { method: 'DELETE' });
  return r.ok ? { ok: true } : { ok: false, reason: r.reason || `http${r.status}` };
}

/**
 * 影を最大 limit 件取る（読み取りは認証なし）。
 *  - 無差別戦: 最近更新された順（`orderBy="t"`）
 *  - 調整戦: 送った仲間の最高Lv（`l`）が lo〜hi の影だけ（`orderBy="l"&startAt&endAt`）。
 *    ★サーバー側で絞る。最近50件を取ってから手元で絞ると、人が増えるほど候補が残らない（advisor 指摘）
 * ★ルール v3 は「t か l の並び・50件まで」の問い合わせしか読ませない（全件の一括取得を防ぐ）
 * @param {{by?:'t'|'l', lo?:number, hi?:number, limit?:number}} [o]
 * @returns {Promise<{ok:true, list:Array<{uid:string, raw:object}>} | {ok:false, reason:string}>}
 */
export async function fetchGhosts({ by = 't', lo = 1, hi = 120, limit = 50 } = {}) {
  let q = `orderBy=${encodeURIComponent(`"${by === 'l' ? 'l' : 't'}"`)}`;
  if (by === 'l') q += `&startAt=${Math.floor(lo)}&endAt=${Math.ceil(hi)}`;
  q += `&limitToLast=${Math.min(50, limit)}`;
  const r = await call(`${DB_URL}/ghost.json?${q}`);
  if (!r.ok) return { ok: false, reason: r.reason || `http${r.status}` };
  const obj = r.body && typeof r.body === 'object' ? r.body : {};
  return { ok: true, list: Object.entries(obj).slice(0, limit).map(([uid, raw]) => ({ uid, raw })) };
}
