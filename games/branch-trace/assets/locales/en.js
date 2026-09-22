/* Python Branch Dungeon — English (default & fallback). */

export default {
  ui: {
    appTitle: "Python Branch Dungeon",
    backToSite: "← All games",

    lead: "No more multiple choice — you control a little explorer inside a dungeon. Every fork is a line of <b>if / elif / else</b> and the program only walks one branch. Use the <b>current variable values</b> above to decide which branch it takes, then move your character into that corridor. Walk the right path and you collect coins & advance; step into a dead branch's trap and you lose time — but you'll see why it wasn't the one taken.",
    moveHint: "Move with arrow keys / WASD, or tap the cell you want to go to.",
    gateNote: "Current fork — which corridor does the program take?",

    progress: "Cleared {done} / {total}",
    levelNo: "Level {n}",
    start: "Start →",
    done: "✓ Done",
    locked: "🔒 Locked",
    reset: "Reset",
    resetConfirm: "Clear all progress for this game?",

    retry: "Retry",
    toList: "Level list",

    timedLeft: "Time left",
    timeLimit: "{n}s limit",
    timeUp: "Time's up",
    timeUpShort: "Time up",

    coins: "Coins {n}",
    vars: "Current variables",
    codeTitle: "This program",

    trap: "Trap!",
    trapLine: "This branch never runs — {explain}",

    win: "You made it out!",
    perfect: "Chose correctly first try at every fork",
    partial: "First-try at {ok} of {total} forks",
    winLine: "{regions} forks · {coins} coins · {time}",
    next: "Next level →",
    allDone: "All done — back to the list",

    playWithOthers: "Play with others",
    roomTitle: "Branch Dungeon room",
    playerNo: "Player {n}",
    connecting: "Connecting…",
    connectFailed: "Can't reach the room server\n{msg}\nStart one: cd server && npm start — or point ?ws=ws://host:2568",
    roomClosed: "The room server closed this room.",

    loadFailed: "Failed to load levels\n{msg}",
  },

  levels: {
    b01: { title: "Pass or Fail", tip: "Whether score qualifies decides the path." },
    b02: { title: "Even or Odd", tip: "Even goes the if path, odd goes else." },
    b03: { title: "Three Ways", tip: "elif checks in order; the first true one wins." },
    b04: { title: "Door Within a Door", tip: "Judge the outer if first, then the inner one." },
    b05: { title: "Extra Lock", tip: "and needs BOTH conditions to be True." },
    b06: { title: "City Lights", tip: "Nesting + multiple branches — don't get lost." },
  },
};