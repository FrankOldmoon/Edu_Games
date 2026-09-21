/* 记忆配对的房间。这里同样**没有比赛**：每个人自己开自己的那一局，
   服务器只记住每个人打到第几关、这一关配上了几对，好让同房间的人互相看见进度。

   和打字房间最大的区别是：服务器**不验**。
   配对对不对，要看得见牌面才知道 —— 而牌面只存在于各人自己的浏览器里
   （而且每人洗牌不同）。服务器看不见，也就不该假装知道。
   所以这里收的是两个数：他在第几关、这一关配上了几对，只做区间检查；
   关卡也是客户端推着走的（牌在客户端手上，配完就是配完了）。

   对课堂来说这完全够用：要的是"同房间、看得见谁在第几关"，不是防作弊。

   房间号注册表、名字清洗、防刷限流都在 roomkit.js 里，和打字房间共用一份。 */

import { Room } from "@colyseus/core";
import { ProgressState, Player } from "../schemas/progress.js";
import { loadLevels } from "../bank.js";
import { cleanCode, cleanName, claimCode, releaseCode, createRateLimiter, roomIdFor } from "../roomkit.js";

export const ROOM_NAME = "memory";

const MAX_CLIENTS = 8;
const MSG_WINDOW_MS = 1000;
/* 每配上一对报一次，人不可能到 200 次/秒；这是防刷屏的。 */
const MSG_BUDGET = Number(process.env.MSG_BUDGET || 200);

export class MemoryRoom extends Room {
  async onCreate(options) {
    const opt = options || {};

    /* roomId 要带游戏前缀，理由见 roomkit.js 的 roomIdFor */
    const code = cleanCode(opt.code);
    this.code = code;
    this.ownsCode = claimCode(ROOM_NAME, code);
    if (this.ownsCode) this.roomId = roomIdFor(ROOM_NAME, code);

    await this.setPrivate(true);

    this.maxClients = MAX_CLIENTS;

    this.levels = loadLevels("../games/memory/levels.json").filter(function (lv) {
      return Array.isArray(lv.pairs) && lv.pairs.length > 0;
    });
    if (!this.levels.length) throw new Error("the memory level bank is empty");

    this.limiter = createRateLimiter({ windowMs: MSG_WINDOW_MS, budget: MSG_BUDGET });

    this.setState(new ProgressState());
    /* 只发关卡 id：每关有几对由客户端从自己的题库里查（两边是同一个 levels.json）。
       服务器手上留一份是为了算"这一关的目标数"—— 越界检查要用。 */
    this.levels.forEach((lv) => { this.state.levelIds.push(lv.id); });

    this.onMessage("start", (client) => this.onStart(client));
    this.onMessage("progress", (client, msg) => this.onProgress(client, msg));
    this.onMessage("name", (client, msg) => this.onName(client, msg));

    console.log(`[memory] room created  id=${this.roomId}  code=${code || "-"}  levels=${this.levels.length}`);
  }

  onJoin(client, options) {
    const p = new Player();
    p.name = cleanName(options && options.name, this.state.players.size + 1);
    this.state.players.set(client.sessionId, p);
    console.log(`[memory] ${this.roomId} <- ${p.name} (${this.state.players.size} in room)`);
  }

  onLeave(client) {
    /* 走了就从榜上消失，不留灰头像（各自一局，留着只会越积越多）。 */
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    this.state.players.delete(client.sessionId);
    this.limiter.forget(client.sessionId);
    console.log(`[memory] ${this.roomId} -> ${p.name} left (${this.state.players.size} in room)`);
  }

  onDispose() {
    if (this.ownsCode) releaseCode(ROOM_NAME, this.code);
    console.log(`[memory] room disposed  id=${this.roomId}`);
  }

  /* 点"开始"就从第一关起步。已经开始的人再点没用（免得重开一局把进度抹掉）。 */
  onStart(client) {
    const p = this.state.players.get(client.sessionId);
    if (!p || p.playing) return;
    p.level = 0;
    p.pos = 0;
    p.playing = true;
    console.log(`[memory] ${this.roomId} ${p.name} started`);
  }

  /* 这一关一共要配几对 */
  goalAt(i) {
    const lv = this.levels[i];
    return lv && Array.isArray(lv.pairs) ? lv.pairs.length : 0;
  }

  /* 客户端报的是"我在第几关、这一关配上了几对"。服务器验不了配对对不对，
     能守的只有范围：关卡只能一关一关往前走，进度不能超过这一关的对数。

     进度是**客户端驱动**的：牌在客户端手上，配完就是配完了，服务器没有依据
     自己往前推。好处是每一条都带着完整的真相 —— 被限流丢掉一条也没关系，
     下一条就把它修正回来了（所以这里连"回推位置"都不太用得上）。 */
  onProgress(client, msg) {
    const p = this.state.players.get(client.sessionId);
    if (!p || !p.playing) return;                 /* 在大堂里还没开始，不收 */
    if (!this.limiter.under(client.sessionId)) return;

    const last = this.state.levelIds.length - 1;
    const lv = msg && typeof msg.level === "number" ? Math.floor(msg.level) : -1;
    const pos = msg && typeof msg.pos === "number" ? Math.floor(msg.pos) : -1;

    if (lv < 0 || lv > last) return this.resync(client, p);
    /* 一关一关往前走，不回头。时间到重开同一关只是 pos 回 0，不算倒退。 */
    if (lv < p.level || lv > p.level + 1) return this.resync(client, p);
    if (pos < 0 || pos > this.goalAt(lv)) return this.resync(client, p);

    const advanced = lv !== p.level;
    p.level = lv;
    p.pos = pos;

    if (advanced) {
      console.log(`[memory] ${this.roomId} ${p.name} -> level ${lv + 1}/${this.state.levelIds.length}`);
    }
    if (lv === last && pos >= this.goalAt(lv)) {
      console.log(`[memory] ${this.roomId} ${p.name} finished the whole bank`);
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
}
