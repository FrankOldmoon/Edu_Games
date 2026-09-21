/* 服务器自己读题库。

   这是关键：校验必须拿服务器手上的那份去做，客户端说的只能算"申请"。
   和游戏用的是同一个 levels.json（同仓库，天然同一份），所以单人/多人不可能对不上。

   路径相对本文件算（URL 解析），所以每个游戏的房间各报各的题库。
   这里只做一件事：读出带字符串 id 的关卡。每关还需要什么（打字要 text、
   配对要 pairs）由各自的房间再筛一道。 */

import { readFileSync } from "node:fs";

export function loadLevels(rel) {
  const raw = JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
  const levels = Array.isArray(raw) ? raw : raw && raw.levels;
  return (levels || []).filter(function (lv) {
    return lv && typeof lv.id === "string";
  });
}
