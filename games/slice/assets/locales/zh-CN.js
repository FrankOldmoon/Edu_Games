/* 切片弹射 —— 简体中文。
   键必须和 locales/en.js 完全一致；en 是默认兼兜底，这里缺哪个键就会显示英文。 */

export default {
  ui: {
    appTitle: "切片弹射",
    backToSite: "← 全部游戏",

    lead: "切片就是三个数：<code>start</code>、<code>stop</code>、<code>step</code>。把它们设好，发射，被选中的方块就会飞进收集盘。要正好命中目标。共 <b>{n}</b> 关，最后一关是负步长。",

    progress: "已完成 {done} / {total}",
    levelNo: "第 {n} 关",
    start: "开始 →",
    done: "✓ 已通关",
    locked: "🔒 未解锁",
    reset: "重置进度",
    resetConfirm: "重置这个游戏的全部进度？",

    target: "目标",
    got: "你拿到",
    fire: "发射",
    retry: "重来",
    toList: "关卡列表",

    idxKeyUp: "上面的小数字：从前往后数的下标",
    idxKeyDown: "下面的小数字：从后往前数的下标",
    slotKey: "三个框依次是 <b>start : stop : step</b> —— 哪个留空就表示省掉它。",
    slotStart: "起点",
    slotStop: "终点",
    slotStep: "步长",
    omitted: "空",
    nothing: "什么都没有 —— 这个切片是空的",

    timeLimit: "限时 {n} 秒",
    leftTime: "剩余 {n} 秒",
    timeUp: "时间到 —— 重来一关吧",

    ok: "完全命中目标！",
    wrong: "还不是目标 —— 看看你实际拿到了什么。",
    invalid: "start、stop、step 必须是整数，或者留空",
    stepZero: "step 不能是 0 —— Python 会为此抛 ValueError",

    win: "命中目标！",
    winLine: "{n} 项 · 发射 {shots} 次 · {time}",
    shots1: "一发命中，瞄得准",
    shotsN: "打了 {n} 发才命中",
    next: "下一关 →",
    allDone: "全部完成，回到关卡列表",

    loadFailed: "加载关卡失败\n{msg}",
  },

  levels: {
    s01: { title: "切一段", tip: "start 位置会被取到，stop 位置不会。" },
    s02: { title: "省掉起点", tip: "起点留空，就是从最开头开始。" },
    s03: { title: "省掉终点", tip: "终点留空，就是一直取到结尾。" },
    s04: { title: "从后面数", tip: "-1 就是最后一个元素。" },
    s05: { title: "最后两个", tip: "负数是从末尾往回数出来的。" },
    s06: { title: "隔一个取一个", tip: "step 决定每次跨几个。" },
    s07: { title: "倒过来", tip: "step 为负，就是倒着走。" },
    s08: { title: "倒着走，隔一个", tip: "从末尾倒着走，每次跨两个。" },
    s09: { title: "越过结尾", tip: "边界超出范围不会报错，只会被截断到合法位置。" },
    s10: { title: "倒着走，两端都写", tip: "step 为负时：start 是起点，stop 是停下前的位置（取不到它）。" },
  },
};
