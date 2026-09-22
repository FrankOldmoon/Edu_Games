# -*- coding: utf-8 -*-
"""分支地牢的出题脚本 —— 跑一次，生成 games/branch-trace/levels.json。

    python3 tools/branch-levels.py

跟变量追踪一个原则：每一关的「哪条分支会走」由真 CPython（tools/pytrace.py）
跑出来，绝不手写。这里只写程序代码 + 关卡标题；其余——
  岔路（哪条分支真会执行）、地图（每条分支 = 一条走廊）、金币（放在正确分支上）、
  陷阱（放在死分支上）、变量自动生成。

地图模型（branch dungeon）：
  把一整关画成一条从左到右的「巷道」。每个 if/elif/else 决策是一个岔路口，
  每条分支是一条并排的走廊；玩家走到岔路口，选一条走廊进去——
  选对了（程序真走的那条）沿路捡金币、往前走；选错了踩进死走廊的陷阱，弹回、扣时、讲解。
  一层是由多个岔路口按执行顺序从左到右串起来的。
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pytrace import trace_of  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "games", "branch-trace", "levels.json")

# 每关每条走廊画多长（格子）—— 太小放不下金币，太大显得空旷
CORRIDOR = 4

TIMER = {"base": 12, "per": 20}


# ---------------------------------------------------------------------------
# 缩进块解析：把代码切成一棵树。每个分支节点 = 一条 if/elif/else 链。
# ---------------------------------------------------------------------------

def _indent(raw):
    return len(raw) - len(raw.lstrip(" "))


def _kw(raw):
    s = raw.strip()
    if not s:
        return ""
    s = s.rstrip(":").strip("()")          # 去掉行尾冒号和括号，只剩关键词
    return s.split(" ", 1)[0]


def parse_blocks(code):
    items, i = _parse_level(code, 0, -1)
    if i != len(code):
        raise SystemExit("代码第 %d 行缩进对不上" % (i + 1))
    return items


def _parse_level(code, start, stop_ind):
    """读取所有『比 stop_ind 更深』的语句，缩进回到 stop_ind 或更浅就停。

    stop_ind：这条块的边界缩进（比如 if 体用 if 头的缩进做界，遇到 elif 就停）。
    """
    items = []
    i = start
    n = len(code)
    while i < n:
        raw = code[i]
        if raw.strip() == "":
            i += 1
            continue
        ind = _indent(raw)
        if ind <= stop_ind:                  # 回到外层缩进 → 这条块结束了
            break
        k = _kw(raw)
        if k == "if":
            node, i = _parse_branch(code, i, ind)
            items.append(node)
        elif k in ("elif", "else"):
            raise SystemExit("代码第 %d 行有裸 %s（前面缺 if）" % (i + 1, k))
        elif k == "while" or raw.strip().startswith("for "):
            raise SystemExit("分支地牢不做循环，第 %d 行 %r 去掉" % (i + 1, raw.strip()))
        else:
            items.append(raw)
            i += 1
    return items, i


def _parse_branch(code, start, indent):
    headers = []
    bodies = []
    lines = []
    i = start
    n = len(code)
    while i < n and _kw(code[i]) in ("if", "elif", "else") and _indent(code[i]) == indent:
        lines.append(i)
        headers.append(code[i])
        i += 1
        body, i = _parse_level(code, i, indent)   # 读到下一个同行缩进的 elif/else 为止
        bodies.append(body)
    return {"kind": "branch", "lines": lines, "headers": headers, "bodies": bodies}, i


# ---------------------------------------------------------------------------
# 分支判定 & 生成
# ---------------------------------------------------------------------------

def _step_first(steps, line):
    for s in steps:
        if s["line"] == line:
            return s
    return None


def _is_else_header(raw):
    return raw.strip().startswith("else")


def taken_index(node, steps):
    """这条 if 链里，程序真会走第几条（0 起）—— 靠各条件行的 cond 判定。"""
    for bi, line in enumerate(node["lines"]):
        s = _step_first(steps, line)
        if _is_else_header(node["headers"][bi]):
            return bi                      # else 是兜底
        if s is not None and s.get("cond") is True:
            return bi                      # 第一个为真的条件把它拦下
    # 走到尾：没有 else 且全假 → 整条跳过，没有实际分支
    return None


def label_of(code, line):
    return code[line].strip()


def branch_lines(code, node, bi):
    """某条分支的头 + 其 body 的代码行号（用于界面置灰高亮）。"""
    out = [node["lines"][bi]]
    seg = node["bodies"][bi]
    top = node["lines"][bi] + 1
    # body 里全是字符串（平面行），逐行取行号；不展开子分支（死路高亮头部已够）
    cur = top
    for item in seg:
        if isinstance(item, str):
            out.append(cur)
        cur += 1
    return out


# ---------------------------------------------------------------------------
# 地图布局：把一串岔路画成「巷道」
# ---------------------------------------------------------------------------

def build_map(code, steps, executed):
    """executed: 按执行顺序排好的一串决策节点（都执行过且已定 taken）。

    返回 (rows, regions)：
      rows: 字符格面 ['#','.','o','S','G']
      regions: 每个岔路口的几何信息，界面按它画走廊/路牌/陷阱。
    """
    W = CORRIDOR
    # 执行顺序：决策节点先排好序，再定列
    cur = 2
    metas = []
    for node in executed:
        tk = taken_index(node, steps)
        if tk is None:
            raise SystemExit("关卡某条 if 链没有 else 且全假：" + repr(node["headers"]))
        lc = cur
        rc = lc + W + 1
        branches = []
        for bi in range(len(node["lines"])):
            branches.append({
                "label": label_of(code, node["lines"][bi]),
                "taken": (bi == tk),
                "dead": (bi != tk),
            })
        metas.append({"line": node["lines"][0], "lc": lc, "rc": rc, "branches": branches})
        cur = rc + 2
    goal = cur + 1
    maxk = max((len(m["branches"]) for m in metas), default=1)

    g = {}
    for r in range(maxk + 1):
        for c in range(goal + 1):
            g[(r, c)] = "#"
    for c in range(goal + 1):
        g[(0, c)] = "."                      # 一条横向的主干道
    g[(0, 0)] = "S"
    g[(0, goal)] = "G"
    for m in metas:
        k = len(m["branches"])
        lc, rc = m["lc"], m["rc"]
        for r in range(k + 1):               # 左/右竖刺：贯通 0..k 行
            g[(r, lc)] = g[(r, rc)] = "."
        for bi, b in enumerate(m["branches"]):
            row = bi + 1
            for c in range(lc + 1, lc + W + 1):
                g[(row, c)] = "."            # 每条分支的走廊
            if b["taken"]:
                for c in (lc + 2, lc + 3):   # 正确分支上放两枚金币
                    g[(row, c)] = "o"
    rows = []
    for r in range(maxk + 1):
        rows.append("".join(g[(r, c)] for c in range(goal + 1)))
    return rows, metas


def explain_for(node, steps, code, tk):
    if tk is None:
        return "整条 if 链没有一个条件成立，程序直接跳过。"
    heading = node["headers"][tk]
    if _is_else_header(heading):
        return "前面的条件都不成立，所以程序走了 else 分支（%s）。" % heading.strip()
    s = _step_first(steps, node["lines"][tk])
    val = s.get("cond") if s else None
    return "条件 %s 为 %s，所以程序走进这条分支（%s）。" % (
        heading.strip(), "真(True)" if val else "假(False)", heading.strip())


# ---------------------------------------------------------------------------
# 题库
# ---------------------------------------------------------------------------
LEVELS = [
    {
        "id": "b01", "title": "生死开关", "tip": "score 够不够格，走对哪条路？",
        "code": [
            'score = 5',
            'if score >= 6:',
            '    grade = "pass"',
            'else:',
            '    grade = "fail"',
            'print(grade)',
        ],
    },
    {
        "id": "b02", "title": "奇偶分流", "tip": "偶数走 if，奇数走 else。",
        "code": [
            'n = 10',
            'if n % 2 == 0:',
            '    tag = "even"',
            'else:',
            '    tag = "odd"',
            'print(tag)',
        ],
    },
    {
        "id": "b03", "title": "三岔路", "tip": "elif 一条一条拦，最先成立的那个才走。",
        "code": [
            'x = 7',
            'if x < 5:',
            '    size = "small"',
            'elif x < 10:',
            '    size = "medium"',
            'else:',
            '    size = "large"',
            'print(size)',
        ],
    },
    {
        "id": "b04", "title": "门里有门", "tip": "先判外面的 if，进了门再判里面的。",
        "code": [
            'n = 8',
            'if n > 5:',
            '    if n > 9:',
            '        g = "big"',
            '    else:',
            '        g = "mid"',
            'else:',
            '    g = "small"',
            'print(g)',
        ],
    },
    {
        "id": "b05", "title": "加一把锁", "tip": "and 要两个都成立才算 True。",
        "code": [
            'age = 16',
            'has_id = True',
            'if age >= 18 and has_id:',
            '    can = "yes"',
            'else:',
            '    can = "no"',
            'print(can)',
        ],
    },
    {
        "id": "b06", "title": "老路新走", "tip": "嵌套 + 多分支混在一起，别走岔。",
        "code": [
            't = 82',
            'if t >= 90:',
            '    rank = "A"',
            'elif t >= 80:',
            '    if t == 82:',
            '        rank = "B+"',
            '    else:',
            '        rank = "B"',
            'else:',
            '    rank = "C"',
            'print(rank)',
        ],
    },
]


def collect_executed(code, steps):
    """收集所有『真会执行』的 if 链，按执行顺序排好（含嵌套）。"""
    tree = parse_blocks(code)
    nodes = []
    def walk(items):
        for it in items:
            if isinstance(it, dict):
                s = _step_first(steps, it["lines"][0])
                if s is not None:
                    nodes.append(it)
                for body in it["bodies"]:
                    walk(body)
    walk(tree)
    # 按首个头的执行先后排序
    nodes.sort(key=lambda nd: steps.index(_step_first(steps, nd["lines"][0])))
    return nodes


def build():
    out = []
    for lv in LEVELS:
        code = lv["code"]
        steps, printed = trace_of(code)
        executed = collect_executed(code, steps)
        rows, regions = build_map(code, steps, executed)
        # 讲解放进每个岔路口，界面答错时展示
        for m, node in zip(regions, executed):
            tk = taken_index(node, steps)
            m["explain"] = explain_for(node, steps, code, tk)
            for b in m["branches"]:
                b["explain"] = m["explain"]
        entry = {
            "id": lv["id"],
            "code": code,
            "steps": steps,
            "timer": dict(TIMER),
            "map": {
                "rows": rows,
                "cols": max(len(r) for r in rows),
                "regions": regions,
            },
        }
        for b in regions:
            if not any(x["taken"] for x in b["branches"]):
                raise SystemExit("%s：有个岔路口没有正确分支" % lv["id"])
        out.append(entry)
    return out


def main():
    levels = build()
    data = {
        "_generatedBy": "tools/branch-levels.py —— 分支/地图/金币/陷阱都由真 CPython 跑出来，别手改；改题请改脚本再重跑",
        "levels": levels,
    }
    path = os.path.normpath(OUT)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("写了 %s" % os.path.relpath(path))
    for lv in levels:
        print("\n  %s —— %d 个岔口, %d 行代码" % (
        lv["id"], len(lv["map"]["regions"]), len(lv["code"])))
        for r in lv["map"]["rows"]:
            print("    " + r)
        for rg in lv["map"]["regions"]:
            tk = next(b["label"] for b in rg["branches"] if b["taken"])
            print("    岔口(col %d) 走 -> %s   %s" % (rg["lc"], tk, rg["explain"]))


if __name__ == "__main__":
    main()