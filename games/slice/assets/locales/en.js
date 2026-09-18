/* Slice Shot — English. Default locale and fallback: keep it complete.
   Keys mirror locales/zh-CN.js exactly. */

export default {
  ui: {
    appTitle: "Slice Shot",
    backToSite: "← All games",

    lead: "A slice is three numbers: <code>start</code>, <code>stop</code> and <code>step</code>. Set them, fire, and the blocks you actually select fly into the tray. Hit the target exactly. <b>{n}</b> levels, ending on negative steps.",

    progress: "Completed {done} / {total}",
    levelNo: "Level {n}",
    start: "Start →",
    done: "✓ Done",
    locked: "🔒 Locked",
    reset: "Reset progress",
    resetConfirm: "Reset all progress for this game?",

    target: "Target",
    got: "You got",
    fire: "Fire",
    retry: "Retry",
    toList: "Level list",

    idxKeyUp: "small numbers above: index counted from the front",
    idxKeyDown: "small numbers below: index counted from the back",
    slotKey: "The three boxes are <b>start : stop : step</b> — leave one empty to omit it.",
    slotStart: "start",
    slotStop: "stop",
    slotStep: "step",
    omitted: "empty",
    nothing: "nothing — the slice came out empty",

    timeLimit: "{n} s limit",
    leftTime: "{n} s left",
    timeUp: "Time's up — try the level again",

    ok: "Exactly the target!",
    wrong: "Not the target yet — look at what you collected.",
    invalid: "start, stop and step have to be whole numbers, or left empty",
    stepZero: "step cannot be 0 — Python raises ValueError for that",

    win: "Slice hit!",
    winLine: "{n} items · {shots} shots · {time}",
    shots1: "First shot — nicely aimed",
    shotsN: "{n} shots to land it",
    next: "Next →",
    allDone: "All done — back to the level list",

    loadFailed: "Could not load the levels\n{msg}",
  },

  levels: {
    s01: { title: "Cut a range", tip: "start is included, stop is not." },
    s02: { title: "Omit the start", tip: "An empty start means: from the very beginning." },
    s03: { title: "Omit the stop", tip: "An empty stop means: all the way to the end." },
    s04: { title: "Count from the back", tip: "-1 is the last item." },
    s05: { title: "The last two", tip: "Negative numbers count back from the end." },
    s06: { title: "Every other one", tip: "step decides how many to skip each time." },
    s07: { title: "Reverse it", tip: "A negative step walks backwards." },
    s08: { title: "Backwards, skipping one", tip: "Walk back from the end, jumping two at a time." },
    s09: { title: "Past the end", tip: "An out-of-range bound is not an error — it just gets clamped." },
    s10: { title: "Backwards, both bounds", tip: "With a negative step, start is where you begin and stop is where you halt (not included)." },
  },
};
