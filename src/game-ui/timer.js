/* 每关的计时器。所有游戏共用：
   - 倒计时（createCountdown）：有上限、剩不到 10 秒变红、可以扣时间
   - 正计时（createStopwatch）：只往上走、没有上限（打字这类"比总用时"的游戏）
   两者用的是同一个 .clock 胶囊和同一条 .timebar 滑块，所以看上去是一套东西。
   样式在 base.css 的 .clock / .timebar 系列。 */

/* 0:42 —— 语言无关，所以读秒不需要进语言包 */
export function formatClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

/* 正计时用这个：往下取整，秒表在 0.9 秒时显示 0:00 而不是 0:01 */
export function formatElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

/* 把关卡库里的 timer: {base, per} 换算成毫秒。
   unit 是这个游戏自己的单位（不同点数量 / 对数 / 行数 / 步数上限…），
   所以规则能写在数据里、老师也能改。 */
export function limitMs(level, unit, fallbackBase, fallbackPer) {
  const spec = (level && level.timer) || {};
  const base = typeof spec.base === "number" ? spec.base : fallbackBase;
  const per = typeof spec.per === "number" ? spec.per : fallbackPer;
  return Math.max(5, base + per * unit) * 1000;
}

/* 滑块：容器里塞一条 track>fill 和一个 thumb。
   结构只有这一份 —— 倒计时拿它表示"还剩多少"，正计时 / 多人竞速拿它表示
   "完成了多少"，都只是把一个 0..1 的比例喂给 set()。 */
export function createBar(host) {
  host.classList.add("timebar");
  const track = document.createElement("div");
  track.className = "track";
  const fill = document.createElement("div");
  fill.className = "fill";
  track.appendChild(fill);
  const thumb = document.createElement("div");
  thumb.className = "thumb";
  host.append(track, thumb);

  return {
    host: host,
    fill: fill,
    thumb: thumb,
    set: function (ratio, low) {
      const pct = Math.max(0, Math.min(1, ratio || 0)) * 100;
      fill.style.width = pct + "%";
      thumb.style.left = pct + "%";
      host.classList.toggle("low", !!low);
    },
    /* 被扣一下：闪一次 */
    hit: function () {
      host.classList.remove("hit");
      void host.offsetWidth;      /* 强制回流，否则动画不会重放 */
      host.classList.add("hit");
    },
  };
}

export function createCountdown(opts) {
  const o = opts || {};
  const el = o.el;
  const lowMs = o.lowMs === undefined ? 10000 : o.lowMs;
  const label = o.label || function (msLeft) { return formatClock(msLeft); };
  const onExpire = o.onExpire || function () {};
  const onTick = o.onTick;
  const bar = o.bar ? createBar(o.bar) : null;

  let endsAt = 0;
  let totalMs = 0;
  let tickId = null;
  let expired = false;
  let running = false;

  function paint(msLeft) {
    const left = Math.max(0, msLeft === undefined ? endsAt - Date.now() : msLeft);
    /* low 要包含 0：归零那一刻还得是红的，不能变回绿色 */
    const low = left <= lowMs;
    if (el) {
      el.textContent = label(left);
      el.classList.toggle("low", low);
    }
    if (bar) bar.set(totalMs > 0 ? left / totalMs : 0, low);
    return left;
  }

  function expire() {
    expired = true;
    stop();
    paint(0);
    onExpire();
  }

  function tick() {
    if (!running) return;
    const left = paint();
    if (onTick) onTick(left);
    if (left <= 0 && !expired) expire();
  }

  function start(ms) {
    stop();
    expired = false;
    running = true;
    totalMs = ms;
    endsAt = Date.now() + ms;
    paint(ms);
    tickId = setInterval(tick, 100);
  }

  function stop() {
    running = false;
    if (tickId) {
      clearInterval(tickId);
      tickId = null;
    }
  }

  /* 扣时间：胶囊和进度条各闪一下，扣完清零就直接算超时 */
  function penalize(ms) {
    if (expired) return 0;
    endsAt -= ms;
    if (el) {
      el.classList.remove("hit");
      void el.offsetWidth;      /* 强制回流，否则动画不会重放 */
      el.classList.add("hit");
    }
    if (bar) bar.hit();
    const left = paint();
    if (left <= 0) {
      expire();
      return 0;
    }
    return left;
  }

  return {
    start: start,
    stop: stop,
    penalize: penalize,
    paint: paint,
    bar: bar,
    leftMs: function () { return Math.max(0, endsAt - Date.now()); },
    leftSeconds: function () { return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)); },
    totalMs: function () { return totalMs; },
    hasExpired: function () { return expired; },
    isRunning: function () { return running; },
  };
}

/* 正计时：只会往上走的秒表。没有上限，所以没有 low / 扣时那两套状态，
   也就没有 expire 回调 —— 什么时候停由调用方决定（打完、或房间开赛）。
   start(ms) 可以从一个已有的偏移起步（多人竞速里补一个已经跑掉的时长）。 */
export function createStopwatch(opts) {
  const o = opts || {};
  const el = o.el;
  const label = o.label || function (ms) { return formatElapsed(ms); };
  const onTick = o.onTick;

  let startedAt = 0;
  let base = 0;
  let tickId = null;
  let running = false;

  function elapsed() {
    return base + (running ? Date.now() - startedAt : 0);
  }

  function paint() {
    if (el) el.textContent = label(elapsed());
    return elapsed();
  }

  function tick() {
    const ms = paint();
    if (onTick) onTick(ms);
  }

  function start(ms) {
    stop();
    base = typeof ms === "number" ? ms : 0;
    startedAt = Date.now();
    running = true;
    paint();
    tickId = setInterval(tick, 100);
  }

  function stop() {
    base = elapsed();        /* 停下来时把跑过的时长固化进 base */
    running = false;
    if (tickId) {
      clearInterval(tickId);
      tickId = null;
    }
  }

  return {
    start: start,
    stop: stop,
    paint: paint,
    elapsedMs: elapsed,
    elapsedSeconds: function () { return Math.floor(elapsed() / 1000); },
    isRunning: function () { return running; },
  };
}
