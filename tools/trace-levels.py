# -*- coding: utf-8 -*-
"""变量追踪的出题脚本 —— 跑一次，生成 games/trace/levels.json。

    python3 tools/trace-levels.py

为什么要脚本而不是手写 levels.json：这份题库里每一关都带着
**每一行执行完之后所有变量的值**（steps）和**每道题的正确答案**（answer）。
手写这些数字，迟早会有一个错 —— 那等于在教错的 Python。
这里全部由真 CPython（tools/pytrace.py）跑出来，而且会反过来检查：
你给的选项里必须真的包含正确答案，否则直接报错，不会产出一个坏题。

改了题目就重跑；它会整个覆盖 levels.json。别手改生成出来的 steps / answer。
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pytrace import trace_of, var_after  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "games", "trace", "levels.json")

# 每关限时 = base + per × 题数（写进 levels.json，老师随时能改）
TIMER = {"base": 15, "per": 20}

# ---------------------------------------------------------------------------
# 题库。只有 id / code / ask 是人写的，其余全部跑出来。
#
#   ask 有两种：
#     dict(line=行号(0 起), nth=第几次执行该行(1 起), name="变量名", options=[...])
#         —— "第 line 行第 nth 次跑完之后，name 是多少？"
#     dict(out=第几行输出(1 起), options=[...])
#         —— "程序打印出来的第 out 行是什么？"
#         挂到"产出这一行输出的那一步"上，学生正好在那一步之前预测。
#   选项顺序无所谓：正确答案在第几个由脚本自己算出来。
#
#   选项里放错的那些才是教学点（错的是 `1/2` 得到 0、"a"+"b" 得到 "a b" 这类
#   初学者的经典误解），所以选项要人写，不能自动生成。
# ---------------------------------------------------------------------------
LEVELS = [
    {
        "id": "t01",
        "code": [
            "a = 3",
            "b = a + 2",
            "a = b * 2",
            "print(a)",
        ],
        "ask": [
            {"line": 1, "nth": 1, "name": "b",
             "options": ["5.0", "3", "5", "32"]},
            {"line": 2, "nth": 1, "name": "a",
             "options": ["10", "5", "6", "52"]},
            {"out": 1, "options": ["10", "5", "52", "3"]},
        ],
    },
    {
        "id": "t02",
        "code": [
            'word = "Py"',
            'word = word + "thon"',
            "n = len(word)",
            'print(word + "!")',
        ],
        "ask": [
            {"line": 1, "nth": 1, "name": "word",
             "options": ["'Python'", "'Py thon'", "'thon'", "'Py'"]},
            {"line": 2, "nth": 1, "name": "n",
             "options": ["6", "'6'", "4", "2"]},
            {"out": 1, "options": ["Python!", "Python", "Python !", "Py thon!"]},
        ],
    },
    {
        "id": "t03",
        "code": [
            "total = 0",
            "for i in range(1, 4):",
            "    total = total + i",
            "print(total)",
        ],
        "ask": [
            {"line": 2, "nth": 1, "name": "total",
             "options": ["1", "0", "3", "6"]},
            {"line": 2, "nth": 2, "name": "total",
             "options": ["3", "1", "2", "6"]},
            {"line": 2, "nth": 3, "name": "total",
             "options": ["6", "3", "4", "10"]},
            {"out": 1, "options": ["6", "3", "10", "1 2 3"]},
        ],
    },
    {
        "id": "t04",
        "code": [
            "xs = []",
            "for i in range(3):",
            "    xs.append(i * 2)",
            "print(xs)",
        ],
        "ask": [
            {"line": 2, "nth": 2, "name": "xs",
             "options": ["[0, 2]", "[0]", "[0, 2, 4]", "[2]"]},
            {"line": 2, "nth": 3, "name": "xs",
             "options": ["[0, 2, 4]", "[0, 2]", "[0, 4, 8]", "6"]},
            {"out": 1, "options": ["[0, 2, 4]", "0 2 4", "[0, 1, 2]", "[2, 4, 6]"]},
        ],
    },
    {
        "id": "t05",
        "code": [
            "n = 7",
            "if n > 5:",
            '    label = "big"',
            "else:",
            '    label = "small"',
            "print(label)",
        ],
        "ask": [
            {"line": 1, "nth": 1, "name": "n",
             "options": ["7", "5", "True", "False"]},
            {"line": 2, "nth": 1, "name": "label",
             "options": ["'big'", "'small'", "7", "None"]},
            {"out": 1, "options": ["big", "small", "7", "big small"]},
        ],
    },
    {
        "id": "t06",
        "code": [
            "n = 3",
            "count = 0",
            "while n > 0:",
            "    n = n - 1",
            "    count = count + 1",
            "print(count)",
        ],
        "ask": [
            {"line": 3, "nth": 1, "name": "n",
             "options": ["2", "3", "1", "0"]},
            {"line": 4, "nth": 1, "name": "count",
             "options": ["1", "0", "2", "3"]},
            {"out": 1, "options": ["3", "2", "0", "1"]},
        ],
    },
    {
        "id": "t07",
        "code": [
            "a = 17",
            "b = a // 5",
            "c = a % 5",
            "print(b, c)",
        ],
        "ask": [
            {"line": 1, "nth": 1, "name": "b",
             "options": ["3", "4", "3.4", "2"]},
            {"line": 2, "nth": 1, "name": "c",
             "options": ["2", "3", "0.4", "5"]},
            {"out": 1, "options": ["3 2", "3.4 2", "32", "(3, 2)"]},
        ],
    },
    {
        "id": "t08",
        "code": [
            "for i in range(2):",
            "    for j in range(2):",
            "        print(i, j)",
        ],
        "ask": [
            {"line": 2, "nth": 2, "name": "j",
             "options": ["1", "0", "2", "i"]},
            {"line": 0, "nth": 2, "name": "i",
             "options": ["1", "0", "2", "3"]},
            {"out": 3, "options": ["1 0", "0 1", "1 1", "0 0"]},
        ],
    },
]


def build():
    out = []
    for lv in LEVELS:
        steps, printed = trace_of(lv["code"])
        entry = {
            "id": lv["id"],
            "code": lv["code"],
            "timer": dict(TIMER),
            "steps": steps,
            "out": printed,
            "ask": [],
        }

        for q in lv["ask"]:
            if "out" in q:
                n = q["out"]
                if n < 1 or n > len(printed):
                    raise SystemExit("%s：要第 %d 行输出，但程序只打印了 %d 行"
                                     % (lv["id"], n, len(printed)))
                truth = printed[n - 1]
                # 挂到"产出第 n 行输出的那一步"上：学生正是在那一步之前预测的
                step = next((k for k, s in enumerate(steps) if s["out"] >= n), None)
                if step is None:
                    raise SystemExit("%s：没有任何一步产出过第 %d 行输出" % (lv["id"], n))
                question = {"kind": "out", "step": step, "nth": n}
            else:
                step = var_after(steps, q["line"], q["nth"])
                name = q["name"]
                if name not in steps[step]["vars"]:
                    raise SystemExit("%s：第 %d 行第 %d 次跑完之后没有变量 %s（只有 %s）"
                                     % (lv["id"], q["line"], q["nth"], name,
                                        ", ".join(steps[step]["vars"]) or "空"))
                truth = steps[step]["vars"][name]
                question = {"kind": "var", "step": step, "line": q["line"], "name": name}

            options = list(q["options"])
            if truth not in options:
                raise SystemExit("%s：正确答案 %r 不在选项里 %r —— 补上或改掉"
                                 % (lv["id"], truth, options))
            if len(set(options)) != len(options):
                raise SystemExit("%s：选项有重复 %r" % (lv["id"], options))

            question["options"] = options
            question["answer"] = options.index(truth)     # 正确答案在第几个（脚本算的）
            entry["ask"].append(question)

        # 两道题落在同一步上就会被游戏里按步索引的 map 吃掉一道 —— 出题时直接拦住
        seen = {}
        for q in entry["ask"]:
            if q["step"] in seen:
                raise SystemExit("%s：第 %d 步上有两道题（%s / %s）—— 错开"
                                 % (lv["id"], q["step"], seen[q["step"]], q.get("name", "输出")))
            seen[q["step"]] = q.get("name", "输出")

        out.append(entry)
    return out


def main():
    levels = build()
    data = {
        "_generatedBy": "tools/trace-levels.py —— steps/answer 都是真 Python 跑出来的，别手改；改题请改脚本再重跑",
        "levels": levels,
    }
    path = os.path.normpath(OUT)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print("写了 %s" % os.path.relpath(path))
    for lv in levels:
        print("  %s  %d 行代码 · %d 步 · %d 题 · 输出 %r"
              % (lv["id"], len(lv["code"]), len(lv["steps"]), len(lv["ask"]), lv["out"]))


if __name__ == "__main__":
    main()
