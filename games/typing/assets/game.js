/* Python 代码打字：照着敲出每一行 Python，标点、引号、缩进都要一模一样。

   两种模式共用同一套判定 —— 核心只有一个数：「这一关已经完成几个字符」board.pos。
     · 单人：pos 就是本地真相。正计时、没有上限，比的是准确率和速度。
     · 多人：一场比赛是一串关卡，谁先跑完最后一关谁赢。过一关**立刻**进下一关，
       不必等别人，所以每个人各有各的关卡和位置；塔上只画同关的人。
       pos 由服务器裁决：本地先乐观前进（不然一个来回就卡一下），
       服务器说不对就把权威位置推回去（resync）。
   计时两处都是正计时：单人用 src/game-ui/timer.js 的 createStopwatch；
   多人用服务器时钟现算（raceTick），因为开赛时刻是服务器给的 ——
   整场跑完才停表，中途过多少关都算在同一条时间里。
   进度条那一条滑块也从"还剩多少"变成"这一关打完了多少"（createBar）。

   判定模型：
     敲对 → pos 前进；敲错 → 原地红闪（多人时错误数只是本地的展示值 ——
     服务器看不见按键，也就不该声称知道）
     Backspace 退回（改错不算错）；Tab 一次顶四个空格；必须整个敲完才算过一关 */

import bank from "../levels.json";
import en from "./locales/en.js";
import zhCN from "./locales/zh-CN.js";
import { i18n, t, mountSwitcher } from "./i18n.js";
import { params, createProgress, startIndex, loadBank, reportResult } from "../../../src/game-ui/progress.js";
import { celebrate, isCelebrating } from "../../../src/game-ui/feedback.js";
import { createBar, createStopwatch, formatElapsed } from "../../../src/game-ui/timer.js";
import { renderLevelList } from "../../../src/game-ui/levels-ui.js";

const GAME_ID = "typing";
const PACKS = { en: en, "zh-CN": zhCN };
const el = function (id) { return document.getElementById(id); };

const MODE = { SOLO: "solo", RACE: "race" };
const PHASE = { LOBBY: "lobby", COUNTDOWN: "countdown", RACING: "racing", DONE: "done" };

const BAD_FLASH_MS = 260;
const INDENT = 4;
const LANES = 3;              /* 头像塔的泳道数，人多了就往同一条里叠（会往上抬一点错开） */
const NAME_KEY = "typing.name";
/* 本地比服务器晚这么一点点才放开键盘：时钟总有误差，早敲的那几个键服务器会拒掉，
   退回去重打就白打了。给所有人同样的一点点宽限，既不偏袒谁，也不会白打。 */
const START_GRACE_MS = 40;

/* 头像不进 schema：sessionId 一样，各客户端算出来的就一样，零资源、不会不同步 */
const AVATARS = ["🦊", "🐼", "🐸", "🐙", "🦉", "🐧", "🐝", "🐢", "🦄", "🐳", "🦋", "🐰"];

let levels = bank.levels || bank;
let prog = null;

let mode = MODE.SOLO;
let board = { text: "", chars: [], spans: [], pos: 0 };
let stats = { hits: 0, keys: 0, errors: 0 };
let watch = null;
let bar = null;
let badTimer = null;

/* 单人 */
let solo = null;

/* 多人 */
let net = null;
let race = null;
let raceTickId = null;
const towerChips = new Map();

/* ------------------------------ 文案取值 ------------------------------ */

function packNow() {
  return PACKS[i18n.getLocale()] || PACKS.en;
}

/* 关卡自带的文案优先（?json= 传进来的自定义关卡库可以自带 title/tip），其次查语言包 */
function lvText(lv, field) {
  if (!lv) return "";
  if (typeof lv[field] === "string") return lv[field];
  const here = packNow().levels && packNow().levels[lv.id];
  if (here && typeof here[field] === "string") return here[field];
  const fb = PACKS.en.levels && PACKS.en.levels[lv.id];
  return fb && typeof fb[field] === "string" ? fb[field] : "";
}

function levelById(id) {
  for (let i = 0; i < levels.length; i++) if (levels[i].id === id) return levels[i];
  return null;
}

function levelNoById(id) {
  for (let i = 0; i < levels.length; i++) if (levels[i].id === id) return i + 1;
  return 1;
}

function show(view) {
  document.body.dataset.view = view;
}

function avatarFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

/* ------------------------------ 关卡列表 ------------------------------ */

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

/* ------------------------------ 共享面板 ------------------------------ */

/* 目标文本拆成一个个 span。换行渲染成 ↵ 加一个 <br>，它同样是必须敲的目标字符。
   容器是 white-space: pre，所以空格和缩进原样保留。 */
function renderBoard(text) {
  const box = el("code");
  board.text = text;
  board.chars = Array.from(text);
  board.spans = [];
  box.innerHTML = "";

  board.chars.forEach(function (ch) {
    if (ch === "\n") {
      const nl = document.createElement("span");
      nl.className = "ch nl";
      nl.textContent = "↵";
      nl.setAttribute("aria-hidden", "true");
      box.append(nl, document.createElement("br"));
      board.spans.push(nl);
      return;
    }
    const s = document.createElement("span");
    s.className = "ch";
    s.textContent = ch;
    box.appendChild(s);
    board.spans.push(s);
  });

  syncBoard();
  box.scrollLeft = 0;
}

/* 光标就是一个高亮的字符块 —— 不用去量文本宽度，空格和换行也能看见 */
function syncBoard() {
  for (let i = 0; i < board.spans.length; i++) {
    const s = board.spans[i];
    s.classList.toggle("ok", i < board.pos);
    s.classList.toggle("cur", i === board.pos);
  }
}

function paintBar() {
  if (bar) bar.set(board.pos / Math.max(1, board.chars.length), false);
}

function clearBad() {
  if (badTimer) {
    clearTimeout(badTimer);
    badTimer = null;
  }
}

function flashBad(i) {
  const s = board.spans[i];
  if (!s) return;
  s.classList.remove("bad");
  void s.offsetWidth;                 /* 强制回流，否则动画不会重放 */
  s.classList.add("bad");
  if (badTimer) clearTimeout(badTimer);
  badTimer = setTimeout(function () {
    s.classList.remove("bad");
    badTimer = null;
  }, BAD_FLASH_MS);
}

/* ------------------------------ 读数 ------------------------------ */

function elapsedMs() {
  if (mode === MODE.SOLO) return watch ? watch.elapsedMs() : 0;
  if (!race) return 0;
  if (race.localDone) return race.localMs;
  if (!race.startsAt || !net) return 0;
  return Math.max(0, net.serverNow() - race.startsAt);
}

function wpm() {
  const minutes = Math.max(1 / 60, elapsedMs() / 60000);
  return Math.round((board.pos / 5) / minutes);
}

function accuracyPct() {
  if (!stats.keys) return 100;
  return Math.round((stats.hits / stats.keys) * 100);
}

function paintStats() {
  const total = board.chars.length;
  el("counter").textContent = t("ui.chars", { n: board.pos, total: total });
  el("statChars").textContent = board.pos + " / " + total;
  el("statWpm").textContent = String(wpm());
  el("statAcc").textContent = accuracyPct() + "%";
  el("statErr").textContent = String(stats.errors);
}

function resetTyping() {
  board.pos = 0;
  stats = { hits: 0, keys: 0, errors: 0 };
  clearBad();
  el("code").classList.remove("waiting");
}

/* ------------------------------ 判定 ------------------------------ */

function canType() {
  if (isCelebrating()) return false;
  if (mode === MODE.SOLO) return !!solo && !solo.done;
  if (!race || race.localDone) return false;
  /* 刚过一关、下一关还没从服务器发下来：这一小会儿先别收键，
     否则那几个字符会按旧关卡的文本去校验，白敲 */
  if (race.advancing) return false;
  if (race.phase === PHASE.RACING) return true;
  /* 倒计时按本地时间自己解开：不能等服务器那一条 patch 到了才让敲，
     否则网络差的人白白晚起跑（服务器照样会拒绝提前的按键）。 */
  if (race.phase === PHASE.COUNTDOWN && net) return net.serverNow() >= race.startsAt + START_GRACE_MS;
  return false;
}

function typeChar(ch) {
  if (!canType()) return;
  if (board.pos >= board.chars.length) return;

  stats.keys += 1;
  if (board.chars[board.pos] !== ch) {
    stats.errors += 1;
    flashBad(board.pos);
    paintStats();
    return;
  }
  typeChunk(ch);
}

/* chunk 里全是刚敲对的字符（Tab 会一次给四个空格）。
   键数由调用方先记好 —— 敲错一个键也要算进正确率的分母。 */
function typeChunk(chunk) {
  board.pos += chunk.length;
  stats.hits += chunk.length;
  if (mode === MODE.SOLO) {
    syncBoard();
    paintBar();
    paintStats();
    if (board.pos >= board.chars.length) win();
    return;
  }
  net.progress(board.pos, chunk);
  if (board.pos < board.chars.length) {
    syncBoard();
    paintBar();
    paintStats();
    return;
  }
  /* 这一关打完了。最后一关 → 整场跑完，等服务器给名次；
     否则等服务器把下一关发下来（通常几十毫秒），这期间先不收键。 */
  if (race.myLevel >= race.lastLevel) {
    race.localMs = Math.max(0, net.serverNow() - race.startsAt);
    race.localDone = true;
    el("hint").innerHTML = t("ui.waitingOthers");
  } else {
    race.advancing = true;
    el("hint").innerHTML = t("ui.levelCleared");
  }
  syncBoard();
  paintBar();
  paintStats();
}

function backspace() {
  if (!canType() || board.pos <= 0) return;
  board.pos -= 1;
  syncBoard();
  paintBar();
  paintStats();
  if (mode === MODE.RACE) net.progress(board.pos, "");
}

/* Tab 一次顶四个空格，但只在接下来的四个目标字符真的都是空格时才算数。
   一次 Tab 记四个键 —— 对被敲出来的那四个空格来说，这就是四个正确的键。 */
function typeIndent() {
  if (!canType()) return;
  if (board.pos + INDENT <= board.chars.length) {
    let all = true;
    for (let k = 0; k < INDENT; k++) if (board.chars[board.pos + k] !== " ") all = false;
    if (all) {
      stats.keys += INDENT;
      typeChunk("    ");
      return;
    }
  }
  stats.keys += 1;
  stats.errors += 1;
  flashBad(board.pos);
  paintStats();
}

/* ------------------------------ 键盘 ------------------------------ */

/* 不用 <input>：键盘事件直接接在文档上。这样空格不会滚页面、Tab 不会把焦点带走。
   代价是要自己挡输入法 —— 组合输入期间的 keydown 必须忽略，否则开着中文输入法敲英文会吞键。
   另外焦点落在输入框/下拉框上时一律不管：那是名字输入框和关卡选择框自己的键盘。 */
function onKeyDown(e) {
  if (document.body.dataset.view !== "game") return;
  if (isCelebrating()) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.isComposing || e.keyCode === 229) return;

  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  if (race && race.phase !== PHASE.RACING && race.phase !== PHASE.COUNTDOWN) return;

  const k = e.key;

  if (k === "Backspace") { e.preventDefault(); backspace(); return; }
  if (k === "Enter") { e.preventDefault(); typeChar("\n"); return; }
  if (k === "Tab") { e.preventDefault(); typeIndent(); return; }
  if (k.length === 1) { e.preventDefault(); typeChar(k); return; }
}

/* ------------------------------ 单人 ------------------------------ */

function startLevel(i) {
  const lv = levels[i];
  const text = String(lv.text === undefined || lv.text === null ? "" : lv.text);

  if (!text) {
    el("err").hidden = false;
    el("err").textContent = t("ui.loadFailed", { msg: "level " + lv.id + " has no text" });
    return;
  }

  mode = MODE.SOLO;
  document.body.classList.remove("is-race");
  solo = { index: i, level: lv, done: false };

  resetTyping();
  renderBoard(text);
  el("keytip").innerHTML = t("ui.keyTip");
  el("btnRetry").textContent = t("ui.retry");
  paintSoloChrome();
  paintStats();
  paintBar();
  show("game");
  watch.start();

  /* 顶栏那个刚被点过的按钮还拿着焦点，接着敲 Enter / Space 会把它再按一次 */
  if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
}

function paintSoloChrome() {
  if (!solo) return;
  const chars = board.chars.length;
  el("lvName").textContent = t("ui.levelNo", { n: solo.index + 1 }) + " · " + lvText(solo.level, "title");
  el("hint").textContent = t("ui.levelInfo", { n: chars }) + " · " + lvText(solo.level, "tip");
}

function win() {
  watch.stop();
  solo.done = true;
  clearBad();
  syncBoard();
  paintStats();

  const chars = board.chars.length;
  const seconds = Math.max(1, watch.elapsedSeconds());
  const acc = accuracyPct();
  const last = solo.index === levels.length - 1;
  const index = solo.index;
  const errors = stats.errors;
  const stars = errors === 0 ? 3 : errors <= 2 ? 2 : 1;
  const speed = Math.round((chars / 5) / (seconds / 60));

  prog.mark(solo.level.id);
  reportResult(GAME_ID, {
    level: index + 1,
    levelId: solo.level.id,
    levelTitle: lvText(solo.level, "title"),
    correct: stats.hits,
    total: stats.keys,
    rate: stats.keys ? stats.hits / stats.keys : 1,
    progress: prog.ratio(),
    finished: last,
    timedOut: false,
    locale: i18n.getLocale(),
    mode: "solo",
    chars: chars,
    wpm: speed,
    accuracy: acc,
    errors: errors,
    seconds: seconds,
    stars: stars,
  });
  renderList();

  celebrate({
    title: t("ui.win"),
    lines: [
      t("ui.stars" + stars),
      t("ui.winLine", { chars: chars, wpm: speed, acc: acc }),
      errors === 0 ? t("ui.noTypos") : t("ui.typos", { n: errors }),
      t("ui.doneIn", { time: formatElapsed(seconds * 1000) }),
    ],
    actionLabel: last ? t("ui.allDone") : t("ui.next"),
    onAction: function () {
      if (last) toList();
      else startLevel(index + 1);
    },
  });
}

function toList() {
  if (mode === MODE.RACE) {
    leaveRace();
    return;
  }
  if (watch) watch.stop();
  solo = null;
  renderList();
  show("list");
}

/* ------------------------------ 多人 ------------------------------ */

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

function requestedLevelId() {
  const p = params();
  if (p.id) return p.id;
  if (p.level) {
    const n = parseInt(p.level, 10);
    if (n >= 1 && n <= levels.length) return levels[n - 1].id;
  }
  return levels[0].id;
}

/* 复制邀请链接。教室里的站点多半是 http://，那种情况下 navigator.clipboard 根本不存在，
   所以还要兜一层 execCommand；两层都不行才弹 prompt 让人自己选中。 */
function copyText(text) {
  const btn = el("btnInvite");
  const flash = function () {
    const label = btn.textContent;
    btn.textContent = t("ui.invited");
    setTimeout(function () { btn.textContent = label; }, 1600);
  };

  const legacy = function () {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "readonly");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove();
    if (ok) flash();
    else window.prompt(t("ui.invite"), text);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(flash, legacy);
  } else {
    legacy();
  }
}

async function enterRace(code) {
  mode = MODE.RACE;
  document.body.classList.add("is-race");
  /* 多人这一层是动态 import 的：不玩多人就永远不会加载 colyseus.js */
  let netMod = null;
  try {
    netMod = await import("./net.js");
  } catch (e) {
    el("err").textContent = t("ui.connectFailed", { msg: "net.js " + (e.message || e) });
    el("err").hidden = false;
    leaveRace();
    return;
  }
  const realCode = code || netMod.codeFromUrl() || netMod.randomCode();

  show("game");
  el("hint").textContent = t("ui.connecting");
  el("lvName").textContent = t("ui.raceTitle");

  try {
    net = await netMod.openRoom({
      url: netMod.serverUrl(),
      code: realCode,
      name: playerName(),
      levelId: requestedLevelId(),
    });
  } catch (e) {
    net = null;
    el("err").hidden = false;
    el("err").textContent = t("ui.connectFailed", { msg: e.message || String(e) });
    leaveRace();          /* 连不上就回单人，不把人卡在白屏上 */
    return;
  }

  netMod.writeRoomToUrl(net.roomId);
  race = {
    code: net.roomId,
    startLevelId: "",
    myLevel: 0,        /* 我跑到第几关（下标） */
    lastLevel: 0,      /* 赛道最后一关的下标 */
    rendered: false,   /* 第一关的文本画过了没 —— 只有画过之后换关才闪一下 */
    raceNo: 0,
    phase: "",
    lastPhase: "",
    startsAt: 0,
    advancing: false,  /* 过关了、下一关还没到手的这一小会儿 */
    localDone: false,  /* 整条赛道跑完了 */
    localMs: 0,
    charsDone: 0,      /* 已经打完的那几关一共多少字符（用来算整场 WPM） */
    resultShown: false,
    mod: netMod,
  };

  towerChips.forEach(function (c) { c.remove(); });
  towerChips.clear();
  el("chips").innerHTML = "";
  buildLanes();
  bindRoomInputs();
  el("roomBar").hidden = false;
  el("tower").hidden = false;
  el("keytip").innerHTML = t("ui.keyTip");
  el("roomCode").textContent = t("ui.roomLabel", { code: net.roomId });
  el("btnRetry").textContent = t("ui.raceAgain");

  net.room.onMessage("resync", function (msg) {
    /* 服务器不认这次前进：退回它认定的位置（它说的关卡也算） */
    if (!race) return;
    const lv = msg && typeof msg.level === "number" ? msg.level : race.myLevel;
    if (lv !== race.myLevel) {
      race.myLevel = lv;
      race.advancing = false;
      resetTyping();
      renderBoard(levelText(lv));
      paintBar();
      paintStats();
      return;
    }
    const pos = msg && typeof msg.pos === "number" ? msg.pos : 0;
    if (pos < board.pos) {
      board.pos = pos;
      race.advancing = false;
      syncBoard();
      paintBar();
      paintStats();
    }
  });
  net.room.onStateChange(onRoomState);
  net.room.onLeave(function () {
    if (race) {
      el("err").hidden = false;
      el("err").textContent = t("ui.roomClosed");
    }
  });

  raceTickId = setInterval(raceTick, 100);
  onRoomState();
  raceTick();
}

function leaveRace() {
  if (raceTickId) {
    clearInterval(raceTickId);
    raceTickId = null;
  }
  if (net) {
    try { net.leave(); } catch (e) { /* 已经断了 */ }
  }
  net = null;
  race = null;
  towerChips.forEach(function (c) { c.remove(); });
  towerChips.clear();
  document.body.classList.remove("is-race");
  el("countdown").hidden = true;
  el("roomBar").hidden = true;
  el("tower").hidden = true;
  el("lobby").hidden = true;
  mode = MODE.SOLO;
  clearBad();
  renderList();
  show("list");
}

function buildLanes() {
  const host = el("lanes");
  host.innerHTML = "";
  for (let i = 0; i < LANES; i++) {
    const d = document.createElement("div");
    d.className = "lane";
    host.appendChild(d);
  }
}

function bindRoomInputs() {
  const sel = el("levelPick");
  const input = el("nameInput");
  if (!sel.dataset.bound) {
    sel.dataset.bound = "1";
    sel.addEventListener("change", function () { if (net) net.setLevel(sel.value); });
  }
  if (!input.dataset.bound) {
    input.dataset.bound = "1";
    input.addEventListener("change", function () {
      const v = cleanNameInput(input.value);
      if (!v) {
        input.value = playerName();
        return;
      }
      input.value = v;
      rememberName(v);
      if (race) race.mod.writeNameToUrl(v);   /* 写回地址栏，刷新之后名字还在 */
      if (net) net.setName(v);
    });
  }
  input.value = playerName();
  renderLevelPicker();
}

function renderLevelPicker() {
  const sel = el("levelPick");
  const want = net && net.room.state ? net.room.state.startLevelId : "";
  if (sel.options.length !== levels.length) {
    sel.innerHTML = "";
    levels.forEach(function (lv) {
      const o = document.createElement("option");
      o.value = lv.id;
      o.textContent = lvText(lv, "title") || lv.id;
      sel.appendChild(o);
    });
  }
  if (want) sel.value = want;
}

/* 我这一关的目标文本。文本随 state 一起下来，客户端不去题库里自己找 ——
   服务器拿它校验，两边必须是同一份。 */
function levelText(i) {
  const st = net && net.room ? net.room.state : null;
  if (!st || !st.texts) return "";
  const s = st.texts[i];
  return s === undefined || s === null ? "" : s;
}

function levelTitleById(id) {
  return lvText(levelById(id), "title") || id;
}

/* 过一关时闪一下，让"换了一关"这件事看得见 */
function flashCode() {
  const box = el("code");
  box.classList.remove("advance");
  void box.offsetWidth;
  box.classList.add("advance");
}

/* 服务器是权威：关卡、位置、名次、时间都从 state 上读，本地只负责画。
   过一关就立刻换成下一关的文本 —— 不必等别人，这就是这一版的全部意思。 */
function onRoomState() {
  if (!race || !net || !net.room.state) return;
  const st = net.room.state;
  if (!st.players || !st.texts) return;

  if (st.raceNo !== race.raceNo) {
    /* 新的一场：所有人回到赛道第一关 */
    race.raceNo = st.raceNo;
    race.resultShown = false;
    race.localDone = false;
    race.localMs = 0;
    race.advancing = false;
    race.myLevel = 0;
    race.rendered = false;
    race.charsDone = 0;
    race.startsAt = st.startsAt;
  }

  if (st.startLevelId !== race.startLevelId) {
    race.startLevelId = st.startLevelId;
    renderLevelPicker();
  }

  race.lastLevel = Math.max(0, st.levelIds.length - 1);

  const me = st.players.get(net.sessionId);
  if (me && me.level !== race.myLevel) {
    race.charsDone += board.chars.length;   /* 刚打完那一关的长度 */
    race.myLevel = me.level;
    race.advancing = false;      /* 下一关到手了，可以接着敲 */
  }
  if (me && me.place > 0) {
    race.localDone = true;       /* 整条赛道跑完了 */
    race.advancing = false;
    if (me.timeMs > 0) race.localMs = me.timeMs;   /* 服务器给出的用时才是准的 */
  }

  /* 该画哪一关的文本：第一次画、换了关卡、房间换了赛道，都是这一条 */
  const want = levelText(race.myLevel);
  if (!race.rendered || race.renderedLevel !== race.myLevel) {
    resetTyping();
    renderBoard(want);
    paintBar();
    if (race.rendered) flashCode();
    race.renderedLevel = race.myLevel;
  }

  race.phase = st.phase;
  race.startsAt = st.startsAt;
  if (race.phase === PHASE.DONE) race.advancing = false;

  if (race.lastPhase !== race.phase) {
    onPhaseChanged(race.lastPhase, race.phase);
    race.lastPhase = race.phase;
  }

  renderTower();
  renderRoster();
  paintRacePanels();
  paintStats();
  race.rendered = true;

  if (st.phase === PHASE.DONE) showRaceResult();
}

/* 换阶段只做一次的事。重点是开赛那一刻把焦点从按钮上摘下来 ——
   否则「开始比赛」那个按钮还拿着焦点，接着敲 Enter / Space 会把整场比赛又开一遍。 */
function onPhaseChanged(from, to) {
  if (to !== PHASE.COUNTDOWN && to !== PHASE.RACING) return;
  const a = document.activeElement;
  if (!a || a === document.body) return;
  if (a.tagName === "BUTTON" || a.tagName === "SELECT" || a.tagName === "INPUT") a.blur();
}

/* 100ms 一跳：倒计时、正计时、读数都从这一处刷 */
function raceTick() {
  if (!race || !net || !net.room.state) return;
  const st = net.room.state;
  const phase = st.phase;

  if (phase === PHASE.COUNTDOWN && st.startsAt) {
    /* 遮罩消失的那一刻，正好就是 canType() 放行的那一刻 —— 两处用同一个
       startsAt + START_GRACE_MS，中间不能有空档，否则抢跑的人白敲几个键。 */
    paintCountdown(Math.max(0, st.startsAt + START_GRACE_MS - net.serverNow()));
  } else {
    paintCountdown(null);
  }

  if (phase === PHASE.RACING || phase === PHASE.DONE) {
    el("clock").textContent = formatElapsed(elapsedMs());
  }
  paintStats();
}

function paintCountdown(left) {
  const box = el("countdown");
  const num = el("cdText");
  if (left === null || left <= 0) {
    const wasWaiting = el("code").classList.contains("waiting");
    box.hidden = true;
    el("code").classList.remove("waiting");
    if (wasWaiting) syncBoard();        /* 放开键盘那一刻把光标点亮 */
    return;
  }
  box.hidden = false;
  el("code").classList.add("waiting");
  const n = String(Math.ceil(left / 1000));
  if (num.textContent !== n) {
    num.textContent = n;
    num.classList.remove("pop");
    void num.offsetWidth;
    num.classList.add("pop");
  }
}

function paintRacePanels() {
  const phase = race.phase;
  const inLobby = phase === PHASE.LOBBY || phase === PHASE.DONE;
  el("lobby").hidden = !inLobby;
  el("btnEndRace").hidden = !(phase === PHASE.RACING || phase === PHASE.COUNTDOWN);
  el("levelPick").disabled = !inLobby;
  el("nameInput").disabled = !inLobby;
  el("btnStart").textContent = phase === PHASE.DONE ? t("ui.raceAgain") : t("ui.startRace");
  if (race.localDone && phase !== PHASE.DONE) {
    el("hint").innerHTML = t("ui.waitingOthers");
    return;
  }
  el("hint").innerHTML = phaseHint();
}

function phaseHint() {
  const st = net.room.state;
  const levels = Math.max(1, st.levelIds.length);
  if (race.phase === PHASE.LOBBY) {
    return t("ui.raceLead", { level: 1, levels: levels });
  }
  if (race.phase === PHASE.COUNTDOWN) return t("ui.countdownHint");
  if (race.phase === PHASE.RACING) {
    return t("ui.racingHint", { level: race.myLevel + 1, levels: levels, chars: levelText(race.myLevel).length }) +
      " · " + levelTitleById(st.levelIds[race.myLevel]);
  }
  return t("ui.doneHint");
}

/* 房间那一行：我在第几关、同关有几个人、房间一共几个人。
   塔上只画同关的人，所以"同关几个"得写出来，否则塔上只剩自己会莫名其妙。 */
function renderRoster() {
  const st = net.room.state;
  const box = el("roster");
  box.innerHTML = "";
  let here = 0;
  st.players.forEach(function (p, id) {
    if (p.level === race.myLevel) here += 1;
    const c = document.createElement("span");
    c.className = "rc" + (id === net.sessionId ? " me" : "") + (p.connected ? "" : " off");
    c.textContent = avatarFor(id) + " " + p.name + (id === net.sessionId ? " " + t("ui.you") : "");
    c.title = t("ui.onLevel", { n: p.level + 1 });
    box.appendChild(c);
  });
  el("roomMeta").textContent = t("ui.roomMeta", {
    level: race.myLevel + 1,
    levels: Math.max(1, st.levelIds.length),
    here: here,
    room: st.players.size,
  });
}

/* 头像塔：只画和我同一关的人，纵向位置 = 他在这一关打完的比例。
   同一泳道里挨得太近的往上抬一点，别叠成一团。 */
function renderTower() {
  const st = net.room.state;
  const my = race.myLevel;
  const total = Math.max(1, levelText(my).length);
  const list = [];
  let i = 0;
  st.players.forEach(function (p, id) {
    if (p.level !== my) return;          /* 别的关卡的人不在这张图上 */
    list.push({
      id: id,
      name: p.name,
      ratio: Math.max(0, Math.min(1, p.pos / total)),
      place: p.place,
      on: p.connected,
      me: id === net.sessionId,
      lane: i % LANES,
    });
    i += 1;
  });

  const lanes = {};
  list.forEach(function (p) {
    if (!lanes[p.lane]) lanes[p.lane] = [];
    lanes[p.lane].push(p);
  });
  Object.keys(lanes).forEach(function (k) {
    const arr = lanes[k].sort(function (a, b) { return b.ratio - a.ratio; });
    let prev = null;
    let lift = 0;
    arr.forEach(function (p) {
      lift = prev !== null && prev - p.ratio < 0.07 ? Math.min(lift + 0.055, 0.165) : 0;
      p.bottom = Math.min(1, p.ratio + lift);
      prev = p.ratio;
    });
  });

  const alive = {};
  list.forEach(function (p) {
    alive[p.id] = true;
    let slot = towerChips.get(p.id);
    if (!slot) {
      /* 外面这层只负责"站在多高"，好让 bottom 是一个干净的百分比、过渡能动；
         头像和名字在里面，用 translateY(50%) 把自己的中心对到那条线上。 */
      slot = document.createElement("div");
      slot.className = "slot";
      const chip = document.createElement("div");
      chip.className = "chip";
      const av = document.createElement("span");
      av.className = "av";
      const nm = document.createElement("span");
      nm.className = "nm";
      chip.append(av, nm);
      slot.appendChild(chip);
      el("chips").appendChild(slot);
      towerChips.set(p.id, slot);
    }
    const chip = slot.firstElementChild;
    slot.style.setProperty("--lane", String(p.lane));
    slot.style.bottom = (p.bottom * 100).toFixed(1) + "%";
    chip.classList.toggle("me", p.me);
    chip.classList.toggle("off", !p.on);
    chip.classList.toggle("done", p.place > 0);
    chip.querySelector(".av").textContent = avatarFor(p.id);
    chip.querySelector(".nm").textContent = p.name;
    chip.title = p.name + (p.place > 0 ? " · #" + p.place : "");
  });
  towerChips.forEach(function (slot, id) {
    if (!alive[id]) {
      slot.remove();
      towerChips.delete(id);
    }
  });
}

function showRaceResult() {
  if (!race || race.resultShown) return;
  race.resultShown = true;

  const st = net.room.state;
  const me = st.players.get(net.sessionId);
  const total = st.players.size;
  const levels = Math.max(1, st.levelIds.length);
  const place = me ? me.place : 0;
  const reached = place > 0 ? levels : (me ? me.level + 1 : 1);
  const ms = me && me.timeMs > 0 ? me.timeMs : race.localMs;
  const seconds = Math.max(1, Math.round(ms / 1000) || 1);
  const acc = accuracyPct();
  const errors = stats.errors;
  /* 整条赛道一共敲过的字符：打完的几关 + 手上这一关的进度 —— 这样 WPM 才是整场的 */
  const chars = race.charsDone + board.pos;
  const speed = Math.round((chars / 5) / (seconds / 60));
  const lastId = st.levelIds[race.myLevel];

  reportResult(GAME_ID, {
    level: levelNoById(lastId),
    levelId: lastId,
    levelTitle: levelTitleById(lastId),
    correct: stats.hits,
    total: stats.keys,
    rate: stats.keys ? stats.hits / stats.keys : 1,
    progress: prog.ratio(),
    finished: false,
    timedOut: false,
    locale: i18n.getLocale(),
    mode: "race",
    room: net.roomId,
    place: place,
    players: total,
    levels: levels,
    reached: reached,
    chars: chars,
    wpm: speed,
    accuracy: acc,
    errors: errors,
    seconds: seconds,
  });

  celebrate({
    title: place === 1 ? t("ui.raceWon") : t("ui.raceOver"),
    lines: [
      place > 0 ? t("ui.racePlace", { place: place, total: total }) : t("ui.raceDnf"),
      place > 0 ? t("ui.raceTime", { levels: levels, time: formatElapsed(ms) })
                : t("ui.coursePartial", { done: reached, levels: levels }),
      t("ui.raceStats", { wpm: speed, acc: acc, err: errors }),
    ],
    actionLabel: t("ui.raceAgain"),
    onAction: function () { if (net) net.start(); },
  });
}

/* ------------------------------ 语言切换 ------------------------------ */

function relocalize() {
  renderList();
  el("keytip").innerHTML = t("ui.keyTip");
  el("btnRetry").textContent = mode === MODE.RACE ? t("ui.raceAgain") : t("ui.retry");

  if (mode === MODE.SOLO) {
    if (!solo) return;
    paintSoloChrome();
    paintStats();
    return;
  }
  if (!race || !net || !net.room.state) return;
  el("lvName").textContent = t("ui.raceTitle");
  el("roomCode").textContent = t("ui.roomLabel", { code: net.roomId });
  renderLevelPicker();
  renderRoster();
  renderTower();
  paintRacePanels();
  paintStats();
}

/* ------------------------------ 启动 ------------------------------ */

async function boot() {
  mountSwitcher();
  i18n.onChange(relocalize);

  watch = createStopwatch({
    el: el("clock"),
    onTick: function () {
      if (mode === MODE.SOLO && solo && !solo.done) {
        paintStats();
        paintBar();
      }
    },
  });
  bar = createBar(el("timebar"));

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
  el("btnRetry").addEventListener("click", function () {
    if (mode === MODE.RACE) {
      if (net) net.start();
      return;
    }
    if (solo) startLevel(solo.index);
  });
  el("btnToList").addEventListener("click", toList);
  el("btnStart").addEventListener("click", function () { if (net) net.start(); });
  el("btnEndRace").addEventListener("click", function () { if (net) net.end(); });
  el("btnLeave").addEventListener("click", leaveRace);
  el("btnInvite").addEventListener("click", function () {
    if (!race) return;
    copyText(race.mod.inviteUrl(net.roomId));
  });
  el("btnPlayWithOthers").addEventListener("click", function () {
    /* 新建一间：随机房号写进 URL，然后照常进房 —— 复制链接就能请人进来 */
    const url = new URL(location.href);
    url.searchParams.set("room", randomRoomCode());
    location.assign(url.toString());
  });

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || isCelebrating()) return;
    if (document.body.dataset.view !== "game") return;
    toList();
  });

  renderList();

  /* ?room= 出现就进多人。注意只算一次：?room= 空着时每次算出来的随机房号都不一样 */
  const wanted = codeFromUrlSafe();
  if (wanted !== null) {
    enterRace(wanted);
    return;
  }

  const i = startIndex(levels);
  if (i >= 0 && prog.isUnlocked(i)) startLevel(i);
  else if (params().embed) startLevel(0);
}

/* boot 里没法 await net.js（那会把 colyseus.js 拉进初始包），
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
