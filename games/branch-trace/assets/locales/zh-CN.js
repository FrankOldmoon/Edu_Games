/* Python 分支地牢(新玩法：拼程序走迷宫) —— 简体中文。
   键必须和 locales/en.js 完全对齐(en 是默认兼兜底，缺键就会显示英文)。
   关卡内容(迷宫、块、正解)在 levels.json 里，由 tools/branch-levels.py 用算法算出来。 */

export default {
  ui: {
    appTitle: "Python 分支地牢",

    lead: "这是一段待你拼出来的程序。角色站在迷宫起点，手里有一张 <b>if / elif / else</b> 判断块（迷宫感知：前方/左方/右方是否有路）和若干 <b>前进 / 左转 / 右转</b> 移动块。把块拼成一段能带角色走到 ★ 终点的程序，点「执行」让它跑起来。",
    moveHint: "点击右侧方块加入程序，可拖拽排序；Enter 执行，Backspace 删末尾。",
    stageNote: "看迷宫和起点朝向，把 <b>if/elif/else</b> 判断块和 <b>前进/左转/右转</b> 移动块拼成一段程序，点「执行」让角色自动走。能在不撞墙的情况下走到 <b>★</b> 终点即过关。",

    howtoTitle: "❓ 怎么玩？",
    howto: "① 右侧「可用方块」列出本关能用的块：if 判断块 + 前进(F)/左转(L)/右转(R)。\n② 点击方块加入下面「我的程序」，可拖拽调整顺序、点 ✕ 删除。\n③ 点「执行」—— 程序从头跑到尾，角色按程序结果自动走。\n④ 前方/左方/右方是否有路，由 if 判断块在<b>它执行那一刻</b>读迷宫得到。\n⑤ 撞墙 = 程序不对，扣 5 秒；改块后再执行。\n⑥ 走到 ★ 终点 = 程序走通了，过关！",

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

    palette: "可用方块",
    yourProgram: "我的程序",
    programEmpty: "点上方方块加入程序…",
    run: "▶ 执行",
    clear: "清空",
    remove: "删除此块",
    problem: "本关可用判断",
    problemText: "if 条件判断（基于<角色朝向>读迷宫周围）：",

    if: "if",
    else: "else",

    F: "前进", L: "左转", R: "右转",

    predFrontOpen: "前方有路?",
    predFrontWall: "前方是墙?",
    predLeftOpen: "左方有路?",
    predLeftWall: "左方是墙?",
    predRightOpen: "右方有路?",
    predRightWall: "右方是墙?",

    bump: "撞墙了——程序不对，扣 5 秒，试试改改再执行。",
    goal: "走到终点，过关！",
    notGoal: "执行完毕，但没到 ★ 终点。",

    attempts: "尝试 {n} 次",
    win: "走出地牢！",
    perfect: "一次执行就通关",
    partial: "{total} 次尝试后通关",
    winLine: "尝试 {attempts} 次 · 用时 {time}",
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
    m01: { title: "碰壁右转", tip: "前方是墙就右转" },
    m02: { title: "T 字路口", tip: "前方没路往左拐" },
    m03: { title: "三岔路口", tip: "左边没路往前走" },
    m04: { title: "穿过死胡同", tip: "见墙左转，贴着走" },
    m05: { title: "九宫格", tip: "一路感测，别撞墙" },
  },
};