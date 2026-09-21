/* 多人这一层。单人永远不 import 它 —— 只有 URL 上出现了 ?room= 才会动态
   import("colyseus.js")，所以离线包和单人玩法都不受影响，连不上服务器也只是回到单人。

   两件事在这里做完：
   1. 进房。房间号由客户端指定：先 joinById(房间号)，房间还不存在才 joinOrCreate。
      并发里抢输的那间房号会不一样，这时退出去重进真正的房间（服务器侧见 TypingRoom）。
   2. 对时。开赛时间用的是服务器时间，各人必须自己算出本地对应时刻，
      否则网络慢的人天然吃亏。offset = 服务器时间 - 本地时间，取 rtt 最小的那次样本。 */

const ROOM_NAME = "typing";

function q(name) {
  try {
    return new URLSearchParams(location.search).get(name);
  } catch (e) {
    return null;
  }
}

const CODE_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";

export function randomCode() {
  let s = "";
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

/* ?room=py1 进 py1；?room= 或 ?room=new 表示新建一间（随机房号）。
   返回 null 表示"这次不玩多人"。 */
export function codeFromUrl() {
  const raw = q("room");
  if (raw === null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s || s === "new" || s === "1") return randomCode();
  return /^[a-z0-9][a-z0-9_-]{0,23}$/.test(s) ? s : randomCode();
}

/* ?ws=wss://example.com 覆盖；默认按当前页面所在主机 + 2567 推。
   https 页面必须走 wss（否则浏览器按混合内容拦掉），所以要在前面配一层反代。 */
export function serverUrl() {
  const given = q("ws");
  if (given) return given;
  const secure = location.protocol === "https:";
  return (secure ? "wss://" : "ws://") + location.hostname + ":2567";
}

/* 把 ?room= 写回地址栏（不动别的参数），这样"复制链接"给的就是真实房号 */
export function writeRoomToUrl(code) {
  try {
    const url = new URL(location.href);
    url.searchParams.set("room", code);
    history.replaceState(null, "", url.toString());
  } catch (e) { /* 无痕模式里失败也无所谓 */ }
}

export function inviteUrl(code) {
  try {
    const url = new URL(location.href);
    url.searchParams.set("room", code);
    return url.toString();
  } catch (e) {
    return location.href;
  }
}

const sleep = function (ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
};

/* join 的 promise 回来时 state 还没落地，得等第一次 patch 到了才算能画 */
async function waitForState(room, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (room.state && room.state.players !== undefined) return true;
    await sleep(30);
  }
  return false;
}

/* 对时：发几个 ping，取 rtt 最小的那次算 offset */
async function syncClock(room) {
  const sentAt = {};
  const got = [];
  room.onMessage("pong", function (m) {
    const at = sentAt[m && m.t];
    if (at === undefined) return;
    const now = Date.now();
    const rtt = now - at;
    got.push({ rtt: rtt, offset: m.now - (at + rtt / 2) });
  });

  for (let i = 0; i < 4; i++) {
    const token = "p" + i + "-" + Date.now();
    sentAt[token] = Date.now();
    room.send("ping", { t: token });
    await sleep(70);
  }
  await sleep(220);

  if (!got.length) return { offset: 0, rtt: null };
  got.sort(function (a, b) { return a.rtt - b.rtt; });
  return { offset: got[0].offset, rtt: got[0].rtt };
}

export async function openRoom(opts) {
  const mod = await import("colyseus.js");
  const client = new mod.Client(opts.url);
  const joinOptions = { name: opts.name, levelId: opts.levelId, code: opts.code };

  let room = null;
  try {
    room = await client.joinById(opts.code, joinOptions);
  } catch (e) {
    room = null;
  }

  if (!room) {
    room = await client.joinOrCreate(ROOM_NAME, joinOptions);

    /* 抢输的那间：房间号和自己要的不一样，退出去重进真正的房间（见 TypingRoom 的说明） */
    if (room.roomId !== opts.code) {
      const real = room.roomId;
      await room.leave();
      try {
        room = await client.joinById(opts.code, joinOptions);
        console.log("[typing] room code", opts.code, "was taken by", real, "— rejoined by id");
      } catch (e) {
        throw new Error("could not join room " + opts.code);
      }
    }
  }

  const ready = await waitForState(room, 4000);
  const clock = await syncClock(room);

  let offset = clock.offset;
  return {
    room: room,
    sessionId: room.sessionId,
    roomId: room.roomId,
    ready: ready,
    rtt: clock.rtt,
    serverNow: function () { return Date.now() + offset; },
    progress: function (pos, chunk) { room.send("progress", { pos: pos, chunk: chunk }); },
    setName: function (name) { room.send("name", { name: name }); },
    setLevel: function (id) { room.send("level", { id: id }); },
    start: function () { room.send("start"); },
    end: function () { room.send("end"); },
    leave: function () { try { room.leave(); } catch (e) { /* 已经断了 */ } },
  };
}
