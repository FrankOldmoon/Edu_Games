/* 分支地牢的引擎：把 levels.json 里的「主干道 + 岔路」画成玩家走着走的格子地图，
   角色的移动就是选择题的作答。

   核心机制：
   · 整关是一条从左到右的主干道，每个 if/elif/else 是一个岔路口。
   · 岔路口有几条分支就有几条并排的走廊；程序只走其中一条（真 CPython 算好，写进 levels.json）。
   · 玩家用方向键/WASD（或点击）把角色走进某条走廊 = 选那条分支。
     走对了沿路捡金币、从右竖刺汇回主干道、继续往前；走错了踩进死走廊的陷阱，
     弹回岔口、扣时，并把那条死分支标灰 + 讲清楚为什么不是它。
   · 没走完当前岔口时主干道被顶住，角色必须下到走廊里选 —— 逼你做人而不是绕过去。 */

function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function createDungeon(opts) {
  const host = opts.host;
  const lv = opts.level;
  const t = opts.t;
  const map = lv.map;
  const onWin = opts.win || function () {};
  const onTrap = opts.lose || function () {};

  const rows = map.rows.map(function (s) { return s.split(""); });
  const rooms = map.regions || [];

  let pr = 0, pc = 0, gr = 0, gc = 0;
  const coins = {};
  let coinTotal = 0;
  rows.forEach(function (rowArr, r) {
    rowArr.forEach(function (ch, c) {
      if (ch === "S") { pr = r; pc = c; rows[r][c] = "."; }
      else if (ch === "G") { gr = r; gc = c; rows[r][c] = "."; }
      else if (ch === "o") { coins[r + "," + c] = true; coinTotal++; rows[r][c] = "."; }
    });
  });

  let solved = 0;            // 已经走通几个岔口
  let firstTrySolved = 0;    // 其中几个是第一次走对的
  let coinsGot = 0;
  let gotGoal = false;

  function branchRow(bi) { return bi + 1; }
  const curRegion = function () { return solved < rooms.length ? rooms[solved] : null; };

  /* 是否"当前岔口"的死走廊第一格（陷阱）。不清楚陷阱在视线里提前暴露死路。 */
  function isTrapCell(r, c, cur) {
    if (!cur) return false;
    if (c !== cur.lc + 1) return false;
    for (let bi = 0; bi < cur.branches.length; bi++) {
      if (branchRow(bi) === r && cur.branches[bi].dead) return true;
    }
    return false;
  }

  function canMove(r, c) {
    if (r < 0 || c < 0 || r >= rows.length || c >= (rows[0] || []).length) return false;
    if (rows[r][c] === "#") return false;
    const cur = curRegion();
    if (cur) {
      if (c > cur.rc) return false;                            // 没走完这道岔口，前面过不去
      if (r === 0 && c > cur.lc && c <= cur.rc) return false;  // 主干道被封 → 逼你下走廊选
    }
    return true;
  }

  function currentVars() {
    const cur = curRegion();
    const last = lv.steps[lv.steps.length - 1];
    if (!cur) return last ? last.vars : {};
    for (let i = 0; i < lv.steps.length; i++) {
      if (lv.steps[i].line === cur.line) return lv.steps[i].vars || {};
    }
    return {};
  }

  function tryStep(r, c) {
    if (gotGoal) return false;
    if (!canMove(r, c)) return false;
    const cur = curRegion();

    if (isTrapCell(r, c, cur)) {
      cur.trapped = true;                 // 这道岔口第一次没走对
      onTrap(cur);                        // 扣时，game.js 管
      pr = 0; pc = cur.lc;                // 弹回岔口主干道
      draw();
      return false;
    }

    pr = r; pc = c;
    if (coins[r + "," + c]) { coins[r + "," + c] = false; coinsGot++; }

    /* 从走廊走到右竖刺、汇回主干道 = 这道岔口走通了 */
    if (cur && r > 0 && c === cur.rc) {
      if (!cur.trapped) firstTrySolved++;
      solved++;
    }

    draw();
    if (pr === gr && pc === gc) {
      gotGoal = true;
      onWin();
      return false;
    }
    return true;
  }

  function stepTo(dr, dc) { return tryStep(pr + dr, pc + dc); }

  function pathTo(tr, tc) {
    const w = (rows[0] || []).length, h = rows.length;
    const prev = {};
    const seen = {};
    seen[pr + "," + pc] = true;
    const queue = [[pr, pc]];
    let found = false;
    while (queue.length) {
      const p = queue.shift();
      const r = p[0], c = p[1];
      if (r === tr && c === tc) { found = true; break; }
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        const nr = r + d[0], nc = c + d[1];
        const key = nr + "," + nc;
        if (nr === tr && nc === tc) {
          if (!seen[key]) { seen[key] = true; prev[key] = r + "," + c; queue.push([nr, nc]); }
          return;
        }
        if (!canMove(nr, nc) || seen[key]) return;
        seen[key] = true; prev[key] = r + "," + c; queue.push([nr, nc]);
      });
    }
    if (!found) return null;
    const path = [];
    let k = tr + "," + tc;
    while (k !== pr + "," + pc) {
      const bits = k.split(",");
      path.unshift([Number(bits[0]), Number(bits[1])]);
      k = prev[k];
    }
    return path;
  }

  function moveClick(r, c) {
    if (r === pr && c === pc) return;
    const p = pathTo(r, c);
    if (p) for (let i = 0; i < p.length; i++) if (!tryStep(p[i][0], p[i][1])) break;
  }

  /* ------------------------------- 渲染 ------------------------------- */

  const dungeon = document.createElement("div");
  dungeon.className = "dungeon";

  const boardArea = document.createElement("div");
  const board = document.createElement("div");
  board.className = "board";
  boardArea.appendChild(board);
  const gateCard = document.createElement("div");
  gateCard.className = "gate";
  boardArea.appendChild(gateCard);
  const mv = document.createElement("p");
  mv.className = "movehint";
  mv.textContent = t("ui.moveHint");
  boardArea.appendChild(mv);

  const side = document.createElement("div");
  side.className = "side";
  const varCard = document.createElement("div");
  varCard.className = "card";
  varCard.innerHTML = "<h4>" + esc(t("ui.vars")) + "</h4><div class=\"vars\"></div>";
  side.appendChild(varCard);
  const coinCard = document.createElement("div");
  coinCard.className = "card coinsline";
  side.appendChild(coinCard);
  const codeCard = document.createElement("div");
  codeCard.className = "card codecard";
  codeCard.innerHTML = "<h4>" + esc(t("ui.codeTitle")) + "</h4><div class=\"code\"></div>";
  side.appendChild(codeCard);

  dungeon.appendChild(boardArea);
  dungeon.appendChild(side);
  host.appendChild(dungeon);

  function drawBoard() {
    board.innerHTML = "";
    const cur = curRegion();
    rows.forEach(function (rowArr, r) {
      const rowDiv = document.createElement("div");
      rowDiv.className = "row";
      rowArr.forEach(function (cellCh, c) {
        const cell = document.createElement("div");
        let cls = "cell";
        if (cellCh === "#") {
          cls += " wall";
        } else {
          if (cur && c === cur.lc && r > 0 && r <= cur.branches.length) cls += " dec";
          else if (coins[r + "," + c]) cls += " coin";
          else if (isTrapCell(r, c, cur)) cls += " trap";
        }
        if (r === gr && c === gc) cls += " goal";

        if (pr === r && pc === c) {
          cls += " player";
          cell.innerHTML = "<span class=\"dot\"></span>";
        } else if (coins[r + "," + c]) {
          cell.textContent = "$";                        // 还没捡的金币
        } else if (r === gr && c === gc) {
          cell.textContent = "★";                        // 终点
        }
        cell.className = cls;
        cell.addEventListener("click", function () { moveClick(r, c); });
        rowDiv.appendChild(cell);
      });
      board.appendChild(rowDiv);
    });
  }

  function drawGate() {
    const cur = curRegion();
    if (cur) {
      gateCard.className = "gate";
      let html = "<p class=\"gateq\">" + esc(t("ui.gateNote")) + "</p>";
      let revealedExplain = "";
      cur.branches.forEach(function (b, bi) {
        const revealed = b.dead && cur.trapped;
        if (revealed && !revealedExplain) revealedExplain = b.explain;
        html += "<div class=\"branch" + (revealed ? " dead" : "") + "\">" +
          "<span class=\"mark\">" + (revealed ? "✖" : "·") + "</span>" +
          "<code>" + esc(b.label) + "</code></div>";
      });
      if (revealedExplain) {
        html += "<div class=\"explain\">" + esc(t("ui.trapLine", { explain: revealedExplain })) + "</div>";
      }
      gateCard.innerHTML = html;
      cur._revealedExplain = revealedExplain;
    } else {
      const done = solved >= rooms.length;
      gateCard.className = "gate done";
      gateCard.innerHTML = done
        ? "<p class=\"gateq\">" + esc(t("ui.win")) + "</p>" +
          "<p>" + esc(t("ui.allDone")) + "</p>"
        : "";
    }
  }

  function drawSide() {
    const v = currentVars();
    const keys = Object.keys(v);
    const vbox = varCard.querySelector(".vars");
    vbox.innerHTML = keys.length
      ? keys.map(function (k) {
        return "<div class=\"v\"><b>" + esc(k) + "</b><span>" + esc(v[k]) + "</span></div>";
      }).join("")
      : "<div class=\"none\">…</div>";

    coinCard.innerHTML = t("ui.coins", { n: coinsGot });

    const code = lv.code || [];
    const doneLines = {};
    for (let i = 0; i < solved && i < rooms.length; i++) doneLines[rooms[i].line] = true;
    const cur = curRegion();
    codeCard.querySelector(".code").innerHTML = code.map(function (src, li) {
      const cls = doneLines[li] ? "ln ran" : (cur && cur.line === li ? "ln now" : "ln");
      return "<div class=\"" + cls + "\"><span class=\"no\">" + (li + 1) + "</span>" +
        "<span class=\"src\">" + esc(src === "" ? " " : src) + "</span></div>";
    }).join("");
  }

  function draw() {
    drawBoard();
    drawGate();
    drawSide();
  }

  function relocalize() {
    mv.textContent = t("ui.moveHint");
    varCard.innerHTML = "<h4>" + esc(t("ui.vars")) + "</h4><div class=\"vars\"></div>";
    codeCard.innerHTML = "<h4>" + esc(t("ui.codeTitle")) + "</h4><div class=\"code\"></div>";
    draw();
  }

  draw();

  return {
    stepTo: stepTo,
    moveClick: moveClick,
    relocalize: relocalize,
    lock: function () { gotGoal = true; },
    solvedCount: function () { return solved; },
    coins: function () { return coinsGot; },
    total: function () { return rooms.length; },
    firstTry: function () { return firstTrySolved; },
  };
}

export default createDungeon;