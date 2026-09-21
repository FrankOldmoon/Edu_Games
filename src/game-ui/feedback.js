/* 通关反馈弹框：新游戏共用（样式在 src/game-ui/base.css 的 .celebrate-*）。

   celebrate({
     title:  "全部找到！",
     lines:  ["剩余 10 秒", "18 步"],
     actionLabel: "下一关 →",
     onAction:  fn,   // 点了主按钮
     onDismiss: fn,   // 点遮罩 / 按 Esc 收掉
     fireworks: false, // 默认会放一轮通关烟花（src/game-ui/fireworks.js）
   })

   烟花先放，卡片隔 3 秒再弹：卡片是模态的，一插进来就把刚做好的那一盘盖住了，
   而"全部搞定"这一刻本来就是给烟花留的。没有烟花可看的时候（自己传了
   fireworks: false，或系统要求减少动态效果）就直接弹，不让人干等。

   等烟花的这几秒里会先铺一层透明的 .celebrate-blocker：遮罩和卡片都还没进来，
   但底下的游戏不该能点 —— 否则刚赢下这一盘的手会顺手按到面板上再触发一次。
   弹框不会自动消失；同时只保留一个实例。 */

import { launchFireworks } from "./fireworks.js";

const CARD_DELAY_MS = 3000;

let current = null;

export function celebrate(opts) {
  const o = opts || {};
  if (current) current.close(false);

  const overlay = document.createElement("div");
  overlay.className = "celebrate";

  const card = document.createElement("div");
  card.className = "celebrate-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");

  const check = document.createElement("div");
  check.className = "celebrate-check";
  check.setAttribute("aria-hidden", "true");
  check.textContent = "✓";
  card.appendChild(check);

  const title = document.createElement("div");
  title.className = "celebrate-title";
  title.textContent = o.title || "";
  card.appendChild(title);

  if (o.lines && o.lines.length) {
    const box = document.createElement("div");
    box.className = "celebrate-lines";
    o.lines.forEach(function (line) {
      const row = document.createElement("div");
      row.textContent = line;
      box.appendChild(row);
    });
    card.appendChild(box);
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn primary";
  btn.textContent = o.actionLabel || "Continue";
  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    close(true);
  });
  card.appendChild(btn);

  /* 卡片自己吃点击，别让它在冒泡里被遮罩当成"点空白"收掉 */
  card.addEventListener("click", function (e) { e.stopPropagation(); });

  function onKey(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close(false);
    }
  }

  let timer = 0;
  let blocker = null;
  let fx = null;

  function show() {
    timer = 0;
    if (blocker) { blocker.remove(); blocker = null; }
    document.body.appendChild(overlay);
    document.body.appendChild(card);
    document.addEventListener("keydown", onKey, true);
    btn.focus();
  }

  function close(byAction) {
    if (timer) clearTimeout(timer);
    if (blocker) { blocker.remove(); blocker = null; }
    document.removeEventListener("keydown", onKey, true);
    if (fx) fx.stop();
    overlay.remove();
    card.remove();
    current = null;
    if (byAction) {
      if (o.onAction) o.onAction();
    } else if (o.onDismiss) {
      o.onDismiss();
    }
  }

  overlay.addEventListener("click", function () { close(false); });

  /* 烟花先放：火花飞在遮罩上面、卡片下面（见 base.css 的 .fx-canvas）。
     没有烟花可看的时候 fx 是 null（自己关了，或者系统要求减少动态效果），
     那就没有等的理由，卡片直接弹。 */
  fx = o.fireworks === false ? null : launchFireworks({ shells: 9, hue: o.hue });

  /* current 先挂上：卡片还没弹出来的这几秒里 isCelebrating() 也该是 true ——
     游戏靠它停掉输入，不能因为"卡片还没出现"就多收几个键 */
  current = { close: close };

  if (fx) {
    blocker = document.createElement("div");
    blocker.className = "celebrate-blocker";
    document.body.appendChild(blocker);
    timer = setTimeout(show, CARD_DELAY_MS);
  } else {
    show();
  }

  return current;
}

export function isCelebrating() {
  return current !== null;
}
