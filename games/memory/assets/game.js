/* Python 术语配对：翻两张牌，把名字和含义配上对。

   关卡库静态引入（Vite 会打进包里），文案按关卡 id 从语言包取；
   按数据键取文案时直接读语言包对象，不走 t() 的点路径 —— 术语里有点号
   （.upper()），点路径会被拆坏。 */

import bank from "../levels.json";
import en from "./locales/en.js";
import zhCN from "./locales/zh-CN.js";
import { i18n, t, mountSwitcher } from "./i18n.js";
import { params, createProgress, startIndex, loadBank, reportResult } from "../../../src/game-ui/progress.js";
import { celebrate, isCelebrating } from "../../../src/game-ui/feedback.js";
import { createCountdown, limitMs, formatClock } from "../../../src/game-ui/timer.js";
import { renderLevelList } from "../../../src/game-ui/levels-ui.js";

const GAME_ID = "memory";
const PACKS = { en: en, "zh-CN": zhCN };
const el = function (id) { return document.getElementById(id); };

const MODE = { SOLO: "solo", ROOM: "room" };
const NAME_KEY = "memory.name";
/* 服务器上这个游戏的房间类型名（见 server/rooms/MemoryRoom.js 的 ROOM_NAME）。
   房间号在服务器内部是 `<这个>-<房号>`，见 src/game-ui/room/net.js 的 roomIdFor。 */
const ROOM_NAME = "memory";

/* 每关限时 = BASE + PER_PAIR × 对数（关卡库里的 timer 可以覆盖）。
   默认：20 秒垫底 + 每对 12 秒 —— 4 对 68 秒，6 对 92 秒。 */
const TIME_BASE = 20;
const TIME_PER_PAIR = 12;

let levels = bank.levels || bank;
let prog = null;
let game = null;
let clock = null;
let timedOut = false;

/* 房间：net 是连接（src/game-ui/room/net.js），panel 是大堂 + 头像塔（room/panel.js）。
   语义和打字游戏一样 —— 点开始只开自己那一局，打完一关自己进下一关，
   塔上只画和你同一关的人。 */
let mode = MODE.SOLO;
let net = null;
let panel = null;

/* 换关卡时加一。翻回去的定时器回调拿翻开时的编号比对，
   对不上就作废 —— 否则上一关那个 780ms 的回调会把新一关刚翻的牌收掉。 */
let turnEpoch = 0;

/* ------------------------------ 文案取值 ------------------------------ */

function packNow() {
  return PACKS[i18n.getLocale()] || PACKS.en;
}

/* 关卡自带的文案优先（?json= 传进来的自定义关卡库可以自带 title/tip/defs），
   其次查语言包，最后回落到空串 / 术语本身。 */
function lvText(lv, field) {
  if (typeof lv[field] === "string") return lv[field];
  const here = packNow().levels && packNow().levels[lv.id];
  if (here && typeof here[field] === "string") return here[field];
  const fb = PACKS.en.levels && PACKS.en.levels[lv.id];
  return fb && typeof fb[field] === "string" ? fb[field] : "";
}

function defOf(lv, term) {
  if (lv.defs && typeof lv.defs[term] === "string") return lv.defs[term];
  const here = packNow().levels && packNow().levels[lv.id];
  if (here && here.defs && typeof here.defs[term] === "string") return here.defs[term];
  const fb = PACKS.en.levels && PACKS.en.levels[lv.id];
  if (fb && fb.defs && typeof fb.defs[term] === "string") return fb.defs[term];
  return term;
}

/* -------------------------------- 工具 -------------------------------- */

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

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

/* -------------------------------- 游戏 -------------------------------- */

function startLevel(i) {
  const lv = levels[i];
  const pairs = lv.pairs || [];

  const cards = [];
  pairs.forEach(function (term, pi) {
    cards.push({ pair: pi, side: "term", text: term, matched: false });
    cards.push({ pair: pi, side: "def", text: defOf(lv, term), matched: false });
  });

  game = {
    index: i,
    level: lv,
    cards: shuffled(cards),
    up: [],
    matchedCount: 0,
    moves: 0,
    startedAt: Date.now(),
    busy: false,
  };
  turnEpoch += 1;

  el("board").classList.remove("failed");
  paintGameChrome();
  renderBoard();
  show("game");
  startClock();
  reportProgress();          /* 房间里：把"我在第几关、配了几对"告诉别人 */
}

function paintGameChrome() {
  if (!game) return;
  el("lvName").textContent = t("ui.levelNo", { n: game.index + 1 }) + " · " + lvText(game.level, "title");
  el("moves").textContent = t("ui.moves", { n: game.moves });

  if (timedOut) {
    el("hint").textContent = t("ui.timeUp");
    return;
  }
  const pairs = (game.level.pairs || []).length;
  const limit = Math.round(limitMs(game.level, pairs, TIME_BASE, TIME_PER_PAIR) / 1000);
  el("hint").textContent = t("ui.timeLimit", { n: limit }) + " · " + lvText(game.level, "tip");
}

function renderBoard() {
  const box = el("board");
  box.style.gridTemplateColumns = "repeat(" + (game.level.cols || 4) + ", minmax(0, 1fr))";
  box.innerHTML = "";

  game.cards.forEach(function (c, i) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "card " + (c.side === "term" ? "is-term" : "is-def");

    const inner = document.createElement("div");
    inner.className = "inner";

    const back = document.createElement("div");
    back.className = "face back";
    back.setAttribute("aria-hidden", "true");
    back.textContent = "?";

    const front = document.createElement("div");
    front.className = "face front";
    front.setAttribute("aria-hidden", "true");
    front.textContent = c.text;

    inner.append(back, front);
    b.appendChild(inner);
    b.addEventListener("click", function () { onCard(i); });
    box.appendChild(b);
  });

  syncCards();
}

function syncCards() {
  const nodes = el("board").children;
  game.cards.forEach(function (c, i) {
    const b = nodes[i];
    if (!b) return;
    const up = c.matched || game.reveal || game.up.indexOf(i) >= 0;
    b.classList.toggle("is-up", up);
    b.classList.toggle("is-matched", c.matched);
    b.setAttribute("aria-label", up
      ? t("ui.cardUp", { n: i + 1, text: c.text })
      : t("ui.cardDown", { n: i + 1 }));
  });
}

function onCard(i) {
  if (!game || game.busy || timedOut) return;
  const c = game.cards[i];
  if (c.matched || game.up.indexOf(i) >= 0) return;

  game.up.push(i);
  syncCards();
  if (game.up.length < 2) return;

  game.moves += 1;
  el("moves").textContent = t("ui.moves", { n: game.moves });

  const a = game.cards[game.up[0]];
  const b = game.cards[game.up[1]];

  if (a.pair === b.pair && a.side !== b.side) {
    a.matched = true;
    b.matched = true;
    game.matchedCount += 1;
    game.up = [];
    syncCards();
    reportProgress();        /* 配上一对就报一次 —— 同房间的人看着你往上爬 */
    if (game.matchedCount === (game.level.pairs || []).length) win();
    return;
  }

  /* 没配上：把两张翻回去 */
  game.busy = true;
  const myTurn = turnEpoch;
  setTimeout(function () {
    if (!game || turnEpoch !== myTurn) return;
    game.up = [];
    game.busy = false;
    syncCards();
  }, 780);
}

function win() {
  clock.stop();
  const pairs = (game.level.pairs || []).length;
  const left = clock.leftSeconds();
  const seconds = Math.round((Date.now() - game.startedAt) / 1000);
  const stars = game.moves <= pairs * 1.6 ? 3 : game.moves <= pairs * 2.4 ? 2 : 1;
  const last = game.index === levels.length - 1;
  const index = game.index;
  const moves = game.moves;

  el("board").classList.remove("failed");
  prog.mark(game.level.id);
  reportResult(GAME_ID, {
    level: index + 1,
    levelId: game.level.id,
    levelTitle: lvText(game.level, "title"),
    correct: pairs,
    total: pairs,
    rate: 1,
    progress: prog.ratio(),
    finished: last,
    timedOut: false,
    locale: i18n.getLocale(),
    moves: moves,
    perfectMoves: pairs,
    seconds: seconds,
    timeLeft: left,
  });
  renderList();

  celebrate({
    title: t("ui.win"),
    lines: [
      t("ui.stars" + stars),
      t("ui.winLine", { pairs: pairs, moves: moves, time: formatClock(seconds * 1000) }),
      t("ui.leftTime", { n: left }),
    ],
    actionLabel: last ? t("ui.allDone") : t("ui.next"),
    onAction: function () {
      if (last) toList();
      else startLevel(index + 1);
    },
  });
}

function toList() {
  if (mode === MODE.ROOM) {
    leaveRoom();
    return;
  }
  stopClock();
  game = null;
  renderList();
  show("list");
}

/* -------------------------------- 计时 -------------------------------- */

function startClock() {
  const pairs = (game.level.pairs || []).length;
  timedOut = false;
  clock.start(limitMs(game.level, pairs, TIME_BASE, TIME_PER_PAIR));
}

function stopClock() {
  if (clock) clock.stop();
}

function timeUp() {
  if (!game || timedOut) return;
  timedOut = true;
  game.busy = true;
  game.reveal = true;              /* 时间到就把牌全翻开，让人看清错过了什么 */
  el("board").classList.add("failed");
  syncCards();
  paintGameChrome();
  reportProgress();          /* 时间到也是当前的进度，服务器照它记着 */
  reportResult(GAME_ID, {
    level: game.index + 1,
    levelId: game.level.id,
    levelTitle: lvText(game.level, "title"),
    correct: game.matchedCount,
    total: (game.level.pairs || []).length,
    rate: game.matchedCount / Math.max(1, (game.level.pairs || []).length),
    progress: prog.ratio(),
    finished: false,
    timedOut: true,
    locale: i18n.getLocale(),
    moves: game.moves,
  });
}

/* ------------------------------ 房间（多人） ------------------------------ */

/* 房间那一层（连接、大堂、头像塔）在 src/game-ui/room/ 里，和打字游戏共用一份。
   这里只写配对特有的东西：进度怎么算、什么时候报。

   和打字最大的不同：服务器**验不了**配对对不对 —— 牌面只存在于各人自己的浏览器里，
   而且每人洗牌不同，服务器看不见就不该假装知道。
   所以这里报的是"我在第几关、这一关配上了几对"，服务器只做区间检查。
   对课堂来说够了：要的是"看得见谁在第几关"，不是防作弊。

   好处是这里不需要打字那套"回推权威位置"：每一条 progress 都带着完整的
   "第几关 + 配了几对"，被限流丢掉一条也没关系，下一条自己就修正回来了。 */

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

/* 我这一关一共几对 —— 塔上的纵向比例要用它当分母。
   分母从本地题库取（两边是同一个 levels.json）。 */
function pairsAt(i) {
  const lv = levels[i];
  return lv && Array.isArray(lv.pairs) ? lv.pairs.length : 0;
}

/* 上报"我在第几关、这一关配上了几对"。每一条都是完整的真相。 */
function reportProgress() {
  if (mode !== MODE.ROOM || !net || !game) return;
  net.progress({ level: game.index, pos: game.matchedCount });
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
  el("hint").textContent = t("ui.connecting");
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
    /* 房间满了不是"连不上服务器"，得让人知道该换个房号 */
    el("err").textContent = e && e.full
      ? t("room.full", { code: realCode })
      : t("ui.connectFailed", { msg: e.message || String(e) });
    leaveRoom();          /* 连不上就回单人，不把人卡在白屏上 */
    return;
  }

  netMod.writeRoomToUrl(net.code);

  panel = panelMod.createRoomPanel({
    bar: el("roomBar"),
    lobby: el("lobby"),
    tower: el("tower"),
    t: t,
    denomFor: pairsAt,
    /* 开始按钮旁边那句：一按就从第 1 关起 */
    startLabel: function () {
      return t("ui.levelNo", { n: 1 }) + " · " + lvText(levels[0], "title");
    },
    nameDefault: playerName,
    nameFixed: !!usernameFromUrlSafe(),   /* ?username= 指定的名字不给改 */
    inviteUrl: function () { return net.inviteUrl(); },
    /* 点开始：只开我自己这一局 —— 本地把第 1 关的牌摆出来，同时告诉服务器我开始了 */
    onStart: function () {
      if (!net) return;
      net.start({});
      startLevel(0);
    },
    onLeave: leaveRoom,
    onName: function (v) {
      rememberName(v);
      if (net) {
        net.writeNameToUrl(v);        /* 写回地址栏，刷新之后名字还在 */
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
  stopClock();
  if (net) {
    try { net.leave(); } catch (e) { /* 已经断了 */ }
  }
  net = null;
  if (panel) {
    panel.clear();
    panel = null;
  }
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

/* 谁在、谁在第几关、塔上画谁 —— 全交给 panel。
   这里不需要"服务器 → 本地"地推进关卡：关卡本来就是本地推进的
   （牌在我这儿，配完就是配完了），服务器只负责记着给别人看。 */
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
  const pairs = game.level.pairs || [];
  game.cards.forEach(function (c) {
    c.text = c.side === "term" ? pairs[c.pair] : defOf(game.level, pairs[c.pair]);
  });
  paintGameChrome();
  renderBoard();   /* 从 game.cards 重画，翻开的牌和已配对状态都在 */
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
  el("btnRestart").addEventListener("click", function () { if (game) startLevel(game.index); });
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
