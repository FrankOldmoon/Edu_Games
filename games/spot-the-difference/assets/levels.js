/* 关卡数据的加载、校验与进度记录，关卡选择页和游戏页共用。

   数据来源：
     * 默认读上一层的 levels.json —— 只存结构（id / left / right / diffs / timer）
     * 也可以用 ?json=<地址> 指定别处的一份数据（相对或绝对地址都行）

   默认地址用 import.meta.url 拼，这样不管页面挂在 / 还是 /play/ 下都指得对。
   数据在渲染前先整体校验：宁可立刻报错，也不要页面渲染到一半崩掉。

   显示文案（关卡名 / 提示 / 每处不同的解析）不在数据里，按关卡 id 从
   locales/*.js 取。外部题库想自带文案就写 name / tip / hint / note，内联的优先。 */

import { i18n, t } from "./i18n.js";

const DEFAULT_URL = new URL("../levels.json", import.meta.url).href;

/* 进度按数据来源分开存：换了 ?json= 就有自己独立的一份进度 */
const PROGRESS_PREFIX = "std.progress.v1:";

function isStr(v) { return typeof v === "string"; }

/* 校验失败会抛错，错误信息里带上第几关、第几个不同点，方便定位数据问题 */
export function validate(data) {
  if (!data || !Array.isArray(data.levels) || data.levels.length === 0) {
    throw new Error(t("errors.noLevels"));
  }
  data.levels.forEach(function (lv, i) {
    const tag = t("errors.level", { n: i + 1 });
    if (!isStr(lv.id) || !lv.id) throw new Error(t("errors.needId", { tag: tag }));
    if (!isStr(lv.left) || !isStr(lv.right)) {
      throw new Error(t("errors.needCode", { tag: tag }));
    }
    const L = lv.left.split("\n");
    const R = lv.right.split("\n");
    if (L.length !== R.length) {
      throw new Error(t("errors.lineCount", { tag: tag, left: L.length, right: R.length }));
    }
    if (!Array.isArray(lv.diffs) || lv.diffs.length === 0) {
      throw new Error(t("errors.noDiffs", { tag: tag }));
    }

    lv.diffs.forEach(function (d, j) {
      const dt = t("errors.spot", { tag: tag, j: j + 1 });
      /* 目前只在右栏（改动后）判定，左栏是原始代码 */
      if (d.panel !== undefined && d.panel !== "right") {
        throw new Error(t("errors.panelRight", { dt: dt }));
      }
      const ln = d.line;
      if (!Number.isInteger(ln) || ln < 1 || ln > R.length) {
        throw new Error(t("errors.lineRange", { dt: dt, line: ln }));
      }
      /* 同一行左右一模一样，就根本不存在"不同点" */
      if (L[ln - 1] === R[ln - 1]) {
        throw new Error(t("errors.identicalLine", { dt: dt }));
      }
      if (d.find !== undefined) {
        if (!isStr(d.find) || !d.find) throw new Error(t("errors.findEmpty", { dt: dt }));
        if (R[ln - 1].indexOf(d.find) < 0) {
          throw new Error(t("errors.findMissing", {
            dt: dt, line: ln, needle: JSON.stringify(d.find)
          }));
        }
        if (d.at !== undefined) throw new Error(t("errors.findAndAt", { dt: dt }));
      }
      /* 没给 find 时用 at 指明位置：start 圈行首（少缩进），
         end 圈行尾（缺冒号、缺右括号），都不写就是整行。
         注意不要在这里 trim 后比较：少缩进这种差别本身就是空白，
         trim 掉就看不出来了（上面的整行相等检查已经不 trim）。 */
      if (d.at !== undefined && d.at !== "start" && d.at !== "end") {
        throw new Error(t("errors.atValue", { dt: dt, value: JSON.stringify(d.at) }));
      }
    });
  });
  return data;
}

/* 按当前语言把文案补进关卡：数据里内联写了就用它，没写才查语言包。
   返回新的对象，所以换语言时拿原始数据再跑一遍就行。 */
export function localizeLevels(list) {
  return list.map(function (lv) {
    const pre = "levels." + lv.id + ".";
    const out = Object.assign({}, lv);
    out.name = lv.name || i18n.opt(pre + "name") || lv.id;
    out.tip = lv.tip || i18n.opt(pre + "tip") || "";
    out.hint = lv.hint || i18n.opt(pre + "hint") || "";
    out.diffs = lv.diffs.map(function (d, j) {
      const e = Object.assign({}, d);
      e.note = d.note || i18n.opt(pre + "notes." + j) || "";
      return e;
    });
    return out;
  });
}

export async function loadLevels() {
  const q = new URLSearchParams(location.search);
  const custom = q.get("json");
  let url;
  try {
    url = custom ? new URL(custom, location.href).href : DEFAULT_URL;
  } catch (e) {
    throw new Error(t("errors.badJsonUrl", { url: custom }));
  }

  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (e) {
    throw new Error(t("errors.fetchFailed", { url: url }));
  }
  if (!res.ok) throw new Error(t("errors.http", { status: res.status, url: url }));

  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error(t("errors.badJson", { url: url }));
  }
  validate(data);
  data.source = url;
  return data;
}

/* ------------------------------- 进度 -------------------------------- */

function keyOf(source) { return PROGRESS_PREFIX + source; }

export function readProgress(source) {
  try {
    const rec = JSON.parse(localStorage.getItem(keyOf(source)) || "null");
    const done = rec && Array.isArray(rec.done) ? rec.done.filter(isStr) : [];
    return { done: done };
  } catch (e) {
    /* 坏数据当作没进度，不要让整个页面挂掉 */
    return { done: [] };
  }
}

/* 已解锁的关卡数：完成的都解锁，再加上第一个没完成的。
   这样中途跳关或换了数据源也不会把后面的关卡误锁住。 */
export function unlockedCount(levels, done) {
  let n = 0;
  while (n < levels.length && done.indexOf(levels[n].id) >= 0) n++;
  return Math.min(levels.length, n + 1);
}

export function markDone(source, id) {
  const rec = readProgress(source);
  if (rec.done.indexOf(id) < 0) rec.done.push(id);
  try {
    localStorage.setItem(keyOf(source), JSON.stringify({ done: rec.done, at: Date.now() }));
  } catch (e) {
    /* 存不了就只影响进度记录，当前这一关照样能继续玩 */
  }
}

export function resetProgress(source) {
  try { localStorage.removeItem(keyOf(source)); } catch (e) { /* 忽略 */ }
}

/* ?all=1 时解锁全部，方便老师直接跳到某一关演示 */
export function allUnlocked() {
  return new URLSearchParams(location.search).get("all") === "1";
}
