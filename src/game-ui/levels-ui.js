/* 关卡列表：所有游戏共用的一份标记和浮现顺序（样式在 base.css 的 .levels / .lv）。

   这么做是为了让每个游戏的列表页长得一模一样 —— 同样的卡片、同样的
   --i 错开浮入、同样的完成/已解锁/未解锁三态。各游戏只负责把文案和
   数据喂进来，不再各写一套列表。

   renderLevelList({
     host,               容器（这一步会加上 .levels）
     levels,             [{ id, name, tip }]，文案已本地化
     done,               已通关的关卡 id 数组
     isOpen(i),          第 i 关是否解锁；默认按 done 顺序解锁
     hrefFor(i),         返回 URL → 渲染成 <a>（换页式，如 spot-the-difference）
     onPick(i),          没有 hrefFor 时点击回调 → 渲染成 <button>（单页式）
     labelNo(i), labelDone, labelStart, labelLocked,
   }) */

export function renderLevelList(opts) {
  const host = opts.host;
  const levels = opts.levels || [];
  const done = opts.done || [];
  const isOpen = opts.isOpen || function (i) {
    return i === 0 || done.indexOf(levels[i - 1].id) >= 0;
  };

  host.classList.add("levels");
  host.innerHTML = "";

  levels.forEach(function (lv, i) {
    const finished = done.indexOf(lv.id) >= 0;
    const open = isOpen(i);
    const href = open && opts.hrefFor ? opts.hrefFor(i) : null;

    let node;
    if (href) {
      node = document.createElement("a");
      node.href = href;
    } else if (open && opts.onPick) {
      node = document.createElement("button");
      node.type = "button";
    } else {
      node = document.createElement("div");
    }

    node.className = "lv " + (finished ? "done" : (open ? "open" : "locked"));
    node.style.setProperty("--i", String(i));      /* 依次浮入的错开顺序 */

    node.appendChild(cell("num", opts.labelNo(i)));
    node.appendChild(cell("nm", lv.name || lv.id));
    node.appendChild(cell("tp", lv.tip || ""));
    node.appendChild(cell("st", finished ? opts.labelDone : (open ? opts.labelStart : opts.labelLocked)));

    if (!href && open && opts.onPick) {
      node.addEventListener("click", function () { opts.onPick(i); });
    }
    host.appendChild(node);
  });
}

function cell(cls, text) {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = text;
  return d;
}
