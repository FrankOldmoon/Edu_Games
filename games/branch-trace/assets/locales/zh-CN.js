/* Python 分支地牢 —— 简体中文。
   键必须和 locales/en.js 完全对齐（en 是默认兼兜底，缺键就会显示英文）。
   关卡内容（代码、地图、金币的落点、每关走哪个分支）在 levels.json 里，
   由 tools/branch-levels.py 用真 Python 跑出来，不写在这儿。 */

export default {
  ui: {
    appTitle: "Python 分支地牢",
    backToSite: "← 全部游戏",

    lead: "这不再是一道道选择题 —— 你是一个走进地牢的角色。每个岔路口是一行 <b>if / elif / else</b>，程序只会走其中一条分支。靠上面给的<b>当前变量值</b>判断它会走哪条，然后把角色走进那条走廊。走对了沿路捡金币、往前走；走错了踩进死路的陷阱，扣时间，还能看到为什么它不是该走的那条。",
    moveHint: "方向键 / WASD 移动，或点击想去的格子。",
    gateNote: "当前岔路口：程序会走哪条走廊？",

    progress: "已通关 {done} / {total}",
    levelNo: "第 {n} 关",
    start: "开始 →",
    done: "✓ 已完成",
    locked: "🔒 未解锁",
    reset: "重置进度",
    resetConfirm: "清空这个游戏的所有进度？",

    retry: "重来",
    toList: "关卡列表",

    timedLeft: "剩余时间",
    timeLimit: "限时 {n} 秒",
    timeUp: "时间到",
    timeUpShort: "时间到",

    coins: "金币 {n}",
    vars: "当前变量",
    codeTitle: "这段程序",

    trap: "踩到陷阱了！",
    trapLine: "这条分支不是程序会走的 —— {explain}",

    win: "走出地牢！",
    perfect: "每个岔路口都一次走对",
    partial: "{total} 个岔路口里 {ok} 个一次走对",
    winLine: "{regions} 个岔口 · {coins} 金币 · 用时 {time}",
    next: "下一关 →",
    allDone: "全部完成 —— 回到关卡列表",

    playWithOthers: "和别人一起玩",
    roomTitle: "分支地牢房间",
    playerNo: "玩家 {n}",
    connecting: "正在连进房间…",
    connectFailed: "连不到房间服务器\n{msg}\n先跑一个：cd server && npm start —— 或用 ?ws=ws://主机:2568 指",
    roomClosed: "房间服务器把这间房关了。",

    loadFailed: "关卡库加载失败\n{msg}",
  },

  levels: {
    b01: { title: "生死开关", tip: "score 够不够格，决定了走哪条路。" },
    b02: { title: "奇偶分流", tip: "偶数走 if，奇数走 else。" },
    b03: { title: "三岔路", tip: "elif 一条一条拦，最先成立的那个才走。" },
    b04: { title: "门里有门", tip: "先判外面的 if，进了门再判里面的。" },
    b05: { title: "加一把锁", tip: "and 要两个条件都成立才算 True。" },
    b06: { title: "老路新走", tip: "嵌套 + 多分支混在一起，别走岔。" },
  },
};