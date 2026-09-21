/* Python 代码打字：照着敲出每一行 Python，标点、引号、缩进都要一模一样。

   两种模式共用同一套判定 —— 核心只有一个数：「这一关已经完成几个字符」board.pos。
     · 单人：pos 就是本地真相。正计时、没有上限，比的是准确率和速度。
     · 房间（?room=）：**没有比赛**。每个人自己开自己那一局、从第一关往后打，
       打完一关自己进下一关，谁也不等谁、也不影响谁。房间只做一件事：
       把每个人打到第几关、这一关完成了多少同步给别人 ——
       塔上只画和你**同一关**的人（别人打的是另一段代码时，比位置没有意义）。
       pos 由服务器裁决：本地先乐观前进（不然一个来回就卡一下），
       服务器说不对就把权威位置推回去（resync）。
   两种模式的计时都是本地正计时（src/game-ui/timer.js 的 createStopwatch），
   进度条那一条滑块也都是"这一关打完了多少"（createBar）—— 没有开赛时刻，
   所以也不需要跟服务器对时。

   判定模型：
     敲对 → pos 前进；敲错 → 原地红闪（房间模式下错误数只是本地的展示值 ——
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

const MODE = { SOLO: "solo", ROOM: "room" };

const BAD_FLASH_MS = 260;
const INDENT = 4;
const LANES = 3;              /* 头像塔的泳道数，人多了就往同一条里叠（会往上抬一点错开） */
const NAME_KEY = "typing.name";

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

/* 房间 */
let net = null;
let run = null;
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
  return watch ? watch.elapsedMs() : 0;
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
  /* 房间模式：还没点"开始"（在大堂里预览）、或者自己这一局已经打完了，都不收键 */
  if (!run || !run.playing || run.done) return false;
  /* 刚过一关、下一关还没从服务器发下来：这一小会儿先别收键，
     否则那几个字符会按旧关卡的文本去校验，白敲 */
  if (run.advancing) return false;
  return true;
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
  /* 这一关打完了。已经是最后一关 → 自己这一局到此为止，停表弹自己的成绩卡；
     否则等服务器把下一关发下来（通常几十毫秒），这期间先不收键。 */
  if (run.myLevel >= run.lastLevel) {
    finishRun();
    return;
  }
  run.advancing = true;
  armAdvanceWatchdog();
  el("hint").innerHTML = t("ui.levelCleared");
  syncBoard();
  paintBar();
  paintStats();
}

/* 自己这一局打完了：停表、给自己看成绩。这里没有名次 —— 没人跟你比，
   房间里其他人可能还在第 1 关慢慢打。 */
function finishRun() {
  if (!run || run.done) return;
  run.done = true;
  run.advancing = false;
  clearAdvanceWatchdog();
  if (watch) watch.stop();
  el("hint").innerHTML = t("ui.youFinished");
  syncBoard();
  paintBar();
  paintStats();
  showRunResult();
}

function backspace() {
  if (!canType() || board.pos <= 0) return;
  board.pos -= 1;
  syncBoard();
  paintBar();
  paintStats();
  if (mode === MODE.ROOM) net.progress(board.pos, "");
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
  /* 房间里还没点"开始"（在大堂里挑关卡、改名字）：键盘交回给页面本身，
     Tab 该去下一个控件、空格该滚页面，别被判定层吃掉 */
  if (mode === MODE.ROOM && (!run || !run.playing)) return;

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
  document.body.classList.remove("is-room");
  solo = { index: i, level: lv, done: false };

  resetTyping();
  renderBoard(text);
  el("keytip").innerHTML = t("ui.keyTip");
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
  if (mode === MODE.ROOM) {
    leaveRoom();
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

async function enterRoom(code) {
  mode = MODE.ROOM;
  document.body.classList.add("is-room");
  /* 房间这一层是动态 import 的：不进房间就永远不会加载 colyseus.js */
  let netMod = null;
  try {
    netMod = await import("./net.js");
  } catch (e) {
    el("err").textContent = t("ui.connectFailed", { msg: "net.js " + (e.message || e) });
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

  netMod.writeRoomToUrl(net.roomId);
  run = {
    code: net.roomId,
    playing: false,     /* 自己这一局开始了没（跟着服务器上的那个字段走） */
    myLevel: 0,         /* 我打到第几关（题库里的下标） */
    lastLevel: 0,       /* 题库最后一关的下标 */
    rendered: false,    /* 文本画过没有 —— 只有画过之后换关才闪一下 */
    renderedLevel: 0,
    advancing: false,   /* 过关了、下一关还没到手的这一小会儿 */
    advanceTimer: null,
    advanceTries: 0,
    done: false,        /* 自己这一局打完了 */
    charsDone: 0,       /* 已经打完的那几关一共多少字符（用来算这一局的 WPM） */
    resultShown: false,
    mod: netMod,
  };

  towerChips.forEach(function (c) { c.remove(); });
  towerChips.clear();
  el("chips").innerHTML = "";
  buildLanes();
  bindRoomInputs();
  el("roomBar").hidden = false;
  el("lobby").hidden = false;     /* 还没点"开始"：改名字、看谁进来了、看从哪一关起步 */
  el("tower").hidden = false;
  el("keytip").innerHTML = t("ui.keyTip");
  el("roomCode").textContent = t("ui.roomLabel", { code: net.roomId });

  net.room.onMessage("resync", function (msg) {
    /* 服务器不认这次前进：退回它认定的位置（它说的关卡也算） */
    if (!run) return;
    const lv = msg && typeof msg.level === "number" ? msg.level : run.myLevel;
    if (lv !== run.myLevel) {
      run.myLevel = lv;
      run.advancing = false;
      clearAdvanceWatchdog();
      resetTyping();
      renderBoard(levelText(lv));
      paintBar();
      paintStats();
      return;
    }
    const pos = msg && typeof msg.pos === "number" ? msg.pos : 0;
    if (pos < board.pos) {
      board.pos = pos;
      run.advancing = false;
      clearAdvanceWatchdog();
      syncBoard();
      paintBar();
      paintStats();
    }
  });
  net.room.onStateChange(onRoomState);
  net.room.onLeave(function () {
    if (run) {
      el("err").hidden = false;
      el("err").textContent = t("ui.roomClosed");
    }
  });

  onRoomState();
}

function leaveRoom() {
  clearAdvanceWatchdog();
  if (net) {
    try { net.leave(); } catch (e) { /* 已经断了 */ }
  }
  net = null;
  run = null;
  towerChips.forEach(function (c) { c.remove(); });
  towerChips.clear();
  document.body.classList.remove("is-room");
  el("roomBar").hidden = true;
  el("tower").hidden = true;
  el("lobby").hidden = true;
  el("code").classList.remove("waiting");
  mode = MODE.SOLO;
  clearBad();
  if (watch) watch.stop();
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
  const input = el("nameInput");
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
      if (run) run.mod.writeNameToUrl(v);   /* 写回地址栏，刷新之后名字还在 */
      if (net) net.setName(v);
    });
  }
  input.value = playerName();
  renderPreview();
  paintStartAt();
}

/* 房间里没有"挑关卡"这回事：点开始就从第一关起步。
   这里读的是服务器发下来的题库，不去本地题库里找 —— 两边必须是同一份。 */
function firstLevelId() {
  const st = net && net.room ? net.room.state : null;
  return st && st.levelIds && st.levelIds[0] ? st.levelIds[0] : "";
}

/* 开始按钮旁边写清楚：一按就从第 1 关起 */
function paintStartAt() {
  const id = firstLevelId();
  if (id) el("startAt").textContent = t("ui.levelNo", { n: 1 }) + " · " + levelTitleById(id);
}

/* 大堂里先把第一关摊开给你看：代码看得见、但还不能敲 */
function renderPreview() {
  resetTyping();
  renderBoard(levelText(0));
  el("code").classList.add("waiting");
  paintBar();
  paintStats();
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

/* 过一关换下一关时闪一下，让"换了一关"这件事看得见 */
function flashCode() {
  const box = el("code");
  box.classList.remove("advance");
  void box.offsetWidth;
  box.classList.add("advance");
}

/* 点了"开始"之后把焦点从按钮上摘下来 —— 否则接着敲 Enter / Space 会把按钮再按一次 */
function blurChrome() {
  const a = document.activeElement;
  if (!a || a === document.body) return;
  if (a.tagName === "BUTTON" || a.tagName === "SELECT" || a.tagName === "INPUT") a.blur();
}

/* 过关后如果下一关迟迟不来（那一条 progress 被服务器限流丢了，或者包丢了），
   不能就这么干等 —— 客户端会永远停在"过关了"上，人也没法再敲。
   服务器它是权威，所以拿它认定的位置，把中间缺的那一段再交一次；还不行就再试，最多三次。 */
const ADVANCE_RETRY_MS = 1200;
const ADVANCE_RETRY_MAX = 3;

function clearAdvanceWatchdog() {
  if (run && run.advanceTimer) {
    clearTimeout(run.advanceTimer);
    run.advanceTimer = null;
  }
}

function armAdvanceWatchdog() {
  if (!run) return;
  clearAdvanceWatchdog();
  run.advanceTries = 0;
  run.advanceTimer = setTimeout(advanceRetry, ADVANCE_RETRY_MS);
}

function advanceRetry() {
  if (!run || !run.advancing || !net || !net.room.state) return;
  const me = net.room.state.players.get(net.sessionId);
  const from = me ? me.pos : 0;
  run.advanceTries = (run.advanceTries || 0) + 1;
  if (from < board.pos) {
    /* 服务器还差一截：把它缺的那段一次性补上（服务器是按"从他那儿到这儿"的原文比对的） */
    net.progress(board.pos, levelText(run.myLevel).slice(from, board.pos));
  }
  run.advanceTimer = run.advanceTries < ADVANCE_RETRY_MAX
    ? setTimeout(advanceRetry, ADVANCE_RETRY_MS)
    : null;
}

/* 服务器是权威：关卡和位置都从 state 上读，本地只负责画。
   每个人自己打自己的 —— 这里不会因为别人做了什么而改变我这边的状态。 */
function onRoomState() {
  if (!run || !net || !net.room.state) return;
  const st = net.room.state;
  if (!st.players || !st.texts) return;

  run.lastLevel = Math.max(0, st.levelIds.length - 1);

  const me = st.players.get(net.sessionId);
  const playing = !!(me && me.playing);

  if (playing && !run.playing) {
    /* 刚点了开始：进到真正那一关、开表、把大堂收起来 */
    run.myLevel = me.level;
    run.rendered = false;
    run.done = false;
    run.resultShown = false;
    run.charsDone = 0;
    resetTyping();
    renderBoard(levelText(run.myLevel));
    paintBar();
    el("lobby").hidden = true;
    if (watch) watch.start();
    blurChrome();
  }

  if (playing && me.level !== run.myLevel) {
    run.charsDone += board.chars.length;   /* 刚打完那一关的长度 */
    run.myLevel = me.level;
    run.advancing = false;                 /* 下一关到手了，可以接着敲 */
    clearAdvanceWatchdog();
  }

  run.playing = playing;

  if (playing && (!run.rendered || run.renderedLevel !== run.myLevel)) {
    resetTyping();
    renderBoard(levelText(run.myLevel));
    paintBar();
    if (run.rendered) flashCode();         /* 换了一关才闪；第一关不闪 */
    run.renderedLevel = run.myLevel;
    run.rendered = true;
  }

  /* 自己这一局打完了（本地那一下已经弹过卡了；这里兜住"刷新/重连后发现已经打完"） */
  if (run.done) showRunResult();

  paintHint();
  paintRoomBar();
  renderRoster();
  renderTower();
  paintStats();
}

/* 大堂里那句说明：自己打自己的，从第一关起步，房间里互相看得见进度 */
function lobbyLead() {
  const st = net.room.state;
  return t("ui.roomLead", { levels: st.levelIds.length });
}

function roomHint() {
  const st = net.room.state;
  return t("ui.levelHint", {
    level: run.myLevel + 1,
    levels: st.levelIds.length,
    chars: levelText(run.myLevel).length,
  }) + " · " + levelTitleById(st.levelIds[run.myLevel]);
}

function paintHint() {
  if (!run || !net || !net.room.state) return;
  if (!run.playing) { el("hint").innerHTML = lobbyLead(); return; }
  if (run.done) { el("hint").innerHTML = t("ui.youFinished"); return; }
  el("hint").innerHTML = roomHint();
}

/* 房间那一行：我在第几关、同关有几个人、房间一共几个人。
   塔上只画同关的人，所以"同关几个"得写出来，否则塔上只剩自己会莫名其妙。 */
function paintRoomBar() {
  const st = net.room.state;
  if (!run.playing) {
    el("roomMeta").textContent = t("ui.roomPeople", { n: st.players.size });
    return;
  }
  let here = 0;
  st.players.forEach(function (p) {
    if (p.playing && p.level === run.myLevel) here += 1;
  });
  el("roomMeta").textContent = t("ui.roomMeta", {
    level: run.myLevel + 1,
    levels: Math.max(1, st.levelIds.length),
    here: here,
    room: st.players.size,
  });
}

/* 大堂里的人：谁开始了就写他在第几关 —— "互相看得见进度"最直接的那一面 */
function renderRoster() {
  const st = net.room.state;
  const box = el("roster");
  box.innerHTML = "";
  st.players.forEach(function (p, id) {
    const c = document.createElement("span");
    c.className = "rc" + (id === net.sessionId ? " me" : "");
    c.textContent = avatarFor(id) + " " + p.name + (id === net.sessionId ? " " + t("ui.you") : "");
    c.title = p.playing ? t("ui.onLevel", { n: p.level + 1 }) : t("ui.notStarted");
    box.appendChild(c);
  });
}

/* 头像塔：只画和我同一关、而且已经开始的人 —— 别人打的是另一段代码，比位置没有意义。
   纵向位置 = 他在这一关打完的比例。同一泳道里挨得太近的往上抬一点，别叠成一团。 */
function renderTower() {
  const st = net.room.state;

  if (!run.playing) {
    towerChips.forEach(function (c) { c.remove(); });
    towerChips.clear();
    return;
  }

  const my = run.myLevel;
  const total = Math.max(1, levelText(my).length);
  const lastIdx = Math.max(0, st.levelIds.length - 1);
  const list = [];
  let i = 0;
  st.players.forEach(function (p, id) {
    if (!p.playing || p.level !== my) return;      /* 别的关卡的人不在这张图上 */
    list.push({
      id: id,
      name: p.name,
      ratio: Math.max(0, Math.min(1, p.pos / total)),
      /* 最后一关也打满了 = 整个题库都打完了，钉在顶上变金色 */
      finished: p.level === lastIdx && p.pos >= levelText(p.level).length,
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
    chip.classList.toggle("done", p.finished);
    chip.querySelector(".av").textContent = avatarFor(p.id);
    chip.querySelector(".nm").textContent = p.name;
    chip.title = p.name + (p.finished ? " · " + t("ui.finishedAll") : "");
  });
  towerChips.forEach(function (slot, id) {
    if (!alive[id]) {
      slot.remove();
      towerChips.delete(id);
    }
  });
}

/* 自己这一局打完了的成绩卡。和单人那张一样（也是共用的 celebrate）——
   这里没有名次：没人跟你比，房间里其他人可能还在第 1 关慢慢打。 */
function showRunResult() {
  if (!run || run.resultShown) return;
  run.resultShown = true;

  const st = net.room.state;
  const levels = Math.max(1, st.levelIds.length);
  const seconds = Math.max(1, watch ? watch.elapsedSeconds() : 1);
  const acc = accuracyPct();
  const errors = stats.errors;
  /* 这一局一共敲过的字符：打完的几关 + 手上这一关的进度 —— 这样 WPM 才是整局的 */
  const chars = run.charsDone + board.pos;
  const speed = Math.round((chars / 5) / (seconds / 60));
  const stars = errors === 0 ? 3 : errors <= 2 ? 2 : 1;
  const lastId = st.levelIds[run.myLevel];

  reportResult(GAME_ID, {
    level: levelNoById(lastId),
    levelId: lastId,
    levelTitle: levelTitleById(lastId),
    correct: stats.hits,
    total: stats.keys,
    rate: stats.keys ? stats.hits / stats.keys : 1,
    progress: prog.ratio(),
    finished: true,
    timedOut: false,
    locale: i18n.getLocale(),
    mode: "room",
    room: net.roomId,
    players: st.players.size,
    levels: levels,
    chars: chars,
    wpm: speed,
    accuracy: acc,
    errors: errors,
    seconds: seconds,
    stars: stars,
  });

  celebrate({
    title: t("ui.win"),
    lines: [
      t("ui.stars" + stars),
      t("ui.winLine", { chars: chars, wpm: speed, acc: acc }),
      errors === 0 ? t("ui.noTypos") : t("ui.typos", { n: errors }),
      t("ui.doneIn", { time: formatElapsed(seconds * 1000) }),
    ],
    /* 没有「再来一场」：自己这一局打完就完了，想接着打就回列表自己再挑一关 */
    actionLabel: t("ui.backToList"),
    onAction: toList,
  });
}

/* ------------------------------ 语言切换 ------------------------------ */

function relocalize() {
  renderList();
  el("keytip").innerHTML = t("ui.keyTip");

  if (mode === MODE.SOLO) {
    if (!solo) return;
    paintSoloChrome();
    paintStats();
    return;
  }
  if (!run || !net || !net.room.state) return;
  el("lvName").textContent = t("ui.roomTitle");
  el("roomCode").textContent = t("ui.roomLabel", { code: net.roomId });
  paintStartAt();
  paintHint();
  paintRoomBar();
  renderRoster();
  renderTower();
  paintStats();
}

/* ------------------------------ 启动 ------------------------------ */

async function boot() {
  mountSwitcher();
  i18n.onChange(relocalize);

  watch = createStopwatch({
    el: el("clock"),
    onTick: function () {
      /* 正在打的时候每跳一次就把读数和进度条刷一遍：单人是我自己在打，
         房间里是我这一局开始了、还没打完 */
      const liveSolo = mode === MODE.SOLO && solo && !solo.done;
      const liveRoom = mode === MODE.ROOM && run && run.playing && !run.done;
      if (liveSolo || liveRoom) {
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
  el("btnToList").addEventListener("click", toList);
  /* 只开始我自己这一局：一按就从第一关起步，别人完全不受影响 */
  el("btnStart").addEventListener("click", function () {
    if (net) net.startRun(firstLevelId());
  });
  el("btnLeave").addEventListener("click", leaveRoom);
  el("btnInvite").addEventListener("click", function () {
    if (!run) return;
    copyText(run.mod.inviteUrl(net.roomId));
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
    enterRoom(wanted);
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
