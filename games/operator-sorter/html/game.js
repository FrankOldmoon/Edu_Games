/* =============================================================================
 * game.js —— 通用分类路由引擎（Phaser 3.90）
 *
 * 玩法：包裹从生成点出发，沿传送带逐格前进；岔路可点击切换出口方向；
 *       包裹进入收集口即判定对错。关卡逐关解锁，未通过的锁住。
 *
 * 想改题目内容 → 改 decks.js，不用动这个文件。
 *
 * 三种进入方式：
 *   index.html                                  选关菜单
 *   index.html?deck=python&level=3&embed=1      直进第 3 关（显式指定 level 会绕过解锁）
 *   index.html?deckUrl=./my-deck.json           用 URL 传入的 JSON 题库开新知识点
 *
 * 完成一关会通过 postMessage 上报 { type:'correct_rate', rate, ... }
 *
 * 界面文案一律英文；代码注释保持中文，便于维护。
 * ========================================================================== */

import Phaser from "phaser";
import SORTER_DATA from "./decks.js";
import { i18n, mountSwitcher } from "./i18n.js";

(function () {
  'use strict';

  /* ---------------------------------------------------------------------- */
  /* 常量                                                                    */
  /* ---------------------------------------------------------------------- */
  var COLS = 16, ROWS = 9, CELL = 52;
  var W = 960, H = 620;
  var PARCEL_MS = 300;                                     // 每格移动耗时
  var LEAD_MS = 1500;                                      // 开局静止时间（真正的思考余量靠出生点到第一个岔路的滑行距离）
  var FIRST_N = 5;                                         // 完成度按前 5 关计：前 5 关全过 → rate = 1（后面是加练）
  var FONT = 'Helvetica Neue, Arial, PingFang SC, Microsoft YaHei, sans-serif';
  var PROGRESS_KEY = 'sorter.progress';

  var C = {
    bg: 0x10131c, cell: 0x171b27, cellEdge: 0x1f2436,
    belt: 0x252c40, beltEdge: 0x333c56, arrow: 0x5b68a0,
    junc: 0x2f3d68, juncOn: 0x27345c, juncEdge: 0x4a7cff,
    spawn: 0x2a3550, spawnEdge: 0x46567f,
    text: 0xe6e8ee, muted: 0x8b93a8, dim: 0x5f6880,
    ok: 0x3ecf8e, err: 0xff6b6b, warn: 0xf5a623, panel: 0x1a1f2e,
    lock: 0x4a5470
  };
  // 12 个知识点配色（包裹与同号收集口共用一色，pair 一眼能对上）
  var BIN_COLORS = [
    0x4a7cff, 0x3ecf8e, 0xf5a623, 0xe2557b, 0x9b6bff, 0x2fc4c4,
    0xff7a5c, 0xa8e05f, 0x5cc8ff, 0xff6fd8, 0xffd166, 0xb0b8ff
  ];
  var DIRV = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

  /* ---------------------------------------------------------------------- */
  /* 进度：localStorage['sorter.progress'] = { "<deckId>": [已通过的关卡索引] }
  /* ---------------------------------------------------------------------- */
  function readProgress() {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function passedList(deckId) {
    var p = readProgress()[deckId];
    return Array.isArray(p) ? p : [];
  }
  // 解锁到「第一个还没通过的关卡」，已通过的关卡随时可重玩。
  // 用"第一个缺口"而不是"最高通过 +1"，是为了避免深链跳过某关后进度被整体跳过。
  function unlockedCount(deckId, levelCount) {
    var passed = passedList(deckId);
    for (var i = 0; i < levelCount; i++) {
      if (passed.indexOf(i) < 0) return i + 1;
    }
    return levelCount;
  }
  function markPassed(deckId, idx) {
    var all = readProgress();
    var p = Array.isArray(all[deckId]) ? all[deckId] : [];
    if (p.indexOf(idx) < 0) p.push(idx);
    all[deckId] = p;
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(all)); } catch (e) {}
  }
  function clearProgress(deckId) {
    var all = readProgress();
    delete all[deckId];
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(all)); } catch (e) {}
  }

  /* ---------------------------------------------------------------------- */
  /* 小工具                                                                  */
  /* ---------------------------------------------------------------------- */
  // URL 上的两个解锁开关：
  //   ?level=N  → 只放行第 N 关（老师的深链），其余关卡照常锁着
  //   ?unlock=1 → 全部解锁（课堂演示用）
  // 注意：这里不钳制 N，因为题库可能不止 9 关（分类多时会自动补宽关卡），
  // 真正的边界由场景按 levels.length 处理。
  function urlFlags() {
    var q = new URLSearchParams(location.search);
    var lq = parseInt(q.get('level') || '0', 10);
    return { unlockAll: q.get('unlock') === '1', forced: lq > 0 ? lq - 1 : -1 };
  }

  function hx(n) { return '#' + n.toString(16).padStart(6, '0'); }

  // 颜色工具：包裹/收集口配色要成对，文字还得看得清
  function mix(a, b, t) {                       // t=0 全 a，t=1 全 b
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (Math.round(ar + (br - ar) * t) << 16)
      | (Math.round(ag + (bg - ag) * t) << 8)
      | Math.round(ab + (bb - ab) * t);
  }
  function luminance(c) {
    return (0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)) / 255;
  }

  // 按字符宽度粗略估算合适字号（CJK 约 1em，其余约 0.62em）
  function fitSize(text, maxW, maxSize, minSize) {
    var unit = 0;
    for (var i = 0; i < text.length; i++) unit += text.charCodeAt(i) > 0x2e80 ? 1.0 : 0.62;
    if (!unit) return maxSize;
    return Math.max(minSize, Math.min(maxSize, Math.floor(maxW / unit)));
  }

  // 估算字号只是起点：文字建好后实测一次宽度，超宽就继续缩，比纯估算可靠
  function fitTextToWidth(t, maxW, minSize) {
    var guard = 0;
    while (t.width > maxW && parseInt(t.style.fontSize, 10) > minSize && guard++ < 12) {
      t.setFontSize(parseInt(t.style.fontSize, 10) - 1);
    }
    return t;
  }

  function rrect(g, x, y, w, h, fill, edge, r) {
    g.fillStyle(fill, 1);
    g.fillRoundedRect(x, y, w, h, r === undefined ? 10 : r);
    if (edge !== undefined && edge !== null) {
      g.lineStyle(2, edge, 1);
      g.strokeRoundedRect(x, y, w, h, r === undefined ? 10 : r);
    }
  }

  function arrow(g, cx, cy, dir, s, color) {
    var a = s * 0.62;
    g.fillStyle(color, 1);
    if (dir === 'e') g.fillTriangle(cx + s, cy, cx - a * 0.6, cy - a, cx - a * 0.6, cy + a);
    else if (dir === 'w') g.fillTriangle(cx - s, cy, cx + a * 0.6, cy - a, cx + a * 0.6, cy + a);
    else if (dir === 'n') g.fillTriangle(cx, cy - s, cx - a, cy + a * 0.6, cx + a, cy + a * 0.6);
    else g.fillTriangle(cx, cy + s, cx - a, cy - a * 0.6, cx + a, cy - a * 0.6);
  }

  // 小挂锁：锁住的关卡用
  function padlock(g, cx, cy, color) {
    g.lineStyle(2.4, color, 1);
    g.beginPath();
    g.arc(cx, cy - 3, 4.6, Math.PI, 0, false);
    g.strokePath();
    g.fillStyle(color, 1);
    g.fillRoundedRect(cx - 6.5, cy - 1, 13, 11, 2.5);
  }

  // 小对勾：已通过的关卡用
  function checkmark(g, cx, cy, color) {
    g.lineStyle(2.6, color, 1);
    g.beginPath();
    g.moveTo(cx - 5.5, cy);
    g.lineTo(cx - 1.5, cy + 4);
    g.lineTo(cx + 6, cy - 4.5);
    g.strokePath();
  }

  function hitZone(scene, x, y, w, h, onClick) {
    var z = scene.add.zone(x, y, w, h).setOrigin(0, 0)
      .setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    z.on('pointerdown', onClick);
    z.on('pointerover', function () { scene.input.setDefaultCursor('pointer'); });
    z.on('pointerout', function () { scene.input.setDefaultCursor('default'); });
    return z;
  }

  function mkButton(scene, x, y, w, h, label, fill, onClick, parent) {
    var g = scene.add.graphics();
    rrect(g, x, y, w, h, fill, null, 10);
    g.lineStyle(2, 0xffffff, 0.14);
    g.strokeRoundedRect(x, y, w, h, 10);
    var t = scene.add.text(x + w / 2, y + h / 2, label, {
      fontFamily: FONT, fontSize: '15px', color: '#ffffff'
    }).setOrigin(0.5, 0.5);
    var z = hitZone(scene, x, y, w, h, onClick);
    if (parent) { parent.add(g); parent.add(t); parent.add(z); }
    return { g: g, text: t, zone: z };
  }

  /* ====================================================================== */
  /* 选关场景                                                                */
  /* ====================================================================== */
  var AUTO_STARTED = false;    // ?embed / ?level 的自动开局只允许发生一次

  var MenuScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function MenuScene() { Phaser.Scene.call(this, { key: 'Menu' }); },

    create: function () {
      var self = this;
      var D = SORTER_DATA;
      var fb = document.getElementById('fallback');
      if (fb) fb.remove();

      // 先按 boot 阶段加载的题库定位，再让 URL 的 ?deck= 覆盖
      this.deckIndex = 0;
      if (D.pendingDeckId) {
        D.getDecks().forEach(function (d, i) { if (d.id === D.pendingDeckId) self.deckIndex = i; });
      }
      this.levelIndex = 0;

      var g = this.add.graphics();
      g.fillStyle(C.bg, 1); g.fillRect(0, 0, W, H);

      // 封面标题/副标题来自题库（JSON 的 title / tagline），默认题库 = Python Operators
      this.coverTitle = this.add.text(64, 50, '', { fontFamily: FONT, fontSize: '34px', color: hx(C.text) });
      this.coverTag = this.add.text(64, 96, '', { fontFamily: FONT, fontSize: '15px', color: hx(C.muted) });

      this.deckLabel = this.add.text(64, 136, '', { fontFamily: FONT, fontSize: '14px', color: hx(C.dim) });

      /* ---------- 题库按钮 ---------- */
      var DW = 264, DH = 76, DX = 64, DY = 162;
      this.deckBtns = D.getDecks().map(function (d, i) {
        var x = DX + i * (DW + 16), y = DY;
        var bg = self.add.graphics();
        var name = self.add.text(x + 18, y + 15, d.name, { fontFamily: FONT, fontSize: '17px', color: hx(C.text) });
        // 描述统一按可用宽度自动缩放，避免外部 JSON 题库的长描述被按钮截断
        var desc = self.add.text(x + 18, y + 44, d.desc, {
          fontFamily: FONT, fontSize: fitSize(d.desc, DW - 34, 12, 9) + 'px', color: hx(C.muted)
        });
        var z = hitZone(self, x, y, DW, DH, function () { self.deckIndex = i; self.didInitLevel = false; self.refreshAll(); });
        return { g: bg, x: x, y: y, name: name, desc: desc, zone: z };
      });

      this.deckInfo = this.add.text(64, 254, '', { fontFamily: FONT, fontSize: '13px', color: hx(C.muted) });
      this.deckCats = this.add.text(64, 276, '', { fontFamily: FONT, fontSize: '13px', color: hx(0x7f89a8) });

      this.lvLabel = this.add.text(64, 308, '', { fontFamily: FONT, fontSize: '14px', color: hx(C.dim) });

      /* ---------- 关卡按钮 ---------- */
      var LW = 64, LH = 64, LX = 64, LGY = 296;        // 两行 × 5 个
      this.lvBtns = [];
      for (var i = 0; i < 10; i++) {
        (function (idx) {
          var x = LX + (idx % 5) * (LW + 10), y = LGY + Math.floor(idx / 5) * (LH + 8);
          var bg = self.add.graphics();
          var num = self.add.text(x + LW / 2, y + LH / 2, String(idx + 1), {
            fontFamily: FONT, fontSize: '24px', color: hx(C.text)
          }).setOrigin(0.5, 0.5);
          hitZone(self, x, y, LW, LH, function () { self.pickLevel(idx); });
          self.lvBtns.push({ g: bg, x: x, y: y, num: num, cx: x + LW / 2, cy: y + LH / 2 });
        })(i);
      }

      this.lvTitle = this.add.text(64, 456, '', { fontFamily: FONT, fontSize: '20px', color: hx(C.text) });
      this.lvHint = this.add.text(64, 486, '', { fontFamily: FONT, fontSize: '13px', color: hx(C.muted) });
      this.lvMeta = this.add.text(64, 508, '', { fontFamily: FONT, fontSize: '13px', color: hx(C.dim) });

      /* ---------- 开始 / 重置 ---------- */
      this.startBtn = mkButton(this, 656, 456, 240, 56, i18n.t('ui.start'), C.juncEdge, function () { self.startGame(); });

      this.add.text(64, 552, i18n.t('ui.menuHint'), {
        fontFamily: FONT, fontSize: '13px', color: hx(C.dim)
      });
      this.resetBtn = this.add.text(896, 552, i18n.t('ui.resetProgress'), {
        fontFamily: FONT, fontSize: '13px', color: hx(C.dim)
      }).setOrigin(1, 0);
      hitZone(this, 896 - 130, 548, 130, 22, function () {
        var deck = D.getDecks()[self.deckIndex];
        if (window.confirm(i18n.t('ui.resetConfirm', { deck: deck.name }))) {
          clearProgress(deck.id);
          self.levelIndex = 0;
          self.didInitLevel = false;
          self.refreshAll();
        }
      });

      /* ---------- URL 参数 ---------- */
      var q = new URLSearchParams(location.search);
      var dq = q.get('deck');
      if (dq) {
        var di = -1;
        D.getDecks().forEach(function (d, i) { if (d.id === dq) di = i; });
        if (di >= 0) this.deckIndex = di;
      }
      var lq = parseInt(q.get('level') || '0', 10);
      var flags = urlFlags();
      if (flags.forced >= 0) this.levelIndex = flags.forced;
      this.unlockAll = flags.unlockAll;
      this.forcedLevel = flags.forced;
      this.didInitLevel = false;
      this.autoStart = (q.get('embed') === '1') || !!dq || flags.forced >= 0 || this.unlockAll;
      this.refreshAll();

      // 自动开局只做一次：否则玩家在游戏里按 Esc 回到选关页时，会被立刻弹回游戏
      if (this.autoStart && !AUTO_STARTED) {
        AUTO_STARTED = true;
        this.time.delayedCall(40, function () { self.startGame(); });
      }
    },

    pickLevel: function (idx) {
      if (idx >= this.levels.length) return;
      if (!this.canPick(idx)) {
        this.flashLocked();
        return;
      }
      this.levelIndex = idx;
      this.refreshAll();
    },

    flashLocked: function () {
      var t = this.lockNote;
      if (!t) {
        t = this.lockNote = this.add.text(896, 508, '', {
          fontFamily: FONT, fontSize: '13px', color: hx(C.lock)
        }).setOrigin(1, 0);
      }
      t.setText(i18n.t('ui.lockedHint')).setAlpha(1);
      this.tweens.killTweensOf(t);
      this.tweens.add({ targets: t, alpha: 0, delay: 1200, duration: 400 });
    },

    canPick: function (idx) {
      if (this.unlockAll) return true;                          // ?unlock=1
      if (idx === this.forcedLevel) return true;                // ?level=N
      if (this.passedIds.indexOf(idx) >= 0) return true;         // 已通过的随时能重玩
      return idx < this.unlocked;                               // 正常推进
    },

    /* 题库或关卡变化后统一刷新所有按钮与文字 */
    refreshAll: function () {
      var self = this;
      var D = SORTER_DATA;
      var deck = D.getDecks()[this.deckIndex];
      this.levels = D.buildLevels(deck);

      var passed = this.passedIds = passedList(deck.id);
      this.unlocked = unlockedCount(deck.id, this.levels.length);

      // 首次进入（或换题库）时把光标落在第一个还没通过的关卡上
      if (!this.didInitLevel) {
        this.didInitLevel = true;
        if (this.forcedLevel < 0 && !this.unlockAll) {
          var first = -1;
          for (var k = 0; k < this.levels.length; k++) {
            if (passed.indexOf(k) < 0) { first = k; break; }
          }
          this.levelIndex = first < 0 ? this.levels.length - 1 : first;
        }
      }
      // 每次都夹一次边界：题库可能不止 9 关，?level= 也不能越界
      if (this.levelIndex < 0) this.levelIndex = 0;
      if (this.levelIndex >= this.levels.length) this.levelIndex = this.levels.length - 1;

      var multi = D.getDecks().length > 1;
      this.deckLabel.setText(multi ? i18n.t('ui.stepDeck') : '');

      // 封面跟着题库走：换了 JSON 题库，标题和副标题就是它的
      this.coverTitle.setText(deck.title || deck.name);
      this.coverTag.setText(deck.tagline || deck.desc);
      document.title = deck.title || deck.name;

      // 只有一套题库时隐藏选择器：封面标题已经是它的名字，不需要再出现"选项"
      this.deckBtns.forEach(function (b, i) {
        b.g.setVisible(multi).clear();
        b.name.setVisible(multi);
        b.desc.setVisible(multi);
        if (b.zone.input) b.zone.input.enabled = multi;
        if (!multi) return;
        var on = i === self.deckIndex;
        rrect(b.g, b.x, b.y, 264, 76, on ? 0x1d2740 : 0x171b27, on ? C.juncEdge : C.cellEdge, 12);
        b.name.setColor(on ? hx(C.text) : hx(C.muted));
        b.desc.setColor(on ? hx(C.juncEdge) : hx(0x5f6880));
      });

      this.lvBtns.forEach(function (b, i) {
        var exists = i < self.levels.length;
        var open = exists && self.canPick(i);
        var done = passed.indexOf(i) >= 0;
        var on = open && i === self.levelIndex;

        b.g.clear();
        rrect(b.g, b.x, b.y, 64, 64,
          on ? 0x1d2740 : (open ? 0x171b27 : 0x141824),
          on ? C.juncEdge : (open ? C.cellEdge : 0x1b2030), 12);

        if (!exists) {
          b.num.setText('').setVisible(false);
          return;
        }
        if (!open) {
          b.num.setText('').setVisible(false);
          padlock(b.g, b.cx, b.cy, C.lock);
          return;
        }
        b.num.setText(String(i + 1)).setVisible(true)
          .setColor(on ? hx(C.text) : hx(0x9aa3ba));
        if (done) checkmark(b.g, b.x + 66, b.y + 18, C.ok);
      });

      var L = this.levels[this.levelIndex];
      var cleared = passed.filter(function (i) { return i < self.levels.length; }).length;
      this.deckInfo.setText(i18n.t('ui.deckInfo', { cats: deck.categories.length, levels: this.levels.length, cleared: cleared }));
      this.deckCats.setText(deck.categories.map(function (c) {
        var first = (c.items && c.items.length) ? c.items[0] : c.item;
        return first + '→' + c.bin;
      }).join('   '));
      this.lvLabel.setText(i18n.t('ui.stepLevel') + (this.unlockAll ? '   ' + i18n.t('ui.unlockedByUrl') : ''));
      this.lvTitle.setText(L.title);
      this.lvHint.setText(L.hint || '');
      this.lvMeta.setText(i18n.t('ui.levelMeta', { total: L.total, bins: L.use.length })
        + (L.relaxed ? ' · ' + i18n.t('ui.relaxed') : ''));
      this.startBtn.text.setText(i18n.t('ui.startWith', { title: L.title }));
    },

    startGame: function () {
      this.scene.start('Game', { deckIndex: this.deckIndex, levelIndex: this.levelIndex });
    }
  });

  /* ====================================================================== */
  /* 主游戏场景                                                              */
  /* ====================================================================== */
  var GameScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function GameScene() { Phaser.Scene.call(this, { key: 'Game' }); },

    init: function (data) {
      this.deckIndex = (data && data.deckIndex) || 0;
      this.levelIndex = (data && data.levelIndex) || 0;
    },

    create: function () {
      var self = this;
      var D = SORTER_DATA;
      this.deck = D.getDecks()[this.deckIndex];
      this.levels = D.buildLevels(this.deck);
      this.level = this.levels[this.levelIndex];
      document.title = this.deck.name + ' · ' + this.level.title;
      this.newlyUnlocked = false;

      this.correct = 0;
      this.delivered = 0;
      this.spawned = 0;
      this.lost = 0;                 // 掉出传送带的包裹数（关卡设计正确时应恒为 0）
      this.finished = false;
      this.parcels = [];

      this.add.graphics().fillStyle(C.bg, 1).fillRect(0, 0, W, H);

      this.parseMap();

      this.staticG = this.add.graphics();
      this.juncG = this.add.graphics();
      this.hudG = this.add.graphics();

      this.drawStaticBoard();
      this.drawJuncs();
      this.drawBinLabels();
      this.drawHud();

      this.input.on('pointerdown', this.onPointerDown, this);
      this.input.keyboard.on('keydown-R', function () {
        self.scene.restart({ deckIndex: self.deckIndex, levelIndex: self.levelIndex });
      });
      this.input.keyboard.on('keydown-ESC', function () { self.scene.start('Menu'); });

      this.time.delayedCall(300, function () { self.startSpawning(); });
    },

    /* ---------------- 地图解析 ---------------- */
    parseMap: function () {
      var L = this.level;
      // 关卡格式校验（改 decks.js 时最容易犯的错）
      if (L.map.length !== ROWS) console.warn('[sorter] "' + L.title + '" should have ' + ROWS + ' rows, found ' + L.map.length);
      L.map.forEach(function (row, i) {
        if (row.length !== COLS) console.warn('[sorter] "' + L.title + '" row ' + (i + 1) + ' should be ' + COLS + ' chars, found ' + row.length);
      });

      var spawnDir = {};
      L.spawns.forEach(function (s) { spawnDir[s.r + ',' + s.c] = s.dir; });

      this.cells = [];
      for (var r = 0; r < ROWS; r++) {
        var row = [];
        var src = L.map[r] || '';
        for (var c = 0; c < COLS; c++) {
          var ch = src[c] || '.';
          var cell = { c: c, r: r, type: 'empty', dir: null, states: null, si: 0, bin: -1, hot: false };
          if (ch === '>') { cell.type = 'belt'; cell.dir = 'e'; }
          else if (ch === '<') { cell.type = 'belt'; cell.dir = 'w'; }
          else if (ch === '^') { cell.type = 'belt'; cell.dir = 'n'; }
          else if (ch === 'v') { cell.type = 'belt'; cell.dir = 's'; }
          else if (ch === '+') { cell.type = 'junc'; cell.states = ['e', 's']; cell.si = 0; cell.dir = 'e'; }
          else if (ch >= 'a' && ch <= 'l') { cell.type = 'bin'; cell.bin = ch.charCodeAt(0) - 97; }
          else if (ch === 'S') { cell.type = 'spawn'; cell.dir = spawnDir[r + ',' + c] || 'e'; }
          row.push(cell);
        }
        this.cells.push(row);
      }

      // 自动把这一关的内容在画面里居中：作者随便把内容画在 16×9 的哪里都行
      var r0 = ROWS, r1 = -1, c0 = COLS, c1 = -1;
      for (var rr = 0; rr < ROWS; rr++) {
        for (var cc = 0; cc < COLS; cc++) {
          if (this.cells[rr][cc].type === 'empty') continue;
          if (rr < r0) r0 = rr;
          if (rr > r1) r1 = rr;
          if (cc < c0) c0 = cc;
          if (cc > c1) c1 = cc;
        }
      }
      if (r1 < 0) { r0 = 0; r1 = ROWS - 1; c0 = 0; c1 = COLS - 1; }
      this.bounds = { r0: r0, r1: r1, c0: c0, c1: c1 };
      var contentW = (c1 - c0 + 1) * CELL, contentH = (r1 - r0 + 1) * CELL;
      var areaTop = 92, areaH = H - areaTop - 62;
      this.originX = Math.round((W - contentW) / 2 - c0 * CELL);
      this.originY = Math.round(areaTop + (areaH - contentH) / 2 - r0 * CELL);
    },

    cellAt: function (c, r) {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
      return this.cells[r][c];
    },
    center: function (c, r) {
      return { x: this.originX + c * CELL + CELL / 2, y: this.originY + r * CELL + CELL / 2 };
    },

    /* ---------------- 静态棋盘（只画一次） ---------------- */
    drawStaticBoard: function () {
      var g = this.staticG;
      var B = this.bounds, OX = this.originX, OY = this.originY;
      g.clear();

      rrect(g, OX + (B.c0 - 1) * CELL, OY + (B.r0 - 1) * CELL,
        (B.c1 - B.c0 + 3) * CELL, (B.r1 - B.r0 + 3) * CELL, 0x131722, C.cellEdge, 16);

      for (var r = B.r0 - 1; r <= B.r1 + 1; r++) {
        for (var c = B.c0 - 1; c <= B.c1 + 1; c++) {
          if (r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;
          var x = OX + c * CELL, y = OY + r * CELL;
          var cx = x + CELL / 2, cy = y + CELL / 2;
          var cell = this.cells[r][c];

          g.fillStyle(C.cell, 1);
          g.fillRoundedRect(x + 2, y + 2, CELL - 4, CELL - 4, 8);

          if (cell.type === 'belt') {
            rrect(g, x + 4, y + 4, CELL - 8, CELL - 8, C.belt, C.beltEdge, 8);
            arrow(g, cx, cy, cell.dir, 13, C.arrow);
          } else if (cell.type === 'bin') {
            // 收集口按知识点配色：底色是该色压暗后的版本，描边与顶条用原色
            var col = BIN_COLORS[cell.bin % BIN_COLORS.length];
            rrect(g, x + 4, y + 4, CELL - 8, CELL - 8, mix(col, 0x121826, 0.74), col, 8);
            g.fillStyle(col, 1);
            g.fillRoundedRect(x + 10, y + 9, CELL - 20, 4, 2);
          } else if (cell.type === 'spawn') {
            rrect(g, x + 4, y + 4, CELL - 8, CELL - 8, C.spawn, C.spawnEdge, 8);
            var b = DIRV[cell.dir];
            arrow(g, cx - b[0] * 10, cy - b[1] * 10, cell.dir, 7, 0x4f6a95);
            arrow(g, cx + b[0] * 3, cy + b[1] * 3, cell.dir, 12, 0xa9bde6);
          }
        }
      }
    },

    /* ---------------- 岔路（状态变化时重画） ---------------- */
    drawJuncs: function () {
      var g = this.juncG;
      var B = this.bounds, OX = this.originX, OY = this.originY;
      g.clear();
      for (var r = B.r0 - 1; r <= B.r1 + 1; r++) {
        for (var c = B.c0 - 1; c <= B.c1 + 1; c++) {
          if (r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;
          var cell = this.cells[r][c];
          if (cell.type !== 'junc') continue;
          var x = OX + c * CELL, y = OY + r * CELL;
          var cx = x + CELL / 2, cy = y + CELL / 2;
          rrect(g, x + 4, y + 4, CELL - 8, CELL - 8,
            cell.hot ? C.juncOn : C.junc, cell.hot ? 0x9fbcff : C.juncEdge, 8);
          arrow(g, cx, cy, cell.dir, 13, cell.hot ? 0xd6e2ff : 0x9fb6ff);
          g.fillStyle(cell.hot ? 0xffffff : C.juncEdge, 1);
          g.fillCircle(x + CELL - 11, y + 11, 2.6);
        }
      }
    },

    /* ---------------- 收集口文字（只建一次） ---------------- */
    drawBinLabels: function () {
      this.binTexts = [];
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          var cell = this.cells[r][c];
          if (cell.type !== 'bin') continue;
          var cat = this.level.use[cell.bin];
          var label = cat ? cat.bin : '?';
          var p = this.center(c, r);
          var size = fitSize(label, CELL - 12, 15, 8);
          // 文字用该知识点颜色的浅色版，和包裹一眼对上
          var tint = mix(BIN_COLORS[cell.bin % BIN_COLORS.length], 0xffffff, 0.45);
          var t = this.add.text(p.x, p.y + 4, label, {
            fontFamily: FONT, fontSize: size + 'px', color: hx(tint)
          }).setOrigin(0.5, 0.5);
          // 预算留出左右各 3-4px 的呼吸空间，否则长标签会贴着描边像被切掉
          this.binTexts.push(fitTextToWidth(t, CELL - 14, 7));
        }
      }
    },

    /* ---------------- 界面文字 ---------------- */
    drawHud: function () {
      var L = this.level;
      this.add.text(64, 26, L.title, { fontFamily: FONT, fontSize: '21px', color: hx(C.text) });
      this.add.text(64, 58, this.deck.name + (L.hint ? ' · ' + L.hint : ''), {
        fontFamily: FONT, fontSize: '13px', color: hx(C.muted)
      });
      this.statText = this.add.text(896, 26, '', { fontFamily: FONT, fontSize: '15px', color: hx(C.text) }).setOrigin(1, 0);
      this.add.text(W / 2, H - 24, i18n.t('ui.gameHint'), {
        fontFamily: FONT, fontSize: '13px', color: hx(C.dim)
      }).setOrigin(0.5, 0.5);
      this.toastText = this.add.text(W / 2, H - 56, '', {
        fontFamily: FONT, fontSize: '15px', color: hx(C.ok)
      }).setOrigin(0.5, 0.5).setAlpha(0);
      this.refreshHud();
    },

    refreshHud: function () {
      this.statText.setText(i18n.t('ui.stats', { correct: this.correct, delivered: this.delivered, total: this.level.total }));
      var g = this.hudG;
      g.clear();
      var bw = 200, bx = 896 - bw, by = 54;
      g.fillStyle(0x232a3d, 1); g.fillRoundedRect(bx, by, bw, 8, 4);
      var p = this.level.total ? Math.min(1, this.delivered / this.level.total) : 0;
      if (p > 0) { g.fillStyle(C.juncEdge, 1); g.fillRoundedRect(bx, by, Math.max(8, bw * p), 8, 4); }
    },

    /* ---------------- 出包 ---------------- */
    // 开局先留一段"准备时间"：场上什么都不动，玩家可以看收集口、先把岔路拨好。
    // 期间显示倒计时条，免得玩家以为是卡住了。点岔路是允许的，不会被拦住。
    runLeadIn: function (ms) {
      var self = this;
      var barW = 320, bx = (W - barW) / 2, by = 570;
      var g = this.add.graphics();
      var label = this.add.text(W / 2, 546, '', {
        fontFamily: FONT, fontSize: '15px', color: hx(C.text)
      }).setOrigin(0.5, 0.5);

      var t0 = this.time.now;
      var tick = this.time.addEvent({
        delay: 100, loop: true,
        callback: function () {
          var left = Math.max(0, ms - (self.time.now - t0));
          var p = ms > 0 ? left / ms : 0;
          g.clear();
          g.fillStyle(0x232a3d, 1); g.fillRoundedRect(bx, by, barW, 6, 3);
          if (p > 0) { g.fillStyle(C.juncEdge, 1); g.fillRoundedRect(bx, by, Math.max(4, barW * p), 6, 3); }
          label.setText(i18n.t('ui.getReady', { n: Math.ceil(left / 1000) }));
          if (left <= 0) {
            tick.remove();
            g.destroy();
            self.tweens.add({
              targets: label, alpha: 0, duration: 260,
              onComplete: function () { label.destroy(); }
            });
          }
        }
      });
    },

    startSpawning: function () {
      var self = this;
      var spawns = this.level.spawns;
      var per = Math.floor(this.level.total / spawns.length);
      var extra = this.level.total - per * spawns.length;
      var lead = this.level.lead || LEAD_MS;

      this.runLeadIn(lead);

      spawns.forEach(function (s, i) {
        var left = per + (i < extra ? 1 : 0);
        var warm = i * 900;                       // 多个生成点错开，别同时出货
        self.time.delayedCall(lead + warm, function () {
          if (self.finished) return;
          // 准备时间结束，先出第一个，然后按间隔循环
          if (left > 0) { left -= 1; self.spawnParcel(s); }
          self.time.addEvent({
            delay: s.every, loop: true,
            callback: function () {
              if (self.finished || left <= 0) return;
              left -= 1;
              self.spawnParcel(s);
            }
          });
        });
      });
    },

    spawnParcel: function (s) {
      var self = this;
      var pool = (s.pool && s.pool.length) ? s.pool : [0];
      var useIdx = pool[Math.floor(Math.random() * pool.length)];
      var cat = this.level.use[useIdx];
      // 同一分类可以带多个取值，随机取一个（这样玩家不能靠记标签过关）
      var label = cat.items[Math.floor(Math.random() * cat.items.length)];
      var p0 = this.center(s.c, s.r);

      // 包裹用所属知识点的颜色（与收集口同色），字色按亮度自动取深/浅
      var col = BIN_COLORS[useIdx % BIN_COLORS.length];
      var ink = luminance(col) > 0.62 ? 0x241d38 : 0xffffff;

      var box = this.add.container(p0.x, p0.y);
      var g = this.add.graphics();
      rrect(g, -CELL / 2 + 7, -CELL / 2 + 7, CELL - 14, CELL - 14, col, mix(col, 0x000000, 0.42), 7);
      box.add(g);
      box.add(fitTextToWidth(this.add.text(0, 1, label, {
        fontFamily: FONT,
        fontSize: fitSize(label, CELL - 22, 22, 10) + 'px',
        color: hx(ink), fontStyle: 'bold'
      }).setOrigin(0.5, 0.5), CELL - 20, 8));
      box.setAlpha(0);
      this.tweens.add({ targets: box, alpha: 1, duration: 160 });

      var parcel = { obj: box, c: s.c, r: s.r, useIdx: useIdx, label: label, alive: true };
      this.parcels.push(parcel);
      this.spawned += 1;
      this.refreshHud();

      this.time.delayedCall(120, function () { self.step(parcel); });
    },

    /* ---------------- 逐格移动（核心） ---------------- */
    step: function (parcel) {
      if (!parcel.alive) return;
      var self = this;
      var cell = this.cellAt(parcel.c, parcel.r);
      if (!cell || cell.type === 'empty') return this.loseParcel(parcel);
      if (cell.type === 'bin') return this.judge(parcel, cell);

      if (cell.type === 'junc' && !cell.hot) { cell.hot = true; this.drawJuncs(); }

      var v = DIRV[cell.dir];
      if (!v) return this.loseParcel(parcel);

      var nc = parcel.c + v[0], nr = parcel.r + v[1];
      var next = this.cellAt(nc, nr);
      if (!next || next.type === 'empty') return this.loseParcel(parcel);

      var from = cell;
      var to = this.center(nc, nr);
      this.tweens.add({
        targets: parcel.obj, x: to.x, y: to.y, duration: PARCEL_MS, ease: 'Linear',
        onComplete: function () {
          if (from.type === 'junc') {
            var stillMine = self.parcels.some(function (p) {
              return p.alive && p !== parcel && p.c === from.c && p.r === from.r;
            });
            if (!stillMine) { from.hot = false; self.drawJuncs(); }
          }
          parcel.c = nc; parcel.r = nr;
          self.step(parcel);
        }
      });
    },

    /* ---------------- 判定 ---------------- */
    judge: function (parcel, cell) {
      var self = this;
      var cat = this.level.use[parcel.useIdx];
      var want = this.level.use[cell.bin];
      var what = parcel.label || (cat ? cat.bin : '?');

      if (parcel.useIdx === cell.bin) {
        this.correct += 1;
        this.showToast(i18n.t('ui.toastOk', { what: what, bin: cat.bin }), C.ok);
      } else {
        this.showToast(i18n.t('ui.toastBad', { what: what, bin: cat ? cat.bin : '?', want: want ? want.bin : '?' }), C.err);
      }

      this.tweens.add({ targets: parcel.obj, alpha: 0, scaleX: 0.4, scaleY: 0.4, duration: 240 });
      this.time.delayedCall(260, function () {
        parcel.alive = false;
        if (parcel.obj) parcel.obj.destroy();
        self.delivered += 1;
        self.refreshHud();
        self.checkDone();
      });
    },

    loseParcel: function (parcel) {
      var self = this;
      this.lost += 1;
      this.showToast(i18n.t('ui.fellOff'), C.err);
      this.tweens.add({ targets: parcel.obj, alpha: 0, y: parcel.obj.y + 40, duration: 240 });
      this.time.delayedCall(260, function () {
        parcel.alive = false;
        parcel.obj.destroy();
        self.delivered += 1;
        self.refreshHud();
        self.checkDone();
      });
    },

    showToast: function (msg, color) {
      var t = this.toastText;
      t.setText(msg).setColor(hx(color)).setAlpha(1);
      this.tweens.killTweensOf(t);
      this.tweens.add({ targets: t, alpha: 0, delay: 800, duration: 400 });
    },

    checkDone: function () {
      if (this.finished) return;
      if (this.delivered < this.level.total) return;
      this.finished = true;

      // 通过本关 → 解锁下一关
      var before = unlockedCount(this.deck.id, this.levels.length);
      markPassed(this.deck.id, this.levelIndex);
      var after = unlockedCount(this.deck.id, this.levels.length);
      this.newlyUnlocked = after > before;

      this.report();
      this.showResult();
    },

    report: function () {
      // 完成度（rate）按「前 FIRST_N 关」计：前 5 关全通过 → rate = 1。
      // 第 6 关以后属于加练，不再影响完成度。levelRate 是本关自己的正确率，供平台参考。
      var cleared = passedList(this.deck.id).filter(function (i) { return i < FIRST_N; }).length;
      var rate = Math.min(1, cleared / Math.min(FIRST_N, this.levels.length));
      var levelRate = this.level.total ? Math.max(0, Math.min(1, this.correct / this.level.total)) : 0;
      // 上报契约：parent.postMessage({ type: 'correct_rate', rate: 0~1 }, '*')
      // 后面的字段是附加信息，平台不读也不影响
      var payload = {
        type: 'correct_rate', rate: rate, levelRate: levelRate,
        progress: this.level.total ? this.delivered / this.level.total : 1,
        deck: this.deck.id, level: this.levelIndex + 1, levelTitle: this.level.title,
        correct: this.correct, total: this.level.total,
        unlocked: unlockedCount(this.deck.id, this.levels.length)
      };
      try {
        if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*');
      } catch (e) {}
      window.dispatchEvent(new CustomEvent('sorter:complete', { detail: payload }));
      console.log('[sorter] reported', payload);
      try {
        var log = JSON.parse(localStorage.getItem('sorter.log') || '[]');
        log.push({ deck: payload.deck, level: payload.level, correct: payload.correct, total: payload.total, at: Date.now() });
        localStorage.setItem('sorter.log', JSON.stringify(log.slice(-100)));
      } catch (e) {}
    },

    /* ---------------- 结算 ---------------- */
    showResult: function () {
      var self = this;
      var rate = this.level.total ? this.correct / this.level.total : 0;
      var last = (this.levelIndex >= this.levels.length - 1);
      var unlockAt = unlockedCount(this.deck.id, this.levels.length);

      var layer = this.add.container(0, 0).setDepth(100);
      var g = this.add.graphics();
      layer.add(g);
      g.fillStyle(0x000000, 0.58); g.fillRect(0, 0, W, H);

      var pw = 480, ph = this.newlyUnlocked ? 296 : 272;
      var px = (W - pw) / 2, py = (H - ph) / 2 - 14;
      rrect(g, px, py, pw, ph, C.panel, C.juncEdge, 16);

      layer.add(this.add.text(W / 2, py + 34, last ? i18n.t('ui.allComplete') : i18n.t('ui.levelComplete'), {
        fontFamily: FONT, fontSize: '23px', color: hx(C.text)
      }).setOrigin(0.5, 0.5));

      layer.add(this.add.text(W / 2, py + 94, Math.round(rate * 100) + '%', {
        fontFamily: FONT, fontSize: '52px',
        color: hx(rate >= 0.8 ? C.ok : (rate >= 0.5 ? C.warn : C.err))
      }).setOrigin(0.5, 0.5));

      layer.add(this.add.text(W / 2, py + 138, i18n.t('ui.scoreLine', { correct: this.correct, total: this.level.total }), {
        fontFamily: FONT, fontSize: '15px', color: hx(C.muted)
      }).setOrigin(0.5, 0.5));

      if (this.newlyUnlocked) {
        layer.add(this.add.text(W / 2, py + 168, i18n.t('ui.levelUnlocked', { n: unlockAt }), {
          fontFamily: FONT, fontSize: '15px', color: hx(C.juncEdge)
        }).setOrigin(0.5, 0.5));
      }

      // 下一关只有在真的解锁了才给按钮（深链跳着玩时不放行）
      var nextIdx = this.levelIndex + 1;
      var f = urlFlags();
      var canNext = nextIdx < this.levels.length && (
        f.unlockAll || nextIdx === f.forced ||
        passedList(this.deck.id).indexOf(nextIdx) >= 0 ||
        nextIdx < unlockedCount(this.deck.id, this.levels.length)
      );

      var bw = 136, bh = 48, by = py + ph - 66;
      mkButton(this, px + 24, by, bw, bh, i18n.t('ui.replay'), 0x39415a, function () {
        self.scene.restart({ deckIndex: self.deckIndex, levelIndex: self.levelIndex });
      }, layer);
      mkButton(this, px + 24 + (bw + 12), by, bw, bh, i18n.t('ui.levelSelect'), 0x39415a, function () {
        self.scene.start('Menu');
      }, layer);
      if (last) {
        mkButton(this, px + 24 + (bw + 12) * 2, by, bw, bh, i18n.t('ui.backToMenu'), C.juncEdge, function () {
          self.scene.start('Menu');
        }, layer);
      } else if (canNext) {
        mkButton(this, px + 24 + (bw + 12) * 2, by, bw, bh, i18n.t('ui.next'), C.juncEdge, function () {
          self.scene.restart({ deckIndex: self.deckIndex, levelIndex: self.levelIndex + 1 });
        }, layer);
      }
    },

    /* ---------------- 交互 ---------------- */
    onPointerDown: function (pointer) {
      if (this.finished) return;
      var c = Math.floor((pointer.x - this.originX) / CELL);
      var r = Math.floor((pointer.y - this.originY) / CELL);
      var cell = this.cellAt(c, r);
      if (!cell || cell.type !== 'junc') return;
      cell.si = (cell.si + 1) % cell.states.length;
      cell.dir = cell.states[cell.si];
      this.drawJuncs();
    }
  });

  /* ====================================================================== */
  /* 启动                                                                    */
  /* ====================================================================== */
  /* 换语言后把当前场景重开一遍：所有文案都在 create / refreshAll 里按当前语言
     现拼，重开是最省事也最不容易漏的做法（关卡进度存在 localStorage 里）。 */
  function restartActiveScene() {
    var game = window.__sorter;
    if (!game) return;
    var scenes = game.scene.getScenes(true);
    var s = scenes && scenes[0];
    if (!s) return;
    if (s.scene.key === 'Game') s.scene.restart({ deckIndex: s.deckIndex, levelIndex: s.levelIndex });
    else s.scene.restart();
  }

  function startGame() {
    window.__sorter = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width: W, height: H,
      backgroundColor: hx(C.bg),
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [MenuScene, GameScene]
    });
    i18n.onChange(restartActiveScene);
  }

  // ?deckUrl=<url> 用外部 JSON 题库启动；?deck=<看起来像路径> 也当 URL 处理
  function boot() {
    var fb = document.getElementById('fallback');
    var D = SORTER_DATA;
    var q = new URLSearchParams(location.search);
    var url = q.get('deckUrl');
    if (!url) {
      var d = q.get('deck') || '';
      if (/^(https?:|\/|\.\/|\.\.\/)/.test(d)) url = d;
    }
    if (!url) { startGame(); return; }

    fetch(url, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        var list = Array.isArray(json) ? json : (Array.isArray(json.decks) ? json.decks : [json]);
        var loaded = [];
        list.forEach(function (item, i) {
          var deck = D.normalizeDeck(item, 'url-' + (i + 1));
          if (!deck) { console.warn('[sorter] skipped invalid deck entry', item); return; }
          loaded.push(deck);
        });
        if (!loaded.length) throw new Error('no valid deck in ' + url);

        // deckUrl 独占：整份题库列表替换为传入的这套，
        // 封面、标题和题库选择都只出现它的内容（不与内置题库并列）
        D.setDecks(loaded);
        D.pendingDeckId = loaded[0].id;
        console.log('[sorter] loaded ' + loaded.length + ' deck(s) from ' + url);
        if (fb) fb.remove();
        startGame();
      })
      .catch(function (err) {
        console.warn('[sorter] failed to load deckUrl, falling back to built-in decks:', url, err);
        if (fb) fb.remove();
        startGame();
      });
  }

  mountSwitcher();

  window.addEventListener('load', boot);
})();
