# Operator Sorter — local copy

This one is **not** a mirrored build: it is a hand-written game that lives in this
folder like the other entries so the card wall can serve it.

- Engine: Phaser 3.90 (MIT), installed from npm and bundled by Vite
- No vendor folder: `game.js` is an ES module that imports Phaser and `decks.js`

Serve the repository root with the Vite dev server and open:

```
http://localhost:5173/games/operator-sorter/html/index.html
```

## Layout

```
html/
├── index.html          entry — loads game.js as a module
├── decks.js            the built-in deck + all 9 level layouts  <-- edit this
├── deck.sample.json    example deck for the ?deckUrl= loading path
├── game.js             engine, scenes, scoring, unlocking
├── i18n.js             wires the locale packs into the shared i18n runtime
├── locales/            en.js (default) + zh-CN.js — every player-visible string
├── embed-demo.html     iframe embedding + postMessage example
screenshots/            Playwright verification captures
```

## How to play

Parcels leave a spawn point and step along the belts one cell at a time.
A parcel reads the exit direction **of the cell it is standing on**, so clicking a
junction only affects the parcels that pass through it after the click.

- Click a junction (blue outline) to switch its exit direction
- Get each parcel into the bin it belongs to
- `R` restart the level, `Esc` back to level select

### Time to think

Two things are tuned so a player is never forced to react instantly:

1. **A long run-in before the first junction.** Every spawn point sits at the far
   left (col 1) and the junctions are clustered on the right (cols 10–14), so a
   parcel slides **9 cells ≈ 2.7 s** along a straight belt before it reaches the
   first decision. Because the symbol is visible the whole way, parcels visibly
   *queue up* on the run-in — you can read the next few and plan ahead.
2. **A short "Get ready" window at level start.** A countdown bar under the board
   holds everything still for 1500 ms (`LEAD_MS`) so you can read the bin labels
   first. A level can override it with `lead: 2500` in its layout.

Nothing is locked during the countdown — **junctions are clickable immediately**,
so you can pre-set the routes before the first parcel arrives.

### The deck: Python operators

Five operators, introduced one at a time over the first four levels:

| Levels | Operators in play |
| --- | --- |
| 1 | `*` `/` |
| 2 | `*` `/` `%` |
| 3 | `*` `/` `%` `//` |
| 4–5 | all five (`*` `/` `%` `//` `**`) |
| 6–10 | practice — the same knowledge stages on different boards |

**Levels 6–10 run at a relaxed pace**: the spawn interval is stretched to
**3×** the layout's own value (≈6.6–7.2 s per parcel), so the player only ever
has to think about one parcel at a time. The menu labels those levels with
`relaxed pace, one parcel at a time`.

Bins read `TIMES DIV MOD FLOOR POWER`.

### Colour coding

Every category has its own colour, and a parcel is drawn **in the colour of the
category it belongs to** — the same colour as its bin's border, top strip and
label tint. So symbol and bin visibly pair up, and you can spot a mis-sort at a
glance. The label text is still the actual signal; the colour is a shortcut.

There are 12 colours, so up to 12 categories can be told apart by colour alone.

### Level capacity

The nine hand-written layouts use 2 → 7 bins. If a deck has **more than 7
categories**, extra wide layouts are appended automatically (one per step, up to
12 bins) so no category is ever silently dropped:

| Categories | Levels |
| --- | --- |
| 7 (the built-in Python deck) | 10 |
| 8 / 9 / 10 / 11 | 11 / 12 / 13 / 14 |
| 12 | 15 |

The wide layouts use two belts: the upper one feeds bins `a`–`g`, the lower one
feeds the rest, each with its own spawner.

### Progressive unlocking

Levels unlock one at a time: finishing a level opens the next one, and the rest
stay locked (shown with a padlock). Cleared levels can always be replayed.

- Progress lives in `localStorage['sorter.progress']`, keyed by deck id:
  `{ "python": [0, 1] }` — the indexes of the cleared levels
- **"Reset progress"** at the bottom right of the menu clears it (asks for confirmation)
- `?level=N` unlocks only level N (for teacher deep links); `?unlock=1` unlocks everything

## URL parameters

| Parameter | Meaning |
| --- | --- |
| `deck=<id>` | pick a built-in deck by id |
| `deckUrl=<url>` | load a deck from JSON (relative or absolute) |
| `level=<1-9>` | start on this level and allow picking it |
| `embed=1` | skip the menu and start immediately |
| `unlock=1` | unlock every level |

```
index.html?deck=python&level=3&embed=1
index.html?deckUrl=./deck.sample.json
index.html?deckUrl=https://example.com/deck.json&unlock=1
```

### Loading a deck from JSON

`deckUrl` accepts a single deck object, an array of decks, or `{ "decks": [ ... ] }`.
The shape is the same as one entry in `decks.js`. Two examples ship with the game:

- `deck.datatypes.json` — Python data types (`int` / `str` / `bool` / `float`), 5
  levels. Each category carries a **list of values**, so a parcel shows a random
  one and the player cannot just memorise one label per bin.
- `deck.sample.json` — two decks (a 7-category one and a 12-category one) showing
  the multi-deck form and the level auto-expansion.

```json
{
  "id": "datatypes",
  "name": "Python Data Types",
  "title": "Python Data Types",
  "tagline": "Sort each value by its Python type",
  "desc": "Send each value to its type",
  "categories": [
    { "bin": "int", "items": ["42", "7", "-3"] },
    { "bin": "str", "items": ["\"hi\"", "\"42\""] }
  ],
  "levelTitles": ["Level 1 · int or str"],
  "levelHints":  ["The quotes decide it: 42 is an int, \"42\" is a str."]
}
```

- The **cover follows the deck**: `title` is the big heading on the menu and the
  browser tab title, `tagline` is the line under it. Both fall back to `name` /
  `desc`, so loading a deck swaps the cover automatically

- A category takes either `items: [...]` (random pick) or `item: 'x'` (fixed) —
  use the list form when several values share one type
- `levels`, `levelTitles` and `levelHints` are all optional; without them you get
  the shared layouts and their text
- **A deck with fewer categories than a layout has bins simply gets fewer
  levels**: a 4-category deck uses the layouts with 2/2/3/4/4 bins (5 levels), so
  you never see duplicated bins
- Invalid entries are skipped with a console warning; if the fetch fails the game
  falls back to the built-in deck
- A cross-origin URL needs CORS headers on the serving side
- Up to 12 categories per deck. Keep bin labels short — 6 characters or fewer
  fits comfortably, longer ones shrink to stay inside the cell

## Changing the content in-repo

Level geometry comes from `html/decks.js`. Levels are ASCII maps; the legend sits
at the top of that file:

```
.            empty
> < ^ v      belt (exit direction)
+            junction (clickable, cycles right <-> down)
a b c d e f g h i j k l   bin -> 1st..12th entry of this level's category list
S            spawn point (direction from the `spawns` array, reading order)
```

The words the player reads — layout names, hints, the deck title and the bin
labels — are not in `decks.js`: they live in `html/locales/`.

## Languages

Two locales ship with the game, and English is the default:

| File | Locale |
| --- | --- |
| `html/locales/en.js` | `en` — the default, and the fallback for every key |
| `html/locales/zh-CN.js` | `zh-CN` — Simplified Chinese |

`html/i18n.js` hands both packs to the shared runtime in `src/i18n/`. The switcher
in the page header stores the choice in `localStorage`, and `?lang=` overrides it
for a single link:

```
index.html?lang=zh-CN&level=3
```

A new string has to be added to **both** packs.

## Embedding

`embed=1` skips the menu and starts the level directly. On finishing a level the
game posts to the parent frame:

```js
{
  type: 'correct_rate',
  rate: 0..1,        // completion: the first FIVE levels are the course — clear all five → 1
  levelRate: 0..1,   // accuracy of the level just finished
  progress: 0..1,    // parcels delivered in that level (1 on report)
  deck, level, levelTitle, correct, total, unlocked
}
```

Levels 6+ are practice: clearing them raises the replay value but the completion
`rate` is already 1 once the first five levels are cleared.

It also fires a `sorter:complete` DOM event and appends to `localStorage['sorter.log']`.
`html/embed-demo.html` is a working host page showing all three.

Hand-written as an educational sorting/routing game; no third-party assets are
bundled — all visuals are drawn procedurally with Phaser Graphics and Text.
