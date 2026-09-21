/* 打字房间。这里**没有比赛**：每个人自己开自己的那一局，服务器只做两件事 ——
   把题库发下去（校验要用），以及记住每个人打到第几关、这一关完成了多少字符，
   好让同一个房间里的人互相看见彼此的进度。

   所以这里没有开赛时间、没有倒计时、没有名次、没有"等其他人"。谁点了开始就谁自己开始，
   不影响别人；打完一关就自己进下一关。

   服务器仍然是唯一权威：目标文本在服务器手上，客户端每推进一段就要把那段字符交上来，
   服务器对着**他当前那一关**的文本比；不匹配就把权威位置推回去（resync）。
   客户端能做的只是"申请前进"。

   房间号由客户端指定（老师写在黑板上的 py1 就是这间房的身份），见 index.js 的
   filterBy(["code"])；万一并发里撞了，抢输的那间会退回随机房号，客户端发现房号
   对不上会重新 joinById(房间号) —— 自己修好，见 ownsCode。

   房间号注册表、名字清洗、防刷限流都在 roomkit.js 里，和记忆房间共用一份。 */

import { Room } from "@colyseus/core";
import { TypingState, Player } from "../schemas/typing.js";
import { loadLevels } from "../bank.js";
import { cleanCode, cleanName, claimCode, releaseCode, createRateLimiter, roomIdFor } from "../roomkit.js";

export const ROOM_NAME = "typing";

const MAX_CLIENTS = 8;
const MSG_WINDOW_MS = 1000;
/* 每秒最多收这么多条 progress（Tab 一次算 4 个字符，但只发一条）。
   人打不到这个量级；这个上限是防刷屏的。测试时可以用 MSG_BUDGET 调低来验证丢包后的恢复。 */
const MSG_BUDGET = Number(process.env.MSG_BUDGET || 200);

export class TypingRoom extends Room {
  async onCreate(options) {
    const opt = options || {};

    /* 房间号：能拿就拿，被别人先拿了就不拿（这间房随后会因为房号对不上而被客户端放弃）。
       roomId 要带游戏前缀，理由见 roomkit.js 的 roomIdFor。 */
    const code = cleanCode(opt.code);
    this.code = code;
    this.ownsCode = claimCode(ROOM_NAME, code);
    if (this.ownsCode) this.roomId = roomIdFor(ROOM_NAME, code);

    /* private：这间房不会被别的 joinOrCreate 顺手并进来。
       只有拿着房间号的 joinById 能进 —— ?room=py1 永远进不了 py2 的房。 */
    await this.setPrivate(true);

    this.maxClients = MAX_CLIENTS;

    /* 服务器要能拿文本校验，所以没有 text 的关卡在这一层就丢掉 */
    this.levels = loadLevels("../games/typing/levels.json").filter(function (lv) {
      return typeof lv.text === "string" && lv.text.length > 0;
    });
    if (!this.levels.length) throw new Error("the typing level bank is empty");

    this.limiter = createRateLimiter({ windowMs: MSG_WINDOW_MS, budget: MSG_BUDGET });

    this.setState(new TypingState());
    this.levels.forEach((lv) => {
      this.state.levelIds.push(lv.id);
      this.state.texts.push(lv.text);
    });

    /* 谁点了"开始"，谁自己开始。别人完全不受影响。 */
    this.onMessage("start", (client, msg) => this.onStart(client, msg));
    this.onMessage("progress", (client, msg) => this.onProgress(client, msg));
    this.onMessage("name", (client, msg) => this.onName(client, msg));

    console.log(`[typing] room created  id=${this.roomId}  code=${code || "-"}  levels=${this.levels.length}`);
  }

  onJoin(client, options) {
    const p = new Player();
    p.name = cleanName(options && options.name, this.state.players.size + 1);
    this.state.players.set(client.sessionId, p);
    console.log(`[typing] ${this.roomId} <- ${p.name} (${this.state.players.size} in room)`);
  }

  onLeave(client) {
    /* 走了就从榜上消失。这里不搞"灰头像"：那是比赛里为了名次不乱跳才需要的，
       而每个人自己打自己的，留一个灰头像在那儿只会越积越多。 */
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    this.state.players.delete(client.sessionId);
    this.limiter.forget(client.sessionId);
    console.log(`[typing] ${this.roomId} -> ${p.name} left (${this.state.players.size} in room)`);
  }

  onDispose() {
    if (this.ownsCode) releaseCode(ROOM_NAME, this.code);
    console.log(`[typing] room disposed  id=${this.roomId}`);
  }

  /* ------------------------------ 开始自己的那一局 ------------------------------ */

  /* 只有还没开始的能开始；已经开始的人再点也没用（免得重开一局把进度抹掉）。
     客户端点"开始"就从第一关起步，所以这里通常收到的是题库第一关的 id。
     不影响任何其它人 —— 这正是这个房间存在的意义。 */
  onStart(client, msg) {
    const p = this.state.players.get(client.sessionId);
    if (!p || p.playing) return;

    const want = msg && typeof msg.levelId === "string" ? msg.levelId : "";
    let at = this.state.levelIds.indexOf(want);
    if (at < 0) at = 0;

    p.level = at;
    p.pos = 0;
    p.playing = true;
    console.log(`[typing] ${this.roomId} ${p.name} started at ${this.state.levelIds[at]}`);
  }

  /* ------------------------------ 前进 ------------------------------ */

  textFor(p) {
    return this.state.texts[p.level] === undefined ? "" : this.state.texts[p.level];
  }

  onProgress(client, msg) {
    const p = this.state.players.get(client.sessionId);
    if (!p || !p.playing) return;      /* 在大堂里还没开始，不收 */
    if (!this.limiter.under(client.sessionId)) {
      /* 被限流丢掉的包不能悄悄丢：把权威位置推回去。
         否则客户端会以为自己在等下一关，一直等下去 —— 卡死比报错糟糕得多。
         一个窗口只回一次，免得刷屏的人把流量放大一倍。 */
      if (this.limiter.warnDue(client.sessionId)) this.resync(client, p);
      return;
    }

    const text = this.textFor(p);
    const pos = msg && typeof msg.pos === "number" ? Math.floor(msg.pos) : -1;
    if (pos < 0 || pos > text.length) return this.resync(client, p);
    if (pos === p.pos) return;

    if (pos > p.pos) {
      /* 往前走：必须把经过的那段字符一起交上来，服务器自己跟文本比 */
      const chunk = msg && typeof msg.chunk === "string" ? msg.chunk : null;
      if (chunk === null || chunk !== text.slice(p.pos, pos)) return this.resync(client, p);
    }
    /* 往后退（改错）放行 */

    p.pos = pos;
    if (p.pos >= text.length) this.clearLevel(p);
  }

  /* 打完一关就自己进下一关；题库打完了就停在那儿，不通知谁、也不比较谁 */
  clearLevel(p) {
    const last = this.state.levelIds.length - 1;
    if (p.level < last) {
      p.level += 1;
      p.pos = 0;
      console.log(`[typing] ${this.roomId} ${p.name} -> level ${p.level + 1}/${this.state.levelIds.length}`);
      return;
    }
    console.log(`[typing] ${this.roomId} ${p.name} finished the whole bank`);
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
