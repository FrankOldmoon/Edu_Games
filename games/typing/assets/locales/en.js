/* Python Code Typing — English.

   This is the default locale and the fallback for every other pack, so it must
   stay complete. Keys mirror locales/zh-CN.js exactly:
     ui.*                 chrome, readouts, buttons, the result card and the race
     levels.<level id>.*  level title and tip — the code itself lives in
                          levels.json and is language-independent, so it is
                          never duplicated here. */

export default {
  ui: {
    appTitle: "Python Code Typing",
    backToSite: "← All games",

    lead: "Type each Python line exactly as it is written, punctuation and all. <b>{n}</b> levels, from a single <code>print</code> to a loop with a running total. There is <b>no timer</b> — the clock counts up, so it comes down to accuracy and speed. Clear a level to unlock the next one.",

    progress: "Completed {done} / {total}",
    levelNo: "Level {n}",
    start: "Start →",
    done: "✓ Done",
    locked: "🔒 Locked",
    reset: "Reset progress",
    resetConfirm: "Reset all progress for this game?",

    retry: "Retry",
    toList: "Level list",
    barTitle: "Progress",
    levelInfo: "{n} characters · no timer",

    chars: "{n} / {total} chars",
    statChars: "Characters",
    statWpm: "WPM",
    statAcc: "Accuracy",
    statErr: "Typos",

    keyTip: "<kbd>Tab</kbd> types four spaces · <kbd>Enter</kbd> starts a new line · <kbd>Backspace</kbd> fixes a typo · turn your IME off before you start",

    win: "Typed it!",
    winLine: "{chars} characters · {wpm} WPM · {acc}% accurate",
    noTypos: "Not one mistyped key",
    typos: "{n} typos",
    stars3: "★★★ Clean run",
    stars2: "★★☆ Nearly clean",
    stars1: "★☆☆ Worth another run",
    next: "Next →",
    allDone: "All done — back to the level list",
    doneIn: "Finished in {time}",

    /* ---- 多人 ---- */
    playWithOthers: "Play with others",
    roomTitle: "Typing room",
    roomLabel: "Room {code}",
    roomMeta: "Level {level}/{levels} · {here} on this level · {room} in the room",
    roomPeople: "{n} in the room",
    roomLead: "Everyone plays their own run here — nobody starts or stops together. Pick a starting level and go; anyone on the same level as you shows up on the tower.",
    onLevel: "On level {n}",
    notStarted: "has not started yet",
    finishedAll: "every level done",
    invite: "Copy invite link",
    invited: "Link copied",
    leave: "Leave",
    yourName: "Your name",
    levelPick: "Level",
    startLevel: "Starting level",
    startPlaying: "Start",
    levelHint: "Level {level}/{levels} · {chars} characters",
    levelCleared: "Cleared — next level coming up",
    youFinished: "You finished your run",
    backToList: "Back to the list",
    finishLine: "finish",
    playerNo: "Player {n}",
    you: "(you)",

    connecting: "Connecting to the room…",
    connectFailed: "Could not reach the room server\n{msg}\nRun one with: cd server && npm start — or pass ?ws=ws://host:2568",
    roomClosed: "The room server closed this room.",

    loadFailed: "Could not load the levels\n{msg}",
  },

  levels: {
    t01: {
      title: "First print",
      tip: "A name, a pair of brackets, a pair of quotes.",
    },
    t02: {
      title: "Assignment",
      tip: "Left of the = is the name, right of it is the value.",
    },
    t03: {
      title: "Nested calls",
      tip: "input() inside int(). Mind the two closing brackets at the end.",
    },
    t04: {
      title: "Three lines",
      tip: "Enter ends a line — the new line is part of the target.",
    },
    t05: {
      title: "A list of strings",
      tip: "Square brackets, a comma, and quotes that need Shift.",
    },
    t06: {
      title: "Keyword arguments",
      tip: "Three strings and one separator, all inside the brackets.",
    },
    t07: {
      title: "An if block",
      tip: "A colon ends the line, and the body is indented by four spaces.",
    },
    t08: {
      title: "A for loop",
      tip: "range() with a number, then an indented body.",
    },
    t09: {
      title: "Defining a function",
      tip: "def, a parameter in brackets, a colon, then return.",
    },
    t10: {
      title: "Running total",
      tip: "Three lines, a list literal, and the += shortcut.",
    },
  },
};
