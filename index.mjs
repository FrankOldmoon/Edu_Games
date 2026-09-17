#!/usr/bin/env node

/**
 * itch.io HTML5 game offline mirror / exploratory crawler
 *
 * Usage:
 *   node index.mjs https://madmarcel.itch.io/bauhaus-builder
 *   node index.mjs https://madmarcel.itch.io/bauhaus-builder --seconds=180 --passes=10 --headed
 *
 * The crawler deliberately does NOT try to bypass DRM/authentication/paywalls.
 * It opens the public itch.io HTML5 game, discovers the embedded build URL,
 * records network responses, and performs conservative UI/game exploration.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import process from 'node:process';
import { URL } from 'node:url';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const pageUrl = argv.find((a) => !a.startsWith('--')) || 'https://madmarcel.itch.io/bauhaus-builder';
const explicitBuildUrl = strArg('build', null);

function numArg(name, fallback, min = 0) {
  const token = argv.find((a) => a.startsWith(`--${name}=`));
  if (!token) return fallback;
  const value = Number(token.split('=').slice(1).join('='));
  return Number.isFinite(value) ? Math.max(min, value) : fallback;
}

function strArg(name, fallback = null) {
  const token = argv.find((a) => a.startsWith(`--${name}=`));
  return token ? token.split('=').slice(1).join('=') : fallback;
}

const seconds = numArg('seconds', 180, 20);
const passes = numArg('passes', 12, 1);
const actionDelay = numArg('action-delay', 1800, 250);
// Infer a game slug from the page URL, e.g. https://madmarcel.itch.io/bauhaus-builder -> bauhaus-builder
const inferredSlug = (() => {
  try {
    const p = new URL(pageUrl).pathname.split('/').filter(Boolean).filter((s) => !/^index\.html?$/i.test(s));
    return p[p.length - 1] || 'game';
  } catch {
    return 'game';
  }
})();
const outDir = strArg('out', `./${inferredSlug}`);
const headed = argv.includes('--headed');
const keepBrowser = argv.includes('--keep-browser');
const maxBodyMB = numArg('max-body-mb', 80, 1);
const maxResponseCount = numArg('max-responses', 10000, 100);
const exploration = strArg('explore', 'aggressive');

// 平台配置：同一个脚本可分别抓取 itch.io 与 CrazyGames 的游戏。
// - itch.io：默认从游戏页面自动发现 html-classic.itch.zone 的构建 URL。
// - CrazyGames：默认从游戏页面自动发现 *.game-files.crazygames.com 的构建 URL；
//   该 CDN 有 Referer 防盗链，必须带 Referer 才能下载资源。
const PLATFORMS = {
  itch: {
    label: 'itch.io',
    buildPattern: /html-classic\.itch\.zone\/html\//i,
    htmlBuildRe: /https?:\\?\/\\?\/html-classic\.itch\.zone\\?\/html\\?\/[^"'<>\s\\]+/gi,
    referer: null,
  },
  crazygames: {
    label: 'CrazyGames',
    buildPattern: /\.game-files\.crazygames\.com\//i,
    htmlBuildRe: /https?:\\?\/\\?\/[a-z0-9-]+\.game-files\.crazygames\.com\\?\/[^"'<>\s\\]+/gi,
    referer: 'https://games.crazygames.com/',
  },
};

function detectPlatform(urlStr) {
  try {
    if (/(^|\.)crazygames\.com$/i.test(new URL(urlStr).host)) return 'crazygames';
  } catch {}
  return 'itch';
}

// --platform=itch|crazygames 可强制指定；缺省按 URL 域名自动识别。
const platformArg = (strArg('platform', '') || '').toLowerCase();
const platform = PLATFORMS[platformArg] ? platformArg : detectPlatform(explicitBuildUrl || pageUrl);
const platformConf = PLATFORMS[platform];

// --referer：Referer 防盗链（CrazyGames 必需，已按平台设好默认值）。
const referer = strArg('referer', platformConf.referer);
// --direct：目标 URL 本身就是游戏构建，无需再从游戏页发现 iframe。
// 若 URL 已符合该平台的构建 URL 特征，则自动进入直连模式。
const direct = argv.includes('--direct') || (() => {
  try { return platformConf.buildPattern.test(new URL(explicitBuildUrl || pageUrl).href); } catch { return false; }
})();

const NAV_WORDS = /^(play|start|begin|continue|next|retry|restart|resume|levels?|level\s*[1-9]|chapter|select|back|menu|ok|go|launch|build|enter|skip|close|return)$/i;
const NAV_CONTAINS = /(play|start|begin|continue|next|retry|restart|resume|level|levels|chapter|select|back|menu|launch|build|enter|skip|close|return)/i;
// 平台专属的统计 / 广告 / 防盗链脚本：只在各自宿主平台内有效，本地托管时要么触发
// 重定向（itch 的 htmlgame.js），要么初始化失败（CrazyGames SDK）。统一忽略抓取，
// 并从产物中移除其 <script> 引用，保持与参考目录结构一致。
const PLATFORM_SCRIPT_RE = /htmlgame\.js|embed-player|crazygames-sdk/i;
const IGNORE_URL = /google-analytics|googletagmanager|doubleclick|facebook\.com\/tr|sentry\.io|hotjar|clarity\.ms|mixpanel|static\.itch\.io\/htmlgame\.js|sdk\.crazygames\.com/i;
// 注意：不要包含 .wasm/.png 等二进制扩展名——重写阶段是按 UTF-8 文本处理的，
// 会把二进制文件的无效字节转换成 U+FFFD 替换字符，彻底损坏 wasm。
const TEXT_EXTS = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt', '.xml']);

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function safeSegment(segment) {
  let s = segment;
  try { s = decodeURIComponent(s); } catch {}
  s = s.replace(/[<>:"|?*\\\x00-\x1F]/g, '_');
  return s || '_';
}

function querySuffix(search) {
  if (!search) return '';
  return `__q_${crypto.createHash('sha1').update(search).digest('hex').slice(0, 12)}`;
}

function urlToRelativePath(rawUrl, mainBuildUrl = null) {
  const u = new URL(rawUrl);
  const base = mainBuildUrl ? new URL(mainBuildUrl) : null;
  let pathname = u.pathname || '/';

  // 同源构建资源统一放在 html/ 下（保持原路径层级），与参考目录结构一致；
  // 跨源资源放在 external/<host>/ 下，避免同路径冲突。
  const sameBuildHost = base && u.host === base.host;
  if (!sameBuildHost) {
    pathname = `external/${safeSegment(u.host)}${pathname}`;
  } else if (!/^\/html\//i.test(pathname)) {
    pathname = `/html${pathname}`;
  }

  const parts = pathname.split('/').filter(Boolean).map(safeSegment);
  let rel = parts.join('/') || 'index.html';
  const ext = path.extname(rel);
  // 主构建文档本身（index.html?v=xxx）不追加 query 后缀，保持入口名为 index.html，
  // 与参考目录结构一致，也避免 README/首页链接指向带 __q_ 后缀的怪异文件名。
  const isMainDoc = base && u.pathname === base.pathname;
  const suffix = isMainDoc ? '' : querySuffix(u.search);
  if (suffix) {
    rel = ext ? `${rel.slice(0, -ext.length)}${suffix}${ext}` : `${rel}${suffix}`;
  }
  return rel;
}

// 用系统 curl 按原始字节下载。itch.zone 对非浏览器 HTTP 客户端会限流/拒绝，
// 而高级客户端（playwright APIRequest / node fetch）会超时或把 gzip 块解压错位。
// curl 稳定且返回精确字节，适合保真抓取 .wasm 这类对字节精确性敏感的大文件。
// 使用 spawn 流式收集，避免 execFile 的 maxBuffer 限制。
async function curlBytes(url, maxBytesMB = 200) {
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0 Safari/537.36';
  const { spawn } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    const args = ['-sS', '-L', '-A', UA, '--compressed', '--max-time', '120'];
    if (referer) args.push('-e', referer);
    args.push(url);
    const child = spawn('curl', args);
    const chunks = [];
    let size = 0;
    const limit = maxBytesMB * 1024 * 1024;
    child.stdout.on('data', (c) => {
      if (size + c.length > limit) {
        child.kill();
        reject(new Error(`curlBytes: response exceeds ${maxBytesMB} MB`));
        return;
      }
      chunks.push(c);
      size += c.length;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`curl exited ${code}`));
    });
  });
}

// wasm 二进制魔数：\0asm
function isWasmBuffer(buf) {
  return !!buf && buf.length >= 4 && buf[0] === 0x00 && buf[1] === 0x61 && buf[2] === 0x73 && buf[3] === 0x6d;
}

// 校验一个“声称是 wasm”的响应体是否可信：明文 wasm（魔数）或可成功解压的压缩流。
// 用于过滤掉 404 / HTML 错误页（它们的字符串内容会被误当成 .wasm 存下来）。
function isValidWasmAsset(buf) {
  if (!buf || buf.length === 0) return false;
  if (isWasmBuffer(buf)) return true;
  try { zlib.brotliDecompressSync(buf); return true; } catch {}
  try { zlib.gunzipSync(buf); return true; } catch {}
  return false;
}

// 判断 .br/.gz 文件的实际内容是否已经是明文（未压缩）。itch 上部分 Unity 构建会把
// 已解压的内容放在 .br 文件名下；此时若保留 .br 后缀，静态服务器（如 vite）会自动
// 追加 Content-Encoding: br，浏览器解码失败（ERR_CONTENT_DECODING_FAILED）。
// 返回 true 表示应当去掉压缩后缀、按明文保存。
function isPlainContent(buf) {
  if (!buf || buf.length === 0) return false;
  if (isWasmBuffer(buf)) return true;
  const head = buf.subarray(0, 16).toString('latin1');
  // 已知的明文签名（Unity WebGL 数据 / zip / 常见文本开头）
  if (head.startsWith('UnityWeb') || head.startsWith('PK')) return true;
  if (/^<(!DOCTYPE|html|\?xml)/i.test(head)) return true;
  if (/^[\s]*[{[<]/.test(head)) return true;
  // 明显的压缩流特征：gzip / zlib 直接判定为“真压缩”
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) return false;
  if (buf.length >= 2 && buf[0] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(buf[1])) return false;
  // 采样头部字节：可打印比例高则视为明文
  const n = Math.min(buf.length, 256);
  let printable = 0;
  for (let i = 0; i < n; i++) {
    const c = buf[i];
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)) printable++;
  }
  return printable / n > 0.85;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha1(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function findBuildUrl(page, conf) {
  const candidates = new Set();

  const add = (value) => {
    if (!value) return;
    try {
      // Decode common HTML entities that may trail the matched URL (e.g. &quot;).
      const decoded = value
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&#x27;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/"+$/, '')   // strip a trailing quote that followed the matched URL
        .trim();
      const u = new URL(decoded, page.url());
      if (conf.buildPattern.test(u.href)) {
        u.hash = '';
        u.search = '';
        candidates.add(u.href);
      }
    } catch {}
  };

  // 1. iframe src attributes.
  const iframeSrcs = await page.locator('iframe').evaluateAll((frames) =>
    frames.map((f) => f.getAttribute('src') || f.getAttribute('data-src')).filter(Boolean)
  ).catch(() => []);
  iframeSrcs.forEach(add);

  // 2. Rendered HTML / inline scripts.
  const html = await page.content();
  const htmlRe = new RegExp(conf.htmlBuildRe.source, 'gi');
  for (const match of html.matchAll(htmlRe)) {
    add(match[0].replaceAll('\\\\/', '/'));
  }

  // 3. Frames already attached.
  for (const frame of page.frames()) add(frame.url());

  // Prefer a direct index.html build URL.
  const list = [...candidates];
  list.sort((a, b) => {
    const score = (u) => /\/index\.html(?:\?|$)/i.test(u) ? 0 : 1;
    return score(a) - score(b);
  });

  return list[0] || null;
}

function responseLooksUseful(response) {
  const url = response.url();
  if (!isHttpUrl(url)) return false;
  if (IGNORE_URL.test(url)) return false;

  const type = response.request().resourceType();
  return !['beacon', 'ping'].includes(type);
}

async function inspectPhaser(frame) {
  if (!frame || frame.isDetached()) return { scenes: [], candidates: [], globals: [] };

  try {
    return await frame.evaluate(() => {
      const out = { scenes: [], candidates: [], globals: [] };

      // Phaser often exposes GAMES globally in Phaser 3 builds.
      const games = globalThis?.Phaser?.GAMES || [];
      for (const game of games) {
        try {
          const canvas = game.canvas;
          const scenes = game.scene?.scenes || [];
          for (const scene of scenes) {
            if (!scene?.sys) continue;
            const active = !!scene.sys.isActive?.();
            const key = scene.sys.settings?.key || '';
            out.scenes.push({ key, active });

            const walk = (obj, depth = 0) => {
              if (!obj || depth > 4) return;
              const text = typeof obj.text === 'string' ? obj.text.trim() : '';
              const input = obj.input ? true : false;
              if (text || input) {
                let bounds = null;
                try {
                  if (typeof obj.getBounds === 'function') {
                    const b = obj.getBounds();
                    bounds = { x: b.centerX, y: b.centerY, width: b.width, height: b.height };
                  }
                } catch {}
                out.candidates.push({
                  scene: key,
                  text: text.slice(0, 120),
                  input,
                  visible: obj.visible !== false,
                  active,
                  x: Number.isFinite(obj.x) ? obj.x : null,
                  y: Number.isFinite(obj.y) ? obj.y : null,
                  bounds,
                  type: obj.type || '',
                });
              }
              const children = obj.list || obj.children?.entries || [];
              if (Array.isArray(children)) {
                for (const child of children) walk(child, depth + 1);
              }
            };

            const children = scene.children?.list || [];
            for (const child of children) walk(child);
          }

          if (canvas) {
            out.canvas = {
              width: canvas.width,
              height: canvas.height,
              rect: canvas.getBoundingClientRect ? (() => {
                const r = canvas.getBoundingClientRect();
                return { left: r.left, top: r.top, width: r.width, height: r.height };
              })() : null,
            };
          }
        } catch {}
      }

      out.candidates = out.candidates
        .filter((x) => x.visible && x.active)
        .filter((x) => x.text || x.input)
        .slice(0, 500);

      // A conservative list of globals useful for diagnostics; never invokes them.
      out.globals = Object.keys(globalThis)
        .filter((k) => /^(game|scene|level|phaser|main|app)$/i.test(k) || /phaser/i.test(k))
        .slice(0, 50);

      return out;
    });
  } catch {
    return { scenes: [], candidates: [], globals: [] };
  }
}

async function getGameCanvasInfo(frame) {
  if (!frame || frame.isDetached()) return null;
  try {
    const canvas = frame.locator('canvas').first();
    const [box, meta] = await Promise.all([
      canvas.boundingBox(),
      canvas.evaluate((el) => ({ canvasWidth: el.width, canvasHeight: el.height }))
    ]);
    if (!box) return null;
    return { left: box.x, top: box.y, width: box.width, height: box.height, ...meta };
  } catch {
    return null;
  }
}

async function getTextButtons(frame) {
  if (!frame || frame.isDetached()) return [];
  try {
    const locator = frame.locator('button, [role="button"], input[type="button"], input[type="submit"], a');
    const count = Math.min(await locator.count(), 100);
    const items = [];
    for (let i = 0; i < count; i++) {
      const el = locator.nth(i);
      try {
        const text = (await el.innerText().catch(() => '')) || (await el.getAttribute('value')) || (await el.getAttribute('aria-label')) || '';
        const box = await el.boundingBox();
        if (box && box.width > 0 && box.height > 0 && text.trim()) {
          items.push({ text: text.trim().slice(0, 120), left: box.x, top: box.y, width: box.width, height: box.height, visible: true, index: i });
        }
      } catch {}
    }
    return items;
  } catch {
    return [];
  }
}

async function clickPhaserCandidate(interactionPage, frame, candidate) {
  const canvas = await getGameCanvasInfo(frame);
  if (!canvas || !candidate) return false;

  const point = candidate.bounds || { x: candidate.x, y: candidate.y };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;

  // Phaser UI coordinates normally map directly to the canvas coordinate system.
  // Clamp to avoid accidental clicks outside the rendered game.
  const sx = canvas.width / Math.max(1, canvas.canvasWidth || canvas.width);
  const sy = canvas.height / Math.max(1, canvas.canvasHeight || canvas.height);
  const x = canvas.left + point.x * sx;
  const y = canvas.top + point.y * sy;

  if (x < canvas.left || y < canvas.top || x > canvas.left + canvas.width || y > canvas.top + canvas.height) {
    return false;
  }

  await page.mouse.click(x, y);
  return true;
}

async function takeScreenshot(frame, dir, label) {
  try {
    const canvas = frame.locator('canvas').first();
    if (await canvas.count()) {
      const safe = label.replace(/[^a-z0-9_-]/gi, '_').slice(0, 80);
      const file = path.join(dir, `${safe}.png`);
      await canvas.screenshot({ path: file });
      return file;
    }
  } catch {}
  return null;
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const absoluteOut = path.resolve(outDir);
  const debugDir = path.join(absoluteOut, '_exploration');
  await fs.mkdir(debugDir, { recursive: true });

  console.log(`\n[html5-game-mirror] platform: ${platformConf.label}${direct ? ' (direct)' : ''}`);
  console.log(`[html5-game-mirror] source: ${pageUrl}`);
  console.log(`[html5-game-mirror] output: ${absoluteOut}`);
  console.log(`[html5-game-mirror] exploration: ${seconds}s, ${passes} passes, mode=${exploration}`);

  const browser = await chromium.launch({ headless: !headed });
  const contextOptions = {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153 Safari/537.36',
  };
  // 部分平台有 Referer 防盗链（如 CrazyGames 的 game-files 域名）。
  if (referer) contextOptions.extraHTTPHeaders = { Referer: referer };
  const context = await browser.newContext(contextOptions);

  const captured = new Map();
  const failures = [];
  const actions = [];
  const seenStates = new Set();
  let responseCount = 0;
  let gameFrame = null;
  let gameUrl = null;
  let gameFramePage = null;
  let interactionPage;

  const saveResponse = async (response) => {
    if (responseCount >= maxResponseCount) return;
    if (!responseLooksUseful(response)) return;
    responseCount += 1;

    const url = response.url();
    if (captured.has(url)) return;

    try {
      let body = await response.body();
      // 二进制大文件（尤其是指针型 .wasm，如 Defold/Emscripten/Unity 游戏）对字节
      // 精确性极其敏感。itch.zone 的压缩/分块传输会让浏览器 response.body() 解压错位。
      // 对 .wasm / .wasm.br / .wasm.gz 一律用系统 curl 重新按原始字节抓取并校验。
      if (/\.wasm(?:\.(?:br|gz))?(?:\?|$)/i.test(url)) {
        let fresh = null;
        try {
          fresh = await curlBytes(url);
        } catch (e) {
          failures.push({ url, error: `wasm curl failed: ${String(e)}` });
        }
        if (fresh && fresh.length > 0 && isValidWasmAsset(fresh)) {
          body = fresh;
        } else if (!isValidWasmAsset(body)) {
          // 浏览器 body 也不可信（如 404/HTML 错误页），直接丢弃该资源。
          failures.push({ url, error: 'wasm content invalid from both curl and browser' });
          return;
        }
      }

      if (!body || body.length === 0 || body.length > maxBodyMB * 1024 * 1024) {
        if (body && body.length > maxBodyMB * 1024 * 1024) {
          failures.push({ url, error: `response exceeds ${maxBodyMB} MB limit`, size: body.length });
        }
        return;
      }
      // 记录发起该请求的 frame 文档所属 host。后续只保留“游戏帧”发起的资源，
      // 以便丢弃平台外层页面（如 CrazyGames 游戏页的广告/框架脚本）带来的无关资源。
      let frameHost = null;
      try { frameHost = new URL(response.frame().url()).host; } catch {}
      captured.set(url, {
        body,
        contentType: response.headers()['content-type'] || '',
        status: response.status(),
        resourceType: response.request().resourceType(),
        frameHost,
        size: body.length,
      });
    } catch (error) {
      failures.push({ url, error: String(error) });
    }
  };

  context.on('response', saveResponse);
  context.on('requestfailed', (request) => {
    const url = request.url();
    if (!IGNORE_URL.test(url)) {
      failures.push({ url, error: request.failure()?.errorText || 'request failed' });
    }
  });

  const page = await context.newPage();
  interactionPage = page;

  if (direct) {
    // 直连模式：pageUrl（或 --build）本身就是游戏构建，直接加载，无需发现 iframe。
    gameUrl = new URL(explicitBuildUrl || pageUrl).toString();
    await page.goto(gameUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
  } else if (explicitBuildUrl) {
    // 显式指定构建 URL：从游戏页面加载（以便拿到平台上下文），构建 URL 单独记录。
    gameUrl = new URL(explicitBuildUrl).toString();
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3000);
  } else {
    // 默认：打开游戏页面，按平台规则自动发现内嵌构建 URL。
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    gameUrl = await findBuildUrl(page, platformConf);
  }
  if (!gameUrl) {
    await browser.close();
    throw new Error(`Unable to discover the ${platformConf.label} build URL. Try --build=<url>, --direct, or --headed to inspect the page.`);
  }

  console.log(`\n[1/6] Build detected:\n      ${gameUrl}`);

  const buildBase = new URL(gameUrl);
  const updateGameFrame = () => {
    const candidate = page.frames().find((f) => {
      try { return new URL(f.url()).host === buildBase.host; } catch { return false; }
    });
    if (candidate) gameFrame = candidate;
  };
  updateGameFrame();

  // If the iframe was lazy/uncooperative, open the build itself in the same browser context.
  if (!gameFrame) {
    gameFramePage = await context.newPage();
    interactionPage = gameFramePage;
    await gameFramePage.goto(gameUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => {
      failures.push({ url: gameUrl, error: `direct build navigation: ${e.message}` });
    });
    gameFrame = gameFramePage.mainFrame();
    await gameFramePage.waitForTimeout(2000);
  }

  await interactionPage.bringToFront();
  await sleep(1500);

  console.log('[2/6] Recording initial network activity...');
  await sleep(2500);

  const started = Date.now();
  let pass = 0;
  let lastResourceCount = 0;
  let stagnation = 0;

  // Conservative sequences first; more invasive exploration later.
  const keyboardSequences = [
    ['Escape'],
    ['Enter'],
    ['Space'],
    ['ArrowUp'],
    ['ArrowDown'],
    ['ArrowLeft'],
    ['ArrowRight'],
    ['Enter', 'ArrowDown', 'Enter'],
    ['Escape', 'Enter'],
    ['Space', 'ArrowDown', 'Enter'],
    ['Digit1'], ['Digit2'], ['Digit3'], ['Digit4'], ['Digit5'],
    ['Digit6'], ['Digit7'], ['Digit8'], ['Digit9'],
  ];

  const canvasClickGrid = [
    [0.50, 0.50],
    [0.50, 0.78],
    [0.50, 0.88],
    [0.30, 0.78],
    [0.70, 0.78],
    [0.25, 0.50],
    [0.75, 0.50],
    [0.50, 0.25],
    [0.20, 0.25],
    [0.80, 0.25],
  ];

  const runAction = async (label, fn) => {
    if ((Date.now() - started) > seconds * 1000) return false;
    try {
      const before = captured.size;
      await fn();
      await sleep(actionDelay);
      updateGameFrame();
      const phaser = await inspectPhaser(gameFrame);
      const screenshot = await takeScreenshot(gameFrame, debugDir, `${String(pass).padStart(2, '0')}-${label}`);
      let stateHash = screenshot;
      if (screenshot) {
        try {
          const bytes = await fs.readFile(screenshot);
          stateHash = sha1(bytes);
        } catch {}
      }
      actions.push({
        pass,
        label,
        timestamp: new Date().toISOString(),
        resourcesBefore: before,
        resourcesAfter: captured.size,
        newResources: captured.size - before,
        scenes: phaser.scenes,
        candidates: phaser.candidates.filter((c) => c.text || c.input).slice(0, 100),
        stateHash,
      });
      return true;
    } catch (error) {
      actions.push({ pass, label, error: String(error) });
      return false;
    }
  };

  while ((Date.now() - started) < seconds * 1000 && pass < passes) {
    pass += 1;
    updateGameFrame();
    if (!gameFrame) {
      await sleep(1000);
      continue;
    }

    console.log(`  [pass ${pass}/${passes}] resources=${captured.size}`);

    // Focus the game.
    const canvasInfo = await getGameCanvasInfo(gameFrame);
    if (canvasInfo) {
      await runAction('focus', async () => {
        await interactionPage.mouse.click(canvasInfo.left + canvasInfo.width / 2, canvasInfo.top + canvasInfo.height / 2);
      });
    }

    // DOM buttons / links, if the game uses HTML UI.
    const domButtons = await getTextButtons(gameFrame);
    const domCandidates = uniqueBy(domButtons.filter((b) => NAV_CONTAINS.test(b.text)), (b) => `${b.text}|${Math.round(b.left)}|${Math.round(b.top)}`).slice(0, 20);
    for (const button of domCandidates) {
      if ((Date.now() - started) >= seconds * 1000) break;
      await runAction(`dom-${button.text}`, async () => {
        await gameFrame.locator('button, [role="button"], input[type="button"], input[type="submit"], a')
          .filter({ hasText: button.text })
          .first()
          .click({ timeout: 1500 })
          .catch(async () => {
            await interactionPage.mouse.click(button.left + button.width / 2, button.top + button.height / 2);
          });
      });
    }

    // Phaser scene inspection: identify actual text/input objects and click likely navigation controls.
    const phaser = await inspectPhaser(gameFrame);
    const phaserCandidates = uniqueBy(
      phaser.candidates.filter((c) => c.text && (NAV_WORDS.test(c.text) || NAV_CONTAINS.test(c.text))),
      (c) => `${c.scene}|${c.text}|${Math.round(c.x || 0)}|${Math.round(c.y || 0)}`
    ).slice(0, 30);

    for (const candidate of phaserCandidates) {
      if ((Date.now() - started) >= seconds * 1000) break;
      await runAction(`phaser-${candidate.scene}-${candidate.text}`, async () => {
        await clickPhaserCandidate(interactionPage, gameFrame, candidate);
      });
    }

    // Keyboard exploration. These keys are intentionally standard navigation/game keys;
    // the number keys are useful when a level selector binds directly to 1..9.
    for (const sequence of keyboardSequences) {
      if ((Date.now() - started) >= seconds * 1000) break;
      if (exploration === 'safe' && sequence.some((k) => /^Digit/.test(k))) continue;
      await runAction(`keys-${sequence.join('-')}`, async () => {
        for (const key of sequence) {
          await interactionPage.keyboard.press(key);
          await sleep(250);
        }
      });
    }

    // Canvas coordinate exploration. This is the fallback for Phaser UIs that contain no DOM
    // buttons and whose menu text cannot be inspected through global scene objects.
    if (exploration === 'aggressive') {
      const info = await getGameCanvasInfo(gameFrame);
      if (info) {
        const clickTargets = canvasClickGrid.slice(0, pass <= 2 ? 5 : canvasClickGrid.length);
        for (const [rx, ry] of clickTargets) {
          if ((Date.now() - started) >= seconds * 1000) break;
          await runAction(`canvas-${rx}-${ry}`, async () => {
            await interactionPage.mouse.click(info.left + info.width * rx, info.top + info.height * ry);
          });
        }
      }
    }

    // Detect whether the exploration is making progress.
    if (captured.size === lastResourceCount) stagnation += 1;
    else stagnation = 0;
    lastResourceCount = captured.size;

    if (stagnation >= 3) {
      // A small reset sequence often exposes the level selector in Phaser games.
      await runAction('reset-menu', async () => {
        await interactionPage.keyboard.press('Escape').catch(() => {});
        await sleep(200);
        await interactionPage.keyboard.press('Escape').catch(() => {});
      });
    }
  }

  await sleep(2500);
  updateGameFrame();
  await takeScreenshot(gameFrame, debugDir, 'final-state');

  console.log(`\n[3/6] Exploration finished: ${Math.round((Date.now() - started) / 1000)}s`);
  console.log(`      Captured ${captured.size} unique HTTP resources.`);
  console.log(`      Recorded ${actions.length} exploration actions.`);

  // Ensure the Build document itself is present even when it was loaded before the response listener.
  if (!captured.has(gameUrl) && gameFramePage) {
    try {
      const response = await gameFramePage.request.get(gameUrl);
      const body = await response.body();
      captured.set(gameUrl, {
        body,
        contentType: response.headers()['content-type'] || 'text/html',
        status: response.status(),
        resourceType: 'document',
        size: body.length,
      });
    } catch (error) {
      failures.push({ url: gameUrl, error: `final document fetch: ${String(error)}` });
    }
  }

  // 懒加载保护：引擎运行时按需拉取的资源（wasm / Unity build 分片）可能从未触发 response。
  // 1) 扫描主构建文档及 loader JS 中引用的 .wasm（含 Unity 的 codeUrl: Web.wasm.br）；
  // 2) 扫描 Unity 的 dataUrl / frameworkUrl / codeUrl 等构建分片；
  // 3) 全部用 curl 保真补抓；wasm 结果做魔数校验，避免把 404 HTML 页当成 wasm 存下来。
  const collectUrls = (text) => {
    // 以主文档所在目录为基准解析（Unity 的资源路径是文档相对路径）。
    const docDir = new URL('.', gameUrl);
    const found = new Set();
    // Unity 常把构建目录写成变量，如 var buildUrl = "Build";
    const buildVar = text.match(/\bbuildUrl\s*=\s*["']([^"']*)["']/);
    const buildPrefix = buildVar ? buildVar[1] : '';
    const add = (raw) => {
      if (!raw) return;
      const cleaned = String(raw).replace(/^\.?\//, '');
      try { found.add(new URL(cleaned, docDir).href); } catch {}
    };
    // Unity 配置项：值可能是 "xxx" 或 buildUrl + "/xxx" 这类拼接。
    const configRe = /\b(?:data|framework|code|streamingAssets)Url\s*[:=]\s*(?:["']([^"']+)["']|([A-Za-z_$][\w$]*)\s*\+\s*["']([^"']+)["'])/g;
    for (const m of text.matchAll(configRe)) {
      if (m[1] != null) add(m[1]);
      else if (m[3] != null) add(buildPrefix + m[3]);
    }
    // 通用 .wasm / .wasm.br / .wasm.gz 引用
    for (const m of text.matchAll(/["'(\s]([^"'()\s>]+\.wasm(?:\.[a-z0-9]+)?(?:\?[^"'()\s>]*)?)/gi)) {
      add(m[1]);
    }
    return found;
  };

  const isBuildAssetUrl = (u) => /\.(?:wasm|data|js)(?:\.(?:br|gz))?(?:\?|$)/i.test(u);

  await (async () => {
    const mainDoc = captured.get(gameUrl);
    if (!mainDoc) return;
    const mainText = mainDoc.body.toString('utf8');
    const found = collectUrls(mainText);

    // 从 loader JS 内容二次提取（Defold/Emscripten 的 loader 会内联 wasm 路径）
    const docDir = new URL('.', gameUrl);
    for (const m of mainText.matchAll(/["'\s]([^"'()\s>]+\.(?:wasm|loader)\.js(?:\?[^"'()\s>]*)?)/gi)) {
      let loaderHref;
      try { loaderHref = new URL(m[1].replace(/^\.?\//, ''), docDir).href; } catch { continue; }
      const loader = captured.get(loaderHref);
      if (!loader) continue;
      collectUrls(loader.body.toString('utf8')).forEach((w) => found.add(w));
    }

    for (const assetUrl of found) {
      if (captured.has(assetUrl)) continue;
      if (responseCount >= maxResponseCount) break;
      if (IGNORE_URL.test(assetUrl)) continue;
      if (!isBuildAssetUrl(assetUrl)) continue;
      try {
        const buf = await curlBytes(assetUrl);
        if (!buf || buf.length === 0) {
          failures.push({ url: assetUrl, error: 'lazy build-asset curl empty' });
          continue;
        }
        // wasm 目标必须通过魔数/可解压校验，否则视为 404/HTML 错误页丢弃。
        if (/\.wasm(?:\.(?:br|gz))?(?:\?|$)/i.test(assetUrl) && !isValidWasmAsset(buf)) {
          failures.push({ url: assetUrl, error: 'lazy wasm content is not a valid wasm/compressed stream' });
          continue;
        }
        responseCount += 1;
        captured.set(assetUrl, {
          body: buf,
          contentType: /\.wasm/i.test(assetUrl) ? 'application/wasm' : 'application/octet-stream',
          status: 200,
          resourceType: 'lazy-build-asset',
          size: buf.length,
        });
        console.log(`      [lazy] captured build asset via curl: ${assetUrl} (${buf.length} bytes)`);
      } catch (e) {
        failures.push({ url: assetUrl, error: `lazy build-asset curl: ${String(e)}` });
      }
    }
  })();

  console.log('[4/6] Writing mirrored resources...');
  const mapping = [];
  const urlMap = new Map();
  // 记录需要改写的“压缩后缀剥离”：basename（含 .br/.gz）-> 新 basename。
  // 用于 Unity 等把明文放在 .br 文件名下的构建：本地去掉 .br，并同步改写文档引用。
  const strippedNames = new Map();
  // 只保留游戏帧发起的资源，丢弃平台外层页面的无关资源（广告/框架/统计等）。
  let droppedForeign = 0;
  for (const [url, item] of captured) {
    if (item.frameHost && item.frameHost !== buildBase.host) {
      droppedForeign += 1;
      continue;
    }
    try {
      let rel = urlToRelativePath(url, gameUrl);
      // 若 .br/.gz 文件内容其实是明文，则去掉后缀，避免静态服务器误加 Content-Encoding。
      if (/\.(br|gz)$/i.test(new URL(url).pathname) && isPlainContent(item.body)) {
        const oldBase = path.basename(rel);
        const newBase = oldBase.replace(/\.(br|gz)$/i, '');
        rel = path.join(path.dirname(rel), newBase);
        strippedNames.set(oldBase, newBase);
      }
      const record = { url, rel, ...item, body: undefined };
      mapping.push(record);
      urlMap.set(url, rel);
    } catch (error) {
      failures.push({ url, error: `path mapping: ${String(error)}` });
    }
  }

  if (droppedForeign) {
    console.log(`      (skipped ${droppedForeign} resource(s) requested by the platform page, not the game)`);
  }

  // Resolve collisions deterministically.
  const relCounts = new Map();
  for (const item of mapping) {
    const n = relCounts.get(item.rel) || 0;
    if (n > 0) {
      const ext = path.extname(item.rel);
      item.rel = ext
        ? `${item.rel.slice(0, -ext.length)}__dup${n}${ext}`
        : `${item.rel}__dup${n}`;
      urlMap.set(item.url, item.rel);
    }
    relCounts.set(item.rel, n + 1);
  }

  for (const item of mapping) {
    const target = path.join(absoluteOut, item.rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, captured.get(item.url).body);
  }

  // 从探索截图挑选一张最合适的作为顶层 capture.png（与 bauhaus-builder 参考结构一致）。
  // 若存在摄像头/实际游戏画面截图，选尺寸最大者；否则回退到任意一张。
  const captureSource = await (async () => {
    let shots = [];
    try {
      shots = (await fs.readdir(debugDir)).filter((f) => f.endsWith('.png'));
    } catch {}
    if (!shots.length) return null;
    const stats = await Promise.all(
      shots.map(async (f) => ({ f, size: (await fs.stat(path.join(debugDir, f))).size }))
    ).catch(() => shots.map((f) => ({ f, size: 0 })));
    stats.sort((a, b) => b.size - a.size);
    return path.join(debugDir, stats[0].f);
  })();
  if (captureSource) {
    await fs.copyFile(captureSource, path.join(absoluteOut, 'capture.png'));
  }

  console.log('[5/6] Rewriting captured absolute URLs to local paths...');
  const entries = [...urlMap.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const item of mapping) {
    const ext = path.extname(item.rel).toLowerCase();
    if (!TEXT_EXTS.has(ext)) continue;

    const target = path.join(absoluteOut, item.rel);
    let text;
    try {
      text = await fs.readFile(target, 'utf8');
    } catch {
      continue;
    }

    const fromDir = path.dirname(target);
    for (const [remoteUrl, remoteRel] of entries) {
      const localTarget = path.join(absoluteOut, remoteRel);
      let replacement = path.relative(fromDir, localTarget).split(path.sep).join('/');
      if (!replacement.startsWith('.')) replacement = `./${replacement}`;
      if (remoteUrl.startsWith('http')) {
        // Exact URL replacement handles quoted JS/CSS/HTML references.
        text = text.split(remoteUrl).join(replacement);
      }
    }

    // 改写被剥离了 .br/.gz 后缀的资源引用（Unity 等明文构建），保证本地路径存在。
    for (const [oldBase, newBase] of strippedNames) {
      if (text.includes(oldBase)) text = text.split(oldBase).join(newBase);
    }

    // 移除平台专属脚本（统计/广告/防盗链）的 <script> 引用，让产物自包含且结构统一。
    if (PLATFORM_SCRIPT_RE.test(text)) {
      text = text
        // <script src="...htmlgame.js"></script> / <script id="..." src="..."></script>
        .replace(/<script\b[^>]*\bsrc=["'][^"']*(?:htmlgame\.js|embed-player|crazygames-sdk)[^"']*["'][^>]*>\s*<\/script>/gi, '')
        // 自闭合形式 <script src="..." />
        .replace(/<script\b[^>]*\bsrc=["'][^"']*(?:htmlgame\.js|embed-player|crazygames-sdk)[^"']*["'][^>]*\/>/gi, '')
        // 单独出现的脚本 URL 引用（如手动外链）
        .replace(/(<script[^>]*\bsrc=["'])\s*https?:\/\/[^"']*(?:htmlgame\.js|embed-player|crazygames-sdk)[^"']*(["'][^>]*>)/gi, '');
    }

    await fs.writeFile(target, text);
  }

  const localBuildPath = urlMap.get(gameUrl) || urlToRelativePath(gameUrl, gameUrl);

  // 顶层结构与参考版 bauhaus-builder 一致：README-local.md + capture.png + html/
  const readme = `# ${inferredSlug} local copy

Captured from the public HTML5 build URL:
${gameUrl}

Serve the directory itself (the \`html/...\` path is intentional):

\`\`\`bash
python3 -m http.server 8080 -d .
\`\`\`

Then open:

http://localhost:8080/${localBuildPath.replace(/^\.\//, '')}
`;

  await fs.writeFile(path.join(absoluteOut, 'README-local.md'), readme);

  // 删除探索过程产生的临时截图目录
  await fs.rm(debugDir, { recursive: true, force: true });

  console.log('[6/6] Done.');
  console.log(`      Build:   ${gameUrl}`);
  console.log(`      Output:  ${absoluteOut}`);
  console.log(`      Open:    http://localhost:8080/${localBuildPath.replace(/^\.\//, '')}`);

  if (!keepBrowser) await browser.close();
}

main().catch(async (error) => {
  console.error('\nERROR:', error?.stack || error);
  process.exitCode = 1;
});
