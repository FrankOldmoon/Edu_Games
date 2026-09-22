/* 变量追踪：一行一行地跑一段真 Python，学生来当解释器。

   每一关给一段代码，程序"执行"到某一行之前，先问一句
   "这一行跑完之后，xxx 是多少？" —— 答对了这一行才真的执行、
   变量表才长出那一行；答错扣 5 秒、可以重选。

   关键：这里的每一步（steps）和每道题的正确答案（answer）**不是这里算的**，
   是出题时用真 CPython 跑出来写进 levels.json 的（tools/trace-levels.py）。
   浏览器里一行 Python 都不跑 —— 所以单人玩的时候一个字节的 wasm 都不用下。
   要自己粘一段代码出题，才去懒加载 Pyodide（见 importCode 那一段）。

   为什么不肯自己写个 JS 求值器：`1/2`、`//` 对负数取整、字符串乘法、
   range 的边界…… 手写迟早会有一条教错，而这是教学游戏，教错是致命的。 */

import bank from "../levels.json";
import en from "./locales/en.js";
import zhCN from "./locales/zh-CN.js";
/* 出题内核，和 tools/trace-levels.py 用的是**同一份文件**：
   出题时被 Python import，这里被 Vite 以 ?raw 原样读进来交给 Pyodide。
   一份代码两个身份，免得两边的追踪逻辑漂移。 */
import tracerSrc from "../../../tools/pytrace.py?raw";
import { i18n, t, mountSwitcher } from "./i18n.js";
import { params, createProgress, startIndex, loadBank, reportResult } from "../../../src/game-ui/progress.js";
import { celebrate, isCelebrating } from "../../../src/game-ui/feedback.js";
import { createCountdown, limitMs, formatClock } from "../../../src/game-ui/timer.js";
import { renderLevelList } from "../../../src/game-ui/levels-ui.js";

const GAME_ID = "trace";
const PACKS = { en: en, "zh-CN": zhCN };
const el = function (id) { return document.getElementById(id); };

/* 每关限时 = BASE + PER × 本关题数（levels.json 里的 timer 可以覆盖）。
   默认：15 秒垫底 + 每题 20 秒 —— 想清楚一个变量的变化，值得这点时间。 */
const TIME_BASE = 15;
const TIME_PER_QUESTION = 20;
/* 答错扣 5 秒。和 spot-the-difference 一个尺度：错了有代价，但能重选。 */
const WRONG_PENALTY_MS = 5000;

let levels = bank.levels || bank;
let prog = null;
let game = null;
let clock = null;
let timedOut = false;

/* 房间（多人）：和记忆/走迷宫/找不同一样，走 src/game-ui/room/ 那一层。
   语义是"各自一局"—— 点开始只开自己那一局，房间只同步"谁在第几关、
   这一关走到了第几步"。塔上只画和你同一关的人。 */
const MODE = { SOLO: "solo", ROOM: "room" };
const ROOM_NAME = "trace";          /* 服务器房间类型名（server/index.js 里 define 的那个） */
const NAME_KEY = "trace.name";

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

/* ------------------------------ 文案取值 ------------------------------ */

function packNow() {
  return PACKS[i18n.getLocale()] || PACKS.en;
}

/* 关卡自带的文案优先（?json= 传进来的自定义题库可以自带 title/tip），
   其次查语言包，最后空串。 */
function lvText(lv, field) {
  if (typeof lv[field] === "string") return lv[field];
  const here = packNow().levels && packNow().levels[lv.id];
  if (here && typeof here[field] === "string") return here[field];
  const fb = PACKS.en.levels && PACKS.en.levels[lv.id];
  return fb && typeof fb[field] === "string" ? fb[field] : "";
}

/* -------------------------------- 工具 -------------------------------- */

function show(view) {
  document.body.dataset.view = view;
}

/* 每一步会用到的变量名（列头）。按名字排序，让同一关的表头稳定不动。 */
function varNames(steps) {
  const set = new Set();
  steps.forEach(function (s) {
    Object.keys(s.vars || {}).forEach(function (k) { set.add(k); });
  });
  return Array.from(set).sort();
}

/* 第 k 步是"第几次执行它那一行"—— 循环里同一行会跑很多遍，
   不写清第几次，题目就歧义了。 */
function occurrenceAt(steps, k) {
  const line = steps[k].line;
  let n = 0;
  for (let i = 0; i <= k; i++) if (steps[i].line === line) n += 1;
  return n;
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

/* 题目归一化。自带题库里 answer 是"正确选项的下标"（由出题脚本算出来的）；
   老师手写 / 浏览器现算的题库多半更愿意写 correct（正确那个值的原文），
   这里两种都收 —— 按下标找不到就按值找。找不到正确答案的题直接丢掉：
   留一道永远答不对的题，比少一道题糟糕得多。 */
function normalizeAsk(ask) {
  const out = [];
  (ask || []).forEach(function (q) {
    if (!q || !Array.isArray(q.options) || typeof q.step !== "number") return;
    let a = q.answer;
    if (typeof a !== "number" && typeof q.correct === "string") a = q.options.indexOf(q.correct);
    if (typeof a !== "number" || a < 0 || a >= q.options.length) return;
    out.push(Object.assign({}, q, { answer: a }));
  });
  return out;
}

function startLevel(i) {
  begin(levels[i], i);
}

/* index 传 -1 表示这是「导入我的代码」现算出来的，不属于题库：
   不写进度、不参与解锁、也没有"下一关"。 */
function begin(lv, index) {
  const steps = lv.steps || [];
  const ask = normalizeAsk(lv.ask);

  /* 把题目按"第几步"挂起来，方便 O(1) 取 */
  const byStep = {};
  ask.forEach(function (q) {
    byStep[q.step] = { q: q, wrong: {}, firstTry: true };
  });

  game = {
    index: index,
    level: lv,
    steps: steps,
    code: lv.code || [],
    cols: varNames(steps),
    askByStep: byStep,
    totalQ: ask.length,
    /* 限时的"单位"：有题就是题数，纯看 trace（导入的代码）就是步数 */
    unit: ask.length || Math.max(1, steps.length),
    correct: 0,
    applied: 0,
    startedAt: Date.now(),
  };
  timedOut = false;

  el("work").classList.remove("failed");
  paintChrome();
  renderCode();
  renderTable();
  renderOut();
  renderAsk();
  show("game");
  startClock();
  reportProgress();          /* 房间里：把"我在第几关、走了几步"告诉别人 */
}

function paintChrome() {
  if (!game) return;
  const imported = game.index < 0;
  el("lvName").textContent = imported
    ? t("ui.importedTitle")
    : t("ui.levelNo", { n: game.index + 1 }) + " · " + lvText(game.level, "title");
  el("counter").textContent = game.totalQ
    ? t("ui.score", { ok: game.correct, total: game.totalQ })
    : t("ui.stepsOf", { n: game.applied, total: game.steps.length });

  if (timedOut) {
    el("tip").textContent = t("ui.timeUp");
    return;
  }
  const limit = Math.round(limitMs(game.level, game.unit, TIME_BASE, TIME_PER_QUESTION) / 1000);
  const tip = imported ? t("ui.importedTip") : lvText(game.level, "tip");
  el("tip").textContent = t("ui.timeLimit", { n: limit }) + " · " + tip;
}

/* 代码：已经跑过的行变暗，正要跑的那一行高亮。
   注意同一行可能跑很多遍（循环），所以"跑过"是一个集合、不是前缀。 */
function renderCode() {
  const box = el("code");
  const cur = game.applied < game.steps.length ? game.steps[game.applied].line : -1;
  const ran = {};
  for (let k = 0; k < game.applied; k++) ran[game.steps[k].line] = true;

  box.innerHTML = "";
  game.code.forEach(function (src, li) {
    const row = document.createElement("div");
    row.className = "ln" + (li === cur ? " now" : (ran[li] ? " ran" : ""));
    const no = document.createElement("span");
    no.className = "no";
    no.textContent = String(li + 1);
    const s = document.createElement("span");
    s.className = "src";
    s.textContent = src === "" ? " " : src;      /* 空行也要占一行，不然行号会串 */
    row.append(no, s);
    box.appendChild(row);
  });
}

/* 变量表：列 = 这一关出现过的所有变量，行 = 已经跑完的每一步。
   还没执行的步骤不画 —— 表是长出来的，不是一开始就在那儿等填。
   这一步有题且还没答，就先摆一行"待答"，把要预测的那格留成 ?。 */
function renderTable() {
  const box = el("trace");
  const pending = currentQuestion();

  const head = ["<tr><th class=\"lno\">#</th>"];
  game.cols.forEach(function (c) { head.push("<th>" + esc(c) + "</th>"); });
  head.push("</tr>");

  const rows = [];
  for (let k = 0; k < game.applied; k++) {
    const s = game.steps[k];
    const cells = ["<td class=\"lno\">" + (s.line + 1) + "</td>"];
    game.cols.forEach(function (c) {
      const v = s.vars && s.vars[c] !== undefined ? s.vars[c] : "·";
      cells.push("<td>" + esc(v) + "</td>");
    });
    const cls = (k === game.applied - 1 ? " class=\"just\"" : "");
    rows.push("<tr" + cls + ">" + cells.join("") + "</tr>");
  }

  /* 待答的那一步先摆一行占位，把要预测的那格留成 ? —— 学生就知道答案会落在哪。
     "程序输出什么"这种题不指某个变量，占位行没有意义，就不摆。 */
  if (pending && pending.q.kind === "var") {
    const s = game.steps[game.applied];
    const cells = ["<td class=\"lno\">" + (s.line + 1) + "</td>"];
    game.cols.forEach(function (c) {
      cells.push("<td>" + (c === pending.q.name ? "<span class=\"unknown\">?</span>" : "·") + "</td>");
    });
    rows.push("<tr class=\"pending\">" + cells.join("") + "</tr>");
  }

  box.innerHTML = "<table class=\"trace\">" + head.join("") + rows.join("") + "</table>";
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* 程序打印出来的东西：跑到哪一步就亮到哪一行。
   输出题问的正是"下一行会打印什么"，所以这里绝不能提前放答案 ——
   只画已经执行完的步骤产出过的那些行（steps[k].out 是累计行数）。 */
function renderOut() {
  const box = el("out");
  const cum = game.applied > 0 ? (game.steps[game.applied - 1].out || 0) : 0;
  const lines = (game.level.out || []).slice(0, cum);
  box.innerHTML = lines.length
    ? lines.map(function (l) { return "<div class=\"oline\">" + esc(l) + "</div>"; }).join("")
    : "<div class=\"oline none\">" + esc(t("ui.noOutput")) + "</div>";
}

function currentQuestion() {
  if (!game || timedOut) return null;
  return game.askByStep[game.applied] || null;
}

/* 问题栏：有题就出选项，没题就给"跑下一行"。
   题面点明"第几行、第几次执行"—— 循环里少了"第几次"就有歧义。 */
function renderAsk() {
  const box = el("qbox");

  if (timedOut) {
    box.className = "qbox timeup";
    box.innerHTML = "<p class=\"qtext\">" + esc(t("ui.timeUp")) + "</p>";
    return;
  }

  const p = currentQuestion();
  if (!p) {
    box.className = "qbox idle";
    const last = game.applied >= game.steps.length;
    box.innerHTML =
      "<button class=\"btn primary\" id=\"btnStep\" type=\"button\"" + (last ? " disabled" : "") + ">" +
      esc(t("ui.step")) + "</button>" +
      "<span class=\"qhint\">" + esc(t("ui.stepHint", { line: nextLine() })) + "</span>";
    const b = el("btnStep");
    if (b) b.addEventListener("click", advance);
    return;
  }

  const q = p.q;
  const n = occurrenceAt(game.steps, game.applied);
  /* 变量名单独套一层 <code>，所以句子拆成前后两半再拼 —— 变量的名字来自题库
     （?json= 时是老师给的），必须转义，不能整串走 innerHTML。 */
  const title = q.kind === "out"
    ? esc(t("ui.askOut", { nth: q.nth }))
    : esc(t("ui.askVarPre", { line: q.line + 1, nth: n })) +
      " <code>" + esc(q.name) + "</code> " + esc(t("ui.askVarPost"));

  box.className = "qbox asking";
  const opts = q.options.map(function (o, oi) {
    const bad = p.wrong[oi];
    return "<button class=\"opt" + (bad ? " bad" : "") + "\" type=\"button\" data-i=\"" + oi + "\"" +
      (bad ? " disabled" : "") + ">" + esc(o) + "</button>";
  }).join("");
  box.innerHTML =
    "<p class=\"qtext\">" + title + "</p>" +
    "<div class=\"qopts\">" + opts + "</div>" +
    "<p class=\"qnote\">" + esc(p.firstTry ? t("ui.pickOne") : t("ui.tryAgain")) + "</p>";

  box.querySelectorAll(".opt").forEach(function (b) {
    b.addEventListener("click", function () { answer(parseInt(b.dataset.i, 10)); });
  });
}

function nextLine() {
  const s = game.steps[game.applied];
  return s ? s.line + 1 : game.code.length;
}

/* 跑下一行。有题拦着就得先答题，所以这里只处理没题的情况。 */
function advance() {
  if (!game || timedOut) return;
  if (currentQuestion()) return;
  game.applied += 1;
  if (game.applied >= game.steps.length) {
    afterRender();
    finish();
    return;
  }
  afterRender();
  reportProgress();
  /* 下一步如果是个问题，问题栏自己会变成选项；否则继续等"跑下一行" */
  const p = currentQuestion();
  if (p) {
    /* 到了要预测的那一行：把焦点交给第一个选项，键盘就能直接选 */
    const first = el("qbox").querySelector(".opt");
    if (first) first.focus();
  }
}

function answer(oi) {
  if (!game || timedOut) return;
  const p = currentQuestion();
  if (!p) return;
  const q = p.q;

  if (oi === q.answer) {
    if (p.firstTry) game.correct += 1;
    p.done = true;
    game.answeredStep = game.applied;
    game.applied += 1;
    if (game.applied >= game.steps.length) {
      afterRender();
      finish();
      return;
    }
    afterRender();
    reportProgress();
    return;
  }

  /* 答错：扣时、把这个选项钉成红的、可以重选。第一次答错就不再计分。 */
  p.firstTry = false;
  p.wrong[oi] = true;
  if (clock) clock.penalize(WRONG_PENALTY_MS);
  renderAsk();
  el("work").classList.remove("failed");
  void el("work").offsetWidth;
  el("work").classList.add("failed");
}

function afterRender() {
  paintChrome();
  renderCode();
  renderTable();
  renderOut();
  renderAsk();
}

/* 出报告用：这一关的完成比例（题答对了几道 / 一共几道） */
function rate() {
  return game.totalQ ? game.correct / game.totalQ : 1;
}

function finish() {
  clock.stop();
  const index = game.index;
  const imported = index < 0;
  const last = !imported && index === levels.length - 1;
  const seconds = Math.round((Date.now() - game.startedAt) / 1000);
  const ok = game.correct;
  const total = game.totalQ;
  const steps = game.steps.length;
  const time = formatClock(seconds * 1000);

  el("work").classList.remove("failed");
  if (!imported) prog.mark(game.level.id);
  reportResult(GAME_ID, {
    level: imported ? 0 : index + 1,
    levelId: imported ? "__imported__" : game.level.id,
    levelTitle: imported ? "" : lvText(game.level, "title"),
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
  reportProgress();          /* 房间里：报一下走满这一步，塔顶见 */

  /* 导入的代码没有题，就别拿"答对几道"来收尾 —— 它本来就是个看 trace 的工具 */
  celebrate({
    title: imported ? t("ui.watchDone") : t("ui.win"),
    lines: imported
      ? [t("ui.watchLine", { steps: steps, time: time })]
      : [
        ok === total ? t("ui.perfect") : t("ui.partial", { ok: ok, total: total }),
        t("ui.winLine", { steps: steps, time: time }),
      ],
    actionLabel: imported ? t("ui.backToList") : (last ? t("ui.allDone") : t("ui.next")),
    onAction: function () {
      if (imported || last) toList();
      else startLevel(index + 1);
    },
  });
}

function toList() {
  if (mode === MODE.ROOM) {
    leaveRoom();            /* 房间模式回列表 = 离开这间房 */
    return;
  }
  stopClock();
  game = null;
  timedOut = false;
  renderList();
  show("list");
}

/* -------------------------------- 计时 -------------------------------- */

function startClock() {
  clock.start(limitMs(game.level, game.totalQ, TIME_BASE, TIME_PER_QUESTION));
}

function stopClock() {
  if (clock) clock.stop();
}

/* 超时：把整条 trace 全摆出来（该看的都让人看见），题目就作废了。
   不把没答的题硬判错 —— 先把正确答案给人看，比分留白。 */
function timeUp() {
  if (!game || timedOut) return;
  timedOut = true;
  game.applied = game.steps.length;
  afterRender();
  reportProgress();          /* 房间里：超时也是当前进度，照它记着 */
  el("work").classList.add("failed");
  reportResult(GAME_ID, {
    level: game.index < 0 ? 0 : game.index + 1,
    levelId: game.index < 0 ? "__imported__" : game.level.id,
    levelTitle: game.index < 0 ? "" : lvText(game.level, "title"),
    correct: game.correct,
    total: game.totalQ,
    rate: game.index < 0 ? 0 : rate(),
    progress: prog.ratio(),
    finished: false,
    timedOut: true,
    locale: i18n.getLocale(),
  });
}

/* --------------------- 导入自己的代码（懒加载 Pyodide） ---------------------

   这是整个游戏里唯一碰 Python 运行时的路径，而且是**点按钮才走**：
   玩法本身一行 Python 都不跑（答案早就在题库里），所以普通学生玩的时候
   一个字节的 wasm 都不会下载。只有老师想拿自己的一段代码现算 trace 时，
   才去拉 Pyodide（约 13MB，浏览器会缓存）。

   为什么这里非要真 CPython：`1/2`、`//` 对负数取整、字符串乘法、range 的
   边界…… 自己手写求值器迟早会有一条教错，而这是教学游戏。 */

const MAX_IMPORT_LINES = 40;

/* 路径故意写成变量：Vite 看到**字面量**的动态 import 就会去解析它，
   而 /pyodide/ 是运行时才存在的东西（dev 由中间件供，线上由 nginx 供），
   构建时它不在，直接写字符串会让构建失败。配 @vite-ignore 才是"留到运行时"。 */
const PYODIDE_ENTRY = "/pyodide/pyodide.mjs";
const PYODIDE_DIR = "/pyodide/";

let pyodide = null;
let pyodidePending = null;

function loadPyodideRuntime() {
  if (pyodide) return Promise.resolve(pyodide);
  if (pyodidePending) return pyodidePending;
  pyodidePending = (async function () {
    const mod = await import(/* @vite-ignore */ PYODIDE_ENTRY);
    pyodide = await mod.loadPyodide({ indexURL: PYODIDE_DIR });
    return pyodide;
  })().catch(function (e) {
    pyodidePending = null;          /* 失败别把拒绝状态缓存住，下次还能重试 */
    throw e;
  });
  return pyodidePending;
}

/* 把出题内核装进去再调它。tracerSrc 就是 tools/pytrace.py 的原文，
   和出题脚本用的是同一份 —— 两边的追踪逻辑不会漂移。 */
const TRACE_PY = [
  "import json",
  "_ns = {'__name__': 'tracer'}",
  "exec(__tracer_src, _ns)",
  "steps, out = _ns['trace_of'](json.loads(__code_json))",
  "json.dumps({'steps': steps, 'out': out})",
].join("\n");

async function traceInBrowser(codeLines) {
  const py = await loadPyodideRuntime();
  /* 都当字符串递进去：JS 的数组递过去会变成 PyProxy，得自己管回收，
     过一趟 JSON 就没有这些麻烦。 */
  py.globals.set("__tracer_src", tracerSrc);
  py.globals.set("__code_json", JSON.stringify(codeLines));
  return JSON.parse(py.runPython(TRACE_PY));
}

/* Python 抛出来的异常：留给人的是最下面那一行（NameError: ... / SyntaxError: ...）。
   自己 exec 进去的模块会带一层模块名（tracer.TooLong: …），去掉更像 Python 原话。 */
function pyErrText(e) {
  const msg = String((e && e.message) || e);
  const lines = msg.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  return (lines[lines.length - 1] || msg).replace(/^[A-Za-z_]\w*\.(?=[A-Z])/, "");
}

const IMPORT_HINT = "用 correct 写正确的那一个值，比数下标可靠："
  + "ask: [{ step: <第几步>, name: \"变量名\", options: [...], correct: \"正确值\" }]";

let lastBank = null;

function setImportStatus(msg, kind) {
  const box = el("importStatus");
  box.textContent = msg || "";
  box.className = "importstatus" + (kind ? " " + kind : "");
}

function importErr(msg) {
  const box = el("importErr");
  box.hidden = !msg;
  box.textContent = msg || "";
}

async function runImport() {
  importErr("");
  const raw = el("importCode").value.replace(/\r\n?/g, "\n");
  const code = raw.split("\n");
  while (code.length && !code[code.length - 1].trim()) code.pop();
  while (code.length && !code[0].trim()) code.shift();

  if (!code.length) { importErr(t("ui.importEmpty")); return; }
  if (code.length > MAX_IMPORT_LINES) { importErr(t("ui.importTooMany", { n: MAX_IMPORT_LINES })); return; }

  el("btnTrace").disabled = true;
  el("btnDownload").disabled = true;
  try {
    if (!pyodide) setImportStatus(t("ui.importLoading"), "busy");
    await loadPyodideRuntime();
    setImportStatus(t("ui.importTracing"), "busy");
    /* 让浏览器有机会把上面那句话画出来，再进同步的 runPython */
    await new Promise(function (r) { setTimeout(r, 0); });

    const res = await traceInBrowser(code);
    if (!res.steps || !res.steps.length) throw new Error(t("ui.importNoSteps"));

    lastBank = {
      _generatedBy: "Python Variable Trace — 导入我的代码（Pyodide 现算）",
      _askHint: IMPORT_HINT,
      levels: [{
        id: "imported",
        code: code,
        timer: { base: 30, per: 5 },      /* 纯看 trace，给宽一点 */
        steps: res.steps,
        out: res.out || [],
        ask: [],
      }],
    };
    el("btnDownload").disabled = false;
    setImportStatus(t("ui.importOk", { n: res.steps.length }), "ok");
    begin(lastBank.levels[0], -1);
  } catch (e) {
    setImportStatus("");
    importErr(t("ui.importFailed", { msg: pyErrText(e) }));
  } finally {
    el("btnTrace").disabled = false;
  }
}

function downloadBank() {
  if (!lastBank) return;
  const blob = new Blob([JSON.stringify(lastBank, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "levels.json";
  document.body.appendChild(a);
  a.click();
  /* 立刻把 <a> 摘掉 / 撤销 blob 会把还没开始的下载直接掐掉 —— 等一会儿再收 */
  setTimeout(function () {
    a.remove();
    URL.revokeObjectURL(url);
  }, 2000);
}

/* ------------------------------ 房间（多人） ------------------------------ */

/* 这一关的目标数（步数）：塔上的纵向比例要用它当分母。分母从本地题库取
   （两边是同一份 levels.json）。 */
function stepsAt(i) {
  const lv = Array.isArray(levels) ? levels[i] : null;
  return lv && Array.isArray(lv.steps) ? lv.steps.length : 0;
}

/* 上报"我在第几关、这一关走到了第几步"。每条都是完整的真相，被限流丢一条
   下一条自己就修正回来了。导入的代码（index=-1）不属于题库，不进房间。 */
function reportProgress() {
  if (mode !== MODE.ROOM || !net || !game || game.index < 0) return;
  net.progress({ level: game.index, pos: game.applied });
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
    /* 房间满了不是"连不上服务器"，得让人知道该换个房号 */
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
    denomFor: stepsAt,
    /* 开始按钮旁边那句：一按就从第 1 关起 */
    startLabel: function () {
      return t("ui.levelNo", { n: 1 }) + " · " + lvText(levels[0], "title");
    },
    nameDefault: playerName,
    nameFixed: !!usernameFromUrlSafe(),
    inviteUrl: function () { return net.inviteUrl(); },
    /* 点开始：只开我自己这一局 —— 本地从第 1 关摆开，同时告诉服务器我开始了 */
    onStart: function () {
      if (!net) return;
      net.start({});
      startLevel(0);
    },
    onLeave: leaveRoom,
    onName: function (v) {
      rememberName(v);
      if (net) {
        net.writeNameToUrl(v);
        net.setName(v);
      }
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
   关卡是本地推进的（变量表在我这儿），服务器只负责记着给别人看。 */
function onRoomState() {
  if (!net || !net.room.state) return;
  const st = net.room.state;
  if (!st.players) return;
  if (panel) panel.render(st, net.sessionId);
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
  paintChrome();
  renderOut();
  renderAsk();
}

/* -------------------------------- 启动 -------------------------------- */

async function boot() {
  mountSwitcher();
  i18n.onChange(relocalize);
  clock = createCountdown({ el: el("clock"), bar: el("timebar"), label: clockLabel, onExpire: timeUp });

  /* ?room= 出现就是进房。只算一次：?room= 空着时每次调用生成的随机房号都不一样。
     进房用内置题库，房间的关卡集是服务器那份 levels.json —— ?json= 自定义题库进房时忽略。 */
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
    if (confirm(t("ui.resetConfirm"))) {
      prog.reset();
      renderList();
    }
  });
  el("btnRetry").addEventListener("click", function () { if (game) startLevel(game.index); });
  el("btnToList").addEventListener("click", toList);
  /* 房间：新建一间（随机房号写进 URL，复制链接就能请人进来） */
  el("btnPlayWithOthers").addEventListener("click", function () {
    const url = new URL(location.href);
    url.searchParams.set("room", randomRoomCode());
    url.searchParams.delete("json");      /* 进房用内置题库，别把自定义题库带进去 */
    location.assign(url.toString());
  });

  /* 「导入我的代码」：展开面板 / 现算 trace / 导出题库 */
  el("btnImport").addEventListener("click", function () {
    const body = el("importBody");
    body.hidden = !body.hidden;
    if (!body.hidden) el("importCode").focus();
  });
  el("btnTrace").addEventListener("click", runImport);
  el("btnDownload").addEventListener("click", downloadBank);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !isCelebrating()) {
      if (game || mode === MODE.ROOM) toList();
      return;
    }
    if (!game || timedOut || isCelebrating()) return;
    /* 数字键选答案：键盘党的路，和点按钮等效 */
    const p = currentQuestion();
    if (p) {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= p.q.options.length) {
        e.preventDefault();
        answer(n - 1);
      }
      return;
    }
    /* 没题的时候，空格 / 回车 = 跑下一行（焦点在按钮上就交给按钮自己） */
    if ((e.key === " " || e.key === "Enter") && !/^(BUTTON|INPUT|SELECT|A)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      advance();
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

/* 计时胶囊：超时就只剩"时间到"，不然是 0:42 */
function clockLabel(msLeft) {
  return timedOut ? t("ui.timeUpShort") : formatClock(msLeft);
}

boot();
