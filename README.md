# Edu Games

A small collection of offline-friendly HTML5 games for learning to program, the card wall
that serves them, and a tool for mirroring third-party HTML5 games for offline use.

Seven games are written here, all bilingual (English + Simplified Chinese), bundled by Vite,
and pulling their libraries from npm. They are spread deliberately across the cognitive
ladder: recalling terms, spotting a difference, ordering a program, predicting a slice,
typing it out character by character, and finally steering an agent with a program you
assembled yourself.

## The games

| Game | What it teaches | Source |
| --- | --- | --- |
| **Term Memory** | Match a Python name with what it means — types, operators, built-ins, containers, branches, string methods, common errors, functions | [`games/memory`](games/memory) |
| **Python Syntax Spot** | Find the spots where two Python snippets differ — variables, `print` / `input`, operators, data types, `if` / `elif` / `else`, indentation | [`games/spot-the-difference`](games/spot-the-difference) |
| **Program Assembly** | Put shuffled lines back in the order that makes the program print the target output — from three lines to a bubble sort | [`games/order`](games/order) |
| **Slice Shot** | Predict what `start:stop:step` really selects, including negative indices and steps | [`games/slice`](games/slice) |
| **Robot Orders** | Sequence, turning and counted repetition: drive a robot with five instructions inside a step budget | [`games/robot`](games/robot) |
| **Operator Sorter** | Route parcels into the bin that names their Python operator (`*` → TIMES, `//` → FLOOR, …) | [`games/operator-sorter`](games/operator-sorter) |
| **Python Code Typing** | Type real Python lines character by character — quotes, brackets, colons and indentation included; solo, or a live race in a shared room | [`games/typing`](games/typing) |

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
│   ├── slice/
│   ├── robot/
│   ├── typing/
│   ├── spot-the-difference/ (two pages: index.html + play/index.html)
│   ├── operator-sorter/     (Phaser, pulled from npm)
│   └── external/            third-party mirrors — NOT tracked
├── server/                  the typing room server (its own package.json)
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

**Solo vs. a race.** Add `?room=<code>` and the same drill becomes a race against everyone
else in that room. A race is a **course**: the levels from the chosen starting level to the
end of the bank, in order. Clear a level and you are moved straight on to the next one — you
never wait for anybody, so the field spreads out across the course, and the first player to
finish the last level wins.

Each player's avatar climbs the tower on the right, and the tower shows **only the people on
your own level**, on the same text as you: the vertical position is how far they are through
*that* level, and the finish line is the top. The line above the tower says which level you
are on and how many others are there with you.

```bash
cd server && npm ci && npm start     # room server on ws://localhost:2568
```

| Parameter | Meaning |
| --- | --- |
| `room=<code>` | join that room, creating it if nobody has yet |
| `room=` / `room=new` | make a new room with a random code |
| `username=<name>` | your name in the room (otherwise remembered, then generated) |
| `ws=<url>` | where the room server is (default: this host, port 2568) |
| `level=<n>` / `id=<id>` | which level a *new* room starts its course on |
| `all=1` `json=<url>` `embed=1` | as in the other games; `json=` only affects solo |

`?username=` is what makes one link per student possible: `?room=py1&username=Ada` drops Ada
straight into the room under her own name. It is remembered from then on, and the *invite*
link deliberately carries the room code without it — copying a link hands over the room, not
your identity.

Rooms are addressed by the code the client picks, so a code written on the board works:
the first player to open it creates the room, everyone else joins by code. The room server
is the authority — it holds the text of every level in the course and checks each character a
client claims to have typed, so a client can only *ask* to move forward, and only *says*
which level it is on. The race starts on a **server** timestamp (`startsAt`, set three
seconds ahead — never a per-client 3-2-1) so a slow connection does not cost you the start;
places and times are the server's too, and the clock runs for the whole course rather than
restarting at each level. Drop out mid-race and your avatar greys out rather than vanishing;
the race still ends when everyone still connected is finished, and anyone can end it early.

Two things are deliberately *not* synced: typos and WPM stay local, because the server never
sees individual keystrokes and should not claim to know. And no result card is shown to the
first player home while others are still typing — their avatar pins to the top and turns gold,
so they can watch the rest of the race. When the race does end, everyone's card arrives three
seconds after the fireworks (the shared `celebrate()`, see
[`docs/game-template.md`](docs/game-template.md)).

The whole multiplayer layer is a dynamic `import()`, so `colyseus.js` is a separate chunk
that is never fetched for solo play: the game still works offline, and `?room=` on a machine
that cannot reach a server drops back to solo with a message.

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

The typing game's room server is a **second, optional** thing: it has its own
`package.json`, so the site's `npm ci` ignores it, and the site builds and runs without it.
Only the multiplayer half needs it:

```bash
cd server && npm ci && npm start        # ws://0.0.0.0:2568 — systemd/pm2 it if you like
```

It serves WebSocket and the matchmaking POSTs; the browser reaches it on port 2568 of
whatever host served the page unless `?ws=` says otherwise, so that port has to be open on
the host and in any firewall in front of it. Change it with `PORT=…` — keep the client's
`?ws=` in step if you move it. On an `https://` page the default becomes `wss://`, so a
reverse proxy has to terminate TLS there. One process is enough for a classroom; the
room-code registry is per-process, so more than one would need `@colyseus/redis-presence`
and a shared driver.

### Updating a running deployment

The whole site is a pull and a build, but on a panel box (aaPanel + a site user) three
details bite, and all three were paid for once already:

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
pm2 restart typing-room || pm2 start $R/server/index.js --name typing-room \
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
