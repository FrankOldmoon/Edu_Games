/* Python Term Memory — English.

   This is the default locale and the fallback for every other pack, so it must
   stay complete. Keys mirror locales/zh-CN.js exactly:
     ui.*                 chrome, buttons and readouts
     levels.<level id>.*  level title, tip, and the meaning of each term.
                          `defs` is keyed by the term itself, so a term with no
                          translation shows up as the term instead of a blank. */

export default {
  ui: {
    appTitle: "Python Term Memory",
    backToSite: "← All games",

    lead: "Flip two cards at a time and match every <b>name</b> with what it does. <b>{n}</b> levels: data types, operators, built-in functions, containers, branches and loops, string methods, common errors and functions. Clear a level to unlock the next one.",

    progress: "Completed {done} / {total}",
    levelNo: "Level {n}",
    start: "Start →",
    done: "✓ Done",
    locked: "🔒 Locked",
    reset: "Reset progress",
    resetConfirm: "Reset all progress for this game?",

    retry: "Retry",
    toList: "Level list",
    moves: "{n} moves",
    clock: "{time}",

    cardDown: "Card {n}, face down",
    cardUp: "Card {n}: {text}",

    win: "All matched!",
    winLine: "{pairs} pairs · {moves} moves · {time}",
    stars3: "★★★ That was efficient",
    stars2: "★★☆ Solid",
    stars1: "★☆☆ Worth another run",
    next: "Next →",
    allDone: "All done — back to the level list",

    loadFailed: "Could not load the levels\n{msg}",
  },

  levels: {
    m01: {
      title: "Data types",
      tip: "The four basic types you meet first.",
      defs: {
        int: "whole number",
        str: "text in quotes",
        float: "number with a dot",
        bool: "either True or False",
      },
    },
    m02: {
      title: "Operators",
      tip: "The ones that are not + - * /.",
      defs: {
        "//": "divide, drop the fraction",
        "%": "what is left over",
        "**": "raise to a power",
        "!=": "not equal",
      },
    },
    m03: {
      title: "Built-in functions",
      tip: "You will use these in almost every program.",
      defs: {
        "len()": "how many items",
        "print()": "show something on screen",
        "input()": "read the line the user typed",
        "int()": "turn a value into an integer",
      },
    },
    m04: {
      title: "Containers",
      tip: "When one variable is not enough.",
      defs: {
        list: "ordered, can change",
        dict: "key → value pairs",
        tuple: "ordered, cannot change",
        set: "no duplicates",
      },
    },
    m05: {
      title: "Branches & loops",
      tip: "Choose a path, or repeat one.",
      defs: {
        if: "run when the condition holds",
        elif: "check another condition",
        else: "run when nothing above matched",
        for: "once per item",
      },
    },
    m06: {
      title: "String methods",
      tip: "Called with a dot, right after the value.",
      defs: {
        ".upper()": "make it upper case",
        ".strip()": "trim the whitespace off both ends",
        ".split()": "cut into a list of parts",
        ".replace()": "swap one substring for another",
      },
    },
    m07: {
      title: "Common errors",
      tip: "Read the last line of the traceback — it names one of these.",
      defs: {
        SyntaxError: "the code is not valid Python",
        TypeError: "the wrong kind of value",
        NameError: "the name is not defined",
        IndexError: "the index is out of range",
      },
    },
    m08: {
      title: "Functions",
      tip: "Six words, and the difference between two of them is easy to miss.",
      defs: {
        def: "start defining a function",
        return: "hand a result back",
        parameter: "the name in the definition",
        argument: "the value passed in a call",
        call: "run the function",
        scope: "where a name can be seen",
      },
    },
  },
};
