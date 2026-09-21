/* 房间这一层。单人永远不 import 它 —— 只有 URL 上出现了 ?room= 才会动态
   import("colyseus.js")，所以离线包和单人玩法都不受影响，连不上服务器也只是回到单人。

   进房：房间号由客户端指定 —— 先 joinById(房间号)，房间还不存在才 joinOrCreate。
   并发里抢输的那间房号会不一样，这时退出去重进真正的房间（服务器侧见 TypingRoom）。

   这里没有对时：房间里没有"同时开赛"这回事，每个人自己开自己那一局，
   计时是本地正计时，不需要跟服务器换算。 */

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

/* ?ws=wss://example.com 覆盖；默认按当前页面所在主机 + DEFAULT_PORT 推。
   https 页面必须走 wss（否则浏览器按混合内容拦掉），所以要在前面配一层反代。 */
const DEFAULT_PORT = 2568;

export function serverUrl() {
  const given = q("ws");
  if (given) return given;
  const secure = location.protocol === "https:";
  return (secure ? "wss://" : "ws://") + location.hostname + ":" + DEFAULT_PORT;
}

/* 把 ?room= 写回地址栏（不动别的参数），这样"复制链接"给的就是真实房号 */
export function writeRoomToUrl(code) {
  try {
    const url = new URL(location.href);
    url.searchParams.set("room", code);
    history.replaceState(null, "", url.toString());
  } catch (e) { /* 无痕模式里失败也无所谓 */ }
}

/* 改名字也写回地址栏，刷新之后名字还在 */
export function writeNameToUrl(name) {
  try {
    const url = new URL(location.href);
    url.searchParams.set("username", name);
    history.replaceState(null, "", url.toString());
  } catch (e) { /* ignore */ }
}

/* 邀请链接：带上房号，但**不能带上你的名字** ——
   别人点开应该是"来我这间房"，不是"你来当我"。 */
export function inviteUrl(code) {
  try {
    const url = new URL(location.href);
    url.searchParams.set("room", code);
    url.searchParams.delete("username");
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

export async function openRoom(opts) {
  const mod = await import("colyseus.js");
  const client = new mod.Client(opts.url);
  const joinOptions = { name: opts.name, code: opts.code };

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

  return {
    room: room,
    sessionId: room.sessionId,
    roomId: room.roomId,
    ready: ready,
    progress: function (pos, chunk) { room.send("progress", { pos: pos, chunk: chunk }); },
    setName: function (name) { room.send("name", { name: name }); },
    /* 开始我自己这一局，从第一关起步 —— 服务器只记我这一份，不碰别人 */
    startRun: function (levelId) { room.send("start", { levelId: levelId }); },
    leave: function () { try { room.leave(); } catch (e) { /* 已经断了 */ } },
  };
}
