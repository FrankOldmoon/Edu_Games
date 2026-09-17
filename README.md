# HTML5 Game Offline Mirror

Downloads a public HTML5 game from **itch.io** or **CrazyGames** into a self-contained
local folder that runs offline.

It launches the game in a real browser, records every network response, performs
multi-pass exploratory navigation to trigger lazy-loaded assets, rewrites absolute URLs
to local relative paths, and strips platform-only scripts so the result is self-contained.

## Install

```bash
npm install
npx playwright install chromium
```

## Run

The platform is detected automatically from the URL. Use `--platform=itch|crazygames`
to force it.

### itch.io

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

### CrazyGames

The `*.game-files.crazygames.com` CDN is protected by a **Referer check**, so the
Referer is set automatically for this platform.

```bash
# From the game page: the build URL is discovered from the embedded iframe
node index.mjs https://games.crazygames.com/en_US/crew-of-one/index.html --out=./games/external/crew-of-one

# Or point straight at the build: only the game's own files are captured
node index.mjs https://crew-of-one.game-files.crazygames.com/crew-of-one/3/index.html --out=./games/external/crew-of-one
```

## Options

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

## Output layout

```
<out>/
├── README-local.md     # how to serve this game
├── capture.png         # representative screenshot from the exploration pass
└── html/               # the mirrored build (original path hierarchy preserved)
```

Platform-page noise (ads, framework bundles, tracking) is dropped; only resources
requested by the **game frame** are kept.

## Serve locally

The repository is a Vite project. The root `index.html` is the card wall:

```bash
npm install
npm run dev            # http://localhost:5173/
npm run build          # -> dist/, ready to serve as static files
npm run preview        # serve the built dist/
```

Mirrored games live in `games/external/<name>/` and are copied verbatim into
`dist/` at build time — Vite never parses or rewrites them. The games we wrote
ourselves (`games/operator-sorter`, `games/spot-the-difference`) are bundled by
Vite and import their libraries (`phaser`, `highlight.js`) from npm.

Those two are also bilingual: English is the default, a Simplified Chinese pack
sits next to each game in its `locales/` folder, and both share the small runtime
in `src/i18n/`. The switcher on the page remembers the choice in `localStorage`,
and `?lang=zh-CN` switches language for a single link.

To add a game to the card wall, append an entry to the `GAMES` array in
`src/main.js`. New mirrors should be downloaded with `--out=./games/external/<name>`.

## How it works

1. Opens the game page (or the build URL in `--direct` mode).
2. Discovers the embedded build URL by platform rule (itch / CrazyGames).
3. Records every useful HTTP response body.
4. Explores: Phaser/DOM-aware clicks, keyboard navigation, and (in aggressive mode)
   canvas coordinate clicks, repeated over multiple passes.
5. Lazily fills build assets the exploration missed (e.g. `.wasm`, Unity's
   `dataUrl` / `frameworkUrl` / `codeUrl`) by re-downloading them with `curl`.
6. Keeps only resources requested by the game frame, dropping platform page noise.
7. Rewrites absolute URLs to local relative paths and writes `README-local.md` + `capture.png`.

## Platform & engine notes

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

## Caveats

- The browser must be able to reach the platform; Referer-protected CDNs are handled per platform.
- Large builds (100 MB+) take a while — raise `--max-body-mb` if a response is skipped.
- The crawler does not attempt to defeat DRM, authentication, licensing, or paywalls.
- Mirrored games remain the property of their authors; use for personal/offline use only.
