/* 服务器自己读题库。
   这是关键：校验必须拿服务器手上的那份文本去做，客户端说的只能算"申请"。
   和游戏用的是同一个 levels.json（同仓库，天然同一份），所以单人/多人不可能对不上。 */

import { readFileSync } from "node:fs";

const BANK_URL = new URL("../games/typing/levels.json", import.meta.url);

export function loadLevels() {
  const raw = JSON.parse(readFileSync(BANK_URL, "utf8"));
  const levels = Array.isArray(raw) ? raw : raw && raw.levels;
  return (levels || [])
    .filter(function (lv) {
      return lv && typeof lv.id === "string" && typeof lv.text === "string" && lv.text.length > 0;
    })
    .map(function (lv) { return { id: lv.id, text: lv.text }; });
}
