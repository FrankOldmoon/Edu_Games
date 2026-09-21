/* 房间状态的两张表。字段刻意压到最少：
   服务器只负责它能验证的东西 —— 位置和时间。
   错误数、WPM、正确率都是各人本地自己算的展示值，不进 schema（服务器看不见按键，也就不该声称知道）。 */

import { Schema, MapSchema, defineTypes } from "@colyseus/schema";

export class Player extends Schema {
  constructor() {
    super();
    this.name = "";
    this.pos = 0;        // 权威位置：已完成几个字符
    this.place = 0;      // 名次，0 = 还没跑完
    this.timeMs = 0;     // 跑完用的时间，服务器时间差的
    this.connected = true;
  }
}

defineTypes(Player, {
  name: "string",
  pos: "uint32",
  place: "uint8",
  timeMs: "uint32",
  connected: "boolean",
});

export class RaceState extends Schema {
  constructor() {
    super();
    this.phase = "lobby";    // lobby | countdown | racing | done
    this.levelId = "";
    this.text = "";          // 目标文本只在服务器这一份，客户端照着画
    this.startsAt = 0;       // 开赛的服务器时间（epoch ms），0 = 还没排
    this.raceNo = 0;         // 每开一场 +1，客户端靠它重置本地的计时和错误数
    this.players = new MapSchema();
  }
}

defineTypes(RaceState, {
  phase: "string",
  levelId: "string",
  text: "string",
  startsAt: "float64",
  raceNo: "uint16",
  players: { map: Player },
});
