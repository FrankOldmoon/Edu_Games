/* Python Branch Dungeon (new: program-assembly maze) — English (default & fallback). */

export default {
  ui: {
    appTitle: "Python Branch Dungeon",

    lead: "This is a program for you to assemble. A little explorer stands at the maze start, holding an <b>if / elif / else</b> branch block (maze-sensing: is there a path ahead / left / right) plus some <b>forward / left / right</b> move blocks. Snap blocks into a program that walks the explorer to the ★ exit, then hit <b>Run</b> and let it walk. Reach the exit = level complete.",
    moveHint: "Click a tile to add it to the program; drag to reorder; Enter to run, Backspace to undo the last tile.",
    stageNote: "Look at the maze and the starting heading. Snap <b>if/elif/else</b> sensing blocks and <b>forward / left / right</b> move blocks into a program, hit <b>Run</b>, and the explorer walks by itself. Reach the <b>★</b> without bumping a wall to win.",

    howtoTitle: "❓ How to play",
    howto: "1. The right panel lists this level's tiles: an if/elif/else sensing block + Forward (F) / Left (L) / Right (R) moves.\n2. Tap a tile to add it to “My program” below; drag to reorder, tap ✕ to remove.\n3. Hit Run — the program plays top to bottom and the explorer moves accordingly.\n4. Whether there's a path ahead/left/right is read from the maze <b>at the moment the if block runs</b>.\n5. Hitting a wall = wrong program, −5s; tweak the tiles and try again.\n6. Reach the ★ = the program works = level complete!",

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

    palette: "Tiles",
    yourProgram: "My program",
    programEmpty: "Tap tiles above to add…",
    run: "▶ Run",
    clear: "Clear",
    remove: "Remove this tile",
    problem: "Sensing conditions",
    problemText: "The if condition reads the maze around the explorer (by its heading):",

    if: "if",
    else: "else",

    F: "Fwd", L: "Left", R: "Right",

    predFrontOpen: "ahead open?",
    predFrontWall: "ahead wall?",
    predLeftOpen: "left open?",
    predLeftWall: "left wall?",
    predRightOpen: "right open?",
    predRightWall: "right wall?",

    bump: "Bumped a wall — wrong program, −5s. Tweak it and run again.",
    goal: "Reached the exit — level complete!",
    notGoal: "Program finished, but not at the ★ exit.",

    attempts: "{n} tries",
    win: "You made it out!",
    perfect: "Cleared on the first run",
    partial: "Cleared after {total} tries",
    winLine: "{attempts} tries · {time}",
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
    m01: { title: "Wall, Turn Right", tip: "ahead is a wall, turn right" },
    m02: { title: "T Junction", tip: "no path ahead, go left" },
    m03: { title: "Three Ways", tip: "no path left, walk ahead" },
    m04: { title: "Through the Cul-de-sac", tip: "see a wall, turn left, hug it" },
    m05: { title: "Nine Grid", tip: "sense every step, don't bump" },
  },
};