/* 关卡进度 + 共用 URL 参数 + 关卡库加载。新游戏共用。

   URL 参数（语义与两个老游戏一致）：
     lang=en|zh-CN   ?lang= 由 i18n 运行时处理
     level=<n>       从第 n 关开始（从 1 开始）
     id=<关卡 id>    从指定 id 的关卡开始
     unlock=1 / all=1 全部解锁（老师演示用）
     embed=1         跳过关卡列表，直接开玩
     json=<url>      换一个关卡库

   进度存在 localStorage["<gameId>.progress.v1"]，是已通关关卡 id 的数组。 */

export function params() {
  let q;
  try {
    q = new URLSearchParams(location.search);
  } catch (e) {
    q = new URLSearchParams("");
  }
  const flag = function (k) { return q.get(k) === "1"; };
  return {
    level: q.get("level"),
    id: q.get("id"),
    unlock: flag("unlock") || flag("all"),
    embed: flag("embed"),
    json: q.get("json"),
  };
}

export function createProgress(gameId, levelIds) {
  const KEY = gameId + ".progress.v1";
  const unlockAll = params().unlock;
  let done = load();

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(raw) ? raw.filter(function (x) { return typeof x === "string"; }) : [];
    } catch (e) {
      return [];
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(done)); } catch (e) { /* private mode */ }
  }

  return {
    ids: levelIds,

    has: function (id) { return done.indexOf(id) >= 0; },

    count: function () {
      return done.filter(function (id) { return levelIds.indexOf(id) >= 0; }).length;
    },

    ratio: function () {
      return levelIds.length ? this.count() / levelIds.length : 0;
    },

    /* 顺序解锁：第一关永远开着，之后只认上一关通关 */
    isUnlocked: function (i) {
      if (unlockAll) return true;
      if (i <= 0) return true;
      return this.has(levelIds[i - 1]);
    },

    /* 返回 true 表示这次是第一次通关（用来决定要不要弹通关卡） */
    mark: function (id) {
      if (done.indexOf(id) >= 0) return false;
      done.push(id);
      save();
      return true;
    },

    reset: function () {
      done = [];
      save();
    },
  };
}

/* 从 URL 参数算出该从第几关开始；没有指定就返回 -1（显示关卡列表） */
export function startIndex(levels) {
  const p = params();
  if (p.id) {
    for (let i = 0; i < levels.length; i++) if (levels[i].id === p.id) return i;
  }
  if (p.level) {
    const n = parseInt(p.level, 10);
    if (n >= 1 && n <= levels.length) return n - 1;
  }
  return -1;
}

/* 加载关卡库；?json= 可以指向任意 URL（老师自己托管一份就行） */
export async function loadBank(defaultUrl) {
  const url = params().json || defaultUrl;
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error("HTTP " + res.status + " — " + url);
  const data = await res.json();
  const levels = Array.isArray(data) ? data : data && data.levels;
  if (!Array.isArray(levels) || !levels.length) throw new Error("no levels in " + url);
  return levels;
}

/* 回传通关结果给宿主页（embed 用）。契约见 docs/game-template.md */
export function reportResult(gameId, payload) {
  const msg = Object.assign({ type: "game_result", game: gameId }, payload);
  try {
    if (window.parent && window.parent !== window) window.parent.postMessage(msg, "*");
  } catch (e) { /* 跨域就只发本地事件 */ }
  try {
    window.dispatchEvent(new CustomEvent(gameId + ":result", { detail: msg }));
  } catch (e) { /* ignore */ }
  return msg;
}
