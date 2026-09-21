import { chromium } from "playwright";

/* 这个测试跑在 MSG_BUDGET=4 的房间服务器（2571）上，也就是"几乎每条 progress 都会被限流丢掉的极端"。
   要验的只有一件事：丢包之后玩家不能就这么卡死。以前会 —— 客户端以为自己在等下一关，
   而服务器根本没收到那一条，谁也推不动。 */

const BASE = "http://localhost:5173/games/typing/";
const WS = "ws://localhost:2571";
const checks = [];
const check = (n, c, d) => { checks.push([n, !!c, d === undefined ? "" : String(d)]); if (!c) console.log("FAIL " + n + (d !== undefined ? " | " + d : "")); };
const errs = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 880 } });

const board = (p) => p.evaluate(() => {
  const spans = [...document.querySelectorAll("#code .ch")];
  return {
    text: spans.map((x) => (x.classList.contains("nl") ? "\n" : x.textContent)).join(""),
    ok: spans.filter((x) => x.classList.contains("ok")).length,
    chars: document.getElementById("statChars").textContent,
    hint: document.getElementById("hint").innerText,
    clock: document.getElementById("clock").innerText,
  };
});

/* 自适应补打：读当前"该打什么"，缺什么补什么 —— 服务器回滚过也能接着往下打 */
async function typeRemaining(p, pace, budget = 300) {
  for (let i = 0; i < budget; i++) {
    const s = await board(p);
    if (s.ok >= s.text.length) return true;
    const ch = s.text[s.ok];
    if (ch === "\n") await p.keyboard.press("Enter");
    else await p.keyboard.type(ch);
    if (pace) await p.waitForTimeout(pace);
  }
  return false;
}
async function finishCourse(p, pace) {
  for (let lv = 0; lv < 4; lv++) {
    await typeRemaining(p, pace);
    await p.waitForTimeout(400);
    const s = await board(p);
    if (s.ok >= s.text.length) return true;
  }
  return false;
}

const room = "stall" + Math.floor(Math.random() * 900 + 100);
const open = async (tag, name, extra) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(tag + ": " + e.message));
  await p.goto(`${BASE}?room=${room}${extra}&username=${name}&ws=${WS}`, { waitUntil: "load" });
  await p.waitForSelector("#code .ch", { timeout: 20000 });
  return p;
};
const a = await open("A", "Ada", "&id=t09");     /* 赛道 = t09 > t10 两关 */
const b = await open("B", "Bo", "");
await b.waitForFunction(() => document.querySelectorAll("#roster .rc").length === 2, null, { timeout: 15000 });
check("the tight-budget server still runs a normal room",
  (await a.locator("#roomCode").innerText()).includes(room) && (await a.locator("#hint").innerText()).includes("2"),
  (await a.locator("#roomCode").innerText()) + " | " + (await a.locator("#hint").innerText()));

await a.click("#btnStart");
await Promise.all([a, b].map((p) => p.waitForFunction(() => document.getElementById("countdown").hidden, null, { timeout: 12000 })));

/* A 一口气猛打整关：远超 4 条/秒，服务器必然丢掉大部分（包括最后那条） */
await a.keyboard.type((await board(a)).text);
await a.waitForTimeout(2500);
const afterBurst = await board(a);
check("after a burst the client is either advanced or rolled back, never frozen",
  /0 \/ 44/.test(afterBurst.chars) || afterBurst.ok < afterBurst.text.length,
  JSON.stringify({ chars: afterBurst.chars, ok: afterBurst.ok, hint: afterBurst.hint }));

/* 关键：还能不能往下走。卡死的版本在这里永远打不完（键被 advancing 挡着） */
const doneA = await finishCourse(a, 300);
const doneB = await finishCourse(b, 300);
check("the player whose packets were dropped can still finish the level", doneA, JSON.stringify(await board(a)));
check("and so can the other one", doneB, JSON.stringify(await board(b)));

check("the race ends: a dropped message can no longer dead-end the room",
  await a.waitForFunction(() => document.querySelector(".celebrate-card") !== null, null, { timeout: 20000 })
    .then(() => true).catch(() => false),
  JSON.stringify(await board(a)));
check("both see a result", await a.locator(".celebrate-card").isVisible() && await b.locator(".celebrate-card").isVisible());
check("no page errors", errs.length === 0, errs.slice(0, 4).join(" ; "));

await browser.close();
let failed = 0;
for (const [n, ok, d] of checks) { if (!ok) failed++; console.log((ok ? "ok    " : "FAIL  ") + n + (d && !ok ? " | " + d : "")); }
console.log(`\ntight budget: ${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
