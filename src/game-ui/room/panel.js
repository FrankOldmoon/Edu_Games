/* 房间（多人）那套界面：房间条 + 大堂 + 同关头像塔。和"玩的是什么游戏"无关。

   语义是固定的"各自一局"：
     · 点"开始"只开自己那一局，不影响房间里的任何人
     · 从第 1 关起步，打完一关自己进下一关
     · 塔上只画和你**同一关**的人 —— 别人打的是另一段内容，比位置没有意义

   各游戏要给的就三样：三个宿主元素（房间条 / 大堂 / 头像塔，布局留在各自的
   index.html 和 style.css 里）、一个"这一关的目标数"函数、几个回调。 */

const MIN_LANES = 3;          /* 至少画三条泳道：小班永远是三条，和以前一样 */
const TOWER_PITCH = 46;       /* 一个"头像+名字"大约占多高（px），用来算一条泳道站得下几个 */
const NAME_MAX = 16;

/* 头像不进 schema：sessionId 一样，各客户端算出来的就一样，零资源、不会不同步 */
const AVATARS = ["🦊", "🐼", "🐸", "🐙", "🦉", "🐧", "🐝", "🐢", "🦄", "🐳", "🦋", "🐰"];

function defaultAvatar(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

/* 名字：控制字符剔掉（要能安全地画出来），压缩空白，限长 */
function cleanNameInput(v) {
  return String(v === undefined || v === null ? "" : v)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX);
}

function make(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function createRoomPanel(opts) {
  const t = opts.t;
  const denomFor = opts.denomFor || function () { return 1; };
  const labelFor = opts.startLabel || function () { return ""; };
  const avatarFor = opts.avatarFor || defaultAvatar;
  const nameDefault = opts.nameDefault || function () { return "Player"; };
  /* 名字是链接里带的（?username=Ada）就不能改：老师发的是"你以 Ada 的身份进来"，
     不是"你来当我"。这时候输入框只用来显示。 */
  const nameFixed = !!opts.nameFixed;

  let code = "";

  /* ------------------------------ 房间条 ------------------------------ */

  const codeEl = make("span", "roomcode");
  const metaEl = make("span", "roommeta");
  const inviteBtn = make("button", "btn");
  inviteBtn.type = "button";
  const leaveBtn = make("button", "btn ghost");
  leaveBtn.type = "button";
  opts.bar.append(codeEl, metaEl, make("span", "spacer"), inviteBtn, leaveBtn);

  /* ------------------------------- 大堂 ------------------------------- */

  const startAtEl = make("span", "lbl");
  const startBtn = make("button", "btn primary");
  startBtn.type = "button";

  const nameLbl = make("label", "lbl");
  nameLbl.setAttribute("for", "roomName");
  const nameEl = make("input");
  nameEl.id = "roomName";
  nameEl.type = "text";
  nameEl.maxLength = NAME_MAX;
  nameEl.autocomplete = "off";
  nameEl.spellcheck = false;
  if (nameFixed) {
    nameEl.readOnly = true;
    nameEl.classList.add("is-fixed");
  }

  const rosterEl = make("div", "roster");

  const rowStart = make("div", "lobbyrow");
  rowStart.append(startAtEl, startBtn);
  const rowName = make("div", "lobbyrow");
  rowName.append(nameLbl, nameEl);
  opts.lobby.append(rowStart, rowName, rosterEl);

  /* ------------------------------ 头像塔 ------------------------------ */

  const lanesEl = make("div", "lanes");
  const chipsEl = make("div", "chips");
  /* .strip 是整条可滑动的泳道带；.tower-scroll 是那一格窗口，人多时左右滑 */
  const stripEl = make("div", "strip");
  stripEl.append(lanesEl, chipsEl);
  const scrollEl = make("div", "tower-scroll");
  scrollEl.appendChild(stripEl);
  const railtopEl = make("div", "railtop");
  opts.tower.append(scrollEl, railtopEl);
  let lanesMade = 0;            /* 已经画了几条泳道，变了才重建 */

  /* 谁在塔上：sessionId -> 外面那层 .slot（只负责"站在多高"） */
  const chips = new Map();

  /* ------------------------------- 交互 ------------------------------- */

  /* 复制邀请链接。教室里的站点多半是 http://，那种情况下 navigator.clipboard
     根本不存在，所以还要兜一层 execCommand；两层都不行才弹 prompt 让人自己选中。 */
  function copyInvite() {
    const text = opts.inviteUrl ? opts.inviteUrl() : location.href;
    const flash = function () {
      inviteBtn.textContent = t("room.invited");
      setTimeout(function () { inviteBtn.textContent = t("room.invite"); }, 1600);
    };
    const legacy = function () {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "readonly");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      if (ok) flash();
      else window.prompt(t("room.invite"), text);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(flash, legacy);
    } else {
      legacy();
    }
  }

  startBtn.addEventListener("click", function () {
    if (opts.onStart) opts.onStart();
    /* 刚点过的按钮还拿着焦点，接着敲 Enter / Space 会把它再按一次 */
    startBtn.blur();
  });
  leaveBtn.addEventListener("click", function () { if (opts.onLeave) opts.onLeave(); });
  inviteBtn.addEventListener("click", copyInvite);
  nameEl.addEventListener("change", function () {
    if (nameFixed) { nameEl.value = nameDefault(); return; }
    const v = cleanNameInput(nameEl.value);
    if (!v) { nameEl.value = nameDefault(); return; }
    nameEl.value = v;
    if (opts.onName) opts.onName(v);
  });

  /* ------------------------------- 绘制 ------------------------------- */

  function paintBar(state, me) {
    codeEl.textContent = t("room.label", { code: code });

    const playing = !!(me && me.playing);
    if (!playing) {
      metaEl.textContent = t("room.people", { n: state.players.size });
      return;
    }

    /* 塔上只画同关的人，所以"同关几个"得写出来，否则塔上只剩自己会莫名其妙 */
    let here = 0;
    state.players.forEach(function (p) {
      if (p.playing && p.level === me.level) here += 1;
    });
    metaEl.textContent = t("room.meta", {
      level: me.level + 1,
      levels: Math.max(1, state.levelIds.length),
      here: here,
      room: state.players.size,
    });
  }

  /* 大堂里的人：谁开始了就写他在第几关 —— "互相看得见进度"最直接的那一面 */
  function paintRoster(state, sessionId) {
    rosterEl.innerHTML = "";
    state.players.forEach(function (p, id) {
      const c = make("span", "rc" + (id === sessionId ? " me" : ""));
      c.textContent = avatarFor(id) + " " + p.name + (id === sessionId ? " " + t("room.you") : "");
      c.title = p.playing ? t("room.onLevel", { n: p.level + 1 }) : t("room.notStarted");
      rosterEl.appendChild(c);
    });
  }

  /* 头像塔：只画和我同一关、而且已经开始的人。
     横向 = 名次：爬得高的在最左边，往右依次是靠后的 —— 超过了谁，就往左挪一条。
     纵向 = 他在这一关打完的比例。
     人多就自动加泳道（按这一格的高度算一条站得下几个），加出来的宽度靠左右滑看。
     同一条泳道里间距不够就把上面的往上顶，保证一个都不叠。 */
  function paintTower(state, sessionId, me) {
    if (!me || !me.playing) {
      chips.forEach(function (c) { c.remove(); });
      chips.clear();
      return;
    }

    const my = me.level;
    const total = Math.max(1, denomFor(my));
    const lastIdx = Math.max(0, state.levelIds.length - 1);
    const list = [];
    state.players.forEach(function (p, id) {
      if (!p.playing || p.level !== my) return;      /* 别的关卡的人不在这张图上 */
      const denom = denomFor(p.level);
      list.push({
        id: id,
        name: p.name,
        ratio: Math.max(0, Math.min(1, p.pos / total)),
        /* 最后一关也打满了 = 整个题库都打完了，钉在顶上变金色 */
        finished: p.level === lastIdx && p.pos >= denom,
        me: id === sessionId,
      });
    });

    /* 名次：进度高的在前。同分按名字、再按 id —— 图个稳定，
       不然两个人并排的时候，每次重画都会互换位置（看着像在抖） */
    list.sort(function (a, b) {
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.name !== b.name) return a.name < b.name ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });

    const W = scrollEl.clientWidth || 0;                 /* 看得见的那一格有多宽 */
    const H = chipsEl.clientHeight || 0;                 /* 纵向可用高度 */
    const cap = H > 0 ? Math.max(1, Math.floor(H / TOWER_PITCH)) : 4;
    const lanes = Math.max(MIN_LANES, Math.ceil(list.length / cap));
    const per = Math.max(1, Math.ceil(list.length / lanes));
    /* 三条以内撑满这一格；再多的泳道就按原来每条多宽往右长，超出的靠左右滑 */
    const laneW = Math.max(56, W / Math.min(lanes, MIN_LANES));

    stripEl.style.setProperty("--lanes", String(lanes));
    stripEl.style.setProperty("--lanew", laneW.toFixed(1) + "px");
    if (lanes !== lanesMade) {
      lanesEl.innerHTML = "";
      for (let i = 0; i < lanes; i++) lanesEl.appendChild(make("div", "lane"));
      lanesMade = lanes;
    }

    /* 同一条泳道里两个头像的最小间距（换成 0~1 的比例）：
       不够就往上顶，顶到碰天花板再整体下压 —— 所以一条泳道里再多也看得见 */
    const GAP = H > 0 ? TOWER_PITCH / H : 0.17;
    const byLane = {};
    list.forEach(function (p, i) {
      p.lane = Math.min(lanes - 1, Math.floor(i / per));
      if (!byLane[p.lane]) byLane[p.lane] = [];
      byLane[p.lane].push(p);
    });
    Object.keys(byLane).forEach(function (k) {
      const arr = byLane[k].sort(function (a, b) { return a.ratio - b.ratio; });
      let prev = null;
      arr.forEach(function (p) {
        let y = p.ratio;
        if (prev !== null && y - prev < GAP) y = prev + GAP;
        p.bottom = y;
        prev = y;
      });
      const top = arr.length ? arr[arr.length - 1].bottom : 0;
      if (top > 1) {
        const shift = top - 1;
        arr.forEach(function (p) { p.bottom = Math.max(0, p.bottom - shift); });
      }
    });

    const alive = {};
    list.forEach(function (p) {
      alive[p.id] = true;
      let slot = chips.get(p.id);
      const fresh = !slot;
      if (fresh) {
        /* 外面这层只负责"站哪条泳道、站多高"，好让 left/bottom 都是干净的百分比、
           过渡能动；头像和名字在里面，用 translateY(50%) 把自己的中心对到那条线上。 */
        slot = make("div", "slot");
        const c = make("div", "chip");
        c.append(make("span", "av"), make("span", "nm"));
        slot.appendChild(c);
      }
      const chip = slot.firstElementChild;
      /* 新来的先把位置写好再进 DOM，免得它从最左边飘过来 */
      slot.style.setProperty("--lane", String(p.lane));
      slot.style.bottom = (p.bottom * 100).toFixed(1) + "%";
      chip.classList.toggle("me", p.me);
      chip.classList.toggle("done", p.finished);
      chip.querySelector(".av").textContent = avatarFor(p.id);
      chip.querySelector(".nm").textContent = p.name;
      chip.title = p.name + (p.finished ? " · " + t("room.finishedAll") : "");
      if (fresh) {
        chipsEl.appendChild(slot);
        chips.set(p.id, slot);
      }
    });
    chips.forEach(function (slot, id) {
      if (!alive[id]) {
        slot.remove();
        chips.delete(id);
      }
    });
  }

  /* 把静态文案按当前语言刷一遍（语言切换时用） */
  function relocalize() {
    inviteBtn.textContent = t("room.invite");
    leaveBtn.textContent = t("room.leave");
    nameLbl.textContent = t("room.yourName");
    if (nameFixed) nameEl.title = t("room.nameFromLink");
    startBtn.textContent = t("room.start");
    railtopEl.textContent = t("room.finishLine");
  }

  relocalize();
  nameEl.value = nameDefault();

  return {
    /* 房号是给人看的那个（?room= 里的），不是服务器内部的 roomId */
    setCode: function (c) { code = c; },

    /* 名字输入框里的值（改完名字要让调用方知道） */
    name: function () { return nameEl.value; },
    setName: function (v) { nameEl.value = v; },

    relocalize: relocalize,

    /* 每次 state 变化都调一次：谁在、谁在第几关、塔上画谁 */
    render: function (state, sessionId) {
      const me = state.players.get(sessionId);
      const playing = !!(me && me.playing);
      opts.lobby.hidden = playing;
      if (!playing) startAtEl.textContent = labelFor(state, me);
      paintBar(state, me);
      paintRoster(state, sessionId);
      paintTower(state, sessionId, me);
    },

    /* 整间房散伙时把塔清干净 */
    clear: function () {
      chips.forEach(function (c) { c.remove(); });
      chips.clear();
    },
  };
}
