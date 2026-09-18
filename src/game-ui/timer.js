/* 每关倒计时。所有游戏共用，和 spot-the-difference 的那套完全一致：
   - 数字读数（.clock 胶囊）：绿色，剩不到 10 秒变红 + 心跳，被扣时间时闪一下
   - slider 进度条（.timebar）：把剩余时间再用一条会缩的滑块摆一次，
     传 bar: 一个容器元素就行，填充条和滑块由这里建、由这里驱动
   样式在 base.css 的 .clock / .timebar 系列。 */

/* 0:42 —— 语言无关，所以读秒不需要进语言包 */
export function formatClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
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

/* 进度条：容器里塞一条 track>fill 和一个 thumb。
   结构照抄 spot-the-difference 的 .timebar，所以那边的样式能直接用。 */
function buildBar(host) {
  host.classList.add("timebar");
  const track = document.createElement("div");
  track.className = "track";
  const fill = document.createElement("div");
  fill.className = "fill";
  track.appendChild(fill);
  const thumb = document.createElement("div");
  thumb.className = "thumb";
  host.append(track, thumb);
  return { host: host, fill: fill, thumb: thumb };
}

export function createCountdown(opts) {
  const o = opts || {};
  const el = o.el;
  const lowMs = o.lowMs === undefined ? 10000 : o.lowMs;
  const label = o.label || function (msLeft) { return formatClock(msLeft); };
  const onExpire = o.onExpire || function () {};
  const onTick = o.onTick;
  const bar = o.bar ? buildBar(o.bar) : null;

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
    if (bar) {
      const pct = totalMs > 0 ? Math.max(0, Math.min(1, left / totalMs)) * 100 : 0;
      bar.fill.style.width = pct + "%";
      bar.thumb.style.left = pct + "%";
      bar.host.classList.toggle("low", low);
    }
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
    if (bar) {
      bar.host.classList.remove("hit");
      void bar.host.offsetWidth;
      bar.host.classList.add("hit");
    }
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
