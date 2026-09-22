/* 通用"进度房间"：给**服务器验不了**的游戏用（配对、走迷宫、找不同……）。

   服务器只守范围：关卡一关一关往前走、进度不超过这一关的目标数。
   关卡由**客户端推**着走 —— 内容（牌面、地图、两幅图）只在客户端手上，
   服务器看不见，也就没有依据自己往前推。

   每条 progress 都带完整的真相（"我在第几关、打到哪"），所以被限流丢掉一条没关系，
   下一条自己就修正回来了 —— 这条路不需要打字那种"回推权威位置"。

   能验的游戏不要用这个：打字的目标文本在服务器手上，可以逐字符比对，而且应该由
   服务器推进关卡 —— 那种自己写一个 Room（见 rooms/TypingRoom.js）。

   用法（见 index.js）：

     server.define("robot", makeProgressRoom({
       game: "robot",
       bank: "../games/robot/levels.json",
       keep: lv => Array.isArray(lv.map) && lv.map.length > 0,
       goal: lv => countParcels(lv.map),
     })) */

import { Room } from "@colyseus/core";
import { ProgressState, Player } from "../schemas/progress.js";
import { loadLevels } from "../bank.js";
import { cleanCode, cleanName, claimCode, releaseCode, createRateLimiter, roomIdFor } from "../roomkit.js";

/* 一间房最多几个人。超了 Colyseus 会把房间锁上，后来的人直接进不来。
   50 = 够装一个班；要更多（几个班一起）用 MAX_CLIENTS 环境变量放开。 */
const MAX_CLIENTS = Number(process.env.MAX_CLIENTS || 50);
const MSG_WINDOW_MS = 1000;
/* 人不可能一秒报 200 次；这是防刷屏的。 */
const MSG_BUDGET = Number(process.env.MSG_BUDGET || 200);

export function makeProgressRoom(cfg) {
  const game = cfg.game;
  const keep = cfg.keep || function () { return true; };

  return class ProgressRoom extends Room {
    async onCreate(options) {
      const opt = options || {};

      /* roomId 要带游戏前缀，理由见 roomkit.js 的 roomIdFor */
      const code = cleanCode(opt.code);
      this.code = code;
      this.ownsCode = claimCode(game, code);
      if (this.ownsCode) this.roomId = roomIdFor(game, code);

      await this.setPrivate(true);
      this.maxClients = MAX_CLIENTS;

      this.levels = loadLevels(cfg.bank).filter(keep);
      if (!this.levels.length) throw new Error("the " + game + " level bank is empty");

      this.limiter = createRateLimiter({ windowMs: MSG_WINDOW_MS, budget: MSG_BUDGET });

      this.setState(new ProgressState());
      /* 只发关卡 id：每关的目标数由客户端从自己的题库里查（两边是同一份 levels.json）；
         服务器手上留一份是为了算"这一关的目标数"—— 范围检查要用。 */
      this.levels.forEach((lv) => { this.state.levelIds.push(lv.id); });

      this.onMessage("start", (client) => this.onStart(client));
      this.onMessage("progress", (client, msg) => this.onProgress(client, msg));
      this.onMessage("name", (client, msg) => this.onName(client, msg));

      console.log(`[${game}] room created  id=${this.roomId}  code=${code || "-"}  levels=${this.levels.length}`);
    }

    onJoin(client, options) {
      const p = new Player();
      p.name = cleanName(options && options.name, this.state.players.size + 1);
      this.state.players.set(client.sessionId, p);
      console.log(`[${game}] ${this.roomId} <- ${p.name} (${this.state.players.size} in room)`);
    }

    onLeave(client) {
      /* 走了就从榜上消失，不留灰头像（各自一局，留着只会越积越多）。 */
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      this.state.players.delete(client.sessionId);
      this.limiter.forget(client.sessionId);
      console.log(`[${game}] ${this.roomId} -> ${p.name} left (${this.state.players.size} in room)`);
    }

    onDispose() {
      if (this.ownsCode) releaseCode(game, this.code);
      console.log(`[${game}] room disposed  id=${this.roomId}`);
    }

    /* 点"开始"就从第一关起步。已经开始的人再点没用（免得重开一局把进度抹掉）。 */
    onStart(client) {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.playing) return;
      p.level = 0;
      p.pos = 0;
      p.playing = true;
      console.log(`[${game}] ${this.roomId} ${p.name} started`);
    }

    /* 这一关的目标数：塔上的分母，也是范围检查的上限 */
    goalAt(i) {
      const lv = this.levels[i];
      if (!lv) return 0;
      const g = Math.floor(cfg.goal(lv));
      return g > 0 ? g : 0;
    }

    onProgress(client, msg) {
      const p = this.state.players.get(client.sessionId);
      if (!p || !p.playing) return;                 /* 在大堂里还没开始，不收 */
      if (!this.limiter.under(client.sessionId)) return;

      const last = this.state.levelIds.length - 1;
      const lv = msg && typeof msg.level === "number" ? Math.floor(msg.level) : -1;
      const pos = msg && typeof msg.pos === "number" ? Math.floor(msg.pos) : -1;

      if (lv < 0 || lv > last) return this.resync(client, p);
      /* 一关一关往前走，不回头。（时间到重开同一关只是 pos 回 0，不算倒退。） */
      if (lv < p.level || lv > p.level + 1) return this.resync(client, p);
      if (pos < 0 || pos > this.goalAt(lv)) return this.resync(client, p);

      const advanced = lv !== p.level;
      p.level = lv;
      p.pos = pos;

      if (advanced) {
        console.log(`[${game}] ${this.roomId} ${p.name} -> level ${lv + 1}/${this.state.levelIds.length}`);
      }
      if (lv === last && pos >= this.goalAt(lv)) {
        console.log(`[${game}] ${this.roomId} ${p.name} finished the whole bank`);
      }
    }

    resync(client, p) {
      client.send("resync", { pos: p.pos, level: p.level });
    }

    onName(client, msg) {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.name = cleanName(msg && msg.name, this.state.players.size);
    }
  };
}
