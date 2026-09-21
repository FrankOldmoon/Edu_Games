/* Python 代码打字 —— 简体中文。
   键必须和 locales/en.js 完全一致；en 是默认兼兜底，这里缺哪个键就会显示英文。
   代码本身在 levels.json 里，和语言无关，所以这里不重复。 */

export default {
  ui: {
    appTitle: "Python 代码打字",
    backToSite: "← 全部游戏",

    lead: "照着敲出每一行 Python，标点符号也要一模一样。共 <b>{n}</b> 关，从一个 <code>print</code> 到一个带累加的循环。<b>不计时</b>：秒表往上走，比的就是准确率和速度。过一关解锁下一关。",

    progress: "已完成 {done} / {total}",
    levelNo: "第 {n} 关",
    start: "开始 →",
    done: "✓ 已通关",
    locked: "🔒 未解锁",
    reset: "重置进度",
    resetConfirm: "重置这个游戏的全部进度？",

    retry: "重来",
    toList: "关卡列表",
    barTitle: "完成进度",
    levelInfo: "{n} 个字符 · 不计时",

    chars: "{n} / {total} 字符",
    statChars: "已完成",
    statWpm: "WPM",
    statAcc: "正确率",
    statErr: "敲错",

    keyTip: "<kbd>Tab</kbd> 一次敲四个空格 · <kbd>Enter</kbd> 换行 · <kbd>Backspace</kbd> 改掉敲错的字 · 开始前先把输入法切成英文",

    win: "敲完了！",
    winLine: "{chars} 个字符 · {wpm} WPM · 正确率 {acc}%",
    noTypos: "一个键都没敲错",
    typos: "敲错 {n} 次",
    stars3: "★★★ 一次没差",
    stars2: "★★☆ 已经很接近了",
    stars1: "★☆☆ 值得再练一次",
    next: "下一关 →",
    allDone: "全部完成，回到关卡列表",
    doneIn: "用时 {time}",

    /* ---- 多人 ---- */
    playWithOthers: "和别人一起打",
    raceTitle: "打字竞速",
    roomLabel: "房间 {code}",
    playersInRoom: "房间里有 {n} 人",
    invite: "复制邀请链接",
    invited: "链接已复制",
    leave: "离开房间",
    yourName: "你的名字",
    levelPick: "关卡",
    startRace: "开始比赛",
    endRace: "结束比赛",
    raceAgain: "再来一场",
    raceLead: "大家打同一段代码，先爬到顶的赢。共 <b>{chars}</b> 个字符。",
    countdownHint: "准备好 —— 代码对所有人在同一时刻解锁。",
    racingHint: "共 {chars} 个字符 —— 开始！",
    doneHint: "比赛结束，右边是名次。",
    waitingOthers: "打完了 —— 等其他人",
    finishLine: "终点",
    playerNo: "玩家 {n}",
    you: "（你）",
    raceWon: "你赢了！",
    raceOver: "比赛结束",
    racePlace: "你排第 {place} / {total}",
    raceDnf: "这一场没打完",
    raceStats: "{wpm} WPM · 正确率 {acc}% · 敲错 {err} 次",

    connecting: "正在进入房间……",
    connectFailed: "连不上房间服务器\n{msg}\n可以先用 cd server && npm start 起一个，或者用 ?ws=ws://主机:2567 指定地址",
    roomClosed: "房间服务器关掉了这个房间。",

    loadFailed: "加载关卡失败\n{msg}",
  },

  levels: {
    t01: {
      title: "第一次 print",
      tip: "一个函数名、一对括号、一对引号。",
    },
    t02: {
      title: "赋值",
      tip: "等号左边是名字，右边是值。",
    },
    t03: {
      title: "嵌套调用",
      tip: "int() 里面套着 input()，注意最后两个右括号。",
    },
    t04: {
      title: "三行代码",
      tip: "Enter 结束一行 —— 换行本身也是要敲的目标。",
    },
    t05: {
      title: "字符串列表",
      tip: "方括号、逗号，还有需要按 Shift 的双引号。",
    },
    t06: {
      title: "关键字参数",
      tip: "三个字符串加一个分隔符，全在括号里。",
    },
    t07: {
      title: "if 代码块",
      tip: "冒号收尾，块内缩进四个空格。",
    },
    t08: {
      title: "for 循环",
      tip: "range() 里放个数字，然后是一段缩进的循环体。",
    },
    t09: {
      title: "定义函数",
      tip: "def、括号里的参数、冒号，然后是 return。",
    },
    t10: {
      title: "累加循环",
      tip: "三行：一个列表字面量，还有 += 这个简写。",
    },
  },
};
