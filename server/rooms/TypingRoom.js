/* 打字竞速的房间。一场比赛 = 一段同样的 Python 代码 + 谁先跑完谁赢。

   三条原则：
   1. 服务器是唯一权威。目标文本在服务器手上，客户端每推进一段就要把那段字符
      交上来，服务器对着文本比；不匹配就把权威位置推回去（resync）。客户端能做的
      只是"申请前进"，改不了名次。
   2. 名次和时间都用服务器时钟：开赛时间是 Date.now() + 3 秒，各人自己算倒计时。
      绝不能让每个客户端各自 3-2-1 —— 那样网络慢的人天然吃亏。
   3. 房间号由客户端指定（老师写在黑板上的 py1 就是这间房的身份）。
      onCreate 里覆盖 roomId，配合 index.js 的 filterBy(["code"]) 让同号的并发创建
      被串行化；万一还是撞了，抢输的那间会退回随机房号，客户端发现房号对不上会
      重新 joinById(房间号) —— 自己修好，见 ownsCode。 */

import { Room } from "@colyseus/core";
import { RaceState, Player } from "../schema.js";
import { loadLevels } from "../bank.js";

export const ROOM_NAME = "typing";

const PHASE = { LOBBY: "lobby", COUNTDOWN: "countdown", RACING: "racing", DONE: "done" };

const COUNTDOWN_MS = 3000;
const MAX_CLIENTS = 8;
const MAX_NAME = 16;
const MSG_WINDOW_MS = 1000;
const MSG_BUDGET = 200;      /* 每秒最多收这么多条 progress（Tab 一次算 4 个字符，但只发一条） */

/* 本进程里已经存在的房间号。单进程部署；多进程要换成 presence 查询。 */
const liveCodes = new Set();

export function cleanCode(v) {
  const s = String(v === undefined || v === null ? "" : v).trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,23}$/.test(s) ? s : "";
}

function cleanName(v, n) {
  const s = String(v === undefined || v === null ? "" : v)
    .replace(/[\u0000-\u001f\u007f]/g, "")   /* 控制字符剔掉，名字要能安全地画出来 */
    .replace(/\s+/g, " ")
    .trim();
  return (s || "Player " + n).slice(0, MAX_NAME);
}

export class TypingRoom extends Room {
  async onCreate(options) {
    const opt = options || {};

    /* 房间号：能拿就拿，被别人先拿了就不拿（这间房随后会因为房号对不上而被客户端放弃） */
    const code = cleanCode(opt.code);
    this.code = code;
    this.ownsCode = false;
    if (code && !liveCodes.has(code)) {
      liveCodes.add(code);
      this.ownsCode = true;
      this.roomId = code;
    }

    /* private：这间房不会被别的 joinOrCreate 顺手并进来。
       只有拿着房间号的 joinById 能进 —— ?room=py1 永远进不了 py2 的房。 */
    await this.setPrivate(true);

    this.maxClients = MAX_CLIENTS;

    this.levels = loadLevels();
    if (!this.levels.length) throw new Error("the typing level bank is empty");

    this.rate = new Map();       /* sessionId -> { windowAt, count }，不进 schema */
    this.ranker = 0;
    this.countdown = null;

    this.setState(new RaceState());
    this.applyLevel(this.levels.find(function (l) { return l.id === opt.levelId; }) || this.levels[0]);

    this.onMessage("progress", (client, msg) => this.onProgress(client, msg));
    this.onMessage("name", (client, msg) => this.onName(client, msg));
    this.onMessage("level", (client, msg) => this.onLevel(client, msg));
    this.onMessage("start", () => this.startRace());
    this.onMessage("end", () => this.endRace());
    this.onMessage("ping", (client, msg) => client.send("pong", {
      t: msg && msg.t,
      now: Date.now(),
    }));

    console.log(`[typing] room created  id=${this.roomId}  code=${code || "-"}  level=${this.state.levelId}`);
  }

  onJoin(client, options) {
    const p = new Player();
    p.name = cleanName(options && options.name, this.state.players.size + 1);
    p.pos = 0;
    p.place = 0;
    p.timeMs = 0;
    p.connected = true;
    this.state.players.set(client.sessionId, p);
    console.log(`[typing] ${this.roomId} <- ${p.name} (${this.state.players.size} in room)`);
  }

  onLeave(client) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    this.rate.delete(client.sessionId);

    if (this.state.phase === PHASE.LOBBY) {
      this.state.players.delete(client.sessionId);
      return;
    }
    /* 比赛/结算期间掉线：先留一个灰掉的头像，名次不乱跳；下一场开始时再清 */
    p.connected = false;
    this.maybeFinish();
  }

  onDispose() {
    if (this.countdown) clearTimeout(this.countdown);
    this.countdown = null;
    if (this.ownsCode && this.code) liveCodes.delete(this.code);
    console.log(`[typing] room disposed  id=${this.roomId}`);
  }

  /* ------------------------------- 局 ------------------------------- */

  applyLevel(lv) {
    this.state.levelId = lv.id;
    this.state.text = lv.text;
    this.state.startsAt = 0;
    this.state.phase = PHASE.LOBBY;
    this.ranker = 0;
    this.state.players.forEach((p) => {
      p.pos = 0;
      p.place = 0;
      p.timeMs = 0;
    });
  }

  onLevel(client, msg) {
    if (this.state.phase !== PHASE.LOBBY && this.state.phase !== PHASE.DONE) return;
    const id = msg && msg.id;
    const lv = this.levels.find(function (l) { return l.id === id; });
    if (!lv) return;
    if (this.countdown) { clearTimeout(this.countdown); this.countdown = null; }
    this.applyLevel(lv);
    console.log(`[typing] ${this.roomId} level -> ${lv.id}`);
  }

  startRace() {
    if (this.state.phase === PHASE.COUNTDOWN) return;

    /* 上一场掉线再没回来的人，别拉到下一场 */
    const ghosts = [];
    this.state.players.forEach((p, id) => { if (!p.connected) ghosts.push(id); });
    ghosts.forEach((id) => this.state.players.delete(id));

    this.ranker = 0;
    this.state.players.forEach((p) => {
      p.pos = 0;
      p.place = 0;
      p.timeMs = 0;
    });

    this.state.raceNo += 1;
    this.state.startsAt = Date.now() + COUNTDOWN_MS;   /* 服务器时间，各人自己换算 */
    this.state.phase = PHASE.COUNTDOWN;

    if (this.countdown) clearTimeout(this.countdown);
    this.countdown = setTimeout(() => {
      this.countdown = null;
      if (this.state.phase === PHASE.COUNTDOWN) this.state.phase = PHASE.RACING;
    }, COUNTDOWN_MS);

    console.log(`[typing] ${this.roomId} race #${this.state.raceNo} on ${this.state.levelId}`);
  }

  endRace() {
    if (this.state.phase !== PHASE.COUNTDOWN && this.state.phase !== PHASE.RACING) return;
    if (this.countdown) { clearTimeout(this.countdown); this.countdown = null; }
    this.state.phase = PHASE.DONE;
    console.log(`[typing] ${this.roomId} race #${this.state.raceNo} ended at ${this.ranker} finished`);
  }

  /* 掉线不算数：只有还在线的都跑完了，这场才算完 */
  maybeFinish() {
    if (this.state.phase !== PHASE.RACING) return;
    const total = this.state.text.length;
    let racing = 0;
    let finished = 0;
    this.state.players.forEach((p) => {
      if (!p.connected) return;
      racing += 1;
      if (p.pos >= total) finished += 1;
    });
    if (racing > 0 && finished === racing) this.endRace();
  }

  /* ----------------------------- 前进 ----------------------------- */

  onProgress(client, msg) {
    const p = this.state.players.get(client.sessionId);
    if (!p || !p.connected) return;
    if (this.state.phase !== PHASE.RACING) return;
    if (!this.underBudget(client.sessionId)) return;   /* 刷屏的直接丢，不回包，免得反向放大流量 */

    const text = this.state.text;
    const pos = msg && typeof msg.pos === "number" ? Math.floor(msg.pos) : -1;
    if (pos < 0 || pos > text.length) return this.resync(client, p);
    if (pos === p.pos) return;

    if (pos > p.pos) {
      /* 往前走：必须把经过的那段字符一起交上来，服务器自己跟文本比 */
      const chunk = msg && typeof msg.chunk === "string" ? msg.chunk : null;
      const expected = text.slice(p.pos, pos);
      if (chunk === null || chunk !== expected) return this.resync(client, p);
    }
    /* 往后退（改错）放行 */

    p.pos = pos;

    if (p.pos >= text.length && p.place === 0) {
      this.ranker += 1;
      p.place = this.ranker;
      p.timeMs = Math.max(1, Date.now() - this.state.startsAt);
      console.log(`[typing] ${this.roomId} #${p.place} ${p.name} ${p.timeMs}ms`);
      this.maybeFinish();
    }
  }

  resync(client, p) {
    client.send("resync", { pos: p.pos });
  }

  underBudget(sessionId) {
    const now = Date.now();
    const r = this.rate.get(sessionId);
    if (!r || now - r.windowAt >= MSG_WINDOW_MS) {
      this.rate.set(sessionId, { windowAt: now, count: 1 });
      return true;
    }
    r.count += 1;
    return r.count <= MSG_BUDGET;
  }

  onName(client, msg) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.name = cleanName(msg && msg.name, this.state.players.size);
  }
}
