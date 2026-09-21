/* 指令机器人：用五条指令编一段程序，让机器人把包裹送到收货点。

   教的是「一段程序是一串按顺序执行的原子指令，执行者带着状态（位置、朝向、货）」。
   每条指令占一步，步数上限逼着玩家把路线想清楚；「次数」那一列就是计数循环的雏形。 */

import bank from "../levels.json";
import en from "./locales/en.js";
import zhCN from "./locales/zh-CN.js";
import { i18n, t, mountSwitcher } from "./i18n.js";
import { params, createProgress, startIndex, loadBank, reportResult } from "../../../src/game-ui/progress.js";
import { celebrate, isCelebrating } from "../../../src/game-ui/feedback.js";
import { createCountdown, limitMs, formatClock } from "../../../src/game-ui/timer.js";
import { renderLevelList } from "../../../src/game-ui/levels-ui.js";

const GAME_ID = "robot";
const PACKS = { en: en, "zh-CN": zhCN };
const el = function (id) { return document.getElementById(id); };

const MODE = { SOLO: "solo", ROOM: "room" };
const NAME_KEY = "robot.name";
/* 服务器上这个游戏的房间类型名（见 server/index.js 的 ROBOT）。
   房间号在服务器内部是 `<这个>-<房号>`，见 src/game-ui/room/net.js 的 roomIdFor。 */
const ROOM_NAME = "robot";

/* 每关限时 = BASE + PER_STEP × 步数上限（关卡库里的 timer 可以覆盖）。
   默认：25 秒垫底 + 每步 6 秒 —— 上限 7 步的关 67 秒，20 步的大关 145 秒。 */
const TIME_BASE = 25;
const TIME_PER_STEP = 6;

const CELL = 46;
const DIRS = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };
const ORDER = ["E", "S", "W", "N"];
const ROT = { E: 0, S: 90, W: 180, N: 270 };
const GLYPH = { F: "▲", L: "↰", R: "↱", P: "✋", D: "⬇" };

let levels = bank.levels || bank;
let prog = null;
let game = null;
let runState = null;
let running = false;
let runTimer = null;
let statusState = null;
let clock = null;
let timedOut = false;
let epoch = 0;   /* 换关/改程序/复位都加一，让在跑的定时器作废 */

/* 房间：net 是连接（src/game-ui/room/net.js），panel 是大堂 + 头像塔（room/panel.js）。
   语义和别的游戏一样 —— 点开始只开自己那一局，过关自己进下一关，
   塔上只画和你同一关的人。 */
let mode = MODE.SOLO;
let net = null;
let panel = null;

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

function opName(op) {
  return t("ui.op" + op);
}

function setStatus(key, vars) {
  statusState = key ? { key: key, vars: vars } : null;
  el("status").textContent = key ? t(key, vars) : "";
}

/* ------------------------------ 地图解析 ------------------------------ */

function parseMap(mapRows) {
  const walls = {}, goals = {}, parcels = {};
  let start = null, cols = 0;
  mapRows.forEach(function (row, y) {
    if (row.length > cols) cols = row.length;
    for (let x = 0; x < row.length; x++) {
      const ch = row.charAt(x);
      const k = x + "," + y;
      if (ch === "#") walls[k] = true;
      else if (ch === "*") parcels[k] = (parcels[k] || 0) + 1;
      else if (ch === "G") goals[k] = true;
      else if (ch === "R") start = { x: x, y: y };
    }
  });
  return { walls: walls, goals: goals, parcels: parcels, start: start, cols: cols, rows: mapRows.length };
}

function turn(facing, delta) {
  const i = ORDER.indexOf(facing);
  return ORDER[(i + delta + ORDER.length) % ORDER.length];
}

/* -------------------------------- 视图 -------------------------------- */

/* 视图切换：只改 body[data-view]，该显示哪半边交给 base.css 的
   .list-only / .game-only 决定，和 spot-the-difference 一致。 */
function show(view) {
  document.body.dataset.view = view;
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

/* -------------------------------- 关卡 -------------------------------- */

function startLevel(i) {
  const lv = levels[i];
  const world = parseMap(lv.map || []);
  let total = 0;
  Object.keys(world.parcels).forEach(function (k) { total += world.parcels[k]; });
  game = {
    index: i,
    level: lv,
    world: world,
    totalParcels: total,
    program: [],
    reported: -1,      /* 上一次报给房间的"已送达件数"，用来少发重复的 */
  };
  el("lvName").textContent = t("ui.levelNo", { n: i + 1 }) + " · " + lvText(lv, "title");
  el("tip").textContent = lvText(lv, "tip");
  document.querySelector(".wrap").classList.remove("failed");
  setControlsEnabled(true);
  buildBoard();
  rewound();
  show("game");
  timedOut = false;
  clock.start(limitMs(lv, lv.max || 0, TIME_BASE, TIME_PER_STEP));
}

/* 时间到之后把控制都锁住：用 disabled 而不是静默忽略点击，玩家看得见 */
function setControlsEnabled(on) {
  el("btnRun").disabled = !on;
  el("btnStep").disabled = !on;
  Array.prototype.forEach.call(el("palette").querySelectorAll("button"), function (b) {
    b.disabled = !on;
  });
}

function rewound() {
  const w = game.world;
  runState = {
    x: w.start.x,
    y: w.start.y,
    facing: game.level.facing || "E",
    cargo: 0,
    parcels: Object.assign({}, w.parcels),
    step: 0,
    done: false,
    failed: false,
  };
  stopRun();
  setStatus(null);
  render();
  reportProgress();    /* 复位之后进度是 0，房间里的人立刻看到 */
}

/* -------------------------------- 渲染 -------------------------------- */

function buildBoard() {
  const board = el("board");
  const w = game.world;
  board.innerHTML = "";
  board.style.width = (w.cols * CELL) + "px";
  board.style.height = (w.rows * CELL) + "px";

  for (let y = 0; y < w.rows; y++) {
    for (let x = 0; x < w.cols; x++) {
      const k = x + "," + y;
      const d = document.createElement("div");
      d.className = "tile " + (w.walls[k] ? "wall" : (w.goals[k] ? "goal" : "floor"));
      d.style.left = (x * CELL) + "px";
      d.style.top = (y * CELL) + "px";
      board.appendChild(d);
    }
  }

  game.parcelLayer = document.createElement("div");
  board.appendChild(game.parcelLayer);

  const robot = document.createElement("div");
  robot.className = "robot";
  const body = document.createElement("div");
  body.className = "body";
  body.textContent = "▲";
  robot.appendChild(body);
  board.appendChild(robot);
  game.robotEl = robot;
  game.robotBody = body;
}

function render() {
  if (!game) return;
  renderBoard();
  renderProgram();
  renderBudget();
}

function renderBoard() {
  const layer = game.parcelLayer;
  layer.innerHTML = "";
  Object.keys(runState.parcels).forEach(function (k) {
    const n = runState.parcels[k];
    if (n <= 0) return;
    const parts = k.split(",");
    for (let i = 0; i < n; i++) {
      const p = document.createElement("div");
      p.className = "parcel";
      p.style.left = (parseInt(parts[0], 10) * CELL) + "px";
      p.style.top = (parseInt(parts[1], 10) * CELL) + "px";
      layer.appendChild(p);
    }
  });
  game.robotEl.style.transform = "translate(" + (runState.x * CELL) + "px," + (runState.y * CELL) + "px)";
  game.robotBody.style.transform = "rotate(" + ROT[runState.facing] + "deg)";
}

/* 每个程序行占多少扁平步：[起, 止) */
function rowRanges() {
  const out = [];
  let acc = 0;
  game.program.forEach(function (row) {
    const n = Math.max(1, Math.min(99, row.n | 0));
    out.push([acc, acc + n]);
    acc += n;
  });
  return out;
}

function flatOps() {
  const out = [];
  game.program.forEach(function (row) {
    const n = Math.max(1, Math.min(99, row.n | 0));
    for (let i = 0; i < n; i++) out.push(row.op);
  });
  return out;
}

function renderProgram() {
  const box = el("prog");
  box.innerHTML = "";
  if (!game.program.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = t("ui.empty");
    box.appendChild(li);
    return;
  }

  const ranges = rowRanges();
  const at = runState.step;

  game.program.forEach(function (row, i) {
    const range = ranges[i];
    const li = document.createElement("li");
    li.className = "prow";
    if (at > 0 && at >= range[0] && at < range[1]) li.classList.add("is-now");
    else if (at >= range[1]) li.classList.add("is-past");

    const no = document.createElement("span");
    no.className = "pno";
    no.textContent = String(i + 1);

    const glyph = document.createElement("span");
    glyph.className = "pglyph";
    glyph.textContent = GLYPH[row.op];

    const name = document.createElement("span");
    name.className = "pname";
    name.textContent = opName(row.op);

    const cntwrap = document.createElement("span");
    cntwrap.className = "cntwrap";
    const times = document.createElement("span");
    times.textContent = "×";
    const cnt = document.createElement("input");
    cnt.className = "cnt";
    cnt.type = "number";
    cnt.min = "1";
    cnt.max = "99";
    cnt.value = String(row.n);
    cnt.setAttribute("aria-label", t("ui.countAria"));
    cnt.addEventListener("change", function () {
      const v = parseInt(cnt.value, 10);
      row.n = isNaN(v) ? 1 : Math.max(1, Math.min(99, v));
      rewound();
    });
    cntwrap.append(times, cnt);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "mini";
    del.textContent = "×";
    del.setAttribute("aria-label", t("ui.delAria", { n: i + 1 }));
    del.addEventListener("click", function () {
      game.program.splice(i, 1);
      rewound();
    });

    li.setAttribute("aria-label", t("ui.rowAria", { n: i + 1, op: opName(row.op), count: row.n }));
    li.append(no, glyph, name, cntwrap, del);
    box.appendChild(li);
  });
}

function planSteps() {
  let n = 0;
  game.program.forEach(function (row) { n += Math.max(1, Math.min(99, row.n | 0)); });
  return n;
}

function renderBudget() {
  const max = game.level.max;
  const limit = Math.round(limitMs(game.level, max, TIME_BASE, TIME_PER_STEP) / 1000);
  el("steps").textContent = t("ui.budget", { used: runState.step, max: max });
  el("budget").textContent = t("ui.plan", { n: planSteps() }) +
    " · " + t("ui.bestLine", { best: game.level.best }) +
    " · " + t("ui.timeLimit", { n: limit });
}

/* ------------------------------- 解释执行 ------------------------------- */

/* 通关条件：手里没货、每一件都在收货点上、且一件都没少。
   只判断「没有包裹落在非收货点」是不够的 —— 拿在手里的包裹根本不在图上，
   那样刚捡起最后一件就会被判成通关。 */
function allDelivered() {
  if (runState.cargo > 0) return false;
  let onGoals = 0;
  const parcels = runState.parcels;
  Object.keys(parcels).forEach(function (k) {
    const n = parcels[k];
    if (n > 0 && game.world.goals[k]) onGoals += n;
  });
  return onGoals === game.totalParcels;
}

/* 还没送到收货点的件数（含手上拿着的） */
function parcelsLeft() {
  let left = runState.cargo;
  const parcels = runState.parcels;
  Object.keys(parcels).forEach(function (k) {
    if (parcels[k] > 0 && !game.world.goals[k]) left += parcels[k];
  });
  return left;
}

function applyOp(op) {
  const s = runState;

  if (op === "L") { s.facing = turn(s.facing, -1); return true; }
  if (op === "R") { s.facing = turn(s.facing, 1); return true; }

  const k = s.x + "," + s.y;

  if (op === "P") {
    if ((s.parcels[k] || 0) > 0) {
      s.parcels[k] -= 1;
      s.cargo += 1;
    }
    return true;
  }

  if (op === "D") {
    if (s.cargo > 0) {
      s.cargo -= 1;
      s.parcels[k] = (s.parcels[k] || 0) + 1;
    }
    return true;
  }

  const d = DIRS[s.facing];
  const nx = s.x + d[0];
  const ny = s.y + d[1];
  if (nx < 0 || ny < 0 || nx >= game.world.cols || ny >= game.world.rows) return false;
  if (game.world.walls[nx + "," + ny]) return false;
  s.x = nx;
  s.y = ny;
  return true;
}

function stopRun() {
  running = false;
  if (runTimer) {
    clearTimeout(runTimer);
    runTimer = null;
  }
}

/* 走一步。返回 true 表示还能继续 */
function stepOnce() {
  if (runState.done || runState.failed) return false;

  const flat = flatOps();
  if (runState.step >= flat.length) {
    setStatus("ui.notDone", { left: parcelsLeft() });
    runState.failed = true;
    render();
    return false;
  }

  if (runState.step >= game.level.max) {
    setStatus("ui.outOfSteps", { max: game.level.max });
    runState.failed = true;
    render();
    return false;
  }

  const ok = applyOp(flat[runState.step]);
  runState.step += 1;

  if (!ok) {
    setStatus("ui.bumped", { n: runState.step });
    runState.failed = true;
    game.robotEl.classList.add("bump");
    render();
    setTimeout(function () { if (game) game.robotEl.classList.remove("bump"); }, 400);
    return false;
  }

  render();
  reportProgress();
  if (allDelivered()) {
    win();
    return false;
  }
  return true;
}

function doRun() {
  if (running || timedOut) return;
  if (!game.program.length) {
    setStatus("ui.needProgram");
    return;
  }
  if (runState.done || runState.failed) rewound();

  running = true;
  setStatus("ui.running");
  const myEpoch = epoch;

  const tick = function () {
    if (myEpoch !== epoch || !running) return;
    if (stepOnce()) runTimer = setTimeout(tick, 230);
    else stopRun();
  };
  tick();
}

function win() {
  stopRun();
  clock.stop();
  runState.done = true;
  setStatus(null);

  const last = game.index === levels.length - 1;
  const index = game.index;
  const steps = runState.step;
  const best = game.level.best || steps;
  const max = game.level.max || steps;
  const left = clock.leftSeconds();

  document.querySelector(".wrap").classList.remove("failed");
  prog.mark(game.level.id);
  reportProgress();
  reportResult(GAME_ID, {
    level: index + 1,
    levelId: game.level.id,
    levelTitle: lvText(game.level, "title"),
    correct: best,
    total: steps,
    rate: Math.min(1, best / steps),
    progress: prog.ratio(),
    finished: last,
    timedOut: false,
    locale: i18n.getLocale(),
    steps: steps,
    best: best,
    max: max,
    timeLeft: left,
  });
  renderList();

  const stars = steps <= best ? 3 : steps <= best + 3 ? 2 : 1;
  celebrate({
    title: t("ui.win"),
    lines: [
      t("star" + stars),
      t("ui.winLine", { steps: steps, best: best }),
      t("ui.leftTime", { n: left }),
    ],
    actionLabel: last ? t("ui.allDone") : t("ui.next"),
    onAction: function () {
      if (last) toList();
      else startLevel(index + 1);
    },
  });
}

/* 时间到：停掉还在跑的执行、锁住控制、圈红工作区并报到 */
function timeUp() {
  if (!game || timedOut) return;
  timedOut = true;
  stopRun();
  setControlsEnabled(false);
  document.querySelector(".wrap").classList.add("failed");
  setStatus("ui.timeUp");
  reportResult(GAME_ID, {
    level: game.index + 1,
    levelId: game.level.id,
    levelTitle: lvText(game.level, "title"),
    correct: 0,
    total: game.level.max || 0,
    rate: 0,
    progress: prog.ratio(),
    finished: false,
    timedOut: true,
    locale: i18n.getLocale(),
    steps: runState ? runState.step : 0,
    best: game.level.best,
    max: game.level.max,
  });
}

function toList() {
  if (mode === MODE.ROOM) {
    leaveRoom();
    return;
  }
  stopRun();
  clock.stop();
  game = null;
  runState = null;
  renderList();
  show("list");
}

/* ------------------------------ 房间（多人） ------------------------------ */

/* 房间那一层（连接、大堂、头像塔）在 src/game-ui/room/ 里，几个游戏共用一份。
   这里只写机器人特有的东西：进度怎么算、什么时候报。

   和配对一样，服务器**验不了**：地图在客户端手上，服务器看不见机器人是怎么走的，
   所以只做范围检查（一关一关往前、不超过这一关的包裹数），关卡由客户端推。
   每一条上报都带着完整的真相，丢一条下一条自己就修正回来了。 */

/* 名字：?username=Ada 最优先 —— 老师可以把名字写进链接发给每个人。
   其次是上次存下来的，最后才随便给一个"玩家 37"。 */
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
  try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* 无痕模式 */ }
}

function playerName() {
  const fromUrl = usernameFromUrlSafe();
  if (fromUrl) {
    rememberName(fromUrl);
    return fromUrl;
  }
  let saved = "";
  try { saved = localStorage.getItem(NAME_KEY) || ""; } catch (e) { /* ignore */ }
  if (saved) return saved;
  const auto = t("ui.playerNo", { n: 1 + Math.floor(Math.random() * 99) });
  rememberName(auto);
  return auto;
}

/* 这一关一共要送几件（塔上的分母）：从本地题库数 '*'。
   和 server/index.js 的 countParcels 数的是同一件事，两边必须是同一个题库。 */
function parcelsAt(i) {
  const lv = levels[i];
  if (!lv || !Array.isArray(lv.map)) return 0;
  let n = 0;
  lv.map.forEach(function (row) {
    for (let k = 0; k < row.length; k++) if (row.charAt(k) === "*") n += 1;
  });
  return n;
}

/* 已经送到收货点的件数 = 总数 − 还在地上的（含手上拿着的） */
function delivered() {
  if (!game || !runState) return 0;
  return game.totalParcels - parcelsLeft();
}

/* 走一步就报一次；和上次一样就不发，省掉一堆没用的消息 */
function reportProgress() {
  if (mode !== MODE.ROOM || !net || !game) return;
  const done = delivered();
  if (done === game.reported) return;
  game.reported = done;
  net.progress({ level: game.index, pos: done });
}

async function enterRoom(code) {
  mode = MODE.ROOM;
  document.body.classList.add("is-room");

  /* 房间那一层是动态 import 的：不进房间就永远不会加载 colyseus.js */
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
  el("status").textContent = "";
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
    el("err").textContent = t("ui.connectFailed", { msg: e.message || String(e) });
    leaveRoom();          /* 连不上就回单人，不把人卡在白屏上 */
    return;
  }

  netMod.writeRoomToUrl(net.code);

  panel = panelMod.createRoomPanel({
    bar: el("roomBar"),
    lobby: el("lobby"),
    tower: el("tower"),
    t: t,
    denomFor: parcelsAt,
    /* 开始按钮旁边那句：一按就从第 1 关起 */
    startLabel: function () {
      return t("ui.levelNo", { n: 1 }) + " · " + lvText(levels[0], "title");
    },
    nameDefault: playerName,
    inviteUrl: function () { return net.mod.inviteUrl(net.code); },
    /* 点开始：只开我自己这一局 —— 本地摆出第 1 关的仓库，同时告诉服务器我开始了 */
    onStart: function () {
      if (!net) return;
      net.start({});
      startLevel(0);
    },
    onLeave: leaveRoom,
    onName: function (v) {
      rememberName(v);
      if (net) {
        net.mod.writeNameToUrl(v);    /* 写回地址栏，刷新之后名字还在 */
        net.setName(v);
      }
    },
  });
  panel.setCode(net.code);

  el("roomBar").hidden = false;
  el("lobby").hidden = false;     /* 还没点"开始"：改名字、看谁进来了 */
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
  stopRun();
  clock.stop();
  if (net) {
    try { net.leave(); } catch (e) { /* 已经断了 */ }
  }
  net = null;
  if (panel) {
    panel.clear();
    panel = null;
  }
  game = null;
  runState = null;
  timedOut = false;
  document.body.classList.remove("is-room");
  el("roomBar").hidden = true;
  el("lobby").hidden = true;
  el("tower").hidden = true;
  mode = MODE.SOLO;
  renderList();
  show("list");
}

/* 谁在、谁在第几关、塔上画谁 —— 全交给 panel。
   关卡本来就是本地推进的（仓库在我这儿，送到了就是送到了），服务器只记着给别人看。 */
function onRoomState() {
  if (!net || !net.room.state) return;
  const st = net.room.state;
  if (!st.players) return;
  if (panel) panel.render(st, net.sessionId);
}

/* ------------------------------- 语言切换 ------------------------------- */

function relocalize() {
  renderList();
  /* 房间里的房间号 / 邀请 / 离开 / 名字 / 开始 / 同关提示是共用文案，重新刷一遍 */
  if (mode === MODE.ROOM && net && net.room.state && panel) {
    panel.relocalize();
    panel.render(net.room.state, net.sessionId);
  }
  if (!game) {
    if (mode === MODE.ROOM) el("lvName").textContent = t("ui.roomTitle");
    return;
  }
  el("lvName").textContent = t("ui.levelNo", { n: game.index + 1 }) + " · " + lvText(game.level, "title");
  el("tip").textContent = lvText(game.level, "tip");
  renderProgram();
  renderBudget();
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

  el("palette").addEventListener("click", function (e) {
    const btn = e.target.closest ? e.target.closest("button[data-op]") : null;
    if (!btn || !game || timedOut) return;
    game.program.push({ op: btn.getAttribute("data-op"), n: 1 });
    epoch += 1;
    rewound();
  });

  el("btnRun").addEventListener("click", doRun);
  el("btnStep").addEventListener("click", function () {
    if (!game || running || timedOut) return;
    if (!game.program.length) {
      setStatus("ui.needProgram");
      return;
    }
    if (runState.done || runState.failed) rewound();
    stepOnce();
  });
  el("btnRewind").addEventListener("click", function () {
    if (!game) return;
    epoch += 1;
    /* 房间里时间到之后控制会被锁住，btnRewind 是唯一出路 —— 那就当作"重来这一关" */
    if (mode === MODE.ROOM && timedOut) startLevel(game.index);
    else rewound();
  });
  el("btnClear").addEventListener("click", function () {
    if (!game) return;
    game.program = [];
    epoch += 1;
    rewound();
  });
  el("btnToList").addEventListener("click", toList);
  /* 房间条 / 大堂 / 头像塔里的按钮（开始、离开、邀请、改名）由 panel 接管，见 enterRoom */
  el("btnPlayWithOthers").addEventListener("click", function () {
    /* 新建一间：随机房号写进 URL，然后照常进房 —— 复制链接就能请人进来 */
    const url = new URL(location.href);
    url.searchParams.set("room", randomRoomCode());
    location.assign(url.toString());
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || isCelebrating()) return;
    if (game || mode === MODE.ROOM) toList();
  });

  renderList();

  /* ?room= 出现就进房间。注意只算一次：?room= 空着时每次算出来的随机房号都不一样 */
  const wanted = codeFromUrlSafe();
  if (wanted !== null) {
    enterRoom(wanted);
    return;
  }

  const i = startIndex(levels);
  if (i >= 0 && prog.isUnlocked(i)) startLevel(i);
  else if (params().embed) startLevel(0);
}

/* boot 里没法 await room/net.js（那会把 colyseus.js 拉进初始包），
   所以这里用一份不含动态 import 的小工具读 ?room= / 生成随机房号 */
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

boot();
