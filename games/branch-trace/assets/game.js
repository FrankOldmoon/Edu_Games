/* Python 分支地牢：一个角色在一张会走路的格子地图上移动，选对每个 if/elif/else 该走哪条。

   这一关的每一步（哪条分支会走、金币放在哪、陷阱放在哪）**不是这里算的**，
   是出题时用真 CPython 跑出来写进 levels.json 的（tools/branch-levels.py）。
   浏览器里一行 Python 都不跑 —— 单人玩的时候连一个字节的 wasm 都不用下。

   移动 = 作答：把角色走进某条走廊就等于选了那条分支。走对了通到下一个岔口，
   走错了踩陷阱、扣时、看清那条不该走 —— 然后可以换个岔口再来。
   走到 ★ 终点 = 这一关的程序跑完，过关。 */

import bank from "../levels.json";
import en from "./locales/en.js";
import zhCN from "./locales/zh-CN.js";
import { i18n, t, mountSwitcher } from "./i18n.js";
import { params, createProgress, startIndex, loadBank, reportResult } from "../../../src/game-ui/progress.js";
import { celebrate, isCelebrating } from "../../../src/game-ui/feedback.js";
import { createCountdown, limitMs, formatClock } from "../../../src/game-ui/timer.js";
import { renderLevelList } from "../../../src/game-ui/levels-ui.js";
import createDungeon from "./idungeon.js";

const GAME_ID = "branch-trace";
const PACKS = { en: en, "zh-CN": zhCN };
const el = function (id) { return document.getElementById(id); };

/* 每关限时 = BASE + PER × 本关岔口数。默认 12 秒垫底 + 每题 20 秒。 */
const TIME_BASE = 12;
const TIME_PER_REGION = 20;
/* 踩一次陷阱扣 5 秒。错了有代价，但随时可以换个岔口重试，不设次数上限。 */
const WRONG_PENALTY_MS = 5000;

let levels = bank.levels || bank;
let prog = null;
let dungeon = null;
let game = null;
let clock = null;
let timedOut = false;

const MODE = { SOLO: "solo", ROOM: "room" };
const ROOM_NAME = "branch-trace";
const NAME_KEY = "branch-trace.name";

let mode = MODE.SOLO;
let net = null;
let panel = null;

/* 名字：?username= 优先（老师按学生发链接用），否则上次存的，最后随机"玩家 N" */
function cleanNameInput(v) {
  return String(v === undefined || v === null ? "" : v)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16);
}
function usernameFromUrlSafe() {
  try {
    return cleanNameInput(new URLSearchParams(location.search).get("username"));
  } catch (e) {
    return "";
  }
}
function rememberName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* 无痕 */ }
}
function playerName() {
  const fromUrl = usernameFromUrlSafe();
  if (fromUrl) { rememberName(fromUrl); return fromUrl; }
  let saved = "";
  try { saved = localStorage.getItem(NAME_KEY) || ""; } catch (e) { /* ignore */ }
  if (saved) return saved;
  const auto = t("ui.playerNo", { n: 1 + Math.floor(Math.random() * 99) });
  rememberName(auto);
  return auto;
}
function codeFromUrlSafe() {
  let raw = null;
  try {
    raw = new URLSearchParams(location.search).get("room");
  } catch (e) {
    return null;
  }
  if (raw === null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s || s === "new" || s === "1") return randomRoomCode();
  return /^[a-z0-9][a-z0-9_-]{0,23}$/.test(s) ? s : randomRoomCode();
}
function randomRoomCode() {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function packNow() { return PACKS[i18n.getLocale()] || PACKS.en; }

function lvText(lv, field) {
  if (typeof lv[field] === "string") return lv[field];
  const here = packNow().levels && packNow().levels[lv.id];
  if (here && typeof here[field] === "string") return here[field];
  const fb = PACKS.en.levels && PACKS.en.levels[lv.id];
  return fb && typeof fb[field] === "string" ? fb[field] : "";
}

function show(view) { document.body.dataset.view = view; }

/* ------------------------------- 关卡列表 ------------------------------- */

function renderList() {
  el("lead").innerHTML = t("ui.lead");
  el("progText").textContent = t("ui.progress", { done: prog.count(), total: levels.length });
  const hp = t("ui.howto").split("\n");
  el("howtoBody").innerHTML = hp.map(function (l) { return "<p>" + l + "</p>"; }).join("");

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

function regionCount(lv) {
  return Math.max(1, ((lv.map && lv.map.regions) || []).length);
}

function startLevel(i) { begin(levels[i], i); }

function begin(lv, index) {
  /* index = -1 表示不属于题库（外部 json 现拉的）—— 不写进度、不参与解锁 */
  el("dungeon").innerHTML = "";            /* 再来一关先清掉上一关的画布，idungeon 是 append 的 */
  dungeon = createDungeon({
    host: el("dungeon"),
    level: lv,
    t: t,
    win: function () { finish(); },
    lose: function () { if (clock) clock.penalize(WRONG_PENALTY_MS); jolt(); },
  });
  dungeon.relocalize();

  game = { index: index, level: lv, startedAt: Date.now() };
  timedOut = false;

  el("work").classList.remove("failed");
  paintChrome();
  show("game");
  startClock();
  reportProgress();
}

function jolt() {
  el("work").classList.remove("failed");
  void el("work").offsetWidth;
  el("work").classList.add("failed");
}

function paintChrome() {
  if (!game) return;
  const lv = game.level;
  const imported = game.index < 0;
  el("lvName").textContent = imported
    ? t("ui.roomTitle")
    : t("ui.levelNo", { n: game.index + 1 }) + " · " + lvText(lv, "title");
  el("counter").textContent = dungeon
    ? t("ui.coins", { n: dungeon.coins() })
    : "";
  if (timedOut) {
    el("tip").textContent = t("ui.timeUp");
    return;
  }
  const unit = regionCount(lv);
  const limit = Math.round(limitMs(lv, unit, TIME_BASE, TIME_PER_REGION) / 1000);
  el("tip").textContent = t("ui.timeLimit", { n: limit }) + " · " + lvText(lv, "tip");
}

/* 出报告用：岔口里第一次就走通的比例 */
function rate() {
  return dungeon ? dungeon.firstTry() / Math.max(1, dungeon.total()) : 1;
}

function finish() {
  clock.stop();
  dungeon.lock();
  const lv = game.level;
  const index = game.index;
  const imported = index < 0;
  const last = !imported && index === levels.length - 1;
  const seconds = Math.round((Date.now() - game.startedAt) / 1000);
  const ok = dungeon.firstTry();
  const total = dungeon.total();
  const coins = dungeon.coins();
  const time = formatClock(seconds * 1000);

  el("work").classList.remove("failed");
  if (!imported) prog.mark(lv.id);
  reportResult(GAME_ID, {
    level: imported ? 0 : index + 1,
    levelId: imported ? "__imported__" : lv.id,
    levelTitle: imported ? "" : lvText(lv, "title"),
    correct: ok,
    total: total,
    rate: imported ? 0 : rate(),
    progress: prog.ratio(),
    finished: last,
    timedOut: false,
    locale: i18n.getLocale(),
    seconds: seconds,
  });
  if (!imported) renderList();
  reportProgress();

  celebrate({
    title: t("ui.win"),
    lines: [
      ok === total ? t("ui.perfect") : t("ui.partial", { ok: ok, total: total }),
      t("ui.winLine", { regions: total, coins: coins, time: time }),
    ],
    actionLabel: last ? t("ui.allDone") : t("ui.next"),
    onAction: function () { if (last) toList(); else startLevel(index + 1); },
  });
}

function toList() {
  if (mode === MODE.ROOM) { leaveRoom(); return; }
  stopClock();
  teardownDungeon();
  game = null;
  timedOut = false;
  renderList();
  show("list");
}

function teardownDungeon() {
  el("dungeon").innerHTML = "";
  dungeon = null;
}

/* -------------------------------- 计时 -------------------------------- */

function startClock() {
  const unit = regionCount(game.level);
  clock.start(limitMs(game.level, unit, TIME_BASE, TIME_PER_REGION));
}
function stopClock() { if (clock) clock.stop(); }

/* 超时：把角色锁住，关留下当你看清全局，题目作废。比分留白，不硬判错。 */
function timeUp() {
  if (!game || timedOut) return;
  timedOut = true;
  dungeon.lock();
  paintChrome();
  el("work").classList.add("failed");
}

/* ------------------------------ 房间（多人） ------------------------------ */

function regionsAt(i) {
  const lv = Array.isArray(levels) ? levels[i] : null;
  return lv ? regionCount(lv) : 0;
}

function reportProgress() {
  if (mode !== MODE.ROOM || !net || !game || game.index < 0) return;
  net.progress({ level: game.index, pos: dungeon ? dungeon.solvedCount() : 0 });
}

async function enterRoom(code) {
  mode = MODE.ROOM;
  document.body.classList.add("is-room");

  let netMod = null;
  let panelMod = null;
  try {
    netMod = await import("../../../src/game-ui/room/net.js");
    panelMod = await import("../../../src/game-ui/room/panel.js");
  } catch (e) {
    el("err").textContent = t("ui.connectFailed", { msg: "room " + (e.message || e) });
    el("err").hidden = false;
    leaveRoom();
    return;
  }
  const realCode = code || netMod.codeFromUrl() || netMod.randomCode();

  show("game");
  el("tip").textContent = t("ui.connecting");
  el("lvName").textContent = t("ui.roomTitle");

  try {
    net = await netMod.openRoom({
      roomName: ROOM_NAME,
      url: netMod.serverUrl(),
      code: realCode,
      name: playerName(),
    });
  } catch (e) {
    net = null;
    el("err").hidden = false;
    el("err").textContent = e && e.full
      ? t("room.full", { code: realCode })
      : t("ui.connectFailed", { msg: e.message || String(e) });
    leaveRoom();
    return;
  }

  netMod.writeRoomToUrl(net.code);

  panel = panelMod.createRoomPanel({
    bar: el("roomBar"),
    lobby: el("lobby"),
    tower: el("tower"),
    t: t,
    denomFor: regionsAt,
    startLabel: function () {
      return t("ui.levelNo", { n: 1 }) + " · " + lvText(levels[0], "title");
    },
    nameDefault: playerName,
    nameFixed: !!usernameFromUrlSafe(),
    inviteUrl: function () { return net.inviteUrl(); },
    onStart: function () {
      if (!net) return;
      net.start({});
      startLevel(0);
    },
    onLeave: leaveRoom,
    onName: function (v) {
      rememberName(v);
      if (net) { net.writeNameToUrl(v); net.setName(v); }
    },
  });
  panel.setCode(net.code);

  el("roomBar").hidden = false;
  el("lobby").hidden = false;
  el("tower").hidden = false;

  net.room.onStateChange(onRoomState);
  net.room.onLeave(function () {
    if (mode === MODE.ROOM) {
      el("err").hidden = false;
      el("err").textContent = t("ui.roomClosed");
    }
  });

  onRoomState();
}

function leaveRoom() {
  stopClock();
  if (net) { try { net.leave(); } catch (e) { /* 已经断了 */ } }
  net = null;
  if (panel) { panel.clear(); panel = null; }
  teardownDungeon();
  game = null;
  timedOut = false;
  document.body.classList.remove("is-room");
  el("roomBar").hidden = true;
  el("lobby").hidden = true;
  el("tower").hidden = true;
  mode = MODE.SOLO;
  renderList();
  show("list");
}

function onRoomState() {
  if (!net || !net.room.state) return;
  const st = net.room.state;
  if (st.players) panel.render(st, net.sessionId);
}

/* ------------------------------- 语言切换 ------------------------------- */

function relocalize() {
  renderList();
  if (mode === MODE.ROOM && net && net.room.state && panel) {
    panel.relocalize();
    panel.render(net.room.state, net.sessionId);
  }
  if (!game) {
    if (mode === MODE.ROOM) el("lvName").textContent = t("ui.roomTitle");
    return;
  }
  if (dungeon) {
    dungeon.relocalize();
    paintChrome();
  }
}

/* -------------------------------- 启动 -------------------------------- */

const MOVE = {
  ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
  w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
  W: [-1, 0], S: [1, 0], A: [0, -1], D: [0, 1],
};

async function boot() {
  mountSwitcher();
  i18n.onChange(relocalize);
  clock = createCountdown({ el: el("clock"), bar: el("timebar"), label: clockLabel, onExpire: timeUp });

  const wantRoom = codeFromUrlSafe();
  if (params().json && wantRoom === null) {
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
    if (confirm(t("ui.resetConfirm"))) { prog.reset(); renderList(); }
  });
  el("btnRetry").addEventListener("click", function () { if (game) startLevel(game.index); });
  el("btnToList").addEventListener("click", toList);
  el("btnPlayWithOthers").addEventListener("click", function () {
    const url = new URL(location.href);
    url.searchParams.set("room", randomRoomCode());
    url.searchParams.delete("json");
    location.assign(url.toString());
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !isCelebrating()) {
      if (game || mode === MODE.ROOM) toList();
      return;
    }
    if (!game || timedOut || isCelebrating()) return;
    const mv = MOVE[e.key];
    if (mv && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      dungeon.stepTo(mv[0], mv[1]);
      paintChrome();
      reportProgress();
    }
  });

  renderList();

  if (wantRoom !== null) {
    enterRoom(wantRoom);
    return;
  }

  const i = startIndex(levels);
  if (i >= 0 && prog.isUnlocked(i)) startLevel(i);
  else if (params().embed) startLevel(0);
}

function clockLabel(msLeft) {
  return timedOut ? t("ui.timeUpShort") : formatClock(msLeft);
}

boot();