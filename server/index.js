/* 游戏房间服务器。一个进程、一个端口，和站点（静态 nginx）分开跑。

   ws://localhost:2568  ←  客户端用 ?ws= 覆盖，默认按当前页面的主机名 + 2568 推。
   端口用 PORT 环境变量改（部署机上就把 2568 开在防火墙里）。

   一个进程挂多个游戏的房间。房间类型名由客户端的 joinOrCreate/joinById 决定，
   所以同号不同游戏的房间互不干扰（而且 roomId 还带游戏前缀，见 roomkit.js）。

   两种房间：
     · 能验的（打字）：服务器手上有目标文本，逐字符比对，并由服务器推进关卡
     · 验不了的（配对 / 走迷宫 / 找不同）：内容只在客户端手上，只做范围检查 ——
       用 makeProgressRoom 生成，各自的"这一关目标数"由这里的 goal 给

   两个和"房间号由客户端指定"有关的关键点：
   - onCreate 里覆盖 roomId（见 rooms/*.js）
   - filterBy(["code"])：让 matchMaker 按房间号分桶，同一房号的并发创建会被串行化，
     不会出现两间同号房。filterBy 同时让"随手 joinOrCreate"只能新建、不会并进别人的房。 */

import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { TypingRoom, ROOM_NAME as TYPING } from "./rooms/TypingRoom.js";
import { makeProgressRoom } from "./rooms/ProgressRoom.js";

/* 地图里 '*' 的个数 = 这一关要送的包裹数（和客户端 parseMap 数出来的一致） */
function countParcels(rows) {
  let n = 0;
  rows.forEach(function (row) {
    for (let i = 0; i < row.length; i++) if (row.charAt(i) === "*") n += 1;
  });
  return n;
}

const MEMORY = "memory";
const ROBOT = "robot";
const SPOT = "spot";
const TRACE = "trace";

/* 服务器验不了的几种：配对（对数）、走迷宫（包裹数）、找不同（不同点数） */
const MemoryRoom = makeProgressRoom({
  game: MEMORY,
  bank: "../games/memory/levels.json",
  keep: (lv) => Array.isArray(lv.pairs) && lv.pairs.length > 0,
  goal: (lv) => lv.pairs.length,
});

const RobotRoom = makeProgressRoom({
  game: ROBOT,
  bank: "../games/robot/levels.json",
  keep: (lv) => Array.isArray(lv.map) && lv.map.length > 0,
  goal: (lv) => countParcels(lv.map),
});

const SpotRoom = makeProgressRoom({
  game: SPOT,
  bank: "../games/spot-the-difference/levels.json",
  keep: (lv) => Array.isArray(lv.diffs) && lv.diffs.length > 0,
  goal: (lv) => lv.diffs.length,
});

/* 变量追踪：进度 = 走到第几步（steps）.goal = 该关几步。
   答案在题库 / 浏览器，服务器照例只守范围 —— 和配对 / 找不同同一类。 */
const TraceRoom = makeProgressRoom({
  game: TRACE,
  bank: "../games/trace/levels.json",
  keep: (lv) => Array.isArray(lv.steps) && lv.steps.length > 0,
  goal: (lv) => lv.steps.length,
});

const PORT = Number(process.env.PORT || 2568);
const HOST = process.env.HOST || "0.0.0.0";

const server = new Server({
  transport: new WebSocketTransport(),
  /* 生产环境可以在前面挂 nginx；这里默认不打印启动 banner，日志干净一点 */
  greet: false,
});

/* 房间按 code 分桶（见文件头） */
server.define(TYPING, TypingRoom).filterBy(["code"]);
server.define(MEMORY, MemoryRoom).filterBy(["code"]);
server.define(ROBOT, RobotRoom).filterBy(["code"]);
server.define(SPOT, SpotRoom).filterBy(["code"]);
server.define(TRACE, TraceRoom).filterBy(["code"]);

server.listen(PORT, HOST).then(function () {
  console.log(`[rooms] on ws://${HOST}:${PORT}  (games: ${TYPING}, ${MEMORY}, ${ROBOT}, ${SPOT}, ${TRACE})`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, function () {
    console.log(`\n[rooms] ${sig} — shutting down`);
    server.gracefullyShutdown(true).finally(function () { process.exit(0); });
  });
}
