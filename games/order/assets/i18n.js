/* 拼装程序 的语言实例：默认英文，另加一份简体中文包。
   语言的选择、持久化和切换按钮都在 src/i18n 里，这里只负责把两份包接上。 */

import { createI18n } from "../../../src/i18n/index.js";
import en from "./locales/en.js";
import zhCN from "./locales/zh-CN.js";

export const i18n = createI18n({ packs: { en: en, "zh-CN": zhCN } });

export const t = i18n.t;

export function mountSwitcher() {
  return i18n.mountSwitcher(document.getElementById("lang"));
}
