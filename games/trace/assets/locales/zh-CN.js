/* Python 变量追踪 —— 简体中文。

   键必须和 locales/en.js 完全对齐（en 是默认兼兜底，缺键就会显示英文）。
   关卡内容（代码、trace、答案）在 levels.json 里，由 tools/trace-levels.py
   用真 Python 跑出来，不写在这儿。 */

export default {
  ui: {
    appTitle: "Python 变量追踪",
    backToSite: "← 全部游戏",

    lead: "你来当解释器：<b>{n}</b> 段小程序，一行一行地跑。每一行执行之前，先预测某个变量会变成什么 —— 答对了这一行才真的跑、变量表才长出一行。猜错扣 5 秒，可以重选。过一关解锁下一关。",

    progress: "已通关 {done} / {total}",
    levelNo: "第 {n} 关",
    start: "开始 →",
    done: "✓ 已完成",
    locked: "🔒 未解锁",
    reset: "重置进度",
    resetConfirm: "清空这个游戏的所有进度？",

    retry: "重来",
    toList: "关卡列表",

    timeLeft: "剩余时间",
    timeLimit: "限时 {n} 秒",
    timeUp: "时间到 —— 这是完整的执行过程",
    timeUpShort: "时间到",

    score: "答对 {ok} / {total}",
    step: "▶ 跑下一行",
    stepHint: "下一行是第 {line} 行",

    output: "程序输出",
    noOutput: "还没有任何输出",

    /* ---- 房间（多人）：列表页那个入口 + 进房过渡文案。
       room.* 那些（房号/邀请/离开/名字/开始/名册/同关提示/终点）是共用的，
       在 src/game-ui/room/locales/，由 i18n.js 并进来。 */
    playWithOthers: "和别人一起玩",
    roomTitle: "变量追踪房间",
    playerNo: "玩家 {n}",
    connecting: "正在连进房间…",
    connectFailed: "连不到房间服务器\n{msg}\n先跑一个：cd server && npm start —— 或用 ?ws=ws://主机:2568 指",
    roomClosed: "房间服务器把这间房关了。",

    askVarPre: "第 {line} 行第 {nth} 次执行完之后，",
    askVarPost: " 是多少？",
    askOut: "这段程序打印出来的第 {nth} 行是什么？",
    pickOne: "选一个它执行完之后的值。",
    tryAgain: "不是这个。再看看上面的变量表，重选一个。",

    win: "追踪完成！",
    perfect: "每一处都一次猜对",
    partial: "{total} 处里第一次就猜对了 {ok} 处",
    winLine: "共 {steps} 步 · 用时 {time}",
    next: "下一关 →",
    allDone: "全部完成 —— 回到关卡列表",

    /* ---- 我导入的代码（老师用，没有题，只看 trace） ---- */
    importOpen: "追踪我自己写的代码",
    importNote: "给老师用：粘一段小程序，它在你的浏览器里由真的 Python 解释器跑一遍，然后你可以一步步看它的执行过程。第一次会下载一次 Python 运行时（约 13MB）—— 上面的关卡完全用不到它。跑完之后还能把结果导成 levels.json，自己加题目、托管出去、用 ?json=<地址> 打开。",
    importPlaceholder: "total = 0\nfor i in range(1, 4):\n    total = total + i\nprint(total)",
    importTrace: "跑一遍",
    importDownload: "下载 levels.json",
    importLoading: "正在下载 Python 运行时 —— 约 13MB，只这一次…",
    importTracing: "正在用 CPython 跑…",
    importOk: "共 {n} 步",
    importEmpty: "先粘一段代码。",
    importTooMany: "别超过 {n} 行 —— 这是用来读 trace 的，不是跑大程序。",
    importNoSteps: "这段代码一行都没执行到（是不是全是注释？）。",
    importFailed: "Python 说：\n{msg}",
    importedTitle: "我导入的代码",
    importedTip: "只看不考 —— 没有题，一步步走，看变量怎么变。",
    watchDone: "整条 trace 走完了",
    watchLine: "共 {steps} 步 · 用时 {time}",
    stepsOf: "第 {n} / {total} 步",
    backToList: "回到关卡列表",

    loadFailed: "关卡库加载失败\n{msg}",
  },

  levels: {
    t01: {
      title: "赋值",
      tip: "变量只记得最后一次赋给它的值 —— 旧的值就没了。",
    },
    t02: {
      title: "字符串",
      tip: "两个字符串相加是首尾接起来，中间不会自己加空格。",
    },
    t03: {
      title: "累加",
      tip: "同一行每循环一次就跑一遍。看着 total 一轮一轮地涨。",
    },
    t04: {
      title: "列表在变长",
      tip: "append 往末尾添一项，而且每一轮都会添。",
    },
    t05: {
      title: "只走一条分支",
      tip: "if 和 else 里只会走一条，另一条根本不执行。",
    },
    t06: {
      title: "while 循环",
      tip: "条件一直成立就一直转，直到它不成立为止。",
    },
    t07: {
      title: "// 和 %",
      tip: "// 相除后扔掉小数；% 是除完剩下的余数。",
    },
    t08: {
      title: "双重循环",
      tip: "外层每走一步，内层都要从头到尾跑完一整遍。",
    },
  },
};
