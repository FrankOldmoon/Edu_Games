# -*- coding: utf-8 -*-
"""分支地牢(新玩法)的出题脚本 —— 跑一次，生成 games/branch-trace/levels.json。

玩法：每关一个小迷宫，角色带朝向立于起点。玩家用手头的方块搭一段程序
（if/elif/else 分支块判断「前方/左方/右方是否有路」+ 前进F/左转L/右转R 移动块），
点执行后角色按程序自动走，到达 ★ 终点即过关。不做循环。

一个原则：每关的「正解程序」由这里用确定性算法算出来，并用脚本里同款迷你解释器
跑一遍断言能到终点 —— 绝不手写答案。块、谓词、迷宫形状都是算出来的。
"""
import json
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "games", "branch-trace", "levels.json")

TITLE = {"m01": "碰壁右转", "m02": "T 字路口", "m03": "三岔路口", "m04": "穿过死胡同", "m05": "九宫格"}
TIP = {
    "m01": "前方是墙就右转",
    "m02": "前方没路往左拐",
    "m03": "左边没路往前走",
    "m04": "见墙左转，贴着走",
    "m05": "一路感测，别撞墙",
}

DIRS = [(-1, 0), (0, 1), (1, 0), (0, -1)]  # N E S W
DIRMAP = {"N": 0, "E": 1, "S": 2, "W": 3}
INV = {0: "N", 1: "E", 2: "S", 3: "W"}
TURN = {"L": -1, "R": 1, "F": 0}


# ---------------------------------------------------------------------------
# 迷你解释器：把块程序跑一遍迷宫，判断能否到终点
# ---------------------------------------------------------------------------

class World:
    def __init__(self, rows):
        self.rows = [list(r) for r in rows]
        self.h = len(self.rows)
        self.w = len(self.rows[0]) if self.h else 0
        self.start = None
        self.goal = None
        s = None
        for r in range(self.h):
            for c in range(self.w):
                ch = self.rows[r][c]
                if ch == "S":
                    s = (r, c)
                elif ch == "G":
                    self.goal = (r, c)
        self.start = s

    def open(self, r, c):
        if r < 0 or c < 0 or r >= self.h or c >= self.w:
            return False
        return self.rows[r][c] != "#"

    def cell(self, r, c):
        if r < 0 or c < 0 or r >= self.h or c >= self.w:
            return "#"
        return self.rows[r][c]


def run_program(rows, blocks, program):
    """program: 顶层块 id 序列。blocks: {id:block}。返回 (ok, on_goal, steps, pos_history)。"""
    byid = {b["id"]: b for b in blocks}
    sr, sc = None, None
    for r in range(len(rows)):
        for c in range(len(rows[r])):
            if rows[r][c] == "S":
                sr, sc = r, c
    w = World(rows)
    if w.start is None:
        return (False, False, 0, [])
    pr, pc = w.start
    di = 1  # 默认朝 E
    ok = True
    steps = 0
    hist = [(pr, pc, INV[di])]

    def apply_move(op):
        nonlocal pr, pc, di, steps
        if op == "L":
            di = (di - 1) % 4
        elif op == "R":
            di = (di + 1) % 4
        elif op == "F":
            dr, dc = DIRS[di]
            nr, nc = pr + dr, pc + dc
            if w.open(nr, nc):
                pr, pc = nr, nc
                steps += 1
                hist.append((pr, pc, INV[di]))
            else:
                return False
        return True

    def eval_pred(pred):
        dr, dc = DIRS[di]
        if pred == "front-open":
            return w.open(pr + dr, pc + dc)
        if pred == "front-wall":
            return not w.open(pr + dr, pc + dc)
        if pred == "left-open":
            ldi = (di - 1) % 4
            lr, lc = DIRS[ldi]
            return w.open(pr + lr, pc + lc)
        if pred == "left-wall":
            ldi = (di - 1) % 4
            lr, lc = DIRS[ldi]
            return not w.open(pr + lr, pc + lc)
        if pred == "right-open":
            rdi = (di + 1) % 4
            rr, rc = DIRS[rdi]
            return w.open(pr + rr, pc + rc)
        if pred == "right-wall":
            rdi = (di + 1) % 4
            rr, rc = DIRS[rdi]
            return not w.open(pr + rr, pc + rc)
        return False

    def run_seq(seq):
        nonlocal ok
        for bid in seq:
            b = byid[bid]
            if b["type"] == "move":
                if not apply_move(b["op"]):
                    ok = False
                    return
            elif b["type"] == "chain":
                chosen = None
                for cond in b["conds"]:
                    if eval_pred(cond["pred"]):
                        chosen = cond
                        break
                if chosen is not None:
                    run_seq(chosen["then"])
                else:
                    run_seq(b.get("else", []))
                if not ok:
                    return
            if not ok:
                return

    run_seq(program)
    on_goal = (pr, pc) == w.goal
    return (ok, on_goal, steps, hist)


# ---------------------------------------------------------------------------
# 模板（路径驱动）：每关给一条确定的格路径 + 起点朝向。
# 脚本用这条路径“挖”出迷宫（路径格开路、其余填墙），路径终点放 G，起点放 S，
# 然后由算法把路径切成移动指令流，并在第一个转向处注入一条 if (front-wall) 分支。
# 迷宫由“墙包围一条 1 格宽走廊”构成，因此折角点前方必然是墙 —— front-wall 成立。
# ---------------------------------------------------------------------------

TEMPLATES = [
    # m01：直走 2 格，右折后再直走 1 格到终点（先直后转）。
    {"id": "m01", "dir": "E", "path": [(1, 1), (1, 2), (1, 3), (2, 3), (2, 4)]},
    # m02：直角单拐：直走 2 格右折 1 格到终点。
    {"id": "m02", "dir": "E", "path": [(1, 1), (1, 2), (1, 3), (2, 3)]},
    # m03：先直走 1 格，下折再走 3 格到终点。
    {"id": "m03", "dir": "E", "path": [(1, 1), (1, 2), (2, 2), (3, 2), (3, 3), (3, 4)]},
    # m04：先折向下，再向右，成 Z 形。
    {"id": "m04", "dir": "E", "path": [(1, 1), (2, 1), (3, 1), (3, 2), (3, 3)]},
    # m05：较长直道 + 下拐（直走 3 格再向下 2 格）。
    {"id": "m05", "dir": "E", "path": [(1, 1), (1, 2), (1, 3), (1, 4), (2, 4), (3, 4)]},
]


def maze_from_path(path, pad=2):
    """由格路径生成字符迷宫（边界一圈留 pad，其余墙，路径挖成路）。"""
    rs = [p[0] for p in path]
    cs = [p[1] for p in path]
    h = max(rs) + 1 + pad
    w = max(cs) + 1 + pad
    g = [["#"] * w for _ in range(h)]
    for (r, c) in path:
        g[r][c] = "."
    s = path[0]
    t = path[-1]
    g[s[0]][s[1]] = "S"
    g[t[0]][t[1]] = "G"
    return ["".join(row) for row in g]


def dir_of(dr, dc):
    for i, (x, y) in enumerate(DIRS):
        if x == dr and y == dc:
            return i
    return None


def path_to_moves(path, start_dir):
    """把格路径转成前进/转向指令流，返回 (moves, end_dir)。
    不考虑原地转向到同格的合并（那在 chain 块里做）。"""
    moves = []
    di = DIRMAP[start_dir]
    prev = None
    for step in path:
        r, c = step
        if prev is None:
            prev = step
            continue
        dr, dc = r - prev[0], c - prev[1]
        want = dir_of(dr, dc)
        # 转向：就近（L=-1 / R=+1），最多转一次（模板保证无 180 度急转）
        delta = (want - di) % 4
        if delta == 3:
            di = (di - 1) % 4
            moves.append("L")
        elif delta == 1:
            di = (di + 1) % 4
            moves.append("R")
        elif delta == 2:
            # 掉头：模板不应出现；保守地 L L
            di = (di - 1) % 4
            moves.append("L")
            di = (di - 1) % 4
            moves.append("L")
        moves.append("F")
        prev = step
    return moves, di


# ---------------------------------------------------------------------------
# 从移动指令流 -> 块 & 程序
# ---------------------------------------------------------------------------

PRED_VIABLE = ("front-wall", "front-open", "left-wall", "right-wall")


def build_level(lv):
    """给定 template（含 path/dir/title/tip），构造迷宫、块、answer，并自校验。

    程序结构（确定性）：
      1. 由路径算移动指令流 moves（path_to_moves）。
      2. 找到第一个转向点下标 ti（L 或 R）。ti=0 表示起点就要转向。
      3. program = [moves[:ti] 平铺为 move]  +  chain(if front-wall → turn+F else 直走F)
                  + [moves[ti+2:] 平铺为 move]。
         chain 的 then 取 moves[ti:ti+2]（该转向 + 紧邻的一次前进 F）；else 放一个直走 F
         （正解是 to No 撞墙，但 else 只在 front-wall 为假才走；折角处前方必为墙，故 else 不触发）。
      4. 干扰块：多放一个反方向的转向 move（用不到）。
    """
    path = lv["path"]
    start_dir = lv["dir"]
    rows = maze_from_path(path)
    moves, _ = path_to_moves(path, start_dir)

    # 找第一个转向点
    ti = -1
    for i, op in enumerate(moves):
        if op in ("L", "R"):
            ti = i
            break
    if ti < 0:  # 没转向？退化成纯 move（仍可通关，但没有 if，出题上我们尽量避免）
        ti = 0
        moves = ["F"] * len(path[1:])

    blocks = []
    program = []
    bid = 0

    def make_move(op):
        nonlocal bid
        bid += 1
        b = {"id": "b%d" % bid, "type": "move", "op": op}
        blocks.append(b)
        return b["id"]

    # chain 内 then 的移动（转向 + 前进）
    then_moves = moves[ti:ti + 2]
    then_ids = [make_move(op) for op in then_moves]
    else_id = make_move("F")                       # else: 直走（折角处前方是墙，不会真走）
    bid += 1
    chain_id = "c%d" % bid
    blocks.append({
        "id": chain_id,
        "type": "chain",
        "conds": [{"pred": "front-wall", "then": then_ids}],
        "else": [else_id],
    })

    # 前半（转向点之前，全部是 F）
    pre = moves[:ti]
    post = moves[ti + 2:]
    for op in pre:
        program.append(make_move(op))
    program.append(chain_id)
    for op in post:
        program.append(make_move(op))

    # 干扰块：一个反方向转向 + 一个直走，用不到也能通关
    distractors = []
    used_ops = set(then_moves)
    for op in ("L", "R"):
        if op not in used_ops:
            bid += 1
            d = {"id": "d%d" % bid, "type": "move", "op": op}
            blocks.append(d)
            distractors.append(d["id"])
            break

    # 自校验：脚本内解释器跑一遍 answer，必须到终点
    ok, on_goal, steps, hist = run_program(rows, blocks, program)
    if not (ok and on_goal):
        raise SystemExit("关卡 %s 正解跑不通：ok=%s on_goal=%s moves=%s" % (lv["id"], ok, on_goal, moves))

    return {
        "id": lv["id"],
        "title": TITLE[lv["id"]],
        "tip": TIP[lv["id"]],
        "timer": {"base": 20, "per": 8},
        "map": {
            "rows": rows,
            "cols": max(len(r) for r in rows),
            "start": {"r": path[0][0], "c": path[0][1], "dir": start_dir},
            "goal": {"r": path[-1][0], "c": path[-1][1]},
        },
        "blocks": blocks,
        "answer": program,
        "distractors": distractors,
        "solutionSteps": steps,
    }


def main():
    outs = []
    for lv in TEMPLATES:
        outs.append(build_level(lv))
    data = {
        "_generatedBy": "tools/branch-levels.py —— 迷宫/块/正解都由脚本算出来并自校验，别手改；改题请改脚本再重跑",
        "levels": outs,
    }
    path = os.path.normpath(OUT)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("写了 %s" % os.path.relpath(path))
    for lv in outs:
        print("\n  %s(%s) —— 正解 %d 步" % (lv["id"], lv["title"], lv["solutionSteps"]))
        for r in lv["map"]["rows"]:
            print("    " + r)
        print("    blocks:", [(b["id"], b.get("op") or b["type"]) for b in lv["blocks"]])
        print("    answer:", lv["answer"])


if __name__ == "__main__":
    main()