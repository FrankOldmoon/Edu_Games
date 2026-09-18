/* Program Assembly — English. Default locale and fallback: keep it complete.
   Keys mirror locales/zh-CN.js exactly. */

export default {
  ui: {
    appTitle: "Program Assembly",
    backToSite: "← All games",

    lead: "The lines of a small program got shuffled. Put them back in the order that makes the program produce the output on the right. <b>{n}</b> levels, from three lines up to a full bubble sort.",

    progress: "Completed {done} / {total}",
    levelNo: "Level {n}",
    start: "Start →",
    done: "✓ Done",
    locked: "🔒 Locked",
    reset: "Reset progress",
    resetConfirm: "Reset all progress for this game?",

    program: "Program — drag a line, or use ↑ ↓",
    goal: "Target output",
    stdin: "Input the user types",
    console: "What it printed",
    run: "Run",
    hint: "Hint",
    retry: "Retry",
    toList: "Level list",

    lineAria: "Line {n}: {code}",
    upAria: "Move line {n} up",
    downAria: "Move line {n} down",

    correctAll: "It runs — the output matches!",
    nRight: "{n} of {total} lines are in the right place",
    noneRight: "No line is in the right place yet — look for the line that has to run first",
    hintText: "The first line should be: {code}",
    emptyLine: "(empty line)",

    win: "Program assembled!",
    winLine: "{lines} lines · {attempts} runs · {time}",
    attempts1: "First run — nicely done",
    attemptsN: "{n} runs to get there",
    next: "Next →",
    allDone: "All done — back to the level list",

    loadFailed: "Could not load the levels\n{msg}",
  },

  levels: {
    o01: {
      title: "Name and greeting",
      tip: "A name has to exist before you can use it.",
    },
    o02: {
      title: "Swap two values",
      tip: "The swap happens in the middle; the print has to come after it.",
    },
    o03: {
      title: "Input, compute, print",
      tip: "input() hands you text — turn it into a number before doing maths with it.",
    },
    o04: {
      title: "Add up in a loop",
      tip: "The indented line belongs to the loop above it, and the total has to start somewhere.",
    },
    o05: {
      title: "Define, then call",
      tip: "Defining a function does not run it; the body is indented.",
    },
    o06: {
      title: "List in order",
      tip: "append adds one item, sort puts them in order.",
    },
    o07: {
      title: "Branch order matters",
      tip: "Python takes the first branch that matches, so order decides the answer.",
    },
    o08: {
      title: "Bubble sort",
      tip: "One pass: walk the list, swap neighbours that are out of order — and repeat while anything changed.",
    },
  },
};
