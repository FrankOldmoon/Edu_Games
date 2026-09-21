/* 打字房间的状态：在通用的"进度房间"之上，多一份目标文本。

   为什么只有打字要多这一份 —— 因为打字是唯一一个服务器**能验**的游戏：
   目标文本必须在服务器手上，客户端交上来的那一段要拿它逐字符比对。
   配对、走迷宫这类游戏看得见牌面/地图才知道对不对，而那份东西只在
   各人自己的浏览器里，服务器验不了，也就只发关卡 id（见 schemas/progress.js）。 */

import { Schema, ArraySchema, MapSchema, defineTypes } from "@colyseus/schema";
import { Player } from "./progress.js";

export { Player };

export class TypingState extends Schema {
  constructor() {
    super();
    this.levelIds = new ArraySchema();
    this.texts = new ArraySchema();
    this.players = new MapSchema();
  }
}

defineTypes(TypingState, {
  levelIds: ["string"],
  texts: ["string"],
  players: { map: Player },
});
