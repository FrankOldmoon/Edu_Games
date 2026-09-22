/* 游戏页：左右两份代码并排，右栏里点出与左栏不同的位置。

   判定用的是"坐标"而不是某个字母：数据里每个不同点只写清在第几行、找哪个
   片段，真正的判定范围由渲染结果量出来 —— 用 Range 取到那段文字的外框，再
   向外放宽一点。所以点到附近就算对，不必精确点到字母。

   没有 find 的不同点用 at 指明位置：
     at="start" 圈住行首第一个字符（少缩进这类）
     at="end"   圈住行尾最后一个字符（缺冒号、缺右括号这类）
   这样圆圈就落在该在的位置，不会横跨整行。

   关卡数据和进度放在 levels.js 里，这里只管交互。 */

import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";

import { launchFireworks, prefersReduced } from "../../../src/game-ui/fireworks.js";
import { createCountdown } from "../../../src/game-ui/timer.js";
import { t, i18n, mountSwitcher } from "./i18n.js";
import { loadLevels, localizeLevels, markDone, readProgress, unlockedCount, allUnlocked } from "./levels.js";

const $ = (id) => document.getElementById(id);

/* 判定时向外放宽的像素，配合"不精确到字母"的要求 */
const TOLERANCE = 10;

/* 计时默认值，levels.json 里的 timer 可以覆盖。
   现在的预算 = 不同点数量 × 10 秒（BASE 为 0，即第 1 关 10 秒、第 10 关 100 秒）。 */
const TIME_BASE = 0;        /* 每关基础秒数 */
const TIME_PER_DIFF = 10;   /* 每个不同点追加的秒数 */
const PENALTY = 5;          /* 选错扣掉几秒 */

const MODE = { SOLO: "solo", ROOM: "room" };
const NAME_KEY = "spot.name";
/* 服务器上这个游戏的房间类型名（见 server/index.js 的 SPOT）。
   房间号在服务器内部是 `<这个>-<房号>`，见 src/game-ui/room/net.js 的 roomIdFor。 */
const ROOM_NAME = "spot";

let levels = [];
let rawLevels = null;      // 原始数据，换语言时重新补一遍文案
let level = null;
let levelIndex = 0;
let source = "";
let found = [];
let boxes = [];
let solved = false;
let timedOut = false;
let startedAt = 0;

/* 每关的计时参数（levels.json 里的 timer，boot 里读一次） */
let timeBase = TIME_BASE;
let timePerDiff = TIME_PER_DIFF;

/* 房间里"开始"之前先把第 1 关摆出来给你看，但还不能点、也不计时 */
let previewing = false;

/* 房间：net 是连接（src/game-ui/room/net.js），panel 是大堂 + 头像塔（room/panel.js）。
   这一页是"一页一关"的老结构（单人换关是换页），房间模式下改成原地重画 ——
   换页就等于重新进房，房间连接和塔上的位置都会断。 */
let mode = MODE.SOLO;
let net = null;
let panel = null;

let penaltyMs = PENALTY * 1000;
let solvedLeftMs = 0;
let hintShown = false;
let fx = null;                 // 正在放的烟花
let celebrateShownAt = 0;      // 通关弹框是什么时候弹出来的

let leftPanel = null;
let rightPanel = null;

/* ------------------------------ 地址参数 ----------------------------- */
function param(name) {
  return new URLSearchParams(location.search).get(name);
}

/* 带参数跳转时要保留 json / all，否则自定义数据源一切关就丢了 */
function urlWith(patch) {
  const q = new URLSearchParams(location.search);
  Object.keys(patch).forEach(function (k) {
    if (patch[k] === null) q.delete(k); else q.set(k, patch[k]);
  });
  const s = q.toString();
  return location.pathname + (s ? "?" + s : "");
}

/* ------------------------------ 计时 --------------------------------- */
/* 计时整个交给共享的 createCountdown（src/game-ui/timer.js）：数字胶囊、
   剩不到 10 秒变红心跳、被扣时闪一下、归零回调、以及代码上方那条 slider
   进度条都在那边，各游戏行为一致。这里只补本关特有的一件小事：读数文案。 */
const clock = createCountdown({
  el: $("timer"),
  bar: $("timebar"),
  label: function (ms) { return t("ui.seconds", { n: Math.ceil(ms / 1000) }); },
  onExpire: function () { timeUp(); },
});

function startTimer(ms) {
  startedAt = Date.now();
  clock.start(ms);
}

function stopTimer() {
  clock.stop();
}

function penalize() {
  clock.penalize(penaltyMs);
}

/* --------------------------- 文字位置的计算 --------------------------- */
function charIndex(code, line, col) {
  const lines = code.split("\n");
  let n = 0;
  for (let i = 0; i < line - 1; i++) n += lines[i].length + 1;
  return n + col;
}

function pointAt(root, index) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let node;
  while ((node = walker.nextNode())) {
    const len = node.nodeValue.length;
    if (acc + len >= index) return { node: node, offset: index - acc };
    acc += len;
  }
  return null;
}

/* 某个不同点占的那段文字，返回一个 Range */
function spanOf(codeEl, code, diff) {
  const lines = code.split("\n");
  const raw = lines[diff.line - 1] || "";
  const lead = raw.length - raw.replace(/^\s+/, "").length;
  let from;
  let to;

  if (diff.find) {
    const at = raw.indexOf(diff.find);
    if (at < 0) return null;
    from = at;
    to = at + diff.find.length;
  } else if (diff.at === "start") {
    /* 行首第一个字符：少缩进时，问题就在这一行的左边 */
    from = lead;
    to = Math.min(raw.length, lead + 1);
  } else if (diff.at === "end") {
    /* 行尾最后一个字符：缺冒号、缺右括号时，问题就在这一行的末尾 */
    to = raw.length;
    while (to > 0 && /\s/.test(raw[to - 1])) to--;
    from = to - 1;
  } else {
    /* 兜底：整行（去掉行首缩进和行尾空白） */
    from = lead;
    to = raw.length;
    while (to > from && /\s/.test(raw[to - 1])) to--;
  }

  if (to <= from || from < 0 || to > raw.length) return null;

  const a = pointAt(codeEl, charIndex(code, diff.line, from));
  const b = pointAt(codeEl, charIndex(code, diff.line, to));
  if (!a || !b) return null;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

function measure() {
  const wrap = rightPanel.querySelector(".board-body");
  const codeEl = rightPanel.querySelector("code");
  const wrapRect = wrap.getBoundingClientRect();
  boxes = level.diffs.map(function (d) {
    const range = spanOf(codeEl, level.right, d);
    if (!range) return null;
    const r = range.getBoundingClientRect();
    return {
      left: r.left - wrapRect.left,
      top: r.top - wrapRect.top,
      width: r.width,
      height: r.height,
    };
  });
}

/* ------------------------------- 画圆圈 ------------------------------ */
function drawRing(box) {
  /* 贴着文字画，并封顶：宽片段不会画出一个横跨半屏的圈。
     留白也要小 —— 行距约 21px，圈再大一点，相邻两行的圈就会叠在一起
     （越往后的关卡不同点越密，很容易出现上下相邻）。 */
  const d = Math.max(26, Math.min(Math.max(box.width, box.height) + 10, 60));
  const el = document.createElement("div");
  el.className = "ring";
  el.style.width = d + "px";
  el.style.height = d + "px";
  el.style.left = (box.left + box.width / 2 - d / 2) + "px";
  el.style.top = (box.top + box.height / 2 - d / 2) + "px";
  rightPanel.querySelector(".marks").appendChild(el);
}

function redraw() {
  const marks = rightPanel.querySelector(".marks");
  marks.innerHTML = "";
  found.forEach(function (i) { if (boxes[i]) drawRing(boxes[i]); });
}

/* ------------------------------- 渲染 -------------------------------- */
function renderCode(panel, code) {
  const lines = code.split("\n");
  panel.querySelector(".gutter").innerHTML =
    lines.map((_, i) => "<span>" + (i + 1) + "</span>").join("");

  const codeEl = panel.querySelector("code");
  codeEl.textContent = code;
  hljs.highlightElement(codeEl);
  /* 高亮只是套一层 <span>，文字内容必须原样不变，否则位置计算全错 */
  if (codeEl.textContent !== code) codeEl.textContent = code;
  return codeEl;
}

function updateCounter(bump) {
  const el = $("counter");
  el.textContent = t("ui.counter", { found: found.length, total: level.diffs.length });
  if (!bump) return;
  /* 重新触发一次动画：先摘类再强制回流，否则连续命中只会动第一次 */
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}

/* 通关庆祝 */
/* 最后一处找到的那一刻：先放烟花，隔一会儿再弹成绩卡。
   烟花是"全找完了"这一下的反馈，而卡片一出来就把两块代码盖住了 ——
   所以先让烟花放，3 秒后卡片再弹出来（「下一关」在卡片里，按钮自然也跟着晚 3 秒）。
   卡片不会自己消失：要么点卡片里的按钮继续，要么点遮罩 / 按 Esc 收掉回去看代码。 */
const CELEBRATE_DELAY_MS = 3000;
let celebrateTimer = null;

function paintCelebrate() {
  $("celebrateTitle").textContent = t("ui.allFound");
  $("celebrateTime").textContent = t("ui.celebrateTime", { n: Math.ceil(solvedLeftMs / 1000) });
}

function showCelebrate() {
  const veil = $("celebrate");
  const card = $("celebrateCard");
  if (!veil || !card) return;
  paintCelebrate();
  labelNext();
  veil.hidden = false;
  card.hidden = false;
  celebrateShownAt = performance.now();
  const btn = $("celebrateNext");
  if (btn) btn.focus();
}

function scheduleCelebrate() {
  fx = launchFireworks({ shells: 9 });
  /* 系统开了"减少动态效果"就不会有烟花（launchFireworks 直接返回 null），
     那就别让人对着空屏等 3 秒 */
  if (prefersReduced()) {
    showCelebrate();
    return;
  }
  if (celebrateTimer) clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(function () {
    celebrateTimer = null;
    showCelebrate();
  }, CELEBRATE_DELAY_MS);
}

function hideCelebrate() {
  const veil = $("celebrate");
  const card = $("celebrateCard");
  if (!veil || veil.hidden) return;
  veil.hidden = true;
  if (card) card.hidden = true;
  /* 收掉之后把「下一关」放回顶栏，光标也落上去，回车就能继续 */
  const btn = $("btnNext");
  if (btn) {
    btn.hidden = false;
    labelNext();
    btn.focus();
  }
}

function addNote(note, index) {
  const li = document.createElement("li");
  const badge = document.createElement("span");
  badge.className = "n";
  badge.textContent = String(index);
  const body = document.createElement("span");
  body.textContent = note;
  li.appendChild(badge);
  li.appendChild(body);
  $("notes").appendChild(li);
}

function addExtra(text, cls) {
  const div = document.createElement("div");
  div.className = "hintbox" + (cls ? " " + cls : "");
  div.textContent = text;
  $("extras").appendChild(div);
  return div;
}

/* 提示语本身由关卡文案决定，只有前缀是界面文案 */
function hintText() {
  return t("ui.hintPrefix", { text: level.hint || level.tip || t("ui.defaultHint") });
}

function showHint() {
  hintShown = true;
  $("btnHint").disabled = true;
  addExtra(hintText());
}

/* --------------------------- 对外上报进度 ---------------------------- */
/* 上报契约：每完成一关，告诉外层页面已完成的比例。
     每关 +0.2，5 关到 1，之后封顶在 1。
   用的是累计已完成的关卡数（存在 localStorage 里），所以刷新页面不会
   把已经拿到的进度冲掉；换 ?json= 数据源则各算各的。 */
const RATE_PER_LEVEL = 0.2;

function reportProgress() {
  const done = readProgress(source).done;
  /* 存储不可用时 readProgress 会返回空表，这里把刚完成的这关补上 */
  if (done.indexOf(level.id) < 0) done.push(level.id);
  /* 保留两位小数：3 * 0.2 在浮点下是 0.6000000000000001，
     外层要是拿 === 比对就对不上了 */
  const rate = Math.round(Math.min(1, done.length * RATE_PER_LEVEL) * 100) / 100;
  try {
    if (window.parent) window.parent.postMessage({ type: "correct_rate", rate: rate }, "*");
  } catch (e) {
    /* 外层没接就当作没有这回事，不影响继续玩 */
  }
}

/* 「下一关 / 回到列表」：通关弹框和顶栏各有一颗，文案和动作由这里统一同步。
   单人还是换页（老结构，?level= 也留在地址里）；房间里原地重画，不换页。 */
function nextButton() {
  if (levelIndex + 1 < levels.length) {
    return {
      label: t("ui.next"),
      go: function () {
        if (mode === MODE.ROOM) { setupLevel(levelIndex + 1); return; }
        location.href = urlWith({ level: levelIndex + 2 });
      },
    };
  }
  return {
    label: t("ui.allDone"),
    go: function () {
      if (mode === MODE.ROOM) { leaveRoom(); return; }
      location.href = "../";
    },
  };
}

function labelNext() {
  const spec = nextButton();
  ["btnNext", "celebrateNext"].forEach(function (id) {
    const btn = $(id);
    if (!btn) return;
    btn.textContent = spec.label;
    btn.onclick = spec.go;
  });
}

function complete() {
  solved = true;
  stopTimer();
  const left = clock.leftMs();
  solvedLeftMs = left;
  markDone(source, level.id);
  reportProgress();
  reportRoomProgress();
  $("btnHint").disabled = true;
  addExtra(t("ui.solvedLeft", { n: Math.ceil(left / 1000) }), "good");

  /* 顶栏那颗先藏着：弹框里有一颗，收起弹框时再放回顶栏，免得同时出现两颗「下一关」 */
  $("btnNext").hidden = true;
  labelNext();

  /* 先放烟花，隔 3 秒再弹卡片 —— 也就是「下一关」出现的时刻 */
  scheduleCelebrate();
}

function timeUp() {
  if (solved || timedOut) return;
  timedOut = true;
  stopTimer();
  clock.paint(0);
  $("btnHint").disabled = true;
  addExtra(t("ui.timeUp", { n: Math.round(penaltyMs / 1000) }), "bad");
  $("btnRetry").hidden = false;
  const boards = document.querySelector(".boards");
  if (boards) boards.classList.add("failed");
}

/* ------------------------------- 交互 -------------------------------- */
function onClick(ev) {
  if (solved || timedOut || previewing || !level) return;
  if (ev.target.closest && ev.target.closest(".gutter")) return;

  const wrap = rightPanel.querySelector(".board-body");
  const r = wrap.getBoundingClientRect();
  const x = ev.clientX - r.left;
  const y = ev.clientY - r.top;

  let hitIdx = -1;
  for (let i = 0; i < level.diffs.length; i++) {
    if (found.indexOf(i) >= 0) continue;
    const b = boxes[i];
    if (!b) continue;
    if (x >= b.left - TOLERANCE && x <= b.left + b.width + TOLERANCE &&
        y >= b.top - TOLERANCE && y <= b.top + b.height + TOLERANCE) {
      hitIdx = i;
      break;
    }
  }

  if (hitIdx < 0) {
    wrap.classList.remove("wrong");
    void wrap.offsetWidth;
    wrap.classList.add("wrong");
    setTimeout(function () { wrap.classList.remove("wrong"); }, 320);
    penalize();
    return;
  }

  found.push(hitIdx);
  drawRing(boxes[hitIdx]);
  addNote(level.diffs[hitIdx].note, found.length);
  updateCounter(true);
  reportRoomProgress();      /* 找到一个就报一次 —— 同房间的人看着你往上爬 */
  if (found.length === level.diffs.length) complete();
}

function fail(message) {
  const el = $("err");
  el.hidden = false;
  el.textContent = message;
}

/* --------------------------- 文案与换语言 ---------------------------- */
function paintHeader() {
  document.title = t("ui.playTitle", { name: level.name });
  $("lvName").textContent = t("ui.levelOf", { n: levelIndex + 1, total: levels.length, name: level.name });
  /* 只有两处以上才用复数句式，第 1 关是一处不同，单复数得分开说 */
  const n = level.diffs.length;
  $("lead").innerHTML = t(n === 1 ? "ui.rulesOne" : "ui.rules", {
    n: n, penalty: Math.round(penaltyMs / 1000)
  });
}

/* 换语言：拿原始数据重算文案就地重画。不重新加载数据，也不丢已经找到的不同点
   —— 代码本身与语言无关，所以圆圈的测量结果依然有效。 */
function relocalize() {
  /* 房间里的房间号 / 邀请 / 离开 / 名字 / 开始 / 同关提示是共用文案，先刷一遍 */
  if (mode === MODE.ROOM && net && net.room.state && panel) {
    panel.relocalize();
    panel.render(net.room.state, net.sessionId);
  }
  if (!rawLevels || !level) return;
  levels = localizeLevels(rawLevels);
  level = levels[levelIndex];

  paintHeader();
  updateCounter();
  if (solved) labelNext();

  const notes = $("notes");
  notes.innerHTML = "";
  found.forEach(function (idx, k) { addNote(level.diffs[idx].note, k + 1); });

  const veil = $("celebrate");
  if (veil && !veil.hidden) paintCelebrate();

  const extras = $("extras");
  extras.innerHTML = "";
  if (hintShown) addExtra(hintText());
  if (solved) addExtra(t("ui.solvedLeft", { n: Math.ceil(solvedLeftMs / 1000) }), "good");
  else if (timedOut) addExtra(t("ui.timeUp", { n: Math.round(penaltyMs / 1000) }), "bad");
}

/* ------------------------------- 一关的摆设 ------------------------------- */

/* 这一关的时间预算：关卡自己带 seconds 就用它，否则按不同点数量算 */
function levelMs() {
  return Number.isFinite(level.seconds)
    ? level.seconds * 1000
    : (timeBase + timePerDiff * level.diffs.length) * 1000;
}

/* 摆好第 idx 关：画两块代码、量好位置、开表。
   房间里「下一关」就是再调一次它 —— 原地重画，不换页，所以房间连接、
   塔上的位置都不会断（这一页本来是"一页一关"，换关靠换页）。
   preview=true 只画不跑（大堂里先看一眼第 1 关），也不收点击。 */
function setupLevel(idx, preview) {
  previewing = !!preview;

  if (celebrateTimer) { clearTimeout(celebrateTimer); celebrateTimer = null; }
  if (fx) { fx.stop(); fx = null; }
  hideCelebrate();

  levelIndex = idx;
  level = levels[idx];
  found = [];
  solved = false;
  timedOut = false;
  hintShown = false;

  const boards = document.querySelector(".boards");
  if (boards) boards.classList.remove("failed");

  paintHeader();
  $("btnNext").hidden = true;
  $("btnRetry").hidden = true;
  $("btnHint").disabled = previewing;
  $("notes").innerHTML = "";
  $("extras").innerHTML = "";
  updateCounter();

  renderCode(leftPanel, level.left);
  renderCode(rightPanel, level.right);
  measure();
  redraw();                 /* 清掉上一关留下的圈 */

  reportRoomProgress();     /* 房间里：告诉大家我在第几关、找出了几处 */

  if (previewing) {
    clock.stop();
    clock.paint(levelMs()); /* 只把预算摆在表上，不开始走 */
    return;
  }
  startTimer(levelMs());
}

/* ------------------------------ 房间（多人） ------------------------------ */

/* 房间那一层（连接、大堂、头像塔）在 src/game-ui/room/ 里，几个游戏共用一份。
   这里只写找不同特有的东西：进度怎么算、什么时候报。

   和配对、机器人一样，服务器**验不了**：不同点在哪只有客户端知道（而且判定是按
   浏览器里量出来的坐标），所以服务器只做范围检查（一关一关往前、不超过本关的不同点数），
   关卡由客户端推。每一条上报都带着完整的真相，丢一条下一条自己就修正回来了。 */

/* 名字：?username=Ada 最优先 —— 老师可以把名字写进链接发给每个人。 */
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

/* 这一关一共几处不同（塔上的分母）：从本地关卡库取，和服务器数的是同一份数据 */
function diffsAt(i) {
  const lv = levels[i];
  return lv && Array.isArray(lv.diffs) ? lv.diffs.length : 0;
}

/* 上报"我在第几关、找出了几处"。每一条都是完整的真相。 */
function reportRoomProgress() {
  if (mode !== MODE.ROOM || !net || !level) return;
  net.progress({ level: levelIndex, pos: found.length });
}

async function enterRoom() {
  mode = MODE.ROOM;
  document.body.classList.add("is-room");

  /* 房间那一层是动态 import 的：不进房间就永远不会加载 colyseus.js */
  let netMod = null;
  let panelMod = null;
  try {
    netMod = await import("../../../src/game-ui/room/net.js");
    panelMod = await import("../../../src/game-ui/room/panel.js");
  } catch (e) {
    fail(t("ui.connectFailed", { msg: "room " + (e.message || e) }));
    return;
  }
  const realCode = netMod.codeFromUrl() || netMod.randomCode();

  $("lead").textContent = t("ui.connecting");

  try {
    net = await netMod.openRoom({
      roomName: ROOM_NAME,
      url: netMod.serverUrl(),
      code: realCode,
      name: playerName(),
    });
  } catch (e) {
    net = null;
    /* 房间满了不是"连不上服务器"，得让人知道该换个房号 */
    fail(e && e.full ? t("room.full", { code: realCode }) : t("ui.connectFailed", { msg: e.message || String(e) }));
    mode = MODE.SOLO;
    document.body.classList.remove("is-room");
    return;
  }

  netMod.writeRoomToUrl(net.code);

  panel = panelMod.createRoomPanel({
    bar: $("roomBar"),
    lobby: $("lobby"),
    tower: $("tower"),
    t: t,
    denomFor: diffsAt,
    /* 开始按钮旁边那句：一按就从第 1 关起 */
    startLabel: function () {
      return t("ui.levelNo", { n: 1 }) + " · " + levels[0].name;
    },
    nameDefault: playerName,
    nameFixed: !!usernameFromUrlSafe(),   /* ?username= 指定的名字不给改 */
    inviteUrl: function () { return net.inviteUrl(); },
    /* 点开始：只开我自己这一局 —— 本地摆出第 1 关，同时告诉服务器我开始了 */
    onStart: function () {
      if (!net) return;
      net.start({});
      setupLevel(0);
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

  $("roomBar").hidden = false;
  $("lobby").hidden = false;     /* 还没点"开始"：改名字、看谁进来了 */
  $("tower").hidden = false;
  setupLevel(0, true);           /* 先把第 1 关摊开给你看一眼，但还不能点 */

  net.room.onStateChange(onRoomState);
  net.room.onLeave(function () {
    if (mode === MODE.ROOM) fail(t("ui.roomClosed"));
  });

  onRoomState();
}

/* 离开房间：这一页没有关卡列表可回（列表在另一个页面上），所以直接跳回列表页 */
function leaveRoom() {
  if (net) {
    try { net.leave(); } catch (e) { /* 已经断了 */ }
  }
  net = null;
  if (panel) {
    panel.clear();
    panel = null;
  }
  mode = MODE.SOLO;
  location.href = "../";
}

/* 谁在、谁在第几关、塔上画谁 —— 全交给 panel。
   关卡本来就是本地推进的（两份代码在我这儿，找到了就是找到了），服务器只记着给别人看。 */
function onRoomState() {
  if (!net || !net.room.state) return;
  const st = net.room.state;
  if (!st.players) return;
  if (panel) panel.render(st, net.sessionId);
}

/* ------------------------------- 启动 -------------------------------- */
async function boot() {
  mountSwitcher();
  i18n.onChange(relocalize);

  /* 弹框是模态的：遮罩接住点击，点遮罩（或按 Esc）就收掉回去看代码。
     刚开始那几百毫秒先不理，避免"找到最后一处"的那一下顺手把弹框收掉。 */
  const veil = $("celebrate");
  veil.addEventListener("click", function () {
    if (performance.now() - celebrateShownAt < 350) return;
    hideCelebrate();
  });
  document.addEventListener("keydown", function (e) {
    if (veil.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      hideCelebrate();
    }
  });

  let data;
  try {
    data = await loadLevels();
  } catch (e) {
    fail(t("ui.loadFailed", { msg: (e && e.message ? e.message : e) }));
    return;
  }
  rawLevels = data.levels;
  levels = localizeLevels(rawLevels);
  source = data.source;

  const cfg = data.timer || {};
  timeBase = Number.isFinite(cfg.base) ? cfg.base : TIME_BASE;
  timePerDiff = Number.isFinite(cfg.perDiff) ? cfg.perDiff : TIME_PER_DIFF;
  const pen = Number.isFinite(cfg.penalty) ? cfg.penalty : PENALTY;
  penaltyMs = pen * 1000;

  /* 两块代码面板和它们的事件只接一次，换关只是重画它们 */
  leftPanel = document.querySelector('.board[data-panel="left"]');
  rightPanel = document.querySelector('.board[data-panel="right"]');
  rightPanel.querySelector(".board-body").addEventListener("click", onClick);
  window.addEventListener("resize", function () {
    measure();
    redraw();
  });
  $("btnHint").onclick = showHint;
  $("btnRetry").onclick = function () {
    if (celebrateTimer) { clearTimeout(celebrateTimer); celebrateTimer = null; }
    if (fx) { fx.stop(); fx = null; }
    /* 房间里不换页：换个页就等于重新进房，塔上的进度会断 */
    if (mode === MODE.ROOM) { setupLevel(levelIndex); return; }
    location.reload();
  };

  /* ?room= 出现就进房间：先连上，等点"开始"再摆第 1 关 */
  if (param("room") !== null) {
    await enterRoom();
    return;
  }

  const done = readProgress(source).done;
  const open = allUnlocked() ? levels.length : unlockedCount(levels, done);

  let idx;
  const wantId = param("id");
  const wantLevel = parseInt(param("level") || "", 10);
  if (wantId) {
    idx = levels.map(l => l.id).indexOf(wantId);
    if (idx < 0) { fail(t("ui.notFound", { id: wantId })); return; }
  } else if (wantLevel > 0) {
    idx = Math.min(levels.length, wantLevel) - 1;
  } else {
    idx = Math.min(open, levels.length) - 1;
  }

  if (idx >= open) {
    fail(t("ui.levelLocked"));
    return;
  }

  setupLevel(idx);
}

boot();
