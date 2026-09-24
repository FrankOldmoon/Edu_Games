/* 分支地牢(新玩法)引擎：一个带朝向的角色在一片迷宫里走，走到 ★ 终点就过关。

   玩法不是手动走迷宫，而是“拼程序”：
   · 每关给一组方块—— if/elif/else 分支块（迷宫感知：前方/左方/右方是否有路）
     和移动指令块（前进 F、左转 L、右转 R）。
   · 玩家把手头的块自由拼成一段程序（palette 加进 program，可拖拽重排、可删）。
   · 点「执行」，程序从头跑到尾，角色按程序结果自动走；走到终点即通关。

   数据和正解都是出题脚本（tools/branch-levels.py）用确定算法算出来的，
   浏览器只按 levels.json 的 blocks/map 解释执行，一行 Python 都不跑。 */

function createDungeon(opts) {
  const host = opts.host;
  const lv = opts.level;
  const t = opts.t;
  const map = lv.map;
  const blocksBy = {};
  (lv.blocks || []).forEach(function (b) { blocksBy[b.id] = b; });
  const onWin = opts.win || function () {};
  const onFail = opts.fail || function () {};

  const rows = map.rows.map(function (s) { return s.split(""); });
  const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]]; // N E S W
  const DIRCH = ["N", "E", "S", "W"];

  let pr = map.start.r, pc = map.start.c, pdir = DIRCH.indexOf(map.start.dir);
  const gr = map.goal.r, gc = map.goal.c;

  /* 程序区：顶层块 id 有序序列 */
  let program = [];

  /* 运行时状态 */
  let running = false;
  let timer = null;
  let attempts = 0;          // 执行次数（本关）
  let won = false;

  function open(r, c) {
    if (r < 0 || c < 0 || r >= rows.length) return false;
    if (c >= (rows[r] || []).length) return false;
    return rows[r][c] !== "#";
  }
  function cellCh(r, c) {
    if (r < 0 || c < 0 || r >= rows.length) return "#";
    if (c >= (rows[r] || []).length) return "#";
    return rows[r][c];
  }
  function onGoal() { return pr === gr && pc === gc; }

  /* ---------------------------- 谓词 ---------------------------- */
  function evalPred(pred) {
    const d = DIRS[pdir];
    const dr = d[0], dc = d[1];
    const ldi = (pdir + 3) % 4, rdi = (pdir + 1) % 4;
    const ld = DIRS[ldi], rd = DIRS[rdi];
    switch (pred) {
      case "front-open": return open(pr + dr, pc + dc);
      case "front-wall": return !open(pr + dr, pc + dc);
      case "left-open": return open(pr + ld[0], pc + ld[1]);
      case "left-wall": return !open(pr + ld[0], pc + ld[1]);
      case "right-open": return open(pr + rd[0], pc + rd[1]);
      case "right-wall": return !open(pr + rd[0], pc + rd[1]);
      default: return false;
    }
  }

  /* 返回执行一个块是否成功移动（撞墙/越界 false）。dir-move 不失败。 */
  function applyOp(op) {
    if (op === "L") { pdir = (pdir + 3) % 4; return true; }
    if (op === "R") { pdir = (pdir + 1) % 4; return true; }
    if (op === "F") {
      const d = DIRS[pdir];
      const nr = pr + d[0], nc = pc + d[1];
      if (!open(nr, nc)) return false;
      pr = nr; pc = nc;
      return true;
    }
    return true;
  }

  /* 展开程序（含 chain 内分支）执行一遍，把每步之后的 [r,c,dir] 记进 frames。
     返回 false 表示撞墙失败（角色停在撞墙前那一格）。
     撞墙时也会把失败帧记下，便于回放时停在原地做提示。 */
  function execSeq(seq, frames) {
    for (let i = 0; i < seq.length; i++) {
      const id = seq[i];
      const b = blocksBy[id];
      if (!b) continue;
      if (b.type === "move") {
        if (!applyOp(b.op)) return false;
        frames.push([pr, pc, pdir]);
      } else if (b.type === "chain") {
        let chosen = null;
        for (let j = 0; j < b.conds.length; j++) {
          if (evalPred(b.conds[j].pred)) { chosen = b.conds[j]; break; }
        }
        const body = chosen ? chosen.then : (b.else || []);
        if (!execSeq(body, frames)) return false;
      }
    }
    return true;
  }

  /* 从起点整体跑一遍程序，返回 { ok, frames, onGoal }。 */
  function simulate() {
    pr = map.start.r; pc = map.start.c; pdir = DIRCH.indexOf(map.start.dir);
    const frames = [[pr, pc, pdir]];
    const ok = execSeq(program, frames);
    return { ok: ok, frames: frames, onGoal: pr === gr && pc === gc };
  }

  /* ---------------------------- 渲染：顶栏 ---------------------------- */

  const dungeon = document.createElement("div");
  dungeon.className = "dungeon";

  const boardArea = document.createElement("div");
  boardArea.className = "left";
  const note = document.createElement("p");
  note.className = "stagenote";
  note.innerHTML = t("ui.stageNote");
  boardArea.appendChild(note);
  const board = document.createElement("div");
  board.className = "board";
  boardArea.appendChild(board);
  const mv = document.createElement("p");
  mv.className = "movehint";
  mv.textContent = t("ui.moveHint");
  boardArea.appendChild(mv);

  /* ---------------------------- 渲染：右侧摆块 ---------------------------- */

  const side = document.createElement("div");
  side.className = "side";

  const paletteCard = document.createElement("div");
  paletteCard.className = "card";
  paletteCard.innerHTML = "<h4>" + esc(t("ui.palette")) + "</h4><div class=\"palette\"></div>";
  side.appendChild(paletteCard);

  const progCard = document.createElement("div");
  progCard.className = "card progcard";
  progCard.innerHTML = "<h4>" + esc(t("ui.yourProgram")) + "</h4>" +
    "<div class=\"program\"><div class=\"empty\">" + esc(t("ui.programEmpty")) + "</div></div>" +
    "<div class=\"progbtns\">" +
    "  <button class=\"btn runbtn\" type=\"button\">" + esc(t("ui.run")) + "</button>" +
    "  <button class=\"btn clearbtn\" type=\"button\">" + esc(t("ui.clear")) + "</button>" +
    "</div>" +
    "<div class=\"runstatus\"></div>";
  side.appendChild(progCard);

  const probCard = document.createElement("div");
  probCard.className = "card";
  probCard.innerHTML = "<h4>" + esc(t("ui.problem")) + "</h4><div class=\"prob\"></div>";
  side.appendChild(probCard);

  dungeon.appendChild(boardArea);
  dungeon.appendChild(side);
  host.appendChild(dungeon);

  /* ---------------------------- 块渲染 label ---------------------------- */

  function predLabel(pred) {
    const map = {
      "front-open": t("ui.predFrontOpen"), "front-wall": t("ui.predFrontWall"),
      "left-open": t("ui.predLeftOpen"), "left-wall": t("ui.predLeftWall"),
      "right-open": t("ui.predRightOpen"), "right-wall": t("ui.predRightWall"),
    };
    return map[pred] || pred;
  }

  /* 渲染一个块。pick=true 时给根元素打上 data-pick —— palette 里只有顶层块可被
     点击加入（chain 内部的子块只是展示，点它们也会落到外层 chain 上）。 */
  function blockHtml(id, editable, pick) {
    const b = blocksBy[id];
    if (!b) return "<span class=\"blk unknown\">?</span>";
    const ops = { F: t("ui.F"), L: t("ui.L"), R: t("ui.R") };
    const opicon = { F: "↗", L: "↰", R: "↱" };
    const del = editable ? "<button class=\"del\" title=\"" + esc(t("ui.remove")) + "\">✕</button>" : "";
    const pickAttr = pick ? " data-pick=\"1\"" : "";
    if (b.type === "move") {
      return "<span class=\"blk move\"" + pickAttr + " data-id=\"" + id + "\">" +
        "<b>" + esc(ops[b.op]) + "</b><span class=\"opicon\">" + (opicon[b.op] || "") + "</span>" +
        del + "</span>";
    }
    if (b.type === "chain") {
      let html = "<span class=\"blk chain\"" + pickAttr + " data-id=\"" + id + "\">" +
        "<b class=\"kw\">" + esc(t("ui.if")) + "</b> " + esc(predLabel(b.conds[0] ? b.conds[0].pred : "")) +
        "<span class=\"then\">" +
        (b.conds[0] ? b.conds[0].then.map(function (cid) { return blockHtml(cid, false, false); }).join(" ") : "") +
        "</span>";
      if (b.else && b.else.length) {
        html += "<span class=\"kw else\">" + esc(t("ui.else")) + "</span>" +
          "<span class=\"then\">" + b.else.map(function (cid) { return blockHtml(cid, false, false); }).join(" ") + "</span>";
      }
      html += del + "</span>";
      return html;
    }
    return "";
  }

  /* palette 里展示的块：只列顶层块，点任意位置都选中整块 */
  function renderPalette() {
    const box = paletteCard.querySelector(".palette");
    box.innerHTML = (lv.blocks || [])
      .map(function (b) { return blockHtml(b.id, false, true); })
      .join(" ");
  }

  function render(extra) {
    drawBoard();
    renderProgram();
    if (extra) drawStatus(extra);
  }

  /* ---------------------------- 渲染：棋盘 ---------------------------- */

  function drawBoard() {
    board.innerHTML = "";
    board.dataset.locked = running ? "1" : "0";
    const h = rows.length, w = (rows[0] || []).length;
    const size = 40;
    board.style.width = (w * size) + "px";
    board.style.height = (h * size) + "px";
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const el2 = document.createElement("div");
        el2.className = "tile " + (cellCh(r, c) === "#" ? "wall" : "floor");
        el2.style.left = (c * size) + "px";
        el2.style.top = (r * size) + "px";
        el2.style.width = size + "px";
        el2.style.height = size + "px";
        if (cellCh(r, c) === "S") el2.textContent = "S";
        if (r === gr && c === gc) el2.textContent = "★";
        board.appendChild(el2);
      }
    }
    /* 角色 */
    const rob = document.createElement("div");
    rob.className = "robot";
    rob.style.left = (pc * size + size / 2) + "px";
    rob.style.top = (pr * size + size / 2) + "px";
    const body = document.createElement("div");
    body.className = "body";
    body.style.transform = "rotate(" + (pdir * 90) + "deg)";
    rob.appendChild(body);
    board.appendChild(rob);
  }

  /* ---------------------------- 渲染：程序区 ---------------------------- */

  function renderProgram() {
    const box = progCard.querySelector(".program");
    if (!program.length) {
      box.innerHTML = "<div class=\"empty\">" + esc(t("ui.programEmpty")) + "</div>";
    } else {
      box.innerHTML = program.map(function (id, i) {
        return "<div class=\"slot\" draggable=\"true\" data-idx=\"" + i + "\">" +
          blockHtml(id, true, false) + "</div>";
      }).join("");
      wireDnD(box);
    }
  }

  function wireDnD(box) {
    let dragIdx = null;
    const slots = box.querySelectorAll(".slot");
    slots.forEach(function (slot, i) {
      slot.addEventListener("dragstart", function (e) {
        dragIdx = i;
        slot.classList.add("drag");
        try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); } catch (err) {}
      });
      slot.addEventListener("dragend", function () { slot.classList.remove("drag"); });
      slot.addEventListener("dragover", function (e) { if (dragIdx !== null) e.preventDefault(); });
      slot.addEventListener("drop", function (e) {
        e.preventDefault();
        if (dragIdx === null) return;
        const from = dragIdx, to = i;
        const arr = program.slice();
        const [x] = arr.splice(from, 1);
        arr.splice(to, 0, x);
        program = arr;
        dragIdx = null;
        renderProgram();
      });
    });
    /* 点 × 删除 */
    box.querySelectorAll(".del").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const slot = btn.closest(".slot");
        const idx = Number(slot.dataset.idx);
        program.splice(idx, 1);
        renderProgram();
      });
    });
  }

  /* ---------------------------- probe / problem ---------------------------- */

  function drawProblem() {
    const box = probCard.querySelector(".prob");
    box.innerHTML = "<p>" + esc(t("ui.problemText")) + "</p>" +
      "<p class=\"preds\">" +
      [["front-open", "front-wall"], ["left-open", "left-wall"], ["right-open", "right-wall"]]
        .map(function (pair) {
          return "<span class=\"pred\">" + esc(predLabel(pair[0])) + "</span>" +
            "<span class=\"pred alt\">" + esc(predLabel(pair[1])) + "</span>";
        }).join(" ");
  }

  /* ---------------------------- 执行 ---------------------------- */

  function drawStatus(msg) {
    const box = progCard.querySelector(".runstatus");
    if (!msg) { box.innerHTML = ""; box.className = "runstatus"; return; }
    box.textContent = msg.text || "";
    box.className = "runstatus" + (msg.failed ? " bad" : "");
  }

  function stopRun() {
    running = false;
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function doRun() {
    if (running || won) return;
    if (!program.length) { drawStatus({ text: t("ui.programEmpty"), failed: true }); return; }
    attempts += 1;
    running = true;
    drawStatus();
    /* 先在后台把整段程序跑完（这一步是权威结果），再按轨迹逐帧回放。 */
    const res = simulate();
    /* 回放前先回到起点 */
    pr = map.start.r; pc = map.start.c; pdir = DIRCH.indexOf(map.start.dir);
    render();

    const STEP_MS = 220;
    let fi = 0;
    function playFrame() {
      if (fi >= res.frames.length) {
        running = false;
        if (!res.ok) {
          drawStatus({ text: t("ui.bump"), failed: true });
          render();
          onFail();
        } else if (res.onGoal) {
          won = true;
          stopRun();
          drawStatus({ text: t("ui.goal") });
          render();
          onWin();
        } else {
          drawStatus({ text: t("ui.notGoal") });
        }
        return;
      }
      const f = res.frames[fi++];
      pr = f[0]; pc = f[1]; pdir = f[2];
      drawBoard();
      timer = setTimeout(playFrame, STEP_MS);
    }
    timer = setTimeout(playFrame, STEP_MS);
  }

  function clearProgram() {
    if (running) return;
    program = [];
    renderProgram();
    drawStatus();
  }

  /* ---------------------------- 公共 API ---------------------------- */

  dungeon.querySelector(".runbtn").addEventListener("click", doRun);
  dungeon.querySelector(".clearbtn").addEventListener("click", clearProgram);
  /* palette 点击 = 加入 program。用 [data-pick] 而不是 .blk：
     chain 里嵌着子块，点子块也要落到外层整个 chain 上。 */
  paletteCard.addEventListener("click", function (e) {
    if (running) return;
    const blk = e.target.closest("[data-pick]");
    if (!blk) return;
    const id = blk.dataset.id;
    if (!id) return;
    program.push(id);
    renderProgram();
  });

  function relocalize() {
    note.innerHTML = t("ui.stageNote");
    mv.textContent = t("ui.moveHint");
    paletteCard.querySelector("h4").textContent = t("ui.palette");
    progCard.querySelector("h4").textContent = t("ui.yourProgram");
    progCard.querySelector(".empty") && (progCard.querySelector(".empty").textContent = t("ui.programEmpty"));
    progCard.querySelector(".runbtn").textContent = t("ui.run");
    progCard.querySelector(".clearbtn").textContent = t("ui.clear");
    probCard.querySelector("h4").textContent = t("ui.problem");
    renderProgram();
    drawProblem();
    renderPalette();
    drawStatus();
  }

  drawProblem();
  renderPalette();
  render();

  return {
    run: doRun,
    clear: clearProgram,
    undo: function () {
      if (running) return;
      if (program.length) program.pop();
      renderProgram();
      drawStatus();
    },
    attempts: function () { return attempts; },
    onGoal: onGoal,
    relocalize: relocalize,
    lock: function () { won = true; stopRun(); render(); },
    done: function () { return won; },
    solvedCount: function () { return won ? 1 : 0; },
    /* 撞墙后回到起点重摆：保留程序与尝试次数，只把角色挪回去 */
    rewind: function () {
      stopRun();
      pr = map.start.r; pc = map.start.c; pdir = DIRCH.indexOf(map.start.dir);
      render();
    },
  };
}

function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default createDungeon;