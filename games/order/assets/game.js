/* 拼装程序：把被打乱的代码行排成能产生目标输出的顺序。

   顺序对不对是能直接判定的（比的是行号），所以反馈给「几行位置正确」——
   既不说破答案，也不是单纯一句「错了」。 */

import bank from "../levels.json";
import en from "./locales/en.js";
import zhCN from "./locales/zh-CN.js";
import { i18n, t, mountSwitcher } from "./i18n.js";
import { params, createProgress, startIndex, loadBank, reportResult } from "../../../src/game-ui/progress.js";
import { celebrate, isCelebrating } from "../../../src/game-ui/feedback.js";
import { createCountdown, limitMs, formatClock } from "../../../src/game-ui/timer.js";
import { renderLevelList } from "../../../src/game-ui/levels-ui.js";

const GAME_ID = "order";
const PACKS = { en: en, "zh-CN": zhCN };
const el = function (id) { return document.getElementById(id); };

/* 每关限时 = BASE + PER_LINE × 行数（关卡库里的 timer 可以覆盖）。
   默认：15 秒垫底 + 每行 15 秒 —— 3 行 60 秒，9 行的冒泡排序 150 秒。 */
const TIME_BASE = 15;
const TIME_PER_LINE = 15;

let levels = bank.levels || bank;
let prog = null;
let game = null;
let clock = null;
let timedOut = false;
let dragFrom = -1;

/* ------------------------------ 文案取值 ------------------------------ */

function packNow() {
  return PACKS[i18n.getLocale()] || PACKS.en;
}

function lvText(lv, field) {
  if (typeof lv[field] === "string") return lv[field];
  const here = packNow().levels && packNow().levels[lv.id];
  if (here && typeof here[field] === "string") return here[field];
  const fb = PACKS.en.levels && PACKS.en.levels[lv.id];
  return fb && typeof fb[field] === "string" ? fb[field] : "";
}

/* -------------------------------- 工具 -------------------------------- */

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRand(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* 用关卡 id 做种子的确定性洗牌：同一关每次进来顺序一样，
   而且保证一开始至少有一行是错位的（否则开局就通关了）。 */
function initialOrder(level) {
  const n = level.lines.length;
  const a = [];
  for (let i = 0; i < n; i++) a.push(i);
  const rand = makeRand(hashStr(level.id));
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  let sorted = true;
  for (let i = 0; i < n; i++) if (a[i] !== i) { sorted = false; break; }
  if (sorted && n > 1) a.push(a.shift());
  return a;
}

/* 视图切换：只改 body[data-view]，该显示哪半边交给 base.css 的
   .list-only / .game-only 决定，和 spot-the-difference 一致。 */
function show(view) {
  document.body.dataset.view = view;
}

let statusState = null;

/* 状态栏是可翻译的文案，记成「键 + 变量」而不是成品字符串，
   这样切语言时能跟着重译，不会留着一句旧语言的文字。 */
function setStatus(key, vars) {
  statusState = key ? { key: key, vars: vars } : null;
  el("status").textContent = key ? t(key, vars) : "";
}

function lineLabel(pos) {
  const code = game.lines[game.order[pos]];
  return t("ui.lineAria", { n: pos + 1, code: code === "" ? t("ui.emptyLine") : code });
}

/* ------------------------------- 关卡列表 ------------------------------- */

function renderList() {
  el("lead").innerHTML = t("ui.lead", { n: levels.length });
  el("progText").textContent = t("ui.progress", { done: prog.count(), total: levels.length });

  renderLevelList({
    host: el("levels"),
    levels: levels.map(function (lv) {
      return { id: lv.id, name: lvText(lv, "title"), tip: lvText(lv, "tip") };
    }),
    done: levels.filter(function (lv) { return prog.has(lv.id); }).map(function (lv) { return lv.id; }),
    isOpen: function (i) { return prog.isUnlocked(i); },
    onPick: startLevel,
    labelNo: function (i) { return t("ui.levelNo", { n: i + 1 }); },
    labelDone: t("ui.done"),
    labelStart: t("ui.start"),
    labelLocked: t("ui.locked"),
  });
}

/* -------------------------------- 游戏 -------------------------------- */

function startLevel(i) {
  const lv = levels[i];
  game = {
    index: i,
    level: lv,
    lines: (lv.lines || []).slice(),
    order: initialOrder(lv),
    attempts: 0,
    startedAt: Date.now(),
  };
  el("lvName").textContent = t("ui.levelNo", { n: i + 1 }) + " · " + lvText(lv, "title");
  el("goal").textContent = lv.output || "";
  el("stdin").textContent = lv.stdin || "";
  el("stdinBox").classList.toggle("hidden", !lv.stdin);
  el("consoleBox").classList.add("hidden");
  document.querySelector(".wrap").classList.remove("failed");
  setStatus(null);
  paintTip();
  renderRows();
  show("game");
  timedOut = false;
  clock.start(limitMs(lv, (lv.lines || []).length, TIME_BASE, TIME_PER_LINE));
}

function paintTip() {
  if (!game) return;
  const n = (game.level.lines || []).length;
  const limit = Math.round(limitMs(game.level, n, TIME_BASE, TIME_PER_LINE) / 1000);
  el("tip").textContent = t("ui.timeLimit", { n: limit }) + " · " + lvText(game.level, "tip");
}

function renderRows() {
  const box = el("lines");
  box.innerHTML = "";
  const n = game.order.length;

  game.order.forEach(function (srcIdx, pos) {
    const li = document.createElement("li");
    li.className = "row";
    li.draggable = true;
    li.setAttribute("aria-label", lineLabel(pos));

    const no = document.createElement("span");
    no.className = "no";
    no.textContent = String(pos + 1);

    const code = document.createElement("code");
    code.className = "code";
    code.textContent = game.lines[srcIdx] === "" ? t("ui.emptyLine") : game.lines[srcIdx];

    const up = document.createElement("button");
    up.type = "button";
    up.className = "mini";
    up.textContent = "↑";
    up.disabled = pos === 0;
    up.setAttribute("aria-label", t("ui.upAria", { n: pos + 1 }));
    up.addEventListener("click", function () { moveTo(pos, pos - 1); });

    const down = document.createElement("button");
    down.type = "button";
    down.className = "mini";
    down.textContent = "↓";
    down.disabled = pos === n - 1;
    down.setAttribute("aria-label", t("ui.downAria", { n: pos + 1 }));
    down.addEventListener("click", function () { moveTo(pos, pos + 1); });

    li.append(no, code, up, down);

    li.addEventListener("dragstart", function (e) {
      dragFrom = pos;
      li.classList.add("is-dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", String(pos)); } catch (err) { /* ignore */ }
      }
    });
    li.addEventListener("dragend", function () {
      dragFrom = -1;
      li.classList.remove("is-dragging");
      clearOver();
    });
    li.addEventListener("dragover", function (e) {
      e.preventDefault();
      if (dragFrom >= 0) markOver(pos);
    });
    li.addEventListener("drop", function (e) {
      e.preventDefault();
      if (dragFrom >= 0 && dragFrom !== pos) moveTo(dragFrom, pos);
      clearOver();
    });

    box.appendChild(li);
  });
}

function clearOver() {
  const rows = el("lines").children;
  for (let i = 0; i < rows.length; i++) rows[i].classList.remove("is-over");
}

function markOver(pos) {
  const rows = el("lines").children;
  for (let i = 0; i < rows.length; i++) rows[i].classList.toggle("is-over", i === pos);
}

/* 把第 from 个位置的元素挪到最终的第 to 个位置 */
function moveTo(from, to) {
  if (timedOut) return;
  if (to < 0 || to >= game.order.length || from === to) return;
  const item = game.order.splice(from, 1)[0];
  game.order.splice(to, 0, item);
  renderRows();
  setStatus(null);
}

/* -------------------------------- 判定 -------------------------------- */

function check() {
  if (timedOut) return;
  const n = game.order.length;
  let inPlace = 0;
  for (let i = 0; i < n; i++) if (game.order[i] === i) inPlace += 1;
  game.attempts += 1;

  if (inPlace === n) {
    win();
    return;
  }
  setStatus(inPlace === 0 ? "ui.noneRight" : "ui.nRight", { n: inPlace, total: n });
  const wrap = document.querySelector(".wrap");
  wrap.classList.remove("is-shake");
  void wrap.offsetWidth;   /* 让动画能重放 */
  wrap.classList.add("is-shake");
}

function win() {
  const n = game.order.length;
  setStatus("ui.correctAll");
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const step = reduce ? 0 : 110;
  const rows = Array.prototype.slice.call(el("lines").children);
  rows.forEach(function (r, i) {
    setTimeout(function () { r.classList.add("is-ran"); }, i * step);
  });
  setTimeout(function () {
    el("consoleBox").classList.remove("hidden");
    el("console").textContent = game.level.output || "";
    finish();
  }, n * step + (reduce ? 0 : 260));
}

function finish() {
  clock.stop();
  const n = game.order.length;
  const last = game.index === levels.length - 1;
  const index = game.index;
  const left = clock.leftSeconds();
  const seconds = Math.round((Date.now() - game.startedAt) / 1000);

  document.querySelector(".wrap").classList.remove("failed");
  prog.mark(game.level.id);
  reportResult(GAME_ID, {
    level: index + 1,
    levelId: game.level.id,
    levelTitle: lvText(game.level, "title"),
    correct: n,
    total: n,
    rate: 1 / game.attempts,
    progress: prog.ratio(),
    finished: last,
    timedOut: false,
    locale: i18n.getLocale(),
    attempts: game.attempts,
    lines: n,
    seconds: seconds,
    timeLeft: left,
  });
  renderList();

  celebrate({
    title: t("ui.win"),
    lines: [
      game.attempts === 1 ? t("ui.attempts1") : t("ui.attemptsN", { n: game.attempts }),
      t("ui.winLine", { lines: n, attempts: game.attempts, time: formatClock(seconds * 1000) }),
      t("ui.leftTime", { n: left }),
    ],
    actionLabel: last ? t("ui.allDone") : t("ui.next"),
    onAction: function () {
      if (last) toList();
      else startLevel(index + 1);
    },
  });
}

/* 时间到：把正确顺序直接摆出来（看清答案比停在半路有用），锁住棋盘并报到 */
function timeUp() {
  if (!game || timedOut) return;
  timedOut = true;

  const n = game.order.length;
  game.order = game.order.map(function (_, i) { return i; });
  renderRows();
  const rows = el("lines").children;
  for (let i = 0; i < rows.length; i++) rows[i].classList.add("is-ran");

  document.querySelector(".wrap").classList.add("failed");
  setStatus("ui.timeUp");
  reportResult(GAME_ID, {
    level: game.index + 1,
    levelId: game.level.id,
    levelTitle: lvText(game.level, "title"),
    correct: 0,
    total: n,
    rate: 0,
    progress: prog.ratio(),
    finished: false,
    timedOut: true,
    locale: i18n.getLocale(),
    attempts: game.attempts,
    lines: n,
  });
}

function hint() {
  if (!game || timedOut) return;
  setStatus("ui.hintText", { code: game.lines[0] });
  const pos = game.order.indexOf(0);
  const rows = el("lines").children;
  const row = rows[pos];
  if (row) {
    row.classList.add("is-pulse");
    setTimeout(function () { row.classList.remove("is-pulse"); }, 1700);
  }
}

function toList() {
  clock.stop();
  game = null;
  renderList();
  show("list");
}

/* ------------------------------- 语言切换 ------------------------------- */

function relocalize() {
  renderList();
  if (!game) return;
  el("lvName").textContent = t("ui.levelNo", { n: game.index + 1 }) + " · " + lvText(game.level, "title");
  paintTip();
  renderRows();
  if (statusState) setStatus(statusState.key, statusState.vars);
}

/* -------------------------------- 启动 -------------------------------- */

async function boot() {
  mountSwitcher();
  i18n.onChange(relocalize);
  clock = createCountdown({ el: el("clock"), bar: el("timebar"), onExpire: timeUp });

  if (params().json) {
    try {
      levels = await loadBank("./levels.json");
    } catch (e) {
      el("err").hidden = false;
      el("err").textContent = t("ui.loadFailed", { msg: e.message });
      return;
    }
  }

  prog = createProgress(GAME_ID, levels.map(function (l) { return l.id; }));

  el("btnReset").addEventListener("click", function () {
    if (confirm(t("ui.resetConfirm"))) {
      prog.reset();
      renderList();
    }
  });
  el("btnRun").addEventListener("click", function () { if (game) check(); });
  el("btnHint").addEventListener("click", hint);
  el("btnRetry").addEventListener("click", function () { if (game) startLevel(game.index); });
  el("btnToList").addEventListener("click", toList);
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || isCelebrating()) return;
    if (game) toList();
  });

  renderList();

  const i = startIndex(levels);
  if (i >= 0 && prog.isUnlocked(i)) startLevel(i);
  else if (params().embed) startLevel(0);
}

boot();
