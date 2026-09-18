/* Python 术语配对 —— 简体中文。
   键必须和 locales/en.js 完全一致；en 是默认兼兜底，这里缺哪个键就会显示英文。 */

export default {
  ui: {
    appTitle: "Python 术语配对",
    backToSite: "← 全部游戏",

    lead: "一次翻两张牌，把每个 <b>名字</b> 和它的含义配上对。共 <b>{n}</b> 关：数据类型、运算符、内置函数、容器、分支与循环、字符串方法、常见报错、函数。过一关解锁下一关。",

    progress: "已完成 {done} / {total}",
    levelNo: "第 {n} 关",
    start: "开始 →",
    done: "✓ 已通关",
    locked: "🔒 未解锁",
    reset: "重置进度",
    resetConfirm: "重置这个游戏的全部进度？",

    retry: "重来",
    toList: "关卡列表",
    moves: "{n} 步",
    clock: "{time}",

    cardDown: "第 {n} 张牌，还没翻开",
    cardUp: "第 {n} 张牌：{text}",

    win: "全部配对！",
    winLine: "{pairs} 对 · {moves} 步 · {time}",
    stars3: "★★★ 很高效",
    stars2: "★★☆ 不错",
    stars1: "★☆☆ 值得再练一次",
    next: "下一关 →",
    allDone: "全部完成，回到关卡列表",

    loadFailed: "加载关卡失败\n{msg}",
  },

  levels: {
    m01: {
      title: "数据类型",
      tip: "最先遇到的四种基本类型。",
      defs: {
        int: "整数",
        str: "引号里的文本",
        float: "带小数点的数",
        bool: "只可能是 True 或 False",
      },
    },
    m02: {
      title: "运算符",
      tip: "不是 + - * / 的那几个。",
      defs: {
        "//": "相除后丢掉小数",
        "%": "取余数",
        "**": "求幂",
        "!=": "不相等",
      },
    },
    m03: {
      title: "内置函数",
      tip: "几乎每个程序里都会用到。",
      defs: {
        "len()": "数一数有几个",
        "print()": "把东西显示到屏幕上",
        "input()": "读入用户敲的那一行",
        "int()": "把值转成整数",
      },
    },
    m04: {
      title: "容器",
      tip: "一个变量装不下的时候用。",
      defs: {
        list: "有序，可以修改",
        dict: "键到值的对应",
        tuple: "有序，不能修改",
        set: "不会存重复值",
      },
    },
    m05: {
      title: "分支与循环",
      tip: "选一条路走，或者把一段重复做。",
      defs: {
        if: "条件成立才执行",
        elif: "前一个不成立时再判断一次",
        else: "以上都不成立时执行",
        for: "每个元素跑一次",
      },
    },
    m06: {
      title: "字符串方法",
      tip: "用点号调用，紧跟在值后面。",
      defs: {
        ".upper()": "转成大写",
        ".strip()": "去掉两端的空白",
        ".split()": "切成一个列表",
        ".replace()": "把一段换成另一段",
      },
    },
    m07: {
      title: "常见报错",
      tip: "看报错信息的最后一行，名字就是这些之一。",
      defs: {
        SyntaxError: "代码不是合法的 Python",
        TypeError: "类型用错了",
        NameError: "用了没定义过的名字",
        IndexError: "下标超出范围",
      },
    },
    m08: {
      title: "函数",
      tip: "六个词，其中有两个特别容易混。",
      defs: {
        def: "开始定义函数",
        return: "把结果交回去",
        parameter: "定义里写的那个名字",
        argument: "调用时传进去的值",
        call: "运行这个函数",
        scope: "名字能被看见的范围",
      },
    },
  },
};
