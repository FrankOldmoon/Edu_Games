/* Operator Sorter — 简体中文。

   英文是默认语言，这份包是覆盖层：只写需要改动的键，缺的会自动回落到
   en。`content.decks.python.bins` 按英文标签做键，所以加分类时不会错位。 */

export default {
  ui: {
    appTitle: "运算符分拣",
    loading: "加载中…",
    start: "开始",
    startWith: "开始 · {title}",
    replay: "重玩本关",
    levelSelect: "选择关卡",
    backToMenu: "返回菜单",
    next: "下一关 ▶",
    resetProgress: "重置进度",
    resetConfirm: "重置「{deck}」的全部已通关记录？",
    lockedHint: "请先完成上一关",

    stepDeck: "1 · 选择题库",
    stepLevel: "2 · 选择关卡",
    unlockedByUrl: "（已由 URL 解锁全部关卡）",

    deckInfo: "{cats} 个分类 · {levels} 关 · 已通关 {cleared}/{levels}",
    levelMeta: "{total} 个包裹 · {bins} 个收集口",
    relaxed: "放松节奏，一次只来一个包裹",
    levelPrefix: "第 {n} 关 · ",

    menuHint: "点击蓝色描边的岔路可以切换出口方向 —— 包裹经过时读取的是它脚下那一格的方向。",
    gameHint: "点击岔路切换方向   ·   R 重开本关   ·   Esc 返回选关",

    stats: "正确 {correct}   ·   已送达 {delivered} / {total}",
    getReady: "准备   {n}",
    toastOk: "✓  {what} → {bin}",
    toastBad: "✗  {what} 应该进 {bin}，不是 {want}",
    fellOff: "包裹掉出了传送带",

    allComplete: "全部关卡完成！",
    levelComplete: "本关完成",
    scoreLine: "{total} 个包裹中正确 {correct} 个",
    levelUnlocked: "第 {n} 关已解锁",
  },

  content: {
    decks: {
      python: {
        title: "Python 运算符",
        tagline: "把每个运算符和它对应的名字配起来",
        name: "Python 运算符",
        desc: "把每个运算符和它对应的名字配起来",
        bins: {
          TIMES: "乘法",
          DIV: "除法",
          MOD: "取余",
          FLOOR: "整除",
          POWER: "幂",
        },
      },
    },

    layouts: {
      oneLaneEach: {
        title: "一条道一个口",
        hint: "每条道只通向一个收集口，看清楚每个包裹最后去了哪儿。",
      },
      twoLanes: {
        title: "两条道",
        hint: "还是那两个运算符，但两条道的起点不一样。",
      },
      firstJunction: {
        title: "第一个岔路",
        hint: "点击岔路（蓝色描边）切换方向。包裹经过的那一刻才会读取方向。",
      },
      lShape: {
        title: "L 形传送带",
        hint: "传送带中途向下拐了个弯。运算符没变，形状变了。",
      },
      cascadePair: {
        title: "接力岔路",
        hint: "一个岔路接下一个岔路 —— 要提前想好两步。",
      },
      twoJunctions: {
        title: "两个岔路",
        hint: "包裹会依次经过两个岔路 —— 每个决定一段路线。",
      },
      nestedDrop: {
        title: "嵌套下落",
        hint: "第二个岔路在第一个的正下方 —— 要落两格才能到。",
      },
      feedLane: {
        title: "汇入车道",
        hint: "上面一个岔路，下面一条直道，两者汇入同一组收集口。",
      },
      fourOperators: {
        title: "四个运算符",
        hint: "四个运算符一起上。三个岔路，各管一段。",
      },
      twoLines: {
        title: "两条流水线",
        hint: "两个生成点同时出货。上线只喂上面两个收集口，下线反过来。",
      },
      deepDrops: {
        title: "连续下落",
        hint: "三个岔路，每段落差有两格 —— 留意包裹下落的过程。",
      },
      crossLanes: {
        title: "上下双道",
        hint: "上下叠着两条道，各有自己的岔路。上线喂上面的收集口。",
      },
      fiveOperators: {
        title: "五个运算符",
        hint: "第一个岔路后面还藏着第二个 —— 先过第一个，才有第二个选择。",
      },
      upAndDown: {
        title: "一上一下",
        hint: "两条线各有岔路，互不相干。两边都得盯着。",
      },
      sixOperators: {
        title: "六个运算符",
        hint: "六个收集口、五个岔路。每一段都想清楚了再点。",
      },
      allSeven: {
        title: "七个全上",
        hint: "七个收集口、六个岔路，两个生成点汇进同一条主干。",
      },
      theCascade: {
        title: "瀑布式岔路",
        hint: "岔路自上而下串成一条 —— 从上往下依次设好。",
      },
      eightCategories: {
        title: "八个分类",
        hint: "下面多出一条传送带，运最新加入的那个分类。",
      },
      nineCategories: {
        title: "九个分类",
        hint: "下面那条带子也有自己的岔路了。",
      },
      tenCategories: {
        title: "十个分类",
        hint: "下面那条带子上有两个岔路，要送到三个收集口。",
      },
      elevenCategories: {
        title: "十一个分类",
        hint: "下面那条带子负责四个收集口。两条带子同时跑。",
      },
      twelveCategories: {
        title: "十二个分类",
        hint: "全都铺开：上面七个收集口，下面五个。",
      },
    },
  },
};
