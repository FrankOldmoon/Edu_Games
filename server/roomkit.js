/* 房间服务器共用的几件小事 —— 和"玩的是什么游戏"无关：
   房间号注册表、名字清洗、防刷限流。打字房间和记忆房间都用这一份。

   这里刻意不放任何"校验进度"的逻辑：那是各游戏自己的事
   （打字要拿目标文本比字符，配对只能信客户端报的数），
   放进共用的地方反而会把两边的语义搅在一起。 */

const MAX_NAME = 16;

/* 本进程里已经存在的房间号。按 `<游戏>/<房号>` 存 ——
   否则打字的 py1 会把记忆的 py1 顶掉，而这两个房间本来就该能同时存在。
   单进程部署；多进程要换成 presence 查询。 */
const liveCodes = new Set();

/* 房号：小写、字母数字开头、最长 24。不合法就返回空串（当作"没指定"）。 */
export function cleanCode(v) {
  const s = String(v === undefined || v === null ? "" : v).trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,23}$/.test(s) ? s : "";
}

/* 服务器内部的 roomId = `<游戏>-<房号>`，不是光秃秃的房号。
   必须这样：matchmaker 的 roomId 是**全局**唯一的一张表
   （@colyseus/core 的 MatchMaker.createRoomReferences 里就是 rooms[room.roomId] = room，
   没有查重），所以打字的 py1 和记忆的 py1 必须落到两个不同的 id 上，
   否则后建的那间会把先建的顶掉，joinById 就会把人送进错误的房间。
   人看到的、写在黑板上的房号仍然是 py1（?room=py1）。
   客户端侧同一规则见 src/game-ui/room/net.js 的 roomIdFor。 */
export function roomIdFor(game, code) {
  return game + "-" + code;
}

/* 名字：剔掉控制字符（名字要能安全地画出来），压缩空白，兜底成 "Player N"。 */
export function cleanName(v, n) {
  const s = String(v === undefined || v === null ? "" : v)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (s || "Player " + n).slice(0, MAX_NAME);
}

/* 想用这个房号就用；被别人先拿了就不拿（这间房随后会因为房号对不上被客户端放弃）。 */
export function claimCode(game, code) {
  if (!code) return false;
  const key = game + "/" + code;
  if (liveCodes.has(key)) return false;
  liveCodes.add(key);
  return true;
}

export function releaseCode(game, code) {
  if (code) liveCodes.delete(game + "/" + code);
}

/* 防刷：每个 sessionId 一个窗口内的计数上限。
   超了就丢掉这条消息 —— 但丢掉的消息不能悄悄吞掉，得让调用方回推一次权威位置
   （见 warnDue），否则客户端会停在"以为自己打完了"上等下去。 */
export function createRateLimiter(opts) {
  const o = opts || {};
  const windowMs = o.windowMs || 1000;
  const budget = o.budget || 200;
  const rate = new Map();

  return {
    under: function (sessionId) {
      const now = Date.now();
      const r = rate.get(sessionId);
      if (!r || now - r.windowAt >= windowMs) {
        rate.set(sessionId, { windowAt: now, count: 1, warned: false });
        return true;
      }
      r.count += 1;
      return r.count <= budget;
    },

    /* 这个窗口里是不是还没提醒过他（丢一次提醒一次就够了，免得把流量放大一倍） */
    warnDue: function (sessionId) {
      const r = rate.get(sessionId);
      if (!r || r.warned) return false;
      r.warned = true;
      return true;
    },

    forget: function (sessionId) { rate.delete(sessionId); },
  };
}
