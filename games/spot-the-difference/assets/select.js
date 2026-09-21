/* 关卡选择页：列出所有关卡，完成的打勾，未解锁的锁住（逐关解锁）。

   换语言时不需要重新加载数据：拿原始的 levels 再按新语言补一遍文案重画即可。 */

import { t, i18n, mountSwitcher } from "./i18n.js";
import { loadLevels, localizeLevels, readProgress, unlockedCount, resetProgress, allUnlocked } from "./levels.js";
import { renderLevelList } from "../../../src/game-ui/levels-ui.js";

const $ = (id) => document.getElementById(id);

let levels = [];
let rawLevels = null;      // 原始数据，换语言时重新按新语言补文案
let source = "";

/* 进游戏页时把 json / all 一起带上，否则自定义数据源一点就丢 */
function playUrl(n) {
  const q = new URLSearchParams(location.search);
  q.set("level", String(n));
  return "./play/?" + q.toString();
}

function randomRoomCode() {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function showErr(message) {
  const el = $("err");
  el.hidden = false;
  el.textContent = message;
}

function render() {
  const done = readProgress(source).done;
  const open = allUnlocked() ? levels.length : unlockedCount(levels, done);
  const finished = levels.filter(l => done.indexOf(l.id) >= 0).length;

  $("progress").textContent = t("ui.progress", { done: finished, total: levels.length });

  /* 列表标记统一由 src/game-ui/levels-ui.js 生成：和单页那几个游戏
     长得一模一样，包括 --i 依次浮现的顺序。本页是多页式，所以给 hrefFor。 */
  renderLevelList({
    host: $("levels"),
    levels: levels,
    done: done,
    isOpen: function (i) { return i < open; },
    hrefFor: function (i) { return playUrl(i + 1); },
    labelNo: function (i) { return t("ui.levelNo", { n: i + 1 }); },
    labelDone: t("ui.done"),
    labelStart: t("ui.start"),
    labelLocked: t("ui.locked"),
  });
}

function renderLead() {
  const configured = new URLSearchParams(location.search).get("json");
  $("lead").innerHTML = t("ui.lead", { n: levels.length })
    + (configured ? "" : t("ui.leadCustom"));
}

async function boot() {
  mountSwitcher();

  $("btnReset").onclick = function () {
    if (!window.confirm(t("ui.resetConfirm"))) return;
    resetProgress(source);
    render();
  };

  /* 房间：随机房号带进游戏页 —— 复制链接就能请人进来。房间开在游戏页上，
     因为这一页和游戏页是两个页面（房间那套 UI 在 play/index.html 里）。 */
  $("btnPlayWithOthers").onclick = function () {
    location.href = "./play/?room=" + randomRoomCode();
  };

  try {
    const data = await loadLevels();
    rawLevels = data.levels;
    levels = localizeLevels(rawLevels);
    source = data.source;
  } catch (e) {
    showErr(t("ui.loadFailed", { msg: (e && e.message ? e.message : e) }));
    return;
  }

  renderLead();
  render();

  i18n.onChange(function () {
    levels = localizeLevels(rawLevels);
    renderLead();
    render();
  });
}

boot();
