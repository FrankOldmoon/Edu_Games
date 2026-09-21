import { chromium } from "playwright";

const BASE = "http://10.28.1.151:3010/games/typing/";
const checks = [];
const check = (n, c, d) => { checks.push([n, !!c, d === undefined ? "" : String(d)]); if (!c) console.log("FAIL " + n + (d !== undefined ? " | " + d : "")); };
const errs = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 880 } });
await ctx.addInitScript(() => { window.__results = []; window.addEventListener("typing:result", (e) => window.__results.push(e.detail)); });

const text = (p) => p.evaluate(() => [...document.querySelectorAll("#code .ch")].map((s) => (s.classList.contains("nl") ? "\n" : s.textContent)).join(""));
const chips = (p) => p.evaluate(() => [...document.querySelectorAll("#tower .chip")].map((c) => c.querySelector(".nm").textContent));
async function typeAll(p, t) {
  const lines = t.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("    ")) { await p.keyboard.press("Tab"); await p.keyboard.type(lines[i].slice(4)); }
    else await p.keyboard.type(lines[i]);
    if (i < lines.length - 1) await p.keyboard.press("Enter");
  }
}
/* 一直打到终点：每打完一关文本会换，等它换完再接着打 */
async function runCourse(p, levels) {
  for (let i = 0; i < levels; i++) {
    const before = await text(p);
    await typeAll(p, before);
    if (i < levels - 1) {
      await p.waitForFunction((prev) => {
        const got = [...document.querySelectorAll("#code .ch")].map((s) => (s.classList.contains("nl") ? "\n" : s.textContent)).join("");
        return got !== prev;
      }, before, { timeout: 12000 });
    }
  }
}

const room = "live" + Math.floor(Math.random() * 900 + 100);
const open = async (tag, name) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(tag + ": " + e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(tag + " console: " + m.text()); });
  await p.goto(`${BASE}?room=${room}&username=${name}`, { waitUntil: "load" });
  await p.waitForSelector("#code .ch", { timeout: 20000 });
  return p;
};
const a = await open("A", "Ada");
const b = await open("B", "Bo");
await b.waitForFunction(() => document.querySelectorAll("#roster .rc").length === 2, null, { timeout: 15000 });
check("deployed page + room server work together", (await a.locator("#roomCode").innerText()).includes(room),
  await a.locator("#roomCode").innerText());
check("names arrived from ?username=",
  (await a.evaluate(() => [...document.querySelectorAll("#roster .rc")].map((e) => e.textContent).join(" | "))).includes("Bo"));
check("the whole bank is the course", (await a.locator("#hint").innerText()).includes("10"), await a.locator("#hint").innerText());

await a.click("#btnStart");
await Promise.all([a, b].map((p) => p.waitForFunction(() => !document.getElementById("countdown").hidden, null, { timeout: 8000 })));
await Promise.all([a, b].map((p) => p.waitForFunction(() => document.getElementById("countdown").hidden, null, { timeout: 12000 })));
check("the countdown ran on the real network", true);

/* A 打通前两关，路上确认关卡真的换了、塔上只剩同关的人 */
await typeAll(a, await text(a));
await a.waitForFunction(() => document.getElementById("statChars").textContent === "0 / 12", null, { timeout: 10000 });
check("level 1 cleared, level 2's text is in place (t02 = 12 chars)",
  (await a.locator("#hint").innerText()).includes("2/10") && (await a.locator("#statChars").innerText()) === "0 / 12",
  (await a.locator("#hint").innerText()) + " | " + (await a.locator("#statChars").innerText()));
check("the one who moved on sees only themselves",
  JSON.stringify(await chips(a)) === JSON.stringify(["Ada"]), JSON.stringify(await chips(a)));
check("the one still on level 1 does not see them",
  JSON.stringify(await chips(b)) === JSON.stringify(["Bo"]), JSON.stringify(await chips(b)));

/* 两个人都把剩下 9 关打完（A 已经过了第 1 关，B 一关都还没打完） */
try {
  await runCourse(b, 10);
  await runCourse(a, 9);
} catch (e) {
  for (const [n, p] of [["A", a], ["B", b]]) {
    console.log(n, await p.evaluate(() => ({
      hint: document.getElementById("hint").innerText,
      chars: document.getElementById("statChars").textContent,
      clock: document.getElementById("clock").innerText,
      text: [...document.querySelectorAll("#code .ch")].map((s) => (s.classList.contains("nl") ? "\n" : s.textContent)).join("").slice(0, 40),
      cur: [...document.querySelectorAll("#code .ch")].findIndex((s) => s.classList.contains("cur")),
      ok: document.querySelectorAll("#code .ch.ok").length,
      errs: document.querySelectorAll("#code .ch.bad").length,
    })));
  }
  throw e;
}
await a.waitForTimeout(1500);

const aCard = await a.locator(".celebrate-card").innerText();
const bCard = await b.locator(".celebrate-card").innerText();
check("both finish the whole course on the deployed build",
  aCard.length > 0 && bCard.length > 0, aCard.replace(/\n/g, " | ") || "(no card)");
check("the winner's card names the place and the whole course",
  /#1 of 2/.test(aCard) && /All 10 levels/.test(aCard), aCard.replace(/\n/g, " | "));
check("the runner-up is #2", /#2 of 2/.test(bCard), bCard.replace(/\n/g, " | "));

const ra = (await a.evaluate(() => window.__results)).pop();
check("the race result carries the course fields",
  ra && ra.mode === "race" && ra.levels === 10 && ra.reached === 10 && ra.place === 1 && ra.chars === 265 && ra.room === room,
  JSON.stringify({ levels: ra && ra.levels, reached: ra && ra.reached, chars: ra && ra.chars, place: ra && ra.place }));

check("no page errors", errs.length === 0, errs.slice(0, 4).join(" ; "));
await browser.close();
let failed = 0;
for (const [n, ok, d] of checks) { if (!ok) failed++; console.log((ok ? "ok    " : "FAIL  ") + n + (d && !ok ? " | " + d : "")); }
console.log(`\ndeployed: ${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
