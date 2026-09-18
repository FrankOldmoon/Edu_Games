/* 每关倒计时。所有游戏共用，和 spot-the-difference 的那套行为一致：
   读数是绿色胶囊，剩不到 10 秒变红 + 心跳，被扣时间时闪一下，
   归零就回调 onExpire（各游戏自己去显示「时间到」和重试）。

   样式在 base.css 的 .clock / .clock.low / .clock.hit。 */

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

export function createCountdown(opts) {
  const o = opts || {};
  const el = o.el;
  const lowMs = o.lowMs === undefined ? 10000 : o.lowMs;
  const label = o.label || function (msLeft) { return formatClock(msLeft); };
  const onExpire = o.onExpire || function () {};
  const onTick = o.onTick;

  let endsAt = 0;
  let totalMs = 0;
  let tickId = null;
  let expired = false;
  let running = false;

  function paint(msLeft) {
    const left = Math.max(0, msLeft === undefined ? endsAt - Date.now() : msLeft);
    if (el) {
      el.textContent = label(left);
      el.classList.toggle("low", left <= lowMs && left > 0);
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

  /* 扣时间：闪一下胶囊，扣完清零就直接算超时 */
  function penalize(ms) {
    if (expired) return 0;
    endsAt -= ms;
    if (el) {
      el.classList.remove("hit");
      void el.offsetWidth;      /* 强制回流，否则动画不会重放 */
      el.classList.add("hit");
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
    leftMs: function () { return Math.max(0, endsAt - Date.now()); },
    leftSeconds: function () { return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)); },
    totalMs: function () { return totalMs; },
    hasExpired: function () { return expired; },
    isRunning: function () { return running; },
  };
}
