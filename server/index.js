/* 打字竞速的房间服务器。一个进程、一个端口，和站点（静态 nginx）分开跑。

   ws://localhost:2567  ←  客户端用 ?ws= 覆盖，默认按当前页面的主机名 + 2567 推。

   两个和"房间号由客户端指定"有关的关键点：
   - onCreate 里覆盖 roomId（见 rooms/TypingRoom.js）
   - filterBy(["code"])：让 matchMaker 按房间号分桶，同一房号的并发创建会被串行化，
     不会出现两间同号房。filterBy 同时让"随手 joinOrCreate"只能新建、不会并进别人的房。 */

import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { TypingRoom, ROOM_NAME } from "./rooms/TypingRoom.js";

const PORT = Number(process.env.PORT || 2567);
const HOST = process.env.HOST || "0.0.0.0";

const server = new Server({
  transport: new WebSocketTransport(),
  /* 生产环境可以在前面挂 nginx；这里默认不打印启动 banner，日志干净一点 */
  greet: false,
});

/* 房间按 code 分桶（见文件头） */
server.define(ROOM_NAME, TypingRoom).filterBy(["code"]);

server.listen(PORT, HOST).then(function () {
  console.log(`[typing] room server on ws://${HOST}:${PORT}  (room "${ROOM_NAME}")`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, function () {
    console.log(`\n[typing] ${sig} — shutting down`);
    server.gracefullyShutdown(true).finally(function () { process.exit(0); });
  });
}
