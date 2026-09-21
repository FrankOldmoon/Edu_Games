/* 指令机器人的语言实例：默认英文，另加一份简体中文包。
   语言的选择、持久化和切换按钮都在 src/i18n 里，这里只负责把两份包接上。

   房间（多人）那一层的文案是**共用**的一份（src/game-ui/room/locales/）——
   顶层展开并进来即可：它自成 room.* 一棵子树，不会和本游戏的 ui.* 打架。 */

import { createI18n } from "../../../src/i18n/index.js";
import en from "./locales/en.js";
import zhCN from "./locales/zh-CN.js";
import roomEn from "../../../src/game-ui/room/locales/en.js";
import roomZh from "../../../src/game-ui/room/locales/zh-CN.js";

export const i18n = createI18n({
  packs: {
    en: Object.assign({}, en, roomEn),
    "zh-CN": Object.assign({}, zhCN, roomZh),
  },
});

export const t = i18n.t;

export function mountSwitcher() {
  return i18n.mountSwitcher(document.getElementById("lang"));
}
