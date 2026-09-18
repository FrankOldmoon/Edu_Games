/* 通关反馈弹框：新游戏共用（样式在 src/game-ui/base.css 的 .celebrate-*）。

   celebrate({
     title:  "全部找到！",
     lines:  ["剩余 10 秒", "18 步"],
     actionLabel: "下一关 →",
     onAction:  fn,   // 点了主按钮
     onDismiss: fn,   // 点遮罩 / 按 Esc 收掉
     fireworks: false, // 默认会放一轮通关烟花（src/game-ui/fireworks.js）
   })

   弹框不会自动消失；同时只保留一个实例。 */

import { launchFireworks } from "./fireworks.js";

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

  function close(byAction) {
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
  document.addEventListener("keydown", onKey, true);

  document.body.appendChild(overlay);
  document.body.appendChild(card);
  btn.focus();

  /* 通关烟花：火花飞在遮罩上面、卡片下面（见 base.css 的 .fx-canvas） */
  const fx = o.fireworks === false ? null : launchFireworks({ shells: 9, hue: o.hue });

  current = { close: close };
  return current;
}

export function isCelebrating() {
  return current !== null;
}
