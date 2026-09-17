# Edu Games

A small collection of offline-friendly HTML5 games for learning to program, the card wall
that serves them, and a tool for mirroring third-party HTML5 games for offline use.

Two games are written here. Both are bilingual (English + Simplified Chinese), bundled by
Vite, and pull their libraries from npm.

## The games

| Game | What it teaches | Source |
| --- | --- | --- |
| **Python Syntax Spot** | Find the spots where two Python snippets differ — variables, `print` / `input`, arithmetic and comparison operators, data types, `if` / `elif` / `else`, indentation | [`games/spot-the-difference`](games/spot-the-difference) |
| **Operator Sorter** | Route parcels into the bin that names their Python operator (`*` → TIMES, `//` → FLOOR, …) | [`games/operator-sorter`](games/operator-sorter) |

Third-party games captured with the mirror tool live in `games/external/`. That folder is
**not tracked** — a fresh clone contains only the two games above. See
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
│   └── i18n/                shared i18n runtime + switcher styles
├── games/
│   ├── spot-the-difference/ our game  (Vite entries: index.html, play/index.html)
│   ├── operator-sorter/     our game  (Vite entry:  html/index.html)
│   └── external/            third-party mirrors — NOT tracked
├── index.mjs                the mirror downloader
├── vite.config.js           multi-page build + copies games/external into dist/
└── package.json
```

To add a game to the card wall, append an entry to the `GAMES` array in
[`src/main.js`](src/main.js). A game we own is a Vite HTML entry (add it to
`rollupOptions.input` in [`vite.config.js`](vite.config.js)); a mirrored game is copied in
verbatim and referenced by URL only.

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

**Finishing a level** fires a canvas particle firework show and opens a translucent result
dialog with its own **Next** button. The dialog never times out: press the button to carry
on, or click outside / press `Esc` to dismiss it and look at the code you just fixed.
`prefers-reduced-motion` skips the fireworks and keeps the dialog.

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

## Caveats

- The browser used by the mirror tool must be able to reach the platform;
  Referer-protected CDNs are handled per platform.
- Large builds (100 MB+) take a while — raise `--max-body-mb` if a response is skipped.
- The crawler does not attempt to defeat DRM, authentication, licensing, or paywalls.
- Mirrored games remain the property of their authors; use for personal/offline use only.
