/* =============================================================================
 * decks.js — knowledge decks (the only file you normally need to edit)
 * =============================================================================
 *
 * This game is a generic "sort & route" engine: a parcel shows `item`,
 * a bin shows `bin`, and the player uses clickable junctions to route each
 * parcel into the bin that pairs with it.
 *
 * To teach something else, push another entry into DECKS below — or, without
 * touching this file at all, hand the game a JSON deck over the URL:
 *
 *   index.html?deckUrl=./my-deck.json
 *   index.html?deckUrl=https://example.com/deck.json&level=3&embed=1
 *
 * The JSON is either a single deck object or { "decks": [ ... ] } — same shape
 * as one entry in DECKS. See deck.sample.json next to this file for a template.
 * (Cross-origin URLs need CORS headers on the server serving the JSON.)
 *
 * ─── Level map legend (one character per cell) ──────────────────────────────
 *   .   empty (not walkable)
 *   > < ^ v   belt, exits to the right / left / up / down
 *   +   junction (clickable; cycles between right and down by default)
 *   a..l  bin, mapped to the 1st..12th entry of this level's `use` list
 *   S   spawn point. Directions come from the `spawns` array, matched in
 *       reading order (top to bottom, left to right).
 *
 * A parcel is drawn in the colour of its category, and each bin is tinted with
 * the same colour, so symbol and bin visibly pair up. The label text is still
 * the real signal — the colours just help you find the right bin faster.
 *
 * Movement rule: a parcel sitting on a cell reads THAT CELL's exit direction
 * and steps to the neighbour. Entering a bin resolves the parcel. So the
 * author only has to guarantee that every chain ends in some bin.
 *
 * ─── Category pairings (how knowledge is expressed) ────────────────────────
 *   categories: [ { item: text shown on the parcel, bin: text shown on the bin } ]
 *   Both are free-form strings, but keep bin labels short (about 6 characters):
 *   a bin label is drawn inside a single grid cell.
 *
 * ─── Spawn config ─────────────────────────────────────────────────────────
 *   { dir: exit direction, every: ms between parcels, types: 'all' | ['a','b'] }
 *   `types` uses BIN LETTERS, which keeps level geometry independent of the
 *   deck. 'all' means "emit every category used in this level".
 *
 * ─── Thinking time ────────────────────────────────────────────────────────
 *   A player must never have to react instantly, so two things give slack:
 *
 *   1. A long run-in. Every layout puts the spawn point at the far left and the
 *      junctions on the right, so a parcel slides ~9 cells (~2.7 s) along a
 *      straight belt before it reaches the first decision. Parcels visibly queue
 *      up on the run-in, so the next few are readable in advance. Keep this when
 *      authoring new layouts.
 *   2. A short "get ready" countdown bar at the start (default 1500 ms, the
 *      game's LEAD_MS). Junction clicks work during it. Add `lead: 2500` to a
 *      level if a busy board needs longer.
 * ========================================================================== */

import { i18n, t } from "./i18n.js";

const SORTER_DATA = (function () {

  /* =========================================================================
   * 1. Nine shared level layouts (geometry only — reused by every deck)
   *    The number of bins grows level by level, and so does the number of
   *    operators the player has to tell apart:
   *    L1 two lanes → L2 first junction → L3 two junctions → L4 four operators
   *    → L5 two spawners → L6 five operators → L7 two lines
   *    → L8 six operators → L9 all seven
   * ====================================================================== */
  var LAYOUTS = [
    {
      key: 'oneLaneEach',
      total: 8,
      map: [
        '................',
        '................',
        '.S>>>>>>>>>>a...',
        '................',
        '................',
        '................',
        '.S>>>>>>>>>>b...',
        '................',
        '................'
      ],
      spawns: [
        { dir: 'e', every: 2200, types: ['a'] },
        { dir: 'e', every: 2200, types: ['b'] }
      ]
    },
    {
      key: 'twoLanes',
      total: 8,
      map: [
        '................',
        '.S>>>>>>>>>>a...',
        '................',
        '................',
        '.....S>>>>>>>b..',
        '................',
        '................',
        '................',
        '................'
      ],
      spawns: [
        { dir: 'e', every: 2200, types: ['a'] },
        { dir: 'e', every: 2200, types: ['b'] }
      ]
    },
    {
      key: 'firstJunction',
      total: 8,
      map: [
        '................',
        '................',
        '.S>>>>>>>>+>>>>a',
        '..........v.....',
        '..........>>>>>b',
        '................',
        '................',
        '................',
        '................'
      ],
      spawns: [
        { dir: 'e', every: 2400, types: 'all' }
      ]
    },
    {
      key: 'lShape',
      total: 9,
      map: [
        '................',
        '.S>>>>+>>>>>a...',
        '......v.........',
        '......>>>>>>b...',
        '................',
        '................',
        '................',
        '................',
        '................'
      ],
      spawns: [
        { dir: 'e', every: 2400, types: 'all' }
      ]
    },
    {
      key: 'cascadePair',
      total: 9,
      map: [
        '................',
        '.S>>>>+>a.......',
        '......+>b.......',
        '......c.........',
        '................',
        '................',
        '................',
        '................',
        '................'
      ],
      spawns: [
        { dir: 'e', every: 2400, types: 'all' }
      ]
    },
    {
      key: 'twoJunctions',
      total: 9,
      map: [
        '................',
        '................',
        '.S>>>>>>>>+>>+>a',
        '..........v..v..',
        '..........b..c..',
        '................',
        '................',
        '................',
        '................'
      ],
      spawns: [
        { dir: 'e', every: 2300, types: 'all' }
      ]
    },
    {
      key: 'nestedDrop',
      total: 9,
      map: [
        '................',
        '.S>>>>>>>>+>>>>a',
        '..........v.....',
        '..........+b....',
        '..........c.....',
        '................',
        '................',
        '................',
        '................'
      ],
      spawns: [
        { dir: 'e', every: 2400, types: 'all' }
      ]
    },
    {
      key: 'feedLane',
      total: 9,
      map: [
        '................',
        '.S>>>>>>>>+>>>>a',
        '..........v.....',
        '..........b.....',
        '................',
        '.S>>>>>>>>>>>>>c',
        '................',
        '................',
        '................'
      ],
      spawns: [
        { dir: 'e', every: 2400, types: ['a', 'b'] },
        { dir: 'e', every: 2400, types: ['c'] }
      ]
    },
    {
      key: 'fourOperators',
      total: 12,
      map: [
        '................',
        '................',
        '.S>>>>>>>>+>+>+a',
        '..........v.v.v.',
        '..........b.c.d.',
        '................',
        '................',
        '................',
        '................'
      ],
      spawns: [
        { dir: 'e', every: 2200, types: 'all' }
      ]
    },
    {
      key: 'twoLines',
      total: 12,
      map: [
        '................',
        '................',
        '.S>>>>>>>>+>>>>a',
        '..........v.....',
        '..........b.....',
        '................',
        '.S>>>>>>>>+>>>>c',
        '..........v.....',
        '..........d.....'
      ],
      spawns: [
        { dir: 'e', every: 2600, types: ['a', 'b'] },
        { dir: 'e', every: 2600, types: ['c', 'd'] }
      ]
    },
    {
      key: 'deepDrops',
      total: 12,
      map: [
        '................',
        '.S>>>>>>>+>+>+>a',
        '.........v.v.v..',
        '.........v.v.v..',
        '.........b.c.d..',
        '................',
        '................',
        '................',
        '................'
      ],
      spawns: [
        { dir: 'e', every: 2300, types: 'all' }
      ]
    },
    {
      key: 'crossLanes',
      total: 12,
      map: [
        '................',
        '.S>>>>>>>>>>+>>a',
        '............v...',
        '............b...',
        '................',
        '.S>>>>>>+>>>>>>c',
        '........v.......',
        '........d.......',
        '................'
      ],
      spawns: [
        { dir: 'e', every: 2400, types: ['a', 'b'] },
        { dir: 'e', every: 2400, types: ['c', 'd'] }
      ]
    },
    {
      key: 'fiveOperators',
      total: 12,
      map: [
        '................',
        '................',
        '.S>>>>>>>>+>+>+a',
        '..........+ev.v.',
        '..........b.c.d.',
        '................',
        '................',
        '................',
        '................'
      ],
      spawns: [
        { dir: 'e', every: 2200, types: 'all' }
      ]
    },
    {
      key: 'upAndDown',
      total: 12,
      map: [
        '................',
        '................',
        '.S>>>>>>>>+>>+>a',
        '..........v..v..',
        '..........b..c..',
        '................',
        '.S>>>>>>>>+>>>>d',
        '..........v.....',
        '..........e.....'
      ],
      spawns: [
        { dir: 'e', every: 2500, types: ['a', 'b', 'c'] },
        { dir: 'e', every: 2500, types: ['d', 'e'] }
      ]
    },
    {
      key: 'sixOperators',
      total: 15,
      map: [
        '................',
        '................',
        '.S>>>>>>>>+>+>+a',
        '..........+c+fv.',
        '..........b.d.e.',
        '................',
        '................',
        '................',
        '................'
      ],
      spawns: [
        { dir: 'e', every: 2000, types: 'all' }
      ]
    },
    {
      key: 'allSeven',
      total: 16,
      map: [
        '................',
        '...S............',
        '.S>>>>>>>>+>+>+a',
        '..........+c+f+g',
        '..........b.d.e.',
        '................',
        '................',
        '................',
        '................'
      ],
      spawns: [
        { dir: 's', every: 2400, types: 'all' },
        { dir: 'e', every: 2400, types: 'all' }
      ]
    },
    {
      key: 'theCascade',
      total: 18,
      map: [
        '..S.............',
        '.S>>>>>>>>+>>+>a',
        '..........+b.+e.',
        '..........+c.+f.',
        '..........d..g..',
        '................',
        '................',
        '................',
        '................'
      ],
      spawns: [
        { dir: 's', every: 1700, types: 'all' },
        { dir: 'e', every: 1700, types: 'all' }
      ]
    }
  ];

  /* =========================================================================
   * 2. Wide layouts — used automatically when a deck has more than 7
   *    categories. Each one adds one more bin, so every category in a big deck
   *    still gets its own level. Two belts: the top one serves bins a..g, the
   *    bottom one serves the rest (which is why each has its own spawner).
   * ====================================================================== */
  function wideLevel(bins, key, total, rows, typesB) {
    return {
      key: key,
      total: total,
      map: [
        '................',
        '................',
        '.S>>>>>>>>+>+>+a',
        '..........+c+f+g',
        '..........b.d.e.',
        '................'
      ].concat(rows),
      spawns: [
        { dir: 'e', every: 2100, types: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] },
        { dir: 'e', every: 2100, types: typesB }
      ]
    };
  }

  var EXTRA_LAYOUTS = [
    wideLevel(8, 'eightCategories',
      14,
      [
        '.S>>>>>>>>>>>>>h',
        '................',
        '................'
      ], ['h']),

    wideLevel(9, 'nineCategories',
      15,
      [
        '.S>>>>>>>>+>>>>h',
        '..........v.....',
        '..........i.....'
      ], ['h', 'i']),

    wideLevel(10, 'tenCategories',
      16,
      [
        '.S>>>>>>>>+>>+>h',
        '..........v..v..',
        '..........i..j..'
      ], ['h', 'i', 'j']),

    wideLevel(11, 'elevenCategories',
      17,
      [
        '.S>>>>>>>>+>+>+h',
        '..........v.v.v.',
        '..........i.j.k.'
      ], ['h', 'i', 'j', 'k']),

    wideLevel(12, 'twelveCategories',
      18,
      [
        '.S>>>>>>>>+>+>+h',
        '..........+iv.v.',
        '..........j.k.l.'
      ], ['h', 'i', 'j', 'k', 'l'])
  ];

  /* =========================================================================
   * 3. The knowledge decks.
   *
   *    Order matters: level N uses the first N categories, so the list doubles
   *    as the teaching order. Right now there is a single deck — the Python
   *    operators — and the seven of them arrive one at a time as the levels go.
   * ====================================================================== */
  var DECKS = [

    {
      id: 'python',
      builtin: true,
      // 标题/副标题/收集口名都在 locales/*.js 里，按 id 取（见 localizeDeck）
      titleKey: 'content.decks.python.title',
      taglineKey: 'content.decks.python.tagline',
      nameKey: 'content.decks.python.name',
      descKey: 'content.decks.python.desc',
      categories: [
        { item: '*',  bin: 'TIMES' },
        { item: '/',  bin: 'DIV' },
        { item: '%',  bin: 'MOD' },
        { item: '//', bin: 'FLOOR' },
        { item: '**', bin: 'POWER' }
      ]
    }

    /* Add your own — copy the shape above:
    , {
      id: 'my-deck',
      name: 'My Topic',
      desc: 'One line describing it',
      categories: [
        { item: 'shown on the parcel', bin: 'shown on the bin' }
      ]
      // Omit `levels` to reuse the nine shared layouts, or supply
      // levels: [ ... ] with the same shape as LAYOUTS above.
    }
    */
  ];

  /* =========================================================================
   * 4. Combine layouts + deck into playable levels
   * ====================================================================== */
  var BIN_LETTERS = 'abcdefghijkl';
  var MAX_BINS = 12;
  var ROUND2_FROM = 5;        // 第 6 关起是"放松节奏轮"
  var ROUND2_INTERVAL = 3;    // 出包间隔拉长到 3 倍：一次只来一个包裹，有时间想清楚

  function binLettersIn(L) {
    var seen = {};
    L.map.forEach(function (row) {
      for (var i = 0; i < row.length; i++) {
        var ch = row[i];
        if (ch >= 'a' && ch <= 'l') seen[ch] = true;
      }
    });
    return Object.keys(seen).sort();
  }

  // 从候选里均匀挑出 n 关：跨度覆盖整个难度区间；候选不足时循环补齐
  function spreadTo(list, n) {
    var out = [], seen = {}, i, idx;
    for (i = 0; i < n; i++) {
      idx = Math.round(i * (list.length - 1) / (n - 1));
      if (!seen[idx]) { seen[idx] = true; out.push(list[idx]); }
    }
    var base = out.slice(), j = 0;
    while (out.length < n && base.length) { out.push(base[base.length - 1 - (j % base.length)]); j++; }
    return out;
  }

  var _allShared = null;
  // 全部共享布局（基础 10 关 + 宽关卡），按收集口数量升序
  function allShared() {
    if (_allShared) return _allShared;
    _allShared = LAYOUTS.concat(EXTRA_LAYOUTS).slice().sort(function (a, b) {
      return binLettersIn(a).length - binLettersIn(b).length;
    });
    return _allShared;
  }

  // 默认 10 关，且**前 5 关必须覆盖全部知识点**（完成度按前 5 关计）：
  //   前 5 关：收集口数量从 2 一路递增到「分类总数」，知识点分 5 步全部引入
  //   后 5 关：剩下的布局按难度升序接上（不足 10 关就循环补齐）
  function sharedLayoutsFor(catCount, alignToPattern) {
    var maxBin = Math.min(MAX_BINS, catCount);
    var fits = allShared().filter(function (L) { return binLettersIn(L).length <= maxBin; });

    var out = [], used = {};
    for (var slot = 0; slot < 5; slot++) {
      var want = 2 + Math.round((maxBin - 2) * slot / 4);
      var pick = -1;
      // 取收集口数量 ≥ want 的第一张没用过的布局（同档有多张时会依次用上）
      for (var i = 0; i < fits.length && pick < 0; i++) {
        if (used[i] === undefined && binLettersIn(fits[i]).length >= want) pick = i;
      }
      if (pick >= 0) { used[pick] = true; out.push(fits[pick]); }
    }

    if (alignToPattern) {
      // 题库按"内容"写了 levelTitles：第二轮走一遍同样的收集口阶梯，标题才不会错位。
      // 没写标题的题库跳过这一步，好让 10 关尽量用不同的地图。
      var pattern = out.map(function (L) { return binLettersIn(L).length; });
      pattern.forEach(function (b) {
        if (out.length >= 10) return;
        var got = -1;
        for (var i = 0; i < fits.length && got < 0; i++) {
          if (used[i] === undefined && binLettersIn(fits[i]).length === b) got = i;
        }
        if (got < 0) {                     // 该档用完了 → 复用同档
          for (i = 0; i < fits.length && got < 0; i++) {
            if (binLettersIn(fits[i]).length === b) got = i;
          }
        }
        if (got >= 0) { used[got] = true; out.push(fits[got]); }
      });
    }

    // 剩下的按难度升序补到 10 关（上限 10）
    fits.forEach(function (L, i) { if (out.length < 10 && used[i] === undefined) out.push(L); });
    out = out.slice(0, 10);

    var base = out.slice(), j = 0;
    while (out.length < 10 && base.length) { out.push(base[j % base.length]); j++; }
    return out;
  }

  function buildLevels(deck) {
    var cats = normalizeCategories(deck.categories);
    if (!cats.length) throw new Error('deck needs at least one category: ' + deck.id);
    var src = (deck.levels && deck.levels.length) ? deck.levels
      : sharedLayoutsFor(cats.length, ((deck.levelTitles || []).length > 0));

    // 布局自带的是"几何描述"文案；题库可以用 levelTitles / levelHints 按关覆盖，
    // 这样同一套地图能被不同知识点复用而不会出现牛头不对马嘴的说明。
    var titles = deck.levelTitles || [];
    var hints = deck.levelHints || [];

    return src.map(function (L, li) {
      // How many categories does this layout need?
      var need = binLettersIn(L).length;

      // Take that many categories in order; wrap around if the deck is short.
      var use = [];
      for (var i = 0; i < need; i++) use.push(cats[i % cats.length]);

      // Spawn points: match `spawns` to the S cells in reading order.
      var spawnCells = [];
      for (var r = 0; r < L.map.length; r++) {
        for (var c = 0; c < L.map[r].length; c++) {
          if (L.map[r][c] === 'S') spawnCells.push({ c: c, r: r });
        }
      }

      var spawns = (L.spawns || []).map(function (s, i) {
        var cell = spawnCells[i] || { c: 1, r: 1 };
        // `types` holds bin letters; translate them into category indexes.
        var pool;
        if (s.types === 'all') {
          pool = use.map(function (_, k) { return k; });
        } else {
          pool = (s.types || []).map(function (ch) {
            var k = ch.charCodeAt(0) - 97;
            return (k >= 0 && k < use.length) ? k : 0;
          });
        }
        var every = s.every || 2400;
        // 第 6 关起间隔拉长到 3 倍：一次只来一个包裹，玩家有时间想清楚再动手
        if (li >= ROUND2_FROM) every = Math.round(every * ROUND2_INTERVAL);
        return { c: cell.c, r: cell.r, dir: s.dir || 'e', every: every, pool: pool };
      });
      // 布局自己的出包间隔（未经节奏调整），供调试/测试比对
      var base = (L.spawns || []).map(function (s) { return s.every || 2400; });

      // levelTitles / levelHints 比关卡数短时循环复用，且统一把 "Level N ·" 前缀
      // 重写为实际关卡号（布局重排后原前缀会失真）。布局自带的文案按 key 从
      // 当前语言的包里取，所以换语言之后重新 buildLevels 就会拿到新文案。
      var own = titles.length ? titles[li % titles.length]
        : (L.key ? t('content.layouts.' + L.key + '.title') : '');
      var title = t('ui.levelPrefix', { n: li + 1 }) + String(own).replace(/^Level\s*\d+\s*[·•\-]?\s*/i, '');
      var hint = hints.length ? hints[li % hints.length]
        : (L.key ? t('content.layouts.' + L.key + '.hint') : '');

      return {
        index: li + 1,
        title: title,
        hint: hint,
        map: L.map.slice(),
        spawns: spawns,
        total: L.total || 12,
        use: use,
        base: base,
        relaxed: li >= ROUND2_FROM,
        // 开局准备时间（毫秒），不写就用游戏里的默认值。格子多/岔路多的关卡可以调长一点。
        lead: L.lead
      };
    });
  }

  /* =========================================================================
   * 5. Sanitise decks so a bad file can't break the game
   * ====================================================================== */

  // A category can carry a single item or a list of them:
  //   { bin: 'int', item: '42' }                      → always shows 42
  //   { bin: 'int', items: ['42', '7', '-3'] }        → picks one at random
  // The second form is what you want for "recognise the type of this value":
  // the player cannot just memorise one label per bin.
  function normalizeCategories(list, deckId) {
    var out = [];
    (list || []).forEach(function (c) {
      if (!c || c.bin === undefined) return;
      var items = (Array.isArray(c.items) && c.items.length)
        ? c.items.map(String)
        : (c.item !== undefined ? [String(c.item)] : []);
      if (!items.length) return;
      var bin = String(c.bin);
      // 内置题库的收集口名（TIMES/DIV/…）是教学内容，按语言包换一份；
      // 外部 JSON 题库带的是作者自己的字面文案，原样保留
      if (deckId) bin = i18n.opt('content.decks.' + deckId + '.bins.' + bin) || bin;
      out.push({ bin: bin, items: items });
    });
    return out;
  }

  // 内置题库：文案按当前语言取，分类统一成 { bin, items } 形式
  function localizeDeck(d) {
    var deck = {
      id: d.id,
      title: d.titleKey ? t(d.titleKey) : String(d.title || d.name || 'Custom Deck'),
      tagline: d.taglineKey ? t(d.taglineKey) : String(d.tagline || d.desc || ''),
      name: d.nameKey ? t(d.nameKey) : String(d.name || d.title || 'Custom Deck'),
      desc: d.descKey ? t(d.descKey) : String(d.desc || d.tagline || ''),
      categories: normalizeCategories(d.categories, d.id),
      levels: d.levels,
      levelTitles: d.levelTitles,
      levelHints: d.levelHints
    };
    if (!deck.categories.length) console.warn('[sorter] deck has no valid categories: ' + deck.id);
    return deck;
  }

  // ?deckUrl= 加载的题库会整体替换内置题库。这里每次取用都按当前语言现拼一份，
  // 所以切换语言之后再 getDecks() 拿到的就是新语言的题库。
  var _decks = null;

  function getDecks() {
    return (_decks || DECKS).map(function (d) { return d.builtin ? localizeDeck(d) : d; });
  }

  function setDecks(list) {
    _decks = (list && list.length) ? list : null;
  }

  function normalizeDeck(raw, fallbackId) {
    if (!raw || typeof raw !== 'object') return null;
    var cats = normalizeCategories(raw.categories);
    if (!cats.length) return null;
    return {
      id: String(raw.id || fallbackId || 'custom'),
      // 封面标题/副标题：JSON 可以覆盖，缺省用 name / desc
      title: String(raw.title || raw.name || 'Custom Deck'),
      tagline: String(raw.tagline || raw.desc || ''),
      name: String(raw.name || 'Custom Deck'),
      desc: String(raw.desc || ''),
      categories: cats,
      levels: Array.isArray(raw.levels) && raw.levels.length ? raw.levels : undefined,
      levelTitles: Array.isArray(raw.levelTitles) ? raw.levelTitles : undefined,
      levelHints: Array.isArray(raw.levelHints) ? raw.levelHints : undefined
    };
  }

  return {
    layouts: LAYOUTS,
    getDecks: getDecks,
    setDecks: setDecks,
    buildLevels: buildLevels,
    normalizeDeck: normalizeDeck,
    binLetters: BIN_LETTERS
  };
})();

export default SORTER_DATA;
