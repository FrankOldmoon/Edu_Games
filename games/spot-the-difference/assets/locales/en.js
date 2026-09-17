/* Python Syntax Spot — English.

   This is the default locale and the fallback for every other pack, so it must
   stay complete. Keys mirror locales/zh-CN.js exactly:
     ui.*                    chrome, buttons and readouts
     levels.<level id>.*     level name / tip / hint and the note for each
                             differing spot, in the same order as levels.json */

export default {
  ui: {
    appTitle: "Python Syntax Spot",

    progress: "Completed {done} / {total}",
    levelNo: "Level {n}",
    done: "✓ Done",
    start: "Start →",
    locked: "🔒 Locked",
    reset: "Reset progress",
    resetConfirm: "Reset all progress for this level source?",
    loadFailed: "Could not load the levels\n{msg}",

    lead: "There are <b>{n}</b> levels, covering variables, input/output, operators and data types through to <code>if</code> / <code>elif</code> / <code>else</code> branches. Clear a level to unlock the next one.",
    leadCustom: " Add <code>?json=&lt;url&gt;</code> to the address to load a level bank of your own.",

    backToList: "← Level list",
    hint: "Hint",
    retry: "Retry",
    next: "Next →",
    allDone: "All done — back to the level list",

    panelLeft: "Original code (correct)",
    panelRight: "Changed code — click the spots that differ from the left",
    timeLeft: "Time left",

    seconds: "⏱ {n}s",
    counter: "Found {found} / {total}",
    hintPrefix: "Hint: {text}",
    defaultHint: "Compare every line of the two panels carefully.",
    solvedLeft: "All found — {n}s left.",
    allFound: "All spots found!",
    celebrateTime: "{n}s to spare",
    timeUp: "Time's up! A wrong click costs {n}s — no rush, try again.",

    playTitle: "{name} · Python Syntax Spot",
    levelOf: "Level {n} / {total} · {name}",
    rules: "The two snippets below differ in <b>{n}</b> spots. Click a spot in the <b>right</b> panel — it does not have to be precise, clicking nearby draws a green ring; a wrong click costs {penalty}s.",
    rulesOne: "The two snippets below differ in <b>one</b> spot. Click it in the <b>right</b> panel — it does not have to be precise, clicking nearby draws a green ring; a wrong click costs {penalty}s.",

    notFound: "No such level: {id}",
    levelLocked: "This level is still locked. Clear the earlier ones first — for a teacher demo, add ?all=1 to unlock everything.",
  },

  /* Thrown by validate() / loadLevels() and shown in the page's error box. */
  errors: {
    level: "Level {n}",
    spot: "{tag} spot {j}",
    noLevels: "the data has no levels array",
    needId: "{tag} is missing an id",
    needCode: "{tag} is missing its left / right code",
    lineCount: "{tag} has {left} lines on the left but {right} on the right",
    noDiffs: "{tag} has no diffs",
    panelRight: "{dt} only supports panel=right",
    lineRange: "{dt}: line out of range ({line})",
    identicalLine: "{dt} sits on a line that is identical on both sides, so it is not a difference",
    findEmpty: "{dt}: find must be a non-empty string",
    findMissing: "{dt}: {needle} is not on line {line} of the right panel",
    findAndAt: "{dt}: find and at cannot both be set",
    atValue: "{dt}: at must be start or end, got {value}",
    badJsonUrl: "the json parameter is not a valid URL: {url}",
    fetchFailed: "could not fetch {url}\n(a cross-origin URL needs CORS enabled on the other side)",
    http: "{url} answered with HTTP {status}",
    badJson: "{url} is not valid JSON",
  },

  levels: {
    l01: {
      name: "Variables and assignment",
      tip: "= assigns, == compares",
      hint: "Only one spot differs — look at the assignment sign.",
      notes: [
        "== is a comparison, so y is never assigned here; it should be a single =",
      ],
    },
    l02: {
      name: "Output with print",
      tip: "Strings need quotes, and case matters",
      hint: "Two spots: one case change and one missing quote.",
      notes: [
        "Python is case-sensitive: \"alice\" and \"Alice\" are different values",
        "The quotes are missing: Hi is read as a variable name and raises NameError",
      ],
    },
    l03: {
      name: "Input with input",
      tip: "input always hands back a string",
      hint: "Three spots: a missing conversion, a misspelled name and a case change.",
      notes: [
        "int() is gone: input returns a string, and a string plus 1 raises TypeError",
        "The name is misspelled: nam does not exist, it should be name",
        "Wrong case: next_Age and next_age are two different names",
      ],
    },
    l04: {
      name: "Arithmetic operators",
      tip: "// floors, / divides, % takes the remainder, ** raises a power",
      hint: "Four spots, all in operators or arguments.",
      notes: [
        "The plus became a minus, so s is no longer the sum of the two",
        "// floors and gives 3, while / does float division and gives 3.4",
        "** is exponentiation (17 to the power of 5); % is the remainder",
        "Only two values are printed — one argument is missing",
      ],
    },
    l05: {
      name: "Data types",
      tip: "Quotes make a string, no quotes makes a number",
      hint: "Five spots: a type, a value, a quote, an operator and a case change.",
      notes: [
        "Quotes turn it into a string; 3 is an integer, so the two types differ",
        "4.5 became 4: the float turned into an int and the decimals are gone",
        "The quotes are missing: box becomes a variable name",
        "The multiplication became an addition, so total means something else entirely",
        "Wrong case: Name and name are two different names",
      ],
    },
    l06: {
      name: "Comparison operators",
      tip: ">= vs > and <= vs < — one equals sign changes the result",
      hint: "Six spots, all in comparison operators.",
      notes: [
        ">= lost its equals sign: 60 used to pass, and now the test is False",
        "<= lost its equals sign: b is 100 and the boundary no longer includes it",
        "A condition written as an assignment: = assigns, comparisons need ==",
        "!= became ==: it used to test inequality, now it tests equality",
        "> gained an equals sign: it also becomes true when a equals b",
        "< gained an equals sign, so the boundary is included now",
      ],
    },
    l07: {
      name: "if, single branch",
      tip: "Colon, indentation and quotes — you need all three",
      hint: "Seven spots: a type, two case changes, a missing colon, a missing quote, an assignment and lost indentation.",
      notes: [
        "Quotes make it a string, and the comparison further down will fail",
        "Different case, so the strings are not equal",
        "The if line is missing its colon :, which makes Python raise SyntaxError",
        "The quotes are missing: pass is a Python keyword, so it is read as one instead of a string",
        "A condition written as an assignment: it should be ==",
        "This line is not indented, so it no longer belongs to the if branch",
        "Different case: the printed text changed",
      ],
    },
    l08: {
      name: "if / else and indentation",
      tip: "Python delimits blocks by indentation",
      hint: "Eight spots: a type, missing colons, a missing quote, lost indentation and case changes.",
      notes: [
        "Quotes make it a string, and % will raise TypeError",
        "3 became 3.0: an int turned into a float",
        "Conditions are written with ==; a single = assigns",
        "This line is not indented, so it no longer belongs to the if branch",
        "Different case: the output text changed",
        "The if line is missing its closing colon",
        "The quotes are missing: bigger becomes a variable name",
        "Different case",
      ],
    },
    l09: {
      name: "elif branches",
      tip: "Extra conditions go in elif; else takes no condition",
      hint: "Nine spots: a type, case changes, missing colons, an else with a condition and lost indentation.",
      notes: [
        "The score became a string, and the >= comparison further down will fail",
        "Different case",
        "Wrong case: Grade and grade are two different names",
        "The if line is missing its closing colon",
        "else cannot take a condition — this one should be elif",
        "The indentation is gone: this line no longer belongs to the branch above",
        "The grade is a lowercase c, inconsistent with A and B above",
        "Wrong case: Name is not defined",
        "Wrong case: Score is not defined",
      ],
    },
    l10: {
      name: "Mixed practice",
      tip: "Ten spots covering every kind of mistake so far",
      hint: "Ten spots: a tuple, a type, a missing colon, an operator, lost indentation, an assignment and case changes.",
      notes: [
        "The list [1, 2, 3] became the tuple (1, 2, 3) — a different type",
        "Quotes make it a string, so the accumulation turns into concatenation",
        "The for line is missing its closing colon",
        "Accumulating became subtracting, so the result is completely different",
        "The indentation is gone: this line no longer belongs to the for body",
        "A condition written as an assignment: it should be ==",
        "Wrong case: N is not defined",
        "Floor division // drops the decimals; / is what is needed here",
        "The if line is missing its closing colon",
        "Different case",
      ],
    },
  },
};
