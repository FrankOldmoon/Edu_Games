# -*- coding: utf-8 -*-
"""逐行执行一小段 Python，记下每一步的变量快照 —— 变量追踪游戏的出题内核。

这个文件有两个身份，故意保持一份：

  · 出题时被 Python 直接 import（tools/trace-levels.py）；
  · 线上被浏览器用 Vite 的 `?raw` 原样读进去，交给 Pyodide 现算
    （games/trace/assets/game.js）—— 老师粘一段自己的代码，当场就能出题。

所以它必须是纯 Python、无第三方依赖、能整段丢给 exec / runPython。

关键约定：**每一步记的是"这一行执行完之后"的状态。**
sys.settrace 的 line 事件发生在该行执行"之前"，所以这里不即时记录，
而是把上一行挂起来，等下一个 line 事件（或程序结束）时再落盘 ——
落盘那一刻的 f_locals 正好就是"上一行跑完了"的样子。
"""

import contextlib
import io
import re
import sys

# repr 里的内存地址（<function double at 0x104a3b2c0>）每次跑都不一样，
# 会让生成出来的 levels.json 无法复现。抹掉它，只留下稳定的部分。
_ADDR = re.compile(r" at 0x[0-9a-fA-F]+")

# 步数上限。两个作用：拦住 `while True:` 这种停不下来的循环（在浏览器里
# 会直接把标签页卡死），以及拦住"跑出几万步"把变量表炸掉。
MAX_STEPS = 2000


class TooLong(Exception):
    """跑得太久 —— 十有八九是死循环。"""


def trace_of(code, filename="<lv>"):
    """跑一遍 code，返回 (steps, out)。

    steps: [{"line": 行号(0 起), "vars": {名字: repr(值)}, "out": 到这一步为止打印了几行}]
           按执行顺序。"out" 让"程序打印什么"这类题能挂到具体某一步上
           （产出第 N 行输出的那一步），也让界面能一行一行地把输出放出来。
    out:   程序打印出来的每一行

    值一律用 repr：字符串会带引号（'Py'）、列表带方括号（[0, 2]）——
    这正是要让学生看见的东西（"这是个字符串" / "这是个列表"）。
    """
    text = "\n".join(code) if isinstance(code, (list, tuple)) else str(code)
    steps = []
    buf = io.StringIO()
    # 每个帧各挂一个"上一行"。不能共用一个标量：一进函数体，
    # 被调用的帧会把调用方那一行顶掉，出来的一步就张冠李戴了。
    pending = {}

    def emit(line, variables):
        if len(steps) >= MAX_STEPS:
            raise TooLong("超过 %d 步就停下了 —— 检查一下有没有停不下来的循环" % MAX_STEPS)
        # 此刻 buf 里已有的行数 = 到这一步为止程序打印了几行
        steps.append({"line": line, "vars": variables, "out": buf.getvalue().count("\n")})

    def hook(frame, event, arg):
        # 别人的帧（print、range 内部）不管
        if frame.f_code.co_filename != filename:
            return None
        fid = id(frame)
        if event == "call":
            pending[fid] = None
            return hook
        if event == "line":
            # 上一个 line 事件记下的那一行，到这一刻才算"执行完了"
            if pending.get(fid) is not None:
                emit(pending[fid], _locals(frame))
            pending[fid] = frame.f_lineno - 1
            return hook
        if event == "return":
            # 这一帧的收尾：最后一行跑完了，用退出时的作用域补上
            if pending.get(fid) is not None:
                emit(pending[fid], _locals(frame))
            pending.pop(fid, None)
            return hook
        return hook

    scope = {"__name__": "__main__"}
    sys.settrace(hook)
    try:
        with contextlib.redirect_stdout(buf):
            exec(compile(text, filename, "exec"), scope)
    finally:
        sys.settrace(None)

    # 相邻重复的收尾步（循环最后一轮 + 帧退出）去重：行号和作用域都一样就没必要留两行
    if len(steps) >= 2 and steps[-1] == steps[-2]:
        steps.pop()

    return steps, buf.getvalue().splitlines()


def _locals(frame):
    return _locals_from(frame.f_locals)


def _locals_from(mapping):
    """丢掉 __name__ 这类内部名字，只留下学生定义的变量。"""
    out = {}
    for k, v in mapping.items():
        if k.startswith("__"):
            continue
        try:
            out[k] = _ADDR.sub("", repr(v))
        except Exception:
            out[k] = "<?>"
    return dict(sorted(out.items()))


def var_after(steps, line, nth):
    """第 nth 次执行 line 那一行之后，第几步 —— 出题用。

    nth 从 1 起（"第 1 次"）。找不到就抛，宁可出题时炸掉也不要线上出个空题。
    """
    seen = 0
    for i, s in enumerate(steps):
        if s["line"] == line:
            seen += 1
            if seen == nth:
                return i
    raise LookupError("line %r 只执行了 %d 次，要不到第 %d 次" % (line, seen, nth))


if __name__ == "__main__":
    # 手搓一段验一验：python3 tools/pytrace.py
    demo = ["total = 0", "for i in range(1, 4):", "    total = total + i", "print(total)"]
    st, o = trace_of(demo)
    print("out =", o)
    for i, s in enumerate(st):
        print("%2d  line %d  %s" % (i, s["line"], s["vars"]))
