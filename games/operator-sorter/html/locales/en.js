/* Operator Sorter — English.

   This is the default locale and the fallback for every other pack, so it
   must stay complete. Keys are grouped as:
     ui.*      chrome, buttons, readouts and toasts
     content.* layout / deck copy that used to live inside decks.js      */

export default {
  ui: {
    appTitle: "Operator Sorter",
    loading: "Loading…",
    start: "Start",
    startWith: "Start · {title}",
    replay: "Replay",
    levelSelect: "Level select",
    backToMenu: "Back to menu",
    next: "Next ▶",
    resetProgress: "Reset progress",
    resetConfirm: 'Reset all cleared levels for "{deck}"?',
    lockedHint: "Finish the previous level first",

    stepDeck: "1 · Choose a deck",
    stepLevel: "2 · Choose a level",
    unlockedByUrl: "(all levels unlocked by URL)",

    deckInfo: "{cats} categories · {levels} levels · cleared {cleared}/{levels}",
    levelMeta: "{total} parcels · {bins} bins",
    relaxed: "relaxed pace, one parcel at a time",
    levelPrefix: "Level {n} · ",

    menuHint: "Click a blue-outlined junction to switch its direction — a parcel reads the direction the moment it passes through.",
    gameHint: "Click a junction to switch direction   ·   R restart   ·   Esc level select",

    stats: "Correct {correct}   ·   Delivered {delivered} / {total}",
    getReady: "Get ready   {n}",
    toastOk: "✓  {what} → {bin}",
    toastBad: "✗  {what} is {bin}, not {want}",
    fellOff: "Parcel fell off the belt",

    allComplete: "All levels complete!",
    levelComplete: "Level complete",
    scoreLine: "Correct {correct} of {total} parcels",
    levelUnlocked: "Level {n} unlocked",
  },

  content: {
    decks: {
      python: {
        title: "Python Operators",
        tagline: "Match each operator to a word",
        name: "Python Operators",
        desc: "Match each operator to a word",
      },
    },

    layouts: {
      oneLaneEach: {
        title: "One Lane Each",
        hint: "Each lane leads to exactly one bin. Watch where every parcel ends up.",
      },
      twoLanes: {
        title: "Two Lanes",
        hint: "Same two operators, but the lanes start at different points.",
      },
      firstJunction: {
        title: "First Junction",
        hint: "Click a junction (blue outline) to switch its direction. A parcel reads the direction the moment it passes through.",
      },
      lShape: {
        title: "L Shape",
        hint: "The belt turns downwards halfway. Same operators, new shape.",
      },
      cascadePair: {
        title: "Cascade Pair",
        hint: "One junction feeds the next — plan two hops ahead.",
      },
      twoJunctions: {
        title: "Two Junctions",
        hint: "Parcels pass both junctions in turn — each one decides a leg of the route.",
      },
      nestedDrop: {
        title: "Nested Drop",
        hint: "The second junction sits below the first — two hops to reach it.",
      },
      feedLane: {
        title: "Feed Lane",
        hint: "One junction upstairs, one plain lane below. Both feed the same set.",
      },
      fourOperators: {
        title: "Four Operators",
        hint: "All four operators at once. Three junctions, one for each stretch.",
      },
      twoLines: {
        title: "Two Lines",
        hint: "Two spawners running at once. The top line only feeds the top two bins, and vice versa.",
      },
      deepDrops: {
        title: "Deep Drops",
        hint: "Three junctions, and each drop is two cells long — watch the fall.",
      },
      crossLanes: {
        title: "Cross Lanes",
        hint: "Two lanes stacked, each with its own junction. Top lane feeds the top bins.",
      },
      fiveOperators: {
        title: "Five Operators",
        hint: "There is a second junction behind the first one — take the first to earn the second choice.",
      },
      upAndDown: {
        title: "Up and Down",
        hint: "Two lines with their own junctions, independent of each other. Keep an eye on both.",
      },
      sixOperators: {
        title: "Six Operators",
        hint: "Six bins, five junctions. Think each leg through before you click.",
      },
      allSeven: {
        title: "All Seven",
        hint: "Seven bins, six junctions, and two spawners flowing into one shared trunk.",
      },
      theCascade: {
        title: "The Cascade",
        hint: "Junctions chain downwards now — set them in order, top to bottom.",
      },
      eightCategories: {
        title: "Eight Categories",
        hint: "A second belt appears below, carrying the newest category.",
      },
      nineCategories: {
        title: "Nine Categories",
        hint: "The lower belt now has its own junction.",
      },
      tenCategories: {
        title: "Ten Categories",
        hint: "Two junctions on the lower belt, three bins to reach.",
      },
      elevenCategories: {
        title: "Eleven Categories",
        hint: "Four bins on the lower belt. Both belts run at once.",
      },
      twelveCategories: {
        title: "Twelve Categories",
        hint: "The full spread: seven bins up top, five below.",
      },
    },
  },
};
