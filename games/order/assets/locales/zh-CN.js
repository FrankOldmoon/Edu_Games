/* 拼装程序 —— 简体中文。
   键必须和 locales/en.js 完全一致；en 是默认兼兜底，这里缺哪个键就会显示英文。 */

export default {
  ui: {
    appTitle: "拼装程序",
    backToSite: "← 全部游戏",

    lead: "一段小程序的行被打乱了。把它们排成能让程序输出右边结果的顺序。共 <b>{n}</b> 关，从三行到完整的冒泡排序。",

    progress: "已完成 {done} / {total}",
    levelNo: "第 {n} 关",
    start: "开始 →",
    done: "✓ 已通关",
    locked: "🔒 未解锁",
    reset: "重置进度",
    resetConfirm: "重置这个游戏的全部进度？",

    program: "程序 —— 拖动一行，或用 ↑ ↓",
    goal: "目标输出",
    stdin: "用户敲进去的输入",
    console: "它打印出来的",
    run: "运行",
    hint: "提示",
    retry: "重来",
    toList: "关卡列表",

    lineAria: "第 {n} 行：{code}",
    upAria: "把第 {n} 行上移",
    downAria: "把第 {n} 行下移",

    correctAll: "跑通了，输出一致！",
    nRight: "{n} / {total} 行位置正确",
    noneRight: "还没有一行在正确位置 —— 先找那个必须先执行的行",
    hintText: "第 1 行应该是：{code}",
    emptyLine: "（空行）",

    win: "拼装完成！",
    winLine: "{lines} 行 · 试了 {attempts} 次 · {time}",
    attempts1: "一次就对，漂亮",
    attemptsN: "试了 {n} 次才排好",
    next: "下一关 →",
    allDone: "全部完成，回到关卡列表",

    loadFailed: "加载关卡失败\n{msg}",
  },

  levels: {
    o01: {
      title: "变量与拼接",
      tip: "名字得先存在，才能拿来用。",
    },
    o02: {
      title: "交换两个变量",
      tip: "交换发生在中间，打印必须在它后面。",
    },
    o03: {
      title: "读入 → 计算 → 输出",
      tip: "input() 给你的是文本，先转成数字再算。",
    },
    o04: {
      title: "循环累加",
      tip: "缩进的那一行属于它上面的循环；总和也得先有个起点。",
    },
    o05: {
      title: "先定义，再调用",
      tip: "定义函数不会执行它；函数体要缩进。",
    },
    o06: {
      title: "列表的顺序",
      tip: "append 添一个，sort 把顺序排好。",
    },
    o07: {
      title: "分支的顺序",
      tip: "Python 只走第一个成立的分支，所以顺序决定了答案。",
    },
    o08: {
      title: "冒泡排序",
      tip: "一趟的过程：走一遍列表，把相邻逆序的对调 —— 只要还在变就再来一遍。",
    },
  },
};
