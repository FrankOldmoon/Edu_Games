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

const GAME_ID = "memory";
const PACKS = { en: en, "zh-CN": zhCN };
const el = function (id) { return document.getElementById(id); };

let levels = bank.levels || bank;
let prog = null;
let game = null;
let tick = null;

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

function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

function show(view) {
  document.body.dataset.view = view;
  el("viewList").classList.toggle("hidden", view !== "list");
  el("viewGame").classList.toggle("hidden", view !== "game");
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

  paintGameChrome();
  renderBoard();
  show("game");
  startClock();
}

function paintGameChrome() {
  if (!game) return;
  el("lvName").textContent = t("ui.levelNo", { n: game.index + 1 }) + " · " + lvText(game.level, "title");
  el("hint").textContent = lvText(game.level, "tip");
  el("moves").textContent = t("ui.moves", { n: game.moves });
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
    const up = c.matched || game.up.indexOf(i) >= 0;
    b.classList.toggle("is-up", up);
    b.classList.toggle("is-matched", c.matched);
    b.setAttribute("aria-label", up
      ? t("ui.cardUp", { n: i + 1, text: c.text })
      : t("ui.cardDown", { n: i + 1 }));
  });
}

function onCard(i) {
  if (!game || game.busy) return;
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
  stopClock();
  const pairs = (game.level.pairs || []).length;
  const seconds = Math.round((Date.now() - game.startedAt) / 1000);
  const stars = game.moves <= pairs * 1.6 ? 3 : game.moves <= pairs * 2.4 ? 2 : 1;
  const last = game.index === levels.length - 1;
  const index = game.index;
  const moves = game.moves;

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
    locale: i18n.getLocale(),
    moves: moves,
    perfectMoves: pairs,
    seconds: seconds,
  });
  renderList();

  celebrate({
    title: t("ui.win"),
    lines: [
      t("stars" + stars),
      t("ui.winLine", { pairs: pairs, moves: moves, time: fmtTime(seconds * 1000) }),
    ],
    actionLabel: last ? t("ui.allDone") : t("ui.next"),
    onAction: function () {
      if (last) toList();
      else startLevel(index + 1);
    },
  });
}

function toList() {
  stopClock();
  game = null;
  renderList();
  show("list");
}

/* -------------------------------- 计时 -------------------------------- */

function startClock() {
  stopClock();
  const paint = function () {
    if (!game) return;
    el("clock").textContent = fmtTime(Date.now() - game.startedAt);
  };
  paint();
  tick = setInterval(paint, 500);
}

function stopClock() {
  if (tick) {
    clearInterval(tick);
    tick = null;
  }
}

/* ------------------------------- 语言切换 ------------------------------- */

function relocalize() {
  renderList();
  if (!game) return;
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
  el("btnRestart").addEventListener("click", function () { if (game) startLevel(game.index); });
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
