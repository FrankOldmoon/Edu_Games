/* 房间状态的两张表。字段刻意压到最少：
   服务器只负责它能验证的东西 —— 位置、关卡、时间。
   错误数、WPM、正确率都是各人本地自己算的展示值，不进 schema（服务器看不见按键，也就不该声称知道）。 */

import { Schema, ArraySchema, MapSchema, defineTypes } from "@colyseus/schema";

export class Player extends Schema {
  constructor() {
    super();
    this.name = "";
    this.level = 0;      // 跑到第几关（在 state.levelIds 里的下标）
    this.pos = 0;        // 这一关已完成几个字符
    this.place = 0;      // 跑完整条赛道的名次，0 = 还没跑完
    this.timeMs = 0;     // 跑完整条赛道用的时间，服务器时间差的
    this.connected = true;
  }
}

defineTypes(Player, {
  name: "string",
  level: "uint8",
  pos: "uint32",
  place: "uint8",
  timeMs: "uint32",
  connected: "boolean",
});

export class RaceState extends Schema {
  constructor() {
    super();
    this.phase = "lobby";      // lobby | countdown | racing | done
    this.startLevelId = "";    // 从哪一关起跑（房间设置，只有大堂里能改）
    /* 这一场要跑的关卡：id 用来在客户端取本地化的标题，文本是服务器手上的权威副本。
       两样都发下去，客户端就不需要自己去题库里找 —— 谁也别想和服务器理解得不一样。 */
    this.levelIds = new ArraySchema();
    this.texts = new ArraySchema();
    this.startsAt = 0;         // 开赛的服务器时间（epoch ms），0 = 还没排
    this.raceNo = 0;           // 每开一场 +1，客户端靠它重置本地的计时和错误数
    this.players = new MapSchema();
  }
}

defineTypes(RaceState, {
  phase: "string",
  startLevelId: "string",
  levelIds: ["string"],
  texts: ["string"],
  startsAt: "float64",
  raceNo: "uint16",
  players: { map: Player },
});
