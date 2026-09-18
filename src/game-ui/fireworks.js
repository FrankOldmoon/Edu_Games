/* 通关烟花：一块铺满视口的 canvas，零依赖。所有游戏共用。

   自己算抛体：火箭从底部升起带一条尾迹，到顶炸开，火花受重力 + 阻尼，
   一边飞一边变暗变细。画的时候用 destination-out 低透明度擦掉上一帧做拖尾、
   用 lighter 叠加发光，所以 canvas 本身始终透明，底下的页面照旧看得见。
   放完自动收摊；系统开了"减少动态效果"就干脆不放。

   注意 z-index：canvas 在 .celebrate 遮罩下面（见 base.css 的 .fx-canvas），
   所以火花会从庆祝卡片背后飞出来，不会糊住卡片上的字。

   一般不用直接调它 —— celebrate() 会自动放一轮烟花，
   只有想自己控制时机（或想放不止一轮）时才 import。 */

const HUES = [45, 320, 190, 265, 140, 18, 350, 210];

/* 火箭重力（px/帧²）。初速不写死，由目标高度反推，这样炸点才落得准。 */
const ROCKET_G = 0.16;
const LAUNCH_WINDOW_MS = 1200;

let current = null;

export function prefersReduced() {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function launchFireworks(options) {
  if (prefersReduced() || typeof document === "undefined") return null;
  if (current) current.stop();                 // 上一轮还没放完就别叠着放

  const opt = options || {};
  const shellCount = opt.shells || 8;
  const spread = opt.spread === undefined ? 1 : opt.spread;   // 0..1，越小越集中
  const baseHue = opt.hue === undefined
    ? HUES[Math.floor(Math.random() * HUES.length)]
    : opt.hue;

  const canvas = document.createElement("canvas");
  canvas.className = "fx-canvas";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const rockets = [];
  const sparks = [];
  const rnd = (a, b) => a + Math.random() * (b - a);

  let w = 0;
  let h = 0;
  let raf = 0;
  let last = 0;
  let elapsed = 0;
  let fired = 0;
  let idle = 0;
  let stopped = false;

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit();
  window.addEventListener("resize", fit);

  function boom(x, y, hue) {
    const n = Math.round(rnd(46, 72));
    const power = rnd(2.5, 4.5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.07, 0.07);
      const s = power * rnd(0.42, 1.16);
      sparks.push({
        x: x, y: y, px: x, py: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        hue: hue + rnd(-16, 16),
        size: rnd(1.4, 3.0),
        life: rnd(0.85, 1.7),
        age: 0,
      });
    }
    /* 炸点自己闪一下，爆开那瞬间更亮 */
    sparks.push({
      x: x, y: y, px: x, py: y, vx: 0, vy: 0,
      hue: hue, size: 11, life: 0.2, age: 0, flash: true,
    });
  }

  function launch(i) {
    const off = (i % 2 ? 1 : -1) * rnd(0.08, 0.34) * spread;
    const from = h + 8;
    const targetY = h * rnd(0.14, 0.40);
    rockets.push({
      x: Math.max(w * 0.08, Math.min(w * 0.92, w * (0.5 + off))),
      y: from,
      /* 反推初速：让它正好在 targetY 处把速度用完，那里就是炸点。
         写死初速的话会"还没升到一半就没劲了"，烟花全炸在屏幕下缘。 */
      vy: -Math.sqrt(2 * ROCKET_G * Math.max(60, from - targetY)),
      targetY: targetY,
      hue: baseHue + i * 41,
    });
  }

  function step(dt) {
    /* 淡出上一帧 → 拖尾；再切成叠加模式画火花 → 发光 */
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.17)";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      const from = r.y;
      r.y += r.vy * dt;
      r.vy += ROCKET_G * dt;
      if (r.y <= r.targetY || r.vy >= 0) {
        rockets.splice(i, 1);
        boom(r.x, r.y, r.hue);
        continue;
      }
      ctx.strokeStyle = "hsla(" + r.hue + ", 95%, 74%, .95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r.x, from);
      ctx.lineTo(r.x, r.y);
      ctx.stroke();
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dt / 60;
      if (s.age >= s.life) { sparks.splice(i, 1); continue; }

      const px = s.x;
      const py = s.y;
      s.vx *= Math.pow(0.982, dt);
      s.vy = s.vy * Math.pow(0.982, dt) + 0.045 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      const k = 1 - s.age / s.life;                 // 1 → 0
      const alpha = (s.flash ? 0.5 : 0.92) * k;

      /* 外圈柔光 + 亮芯，比单个圆点更像火花 */
      if (!s.flash) {
        ctx.fillStyle = "hsla(" + s.hue + ", 100%, 80%, " + (0.2 * k) + ")";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * 2 * k + 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "hsla(" + s.hue + ", 100%, " + (56 + 28 * k) + "%, " + alpha + ")";
      ctx.lineWidth = Math.max(1, (s.flash ? 9 : s.size) * k);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "source-over";
  }

  function frame(now) {
    if (stopped) return;
    if (!last) last = now;
    const dt = Math.min(2.5, (now - last) / 16.6667);
    last = now;
    elapsed += dt * 16.6667;

    if (fired < shellCount && elapsed >= fired * (LAUNCH_WINDOW_MS / shellCount)) {
      launch(fired);
      fired += 1;
    }

    step(dt);

    if (fired >= shellCount && !rockets.length && !sparks.length) {
      /* 都放完了，再多擦几帧把残影收干净再收摊 */
      idle += 1;
      if (idle > 12) { stop(); return; }
    } else {
      idle = 0;
    }
    if (elapsed > 9000) { stop(); return; }

    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("resize", fit);
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    if (current === handle) current = null;
  }

  const handle = { stop: stop };
  current = handle;
  raf = requestAnimationFrame(frame);
  return handle;
}
