# Edu Games

A small collection of offline-friendly HTML5 games for learning to program, the card wall
that serves them, and a tool for mirroring third-party HTML5 games for offline use.

Six games are written here, all bilingual (English + Simplified Chinese), bundled by Vite,
and pulling their libraries from npm. They are spread deliberately across the cognitive
ladder: recalling terms, spotting a difference, ordering a program,
typing it out character by character, and finally steering an agent with a program you
assembled yourself.

## The games

| Game | What it teaches | Source |
| --- | --- | --- |
| **Term Memory** | Match a Python name with what it means — types, operators, built-ins, containers, branches, string methods, common errors, functions; solo, or in a shared room | [`games/memory`](games/memory) |
| **Python Syntax Spot** | Find the spots where two Python snippets differ — variables, `print` / `input`, operators, data types, `if` / `elif` / `else`, indentation; solo, or in a shared room | [`games/spot-the-difference`](games/spot-the-difference) |
| **Program Assembly** | Put shuffled lines back in the order that makes the program print the target output — from three lines to a bubble sort | [`games/order`](games/order) |
| **Robot Orders** | Sequence, turning and counted repetition: drive a robot with five instructions inside a step budget; solo, or in a shared room | [`games/robot`](games/robot) |
| **Operator Sorter** | Route parcels into the bin that names their Python operator (`*` → TIMES, `//` → FLOOR, …) | [`games/operator-sorter`](games/operator-sorter) |
| **Python Code Typing** | Type real Python lines character by character — quotes, brackets, colons and indentation included; solo, or in a shared room where everyone plays their own run and sees the others' progress | [`games/typing`](games/typing) |

Third-party games captured with the mirror tool live in `games/external/`. That folder is
**not tracked** — a fresh clone contains only the seven games above. See
[Mirroring third-party games](#mirroring-third-party-games) to recreate it.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173/
npm run build      # -> dist/, ready to serve as static files
npm run preview    # serve the built dist/
```

`npm run download` runs the mirror tool instead; that one additionally needs
`npx playwright install chromium`.

## Repository layout

```
.
├── index.html               card wall — the Vite entry page
├── src/
│   ├── main.js              the GAMES list + card rendering
│   ├── i18n/                shared i18n runtime + switcher styles
│   └── game-ui/             shared base.css, celebrate() and progress helpers
├── docs/
│   └── game-template.md     the contract every new game follows
├── games/
│   ├── memory/              our games — one HTML entry each, Vite-bundled
│   ├── order/               (register them in vite.config.js and src/main.js)
│   ├── robot/
│   ├── typing/
│   ├── spot-the-difference/ (two pages: index.html + play/index.html)
│   ├── operator-sorter/     (Phaser, pulled from npm)
│   └── external/            third-party mirrors — NOT tracked
├── server/                  the room server for every game (its own package.json)
├── index.mjs                the mirror downloader
├── vite.config.js           multi-page build + copies games/external into dist/
└── package.json
```

To add a game to the card wall, append an entry to the `GAMES` array in
[`src/main.js`](src/main.js) and register its HTML entry in `rollupOptions.input` in
[`vite.config.js`](vite.config.js). A mirrored game needs neither — it is copied in verbatim
and referenced by URL only.

A new game we write should follow [`docs/game-template.md`](docs/game-template.md): one HTML
entry, a `levels.json` carrying structure only (every readable string lives in the locale
packs), the shared [`src/i18n`](src/i18n/index.js) runtime, the shared helpers in
[`src/game-ui/`](src/game-ui), and the `game_result` postMessage contract. Any of the seven
games works as a worked example; [`games/memory`](games/memory) is the shortest.

## Languages

English is the default *and* the fallback; a Simplified Chinese pack ships with each game.

| File | Locale |
| --- | --- |
| `games/<game>/…/locales/en.js` | `en` — the default, and the fallback for every key |
| `games/<game>/…/locales/zh-CN.js` | `zh-CN` — Simplified Chinese |

Both feed the shared zero-dependency runtime in [`src/i18n/index.js`](src/i18n/index.js):
dot-path keys, `{placeholder}` interpolation, a fallback chain (current locale → `en` → the
key itself, so a missing translation is visible instead of silently blank), `data-i18n`
attributes for static markup, and the on-page switcher.

The switcher stores the choice in `localStorage` (`gc.locale`); `?lang=zh-CN` overrides it
for one link and sticks. Switching language never reloads the page and never loses progress.

## Python Syntax Spot

[`games/spot-the-difference/`](games/spot-the-difference) — two code panels side by side;
click the spots in the right one that differ from the left. Clicking *near* a spot is
enough: the hit box is measured from the rendered text, not from a character index.

**Timer.** A level is worth ten seconds per difference, so time = differences × 10s
(`levels.json` → `timer`, currently `base: 0`, `perDiff: 10`). A wrong click costs 5s.

**Finishing a level** fires a canvas particle firework show the moment the last difference is
clicked, and opens a translucent result dialog with its own **Next** button **three seconds
later** - the dialog covers both code panels, and that beat is what the fireworks are for. So
the button that carries you to the next level arrives after the show, not on top of it. The
dialog then never times out: press the button to carry on, or click outside / press `Esc` to
dismiss it and look at the code you just fixed. `prefers-reduced-motion` skips the fireworks
and shows the dialog at once rather than leaving you waiting out three seconds of nothing.

**Level data** ([`levels.json`](games/spot-the-difference/levels.json)) holds structure only:

```json
{ "id": "l01",
  "left":  "x = 5\ny = 3\nprint(x + y)",
  "right": "x = 5\ny == 3\nprint(x + y)",
  "diffs": [ { "panel": "right", "line": 2, "find": "==" } ] }
```

A diff points at a spot with either `find` (a substring of that line) or
`at: "start" | "end"` — the latter catches a missing indent or a missing colon.

The display text — level name, tip, hint and the note for each spot — is **not** in the
data. It is looked up in the locale packs by level id (`levels.<id>.*`), so nothing has to
be written twice.

**URL parameters**

| Parameter | Meaning |
| --- | --- |
| `level=<n>` | start on this level |
| `id=<level id>` | start on the level with this id |
| `all=1` | unlock every level (handy for a teacher demo) |
| `json=<url>` | load a different level bank |
| `lang=en\|zh-CN` | force a language for this link |

A `json=` bank may carry its own text (`name` / `tip` / `hint` / `note`), which takes
precedence over the locale packs — a custom bank works without touching this repo.

## Operator Sorter

[`games/operator-sorter/`](games/operator-sorter) — parcels leave a spawn point and step
along belts; click the junctions to route each one into the bin that names its operator.
Levels unlock one at a time. Engine: Phaser 3.90 from npm, nothing vendored.

All the content lives in `html/decks.js`: the level layouts are ASCII maps and the built-in
deck is the Python operators. The words the player reads live in `html/locales/`.

**URL parameters**

| Parameter | Meaning |
| --- | --- |
| `deck=<id>` | pick a built-in deck by id |
| `deckUrl=<url>` | load a deck from JSON (relative or absolute) |
| `level=<1-9>` | start on this level and allow picking it |
| `embed=1` | skip the menu and start immediately |
| `unlock=1` | unlock every level |

**Embedding.** `embed=1` skips the menu and starts the level directly. On finishing a level
the game posts to the parent frame:

```js
{ type: 'correct_rate', rate: 0..1, levelRate: 0..1, progress: 0..1,
  deck, level, levelTitle, correct, total, unlocked }
```

`rate` treats the first five levels as the course: clear those five and it is 1, and levels
6+ only add replay value. The game also fires a `sorter:complete` DOM event and appends to
`localStorage['sorter.log']`. [`html/embed-demo.html`](games/operator-sorter/html/embed-demo.html)
is a working host page showing all three.

Full notes — the deck JSON shape, the level-map legend, how to add your own topic — are in
[`games/operator-sorter/README-local.md`](games/operator-sorter/README-local.md).

## Python Code Typing

[`games/typing/`](games/typing) — the target is real Python, character by character:
quotes, brackets, colons, `=` and the four-space indent are all part of the score. Ten
levels, from `print('hello')` to a three-line loop with a running total.

**No timer.** The clock counts *up*, so there is no ceiling to beat and a level can never
run out on you — it comes down to accuracy and speed. The slider under the bar stopped
being "time left" and became "how much of the line is done". A wrong key flashes red and
costs accuracy, nothing else.

**Typing rules.** A correct key advances the cursor; a wrong one does not. `Backspace`
steps back (fixing a typo is not an error), `Tab` types the four-space indent in one go
(only when the next four characters really are spaces), `Enter` matches the newline, which
is displayed as `↵` and is a target character like any other. Punctuation counts, spaces
count, and you have to reach the end to clear the level. Keys are read from the document
rather than an `<input>`, so `Space` will not scroll the page and `Tab` will not steal
focus — the price is that composition events have to be ignored by hand, so **turn your IME
off before you start**.

**Solo vs. a shared room.** Add `?room=<code>` and you are in the same room as everyone
else — but **there is no race**. Each player plays their own run, starting at the first level,
on their own. Nobody starts or stops together, there is no countdown and no clock but
your own; clear a level and you move straight on to the next one by yourself. What the room
*does* sync is presence and progress — who is here, which level they are on and how far
through it — so everyone can watch each other move. **Term Memory works the same way**
(`?room=<code>` there too, with the matched-pair count as the progress); the two share one
layer, described in [Sharing a room](#sharing-a-room).

Each player's avatar climbs the tower on the right, and the tower shows **only the people on
your own level**, on the same text as you: the vertical position is how far they are through
*that* level, and the finish line is the top. Anyone on a different level is simply not drawn,
because comparing positions on different texts would mean nothing.

**Your own avatar is always pinned in the leftmost lane**, so you never have to hunt for
yourself — which matters, because on a shared level of 30 the class does not fit in one screen.
Everyone else is ranked to your right, the furthest along nearest to you, so passing someone
slides them rightwards past you. A class all starts level 1 together, so the tower is built to
hold a crowd: it works out how many avatars fit in one lane (from the tower's own height) and
adds lanes when it needs more, growing wider than its box so you swipe left/right to see the
rest — and it opens at your end, so you start by seeing yourself. Within a lane avatars are
pushed apart, so nobody ever hides behind anybody. The line above the tower says which level you
are on and how many others are there with you. Finish the last level and your own result card
appears — there is no "race again" and no "end race"; go back to the list to start another run.

```bash
cd server && npm ci && npm start     # room server on ws://localhost:2568
```

| Parameter | Meaning |
| --- | --- |
| `room=<code>` | join that room, creating it if nobody has yet |
| `room=` / `room=new` | make a new room with a random code |
| `username=<name>` | your name in the room (otherwise remembered, then generated) |
| `ws=<url>` | where the room server is (default: this host, port 2568) |
| `level=<n>` / `id=<id>` | which level the solo view opens on |
| `all=1` `json=<url>` `embed=1` | as in the other games; `json=` only affects solo |

`?username=` is what makes one link per student possible: `?room=py1&username=Ada` drops Ada
straight into the room under her own name. It is remembered from then on, and while it comes
from the link the lobby's name box is read-only — the link decides who you are, you do not get
to type over it. The *invite* link deliberately carries the room code without it, so whoever
opens it types their own name: copying a link hands over the room, not your identity.

Rooms are addressed by the code the client picks, so a code written on the board works:
the first player to open it creates the room, everyone else joins by code. The room server
is the authority on two things only — it holds the whole bank and checks each character a
client claims to have typed, so a client can only *ask* to move forward; and it remembers,
per player, which level they are on and how far through it they are. `start` moves only the
player who sent it, and it is ignored for anyone already playing (so you cannot jump levels by
pressing Start again). Leaving deletes you from the board rather than greying you out — with
everyone on their own run there is no field to keep intact, and stale avatars would only pile
up.

Two things are deliberately *not* synced: typos and WPM stay local, because the server never
sees individual keystrokes and should not claim to know. And the result card is your own —
there is no shared finish, no places and no times to compare. It arrives three seconds after
the fireworks (the shared `celebrate()`, see
[`docs/game-template.md`](docs/game-template.md)).

The whole multiplayer layer is a dynamic `import()`, so `colyseus.js` is a separate chunk
that is never fetched for solo play: the game still works offline, and `?room=` on a machine
that cannot reach a server drops back to solo with a message.

## Sharing a room

Four games — typing, memory, robot and spot-the-difference — are built on **one** room layer,
so adding it to a fifth means writing only the game-specific half.

Server ([`server/`](server)) — one process, one port, a room type per game:

- [`server/roomkit.js`](server/roomkit.js): the code registry (`<game>/<code>`), name cleaning
  and the per-second flood limiter. Nothing in it knows what a game is.
- [`server/schemas/progress.js`](server/schemas/progress.js): the generic `Player` (`name`,
  `playing`, `level`, `pos`, `connected`) and `ProgressState` (`levelIds`, `players`). Any
  "one number per level" game fits. Typing extends it with its target texts
  ([`schemas/typing.js`](server/schemas/typing.js)); the other three need nothing more.
- [`server/rooms/ProgressRoom.js`](server/rooms/ProgressRoom.js): `makeProgressRoom({ game, bank,
  keep, goal })` — one factory for every game the server **cannot** check. It keeps each
  player's `level` + `pos` in range (one level at a time, never past that level's goal) and
  lets the client drive the level. Memory, robot and spot are three instances of it.
- [`server/rooms/TypingRoom.js`](server/rooms/TypingRoom.js): the one room that **can** check,
  so it is written by hand — it holds the target texts and advances the level itself. All four
  are defined side by side in [`server/index.js`](server/index.js).

Client ([`src/game-ui/room/`](src/game-ui/room)) — the whole room UI, shared:

- `net.js`: `?room=` / `?ws=` / `?username=` parsing, the join handshake, and the messages.
- `panel.js`: the room bar, the lobby (name + Start + roster) and the same-level tower.
- `locales/`: the shared strings, merged into each game's pack under `room.*` by its `i18n.js`.

A game supplies three host elements (its own layout stays in its HTML/CSS), the tower's
denominator, the line next to Start, and what "progress" means:

```js
panel = createRoomPanel({ bar, lobby, tower, t, denomFor, startLabel,
                          onStart, onLeave, onName, inviteUrl, nameDefault });
net.progress({ pos: board.pos, chunk: chunk });   // typing: checked against the server's text
net.progress({ level: i, pos: matched });         // the other three: range-checked only
```

Two decisions worth knowing:

- **The room id is `<game>-<code>`, not the bare code.** The matchmaker keeps its rooms in one
  global table keyed by `roomId` with no duplicate check, so two games' rooms both called `py1`
  would overwrite each other. What the students see, type and share is still `py1`; only the
  server's internal id carries the prefix. Same rule on both sides — `roomIdFor` in
  [`roomkit.js`](server/roomkit.js) and in [`net.js`](src/game-ui/room/net.js).
- **Only typing validates.** It holds the target text, so it can check the characters a client
  claims to have typed — and it is the *server* that advances the level. For the other three
  the answer only exists in the browser (memory shuffles differently for every player, robot's
  map and spot's differences are judged against what is rendered there), so the server cannot
  check anything: the client reports `level` plus how far it has got, and the server keeps that
  in range. Because each report carries the whole truth, a dropped message heals itself on the
  next one — those three need no resync.

Both are honest about the trade: a classroom wants "same room, see who is on which level",
not anti-cheat.

**A room holds 50 people** (`MAX_CLIENTS`; also settable as an environment variable on the room
server). Colyseus locks a room once the cap is reached, so the 51st person is refused — and the
page says *"room is full, ask for another code"* rather than blaming the server.

To raise it on a running server: `MAX_CLIENTS=100 pm2 restart game-rooms --update-env` (then
`pm2 save`). The deploy script restarts with plain `pm2 restart` on purpose, so the setting
survives later deploys — but if the process is ever deleted and re-created it falls back to 50.

For reference, measured on one room: 200 people all typing at once (~540 progress messages a
second) cost about **2% of one CPU core**, held p95 delivery at ~57 ms and the page at 60 fps.
The room server is not what limits you — the horizontal scrolling is: at 200 players the tower's
lanes total ~3600 px, about ten screens. Keep a class in one room up to 50; beyond that it still
works, it just stops being something you can take in at a glance.

**One more thing clearing a level in a room does:** it marks that level in the game's own
progress store, so the level list *outside* the room unlocks too. Without it you could reach
level 5 in a room and still find the list locked.

## Mirroring third-party games

`index.mjs` downloads a public HTML5 game from **itch.io** or **CrazyGames** into a
self-contained local folder that runs offline.

It launches the game in a real browser, records every network response, performs multi-pass
exploratory navigation to trigger lazy-loaded assets, rewrites absolute URLs to local
relative paths, and strips platform-only scripts so the result is self-contained.

Mirrors belong in `games/external/`, which is git-ignored: they are somebody else's work,
they are large (a Unity build is 40 MB+), and they are not needed to build or run this site.

### Install

```bash
npm install
npx playwright install chromium
```

### Run

The platform is detected automatically from the URL. Use `--platform=itch|crazygames`
to force it.

#### itch.io

Auto-discovers the `html-classic.itch.zone/html/.../index.html` build URL from the game page.

```bash
node index.mjs https://madmarcel.itch.io/bauhaus-builder

# longer / visible exploration
node index.mjs https://madmarcel.itch.io/bauhaus-builder --seconds=240 --passes=16 --headed
```

If discovery is flaky (the page lazy-loads the build), pass it directly:

```bash
node index.mjs https://madmarcel.itch.io/bauhaus-builder \
  --build=https://html-classic.itch.zone/html/17195755-1681053/index.html
```

#### CrazyGames

The `*.game-files.crazygames.com` CDN is protected by a **Referer check**, so the
Referer is set automatically for this platform.

```bash
# From the game page: the build URL is discovered from the embedded iframe
node index.mjs https://games.crazygames.com/en_US/crew-of-one/index.html --out=./games/external/crew-of-one

# Or point straight at the build: only the game's own files are captured
node index.mjs https://crew-of-one.game-files.crazygames.com/crew-of-one/3/index.html --out=./games/external/crew-of-one
```

### Options

| Option | Default | Description |
| --- | --- | --- |
| `<url>` (positional) | — | Game page URL, or the build URL in `--direct` mode. |
| `--out=./games/external/<name>` | `./<slug>` | Output directory (slug is inferred from the URL). |
| `--platform=itch\|crazygames` | auto | Force the platform instead of detecting it from the host. |
| `--direct` | auto | Treat the URL as the game build itself (auto-on when the URL already matches the platform's build pattern). |
| `--build=<url>` | — | Use an explicit build URL instead of discovering it. |
| `--referer=<url>` | per platform | Referer header used for browser + `curl` downloads. |
| `--seconds=180` | `180` | Maximum exploration time. |
| `--passes=12` | `12` | Number of exploration passes. |
| `--action-delay=1800` | `1800` | Wait after each action (ms). |
| `--explore=safe\|aggressive` | `aggressive` | Safe disables coordinate clicking on the canvas. |
| `--max-body-mb=80` | `80` | Skip individual responses larger than this. |
| `--max-responses=10000` | `10000` | Cap the number of captured responses. |
| `--headed` | off | Show Chromium while crawling. |
| `--keep-browser` | off | Leave the browser open when finished. |

### Output layout

```
<out>/
├── README-local.md     # how to serve this game
├── capture.png         # representative screenshot from the exploration pass
└── html/               # the mirrored build (original path hierarchy preserved)
```

Platform-page noise (ads, framework bundles, tracking) is dropped; only resources
requested by the **game frame** are kept.

### How it works

1. Opens the game page (or the build URL in `--direct` mode).
2. Discovers the embedded build URL by platform rule (itch / CrazyGames).
3. Records every useful HTTP response body.
4. Explores: Phaser/DOM-aware clicks, keyboard navigation, and (in aggressive mode)
   canvas coordinate clicks, repeated over multiple passes.
5. Lazily fills build assets the exploration missed (e.g. `.wasm`, Unity's
   `dataUrl` / `frameworkUrl` / `codeUrl`) by re-downloading them with `curl`.
6. Keeps only resources requested by the game frame, dropping platform page noise.
7. Rewrites absolute URLs to local relative paths and writes `README-local.md` + `capture.png`.

### Platform & engine notes

- **itch.io** — strips `static.itch.io/htmlgame.js`. Its domain check redirects the page
  to `https://itch.io/embed-hotlink/<id>` when hosted outside itch.
- **CrazyGames** — strips the CrazyGames SDK script (`sdk.crazygames.com`). Games
  generally guard SDK calls, so they run fine offline. The `game-files` CDN requires
  `Referer: https://games.crazygames.com/`.
- **wasm fidelity** — `.wasm` (and `.wasm.br` / `.wasm.gz`) files are re-fetched with
  `curl` and validated against the wasm magic number, because browser `response.body()`
  can mis-decode chunked/compressed transfers. `.wasm` is never text-rewritten.
- **Unity `.br` builds** — if a `.br` / `.gz` file actually contains already-decompressed
  data, the suffix is stripped and references in the HTML are rewritten. Otherwise a
  static server would send a bogus `Content-Encoding: br` and the browser would fail with
  `ERR_CONTENT_DECODING_FAILED`.

## Deploying

`npm run build` writes a completely static `dist/`. Point any static server at it — this
deployment serves it with nginx as the web root. `games/external/**` is copied into `dist/`
verbatim by [`vite.config.js`](vite.config.js), so mirrored games are served alongside the
built ones, while Vite never parses or rewrites them. If the folder is missing, the build
simply skips it, so a fresh clone builds fine.

Development happens on a workstation; the server only pulls and builds:

```bash
git pull --ff-only && npm ci && npm run build
```

The **room server** is a second, optional thing: it has its own `package.json`, so the site's
`npm ci` ignores it, and the site builds and runs without it. Only the multiplayer half of the
games needs it:

```bash
cd server && npm ci && npm start        # ws://0.0.0.0:2568 — systemd/pm2 it if you like
```

One process serves every game's rooms (typing and memory today), so it is one thing to deploy
and one port to open. It serves WebSocket and the matchmaking POSTs; the browser reaches it on
port 2568 of whatever host served the page unless `?ws=` says otherwise, so that port has to be
open on the host and in any firewall in front of it. Change it with `PORT=…` — keep the client's
`?ws=` in step if you move it. On an `https://` page the default becomes `wss://`, so a reverse
proxy has to terminate TLS there. One process is enough for a classroom; the code registry is
per-process, so more than one would need `@colyseus/redis-presence` and a shared driver.

### Updating a running deployment

[`deploy.sh`](deploy.sh) is the whole thing — pull, rebuild, restart — and it is the one-liner
to put in the panel:

```bash
bash /www/wwwroot/127.0.0.1_3010/deploy.sh
```

In aaPanel that goes in **计划任务 → 类型「Shell 脚本」**, and its 「执行」 button is the
one-click; add a schedule too if you want it to run by itself. The script logs to
`/www/wwwlogs/edu_games-deploy.log`, and it only touches what changed: a front-end-only commit
rebuilds the site and leaves the room server alone, so a CSS fix cannot interrupt a run in
progress.
`R=`, `NODE_DIR=`, `BRANCH=`, `SITE_PORT=`, `ROOM_PORT=` and `PM2_APP=` override the paths and
names if the layout moves.

Four details it encodes, each paid for once already:

- **Only the owner of the deploy key can pull.** That is root, while everything else wants to
  run as the site user (`www`) because nginx serves as `www`. So the git step runs as root and
  the files it *creates* come out root-owned; normalise them right after the pull, or the next
  unprivileged `npm ci` / build fails on them. `chown -R` will stop on the panel's immutable
  `.user.ini` (`chattr +i`), so exclude it.
- **Use `npm ci`, not a floating install.** The lockfile is committed, and `npm ci` is the only
  command that guarantees the deployed tree matches it. `pnpm i` and `npm i` ignore
  `package-lock.json` (pnpm wants its own lockfile) and will happily install newer versions of
  everything.
- **Give npm a cache the site user can write.** The panel's npmrc sets
  `cache=/www/server/nodejs/cache`, which `www` cannot write to, so pass `npm_config_cache`;
  and skip Playwright's browser download, which the build does not need.
- **Fail loudly, build nothing.** `set -e` plus `--ff-only`: if the pull cannot be done the
  script stops. Without that, a failed pull is followed by a successful build of the *old* code
  and the log looks like a deployment.

The manual equivalent, if you ever need to see each step:

```bash
R=/www/wwwroot/127.0.0.1_3010
cd $R
git fetch --prune origin
git pull --ff-only origin main          # as root: root is who holds the key
find $R -name .user.ini -prune -o -print0 | xargs -0 chown www:www   # normalise ownership
NODE=/www/server/nodejs/v24.20.0/bin

sudo -u www env PATH=$NODE:/usr/bin:/bin HOME=/home/www \
  npm_config_cache=/home/www/.npm PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
  bash -c "cd $R && npm ci && npm run build"

# only if you run the room server: its dependencies are its own, and so is its process
sudo -u www env PATH=$NODE:/usr/bin:/bin HOME=/home/www npm_config_cache=/home/www/.npm \
  bash -c "cd $R/server && npm ci"
pm2 restart game-rooms || pm2 start $R/server/index.js --name game-rooms \
  --interpreter $NODE/node
```

The room server also needs its port open (`ufw allow 2568/tcp` here — the panel's firewall is
what the site on 3010 is allowed through), and `pm2 save` so it comes back after a reboot.

Prefer `npm ci` over `npm install` — it installs exactly what the lockfile pins and never
rewrites `package-lock.json`, which keeps the working tree clean on both machines.
`games/external/` is untracked, so it survives every pull; if it is ever missing, recreate it
with `npm run download` (which needs `npx playwright install chromium` first).

## Caveats

- The browser used by the mirror tool must be able to reach the platform;
  Referer-protected CDNs are handled per platform.
- Large builds (100 MB+) take a while — raise `--max-body-mb` if a response is skipped.
- The crawler does not attempt to defeat DRM, authentication, licensing, or paywalls.
- Mirrored games remain the property of their authors; use for personal/offline use only.
