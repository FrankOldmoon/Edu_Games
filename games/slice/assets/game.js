/* 切片弹射：设 start / stop / step，发射，看究竟选中了哪些块。

   玩法是「给定目标序列，构造出对应的切片」——比认符号高一档。
   判据是切片的结果序列，所以同一个目标允许多种写法（[2:99] 和 [-1:] 都对）。 */

import bank from "../levels.json";
import en from "./locales/en.js";
import zhCN from "./locales/zh-CN.js";
import { i18n, t, mountSwitcher } from "./i18n.js";
import { params, createProgress, startIndex, loadBank, reportResult } from "../../../src/game-ui/progress.js";
import { celebrate, isCelebrating } from "../../../src/game-ui/feedback.js";
import { createCountdown, limitMs, formatClock } from "../../../src/game-ui/timer.js";

const GAME_ID = "slice";
const PACKS = { en: en, "zh-CN": zhCN };
const el = function (id) { return document.getElementById(id); };

/* 每关限时 = BASE + PER_ITEM × 列表长度（关卡库里的 timer 可以覆盖）。
   默认：20 秒垫底 + 每项 12 秒 —— 4 项 68 秒，8 项 116 秒。 */
const TIME_BASE = 20;
const TIME_PER_ITEM = 12;

let levels = bank.levels || bank;
let prog = null;
let game = null;
let clock = null;
let timedOut = false;

/* 每换一关、每改一次参数、每发射一次都加一。
   定时器回调拿发射时的编号比对，对不上就自己作废 ——
   否则上一发的收尾会把新一发的状态/收集盘覆盖掉。
   用模块级计数器而不是挂在 game 上：重开同一关时 game 是全新对象，
   挂在 game 上的编号会从 0 重来，旧回调反而"看起来还有效"。 */
let shotEpoch = 0;

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

/* ----------------------------- 切片语义 ----------------------------- */

/* 尽量贴近 Python：负下标从末尾算，越界只截断不报错，
   step 为 0 抛错（对应真实 Python 的 ValueError）。返回被选中的下标序列。 */
function sliceIndices(n, s, e, st) {
  const step = st === "" ? 1 : st;
  if (step === 0) throw new Error("step 0");
  const out = [];
  let start, stop;

  if (step > 0) {
    start = s === "" ? 0 : (s < 0 ? Math.max(n + s, 0) : Math.min(s, n));
    stop = e === "" ? n : (e < 0 ? Math.max(n + e, 0) : Math.min(e, n));
    for (let i = start; i < stop; i += step) out.push(i);
  } else {
    start = s === "" ? n - 1 : (s < 0 ? n + s : Math.min(s, n - 1));
    start = Math.max(-1, Math.min(start, n - 1));
    stop = e === "" ? -1 : (e < 0 ? n + e : Math.min(e, n - 1));
    stop = Math.max(-1, Math.min(stop, n - 1));
    for (let i = start; i > stop; i += step) out.push(i);
  }
  return out;
}

function parseSlot(str) {
  const v = String(str).trim();
  if (v === "") return "";
  return /^[+-]?\d+$/.test(v) ? parseInt(v, 10) : null;
}

function show(view) {
  document.body.dataset.view = view;
  el("viewList").classList.toggle("hidden", view !== "list");
  el("viewGame").classList.toggle("hidden", view !== "game");
}

let statusState = null;

/* 状态栏是可翻译的文案，记成「键 + 变量」而不是成品字符串，
   这样切语言时能跟着重译，不会留着一句旧语言的文字。 */
function setStatus(key, vars) {
  statusState = key ? { key: key, vars: vars } : null;
  el("status").textContent = key ? t(key, vars) : "";
}

/* ------------------------------- 关卡列表 ------------------------------- */

function renderList() {
  el("lead").innerHTML = t("ui.lead", { n: levels.length });
  el("progText").textContent = t("ui.progress", { done: prog.count(), total: levels.length });

  const box = el("levels");
  box.innerHTML = "";
  levels.forEach(function (lv, i) {
    const unlocked = prog.isUnlocked(i);
    const done = prog.has(lv.id);

    const b = document.createElement("button");
    b.type = "button";
    b.className = "level" + (done ? " is-done" : "");
    b.disabled = !unlocked;

    const no = document.createElement("div");
    no.className = "no";
    no.textContent = t("ui.levelNo", { n: i + 1 });

    const ttl = document.createElement("div");
    ttl.className = "ttl";
    ttl.textContent = lvText(lv, "title");

    const st = document.createElement("div");
    st.className = "st";
    st.textContent = done ? t("ui.done") : (unlocked ? t("ui.start") : t("ui.locked"));

    b.append(no, ttl, st);
    b.addEventListener("click", function () { startLevel(i); });
    box.appendChild(b);
  });
}

/* -------------------------------- 游戏 -------------------------------- */

function startLevel(i) {
  const lv = levels[i];
  game = {
    index: i,
    level: lv,
    name: lv.name || "nums",
    items: (lv.items || []).slice(),
    target: (lv.target || []).slice(),
    shots: 0,
    startedAt: Date.now(),
    busy: false,
  };

  el("lvName").textContent = t("ui.levelNo", { n: i + 1 }) + " · " + lvText(lv, "title");
  el("listName").textContent = game.name;
  el("start").value = "";
  el("stop").value = "";
  el("step").value = "";
  document.querySelector(".stripwrap").classList.remove("failed");
  ["start", "stop", "step"].forEach(function (id) { el(id).disabled = false; });
  el("btnFire").disabled = false;

  renderTarget();
  renderStrip();
  resetAim();
  paintExpr();
  paintTip();
  show("game");
  timedOut = false;
  clock.start(limitMs(lv, (lv.items || []).length, TIME_BASE, TIME_PER_ITEM));
  el("start").focus();
}

function paintTip() {
  if (!game) return;
  const n = (game.items || []).length;
  const limit = Math.round(limitMs(game.level, n, TIME_BASE, TIME_PER_ITEM) / 1000);
  el("tip").textContent = t("ui.timeLimit", { n: limit }) + " · " + lvText(game.level, "tip");
}

function renderTarget() {
  const box = el("target");
  box.innerHTML = "";
  game.target.forEach(function (v) {
    const d = document.createElement("span");
    d.className = "tblk";
    d.textContent = String(v);
    box.appendChild(d);
  });
}

function renderStrip() {
  const box = el("strip");
  box.innerHTML = "";
  const n = game.items.length;
  game.items.forEach(function (v, i) {
    const b = document.createElement("div");
    b.className = "blk";

    const ord = document.createElement("div");
    ord.className = "ord";

    const up = document.createElement("div");
    up.className = "idx";
    up.textContent = String(i);

    const val = document.createElement("div");
    val.className = "val";
    val.textContent = String(v);

    const down = document.createElement("div");
    down.className = "idx";
    down.textContent = String(i - n);

    b.append(ord, up, val, down);
    box.appendChild(b);
  });
}

function resetAim() {
  shotEpoch += 1;   /* 还在飞的上一发作废 */
  const nodes = el("strip").children;
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].classList.remove("is-hit", "is-missed");
    nodes[i].firstChild.textContent = "";
  }
  el("tray").innerHTML = "";
  setStatus(null);
}

function paintExpr() {
  const s = el("start").value.trim();
  const e = el("stop").value.trim();
  const st = el("step").value.trim();
  el("exprLine").textContent = game.name + "[" + s + ":" + e + (st === "" ? "" : ":" + st) + "]";
}

function renderTray(values, cls) {
  const box = el("tray");
  box.innerHTML = "";
  if (!values.length) {
    const s = document.createElement("span");
    s.className = "none";
    s.textContent = t("ui.nothing");
    box.appendChild(s);
    return;
  }
  values.forEach(function (v) {
    const d = document.createElement("span");
    d.className = "item" + (cls ? " " + cls : "");
    d.textContent = String(v);
    box.appendChild(d);
  });
}

/* -------------------------------- 发射 -------------------------------- */

function fire() {
  if (!game || game.busy || timedOut) return;

  const s = parseSlot(el("start").value);
  const e = parseSlot(el("stop").value);
  const st = parseSlot(el("step").value);
  if (s === null || e === null || st === null) {
    resetAim();
    setStatus("ui.invalid");
    return;
  }

  let idx;
  try {
    idx = sliceIndices(game.items.length, s, e, st);
  } catch (err) {
    resetAim();
    setStatus("ui.stepZero");
    return;
  }

  game.shots += 1;
  game.busy = true;
  const myShot = ++shotEpoch;   /* 这一发的编号：过期回调自己作废 */

  const values = idx.map(function (i) { return game.items[i]; });
  const same = values.length === game.target.length &&
    values.every(function (v, i) { return v === game.target[i]; });

  const nodes = el("strip").children;
  for (let i = 0; i < nodes.length; i++) nodes[i].classList.remove("is-hit", "is-missed");
  const chosen = {};
  idx.forEach(function (i) { chosen[i] = true; });
  for (let i = 0; i < nodes.length; i++) if (!chosen[i]) nodes[i].classList.add("is-missed");

  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const step = reduce ? 0 : 90;

  idx.forEach(function (i, order) {
    setTimeout(function () {
      if (shotEpoch !== myShot) return;
      const node = nodes[i];
      if (!node) return;
      node.classList.add("is-hit");
      node.firstChild.textContent = String(order + 1);
    }, order * step);
  });

  setTimeout(function () {
    if (shotEpoch !== myShot) return;
    game.busy = false;
    renderTray(values, same ? "ok" : "bad");
    if (same) {
      setStatus("ui.ok");
      finish();
    } else {
      setStatus("ui.wrong");
    }
  }, idx.length * step + (reduce ? 0 : 180));
}

function finish() {
  clock.stop();
  const last = game.index === levels.length - 1;
  const index = game.index;
  const shots = game.shots;
  const left = clock.leftSeconds();
  const seconds = Math.round((Date.now() - game.startedAt) / 1000);
  const n = game.target.length;

  document.querySelector(".stripwrap").classList.remove("failed");
  prog.mark(game.level.id);
  reportResult(GAME_ID, {
    level: index + 1,
    levelId: game.level.id,
    levelTitle: lvText(game.level, "title"),
    correct: n,
    total: Math.max(n, game.items.length),
    rate: 1 / shots,
    progress: prog.ratio(),
    finished: last,
    timedOut: false,
    locale: i18n.getLocale(),
    shots: shots,
    seconds: seconds,
    timeLeft: left,
  });
  renderList();

  celebrate({
    title: t("ui.win"),
    lines: [
      shots === 1 ? t("ui.shots1") : t("ui.shotsN", { n: shots }),
      t("ui.winLine", { n: n, shots: shots, time: formatClock(seconds * 1000) }),
      t("ui.leftTime", { n: left }),
    ],
    actionLabel: last ? t("ui.allDone") : t("ui.next"),
    onAction: function () {
      if (last) toList();
      else startLevel(index + 1);
    },
  });
}

/* 时间到：锁住三个输入框和发射键，圈红方块区并报到 */
function timeUp() {
  if (!game || timedOut) return;
  timedOut = true;
  shotEpoch += 1;                 /* 还在飞的这一发作废 */

  ["start", "stop", "step"].forEach(function (id) { el(id).disabled = true; });
  el("btnFire").disabled = true;
  document.querySelector(".stripwrap").classList.add("failed");
  setStatus("ui.timeUp");
  reportResult(GAME_ID, {
    level: game.index + 1,
    levelId: game.level.id,
    levelTitle: lvText(game.level, "title"),
    correct: 0,
    total: Math.max(1, game.items.length),
    rate: 0,
    progress: prog.ratio(),
    finished: false,
    timedOut: true,
    locale: i18n.getLocale(),
    shots: game.shots,
  });
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
  paintExpr();
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
      el("err").classList.remove("hidden");
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
  el("btnFire").addEventListener("click", fire);
  el("btnRetry").addEventListener("click", function () { if (game) startLevel(game.index); });
  el("btnToList").addEventListener("click", toList);

  ["start", "stop", "step"].forEach(function (id) {
    el(id).addEventListener("input", function () {
      paintExpr();
      resetAim();
    });
    el(id).addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        fire();
      }
    });
  });

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
