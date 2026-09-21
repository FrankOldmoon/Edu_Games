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

/* 「下一关 / 回到列表」：通关弹框和顶栏各有一颗，文案和动作由这里统一同步 */
function nextButton() {
  if (levelIndex + 1 < levels.length) {
    return {
      label: t("ui.next"),
      go: function () { location.href = urlWith({ level: levelIndex + 2 }); },
    };
  }
  return {
    label: t("ui.allDone"),
    go: function () { location.href = "../"; },
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
  if (solved || timedOut || !level) return;
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
  const base = Number.isFinite(cfg.base) ? cfg.base : TIME_BASE;
  const perDiff = Number.isFinite(cfg.perDiff) ? cfg.perDiff : TIME_PER_DIFF;
  const pen = Number.isFinite(cfg.penalty) ? cfg.penalty : PENALTY;
  penaltyMs = pen * 1000;

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

  level = levels[idx];
  levelIndex = idx;
  found = [];
  solved = false;
  timedOut = false;

  paintHeader();
  $("btnNext").hidden = true;
  $("btnRetry").hidden = true;
  $("btnHint").disabled = false;
  $("btnHint").onclick = showHint;
  $("btnRetry").onclick = function () {
    if (celebrateTimer) clearTimeout(celebrateTimer);
    if (fx) fx.stop();
    location.reload();
  };
  $("notes").innerHTML = "";
  $("extras").innerHTML = "";
  updateCounter();

  leftPanel = document.querySelector('.board[data-panel="left"]');
  rightPanel = document.querySelector('.board[data-panel="right"]');
  renderCode(leftPanel, level.left);
  renderCode(rightPanel, level.right);

  measure();
  rightPanel.querySelector(".board-body").addEventListener("click", onClick);
  window.addEventListener("resize", function () {
    measure();
    redraw();
  });

  /* 时间预算：关卡自己带 seconds 就用它，否则按不同点数量算 */
  startTimer(Number.isFinite(level.seconds)
    ? level.seconds * 1000
    : (base + perDiff * level.diffs.length) * 1000);
}

boot();
