/* 指令机器人 —— 简体中文。
   键必须和 locales/en.js 完全一致；en 是默认兼兜底，这里缺哪个键就会显示英文。 */

export default {
  ui: {
    appTitle: "指令机器人",
    backToSite: "← 全部游戏",

    lead: "机器人只会一步步执行你给它的指令。用五条指令编出一段程序，运行，看它实际走到哪。要在步数上限内把所有包裹送到收货点。共 <b>{n}</b> 关。",

    progress: "已完成 {done} / {total}",
    levelNo: "第 {n} 关",
    start: "开始 →",
    done: "✓ 已通关",
    locked: "🔒 未解锁",
    reset: "重置进度",
    resetConfirm: "重置这个游戏的全部进度？",

    run: "运行",
    stepOne: "单步",
    rewind: "复位机器人",
    toList: "关卡列表",
    clear: "清空程序",

    warehouse: "仓库",
    program: "程序",
    lgRobot: "机器人",
    lgParcel: "包裹",
    lgGoal: "收货点",
    lgWall: "墙",

    opF: "前进",
    opL: "左转",
    opR: "右转",
    opP: "拾起",
    opD: "放下",

    empty: "还没有指令 —— 点上面的按钮把程序搭出来。",
    budget: "{used} / {max} 步",
    plan: "计划 {n} 步",
    bestLine: "已知最短：{best} 步",
    rowAria: "第 {n} 条指令：{op}，重复 {count} 次",
    delAria: "删掉第 {n} 条指令",
    countAria: "重复几次",

    needProgram: "先加几条指令",
    running: "运行中…",
    bumped: "第 {n} 步撞墙了",
    outOfSteps: "步数用完了 —— 上限是 {max} 步",
    delivered: "所有包裹都送到收货点了！",
    notDone: "程序跑完了 —— 还有 {left} 件包裹不在收货点上",

    win: "路线跑通！",
    winLine: "{steps} 步 · 已知最短 {best} 步",
    star3: "★★★ 正好是最短解",
    star2: "★★☆ 接近最短解",
    star1: "★☆☆ 能跑通，能不能再短一点？",
    next: "下一关 →",
    allDone: "全部完成，回到关卡列表",

    loadFailed: "加载关卡失败\n{msg}",
  },

  levels: {
    r01: {
      title: "去取货",
      tip: "机器人只会朝它面朝的方向走。转向这件事，得你开口它才做。",
    },
    r02: {
      title: "拐个弯",
      tip: "转向不会移动位置，只改变「前进」是哪一边。",
    },
    r03: {
      title: "绕到背后",
      tip: "两次左转就掉头。先想好转向，再让它走。",
    },
    r04: {
      title: "一条长直道",
      tip: "与其把「前进」加八次，不如把次数填成 8 —— 那就是计数循环。",
    },
    r05: {
      title: "两件包裹",
      tip: "「拾起」从脚下拿走一件：「放下」在脚下留下一件。",
    },
    r06: {
      title: "绕一个方块",
      tip: "先把整条路线想清楚。拐角要转向，而转向同样花掉一步。",
    },
    r07: {
      title: "为什么要填次数",
      tip: "写成十一行很蠢；四行、把次数填好，做的是同一件事。",
    },
    r08: {
      title: "完整一趟",
      tip: "两件包裹、两个收货点，路线还要从中间穿过去。",
    },
  },
};
