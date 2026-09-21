/* 房间状态的两张表。字段刻意压到最少：
   这个房间不搞比赛 —— 每个人自己打自己的，服务器只负责两件事：
   把题库发下去（校验要用），以及记住每个人打到第几关、一关里打了多少。
   名次、用时、倒计时、开赛时间这些都没有，因为那都是"比"才需要的东西。

   错误数、WPM、正确率也是各人本地自己算的展示值，不进 schema
   （服务器看不见按键，也就不该声称知道）。 */

import { Schema, ArraySchema, MapSchema, defineTypes } from "@colyseus/schema";

export class Player extends Schema {
  constructor() {
    super();
    this.name = "";
    this.playing = false;   // 自己那局开始了没有（没开始的只挂在大堂里，不进爬楼榜）
    this.level = 0;         // 打到题库里的第几关（下标）
    this.pos = 0;           // 这一关已完成几个字符
    this.connected = true;
  }
}

defineTypes(Player, {
  name: "string",
  playing: "boolean",
  level: "uint8",
  pos: "uint32",
  connected: "boolean",
});

export class RoomState extends Schema {
  constructor() {
    super();
    /* 题库整个发下去（id 给客户端查本地化标题用，文本是服务器手上的权威副本）。
       两样都发，客户端就不用自己去题库里找 —— 谁也别想和服务器理解得不一样。
       每人自己选起跑关卡，所以这里发的是整个题库，不是某一局切出来的赛道。 */
    this.levelIds = new ArraySchema();
    this.texts = new ArraySchema();
    this.players = new MapSchema();
  }
}

defineTypes(RoomState, {
  levelIds: ["string"],
  texts: ["string"],
  players: { map: Player },
});
