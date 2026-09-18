/* Robot Orders — English. Default locale and fallback: keep it complete.
   Keys mirror locales/zh-CN.js exactly. */

export default {
  ui: {
    appTitle: "Robot Orders",
    backToSite: "← All games",

    lead: "The robot only does what you tell it, one step at a time. Build a program out of five instructions, run it, and watch what actually happens. Deliver every parcel to a drop zone within the step limit. <b>{n}</b> levels.",

    progress: "Completed {done} / {total}",
    levelNo: "Level {n}",
    start: "Start →",
    done: "✓ Done",
    locked: "🔒 Locked",
    reset: "Reset progress",
    resetConfirm: "Reset all progress for this game?",

    run: "Run",
    stepOne: "Step",
    rewind: "Reset robot",
    toList: "Level list",
    clear: "Clear program",

    warehouse: "Warehouse",
    program: "Program",
    lgRobot: "robot",
    lgParcel: "parcel",
    lgGoal: "drop zone",
    lgWall: "wall",

    opF: "Forward",
    opL: "Turn left",
    opR: "Turn right",
    opP: "Pick up",
    opD: "Put down",

    empty: "No instructions yet — tap the buttons above to build the program.",
    budget: "{used} / {max} steps",
    plan: "{n} steps planned",
    bestLine: "shortest known solution: {best} steps",
    timeLimit: "{n} s limit",
    leftTime: "{n} s left",
    timeUp: "Time's up — try the level again",
    rowAria: "Instruction {n}: {op}, repeated {count} times",
    delAria: "Remove instruction {n}",
    countAria: "How many times to repeat",

    needProgram: "Add some instructions first",
    running: "Running…",
    bumped: "Bumped into a wall on step {n}",
    outOfSteps: "Out of steps — the limit is {max}",
    delivered: "Every parcel is on a drop zone!",
    notDone: "The program ended — {left} parcel(s) still not on a drop zone",

    win: "Route complete!",
    winLine: "{steps} steps · shortest known {best}",
    star3: "★★★ Exactly the shortest",
    star2: "★★☆ Close to the shortest",
    star1: "★☆☆ It runs — can you shorten it?",
    next: "Next →",
    allDone: "All done — back to the level list",

    loadFailed: "Could not load the levels\n{msg}",
  },

  levels: {
    r01: {
      title: "Fetch it",
      tip: "The robot only walks the way it is facing. Turning is something you have to ask for.",
    },
    r02: {
      title: "Turn the corner",
      tip: "A turn does not move the robot — it only changes which way forward is.",
    },
    r03: {
      title: "Round the back",
      tip: "Two left turns face the robot the opposite way. Work out the turns before you move.",
    },
    r04: {
      title: "One long walk",
      tip: "Rather than adding Forward eight times, set its count to 8 — that is a counted loop.",
    },
    r05: {
      title: "Two parcels",
      tip: "Pick up takes one parcel from the tile you are standing on; put down leaves one there.",
    },
    r06: {
      title: "Around the block",
      tip: "Plan the whole route first. Corners need a turn, and a turn costs a step too.",
    },
    r07: {
      title: "Why counts help",
      tip: "Eleven rows would be silly. Four rows with counts do exactly the same thing.",
    },
    r08: {
      title: "Full run",
      tip: "Two parcels, two drop zones, and a route that has to cut through the middle.",
    },
  },
};
