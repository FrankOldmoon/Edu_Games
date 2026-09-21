/* 进度房间里每个人那一份 —— 和具体游戏无关。

   任何"一关里有一个进度数"的游戏都能直接用这两个类：
     · 打字：pos = 这一关敲对了几个字符
     · 配对：pos = 这一关配上了几对
   名次、用时、倒计时、开赛时间都不在这里，因为那都是"比"才需要的东西。

   错误数、WPM、正确率这类展示值各人本地算，不进 schema
   （服务器看不见按键，也就不该声称知道）。 */

import { Schema, ArraySchema, MapSchema, defineTypes } from "@colyseus/schema";

export class Player extends Schema {
  constructor() {
    super();
    this.name = "";
    this.playing = false;   // 自己那局开始了没有（没开始的只挂在大堂里，不进爬楼榜）
    this.level = 0;         // 打到题库里的第几关（下标）
    this.pos = 0;           // 这一关完成了多少（含义由各游戏定，见文件头）
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

export class ProgressState extends Schema {
  constructor() {
    super();
    /* 题库的关卡 id，有序。客户端拿它当"第几关"的权威顺序，
       也拿它跟自己的题库对表。具体每关的内容各游戏自己发（见 schemas/typing.js）。 */
    this.levelIds = new ArraySchema();
    this.players = new MapSchema();
  }
}

defineTypes(ProgressState, {
  levelIds: ["string"],
  players: { map: Player },
});
