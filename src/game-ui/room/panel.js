/* 房间（多人）那套界面：房间条 + 大堂 + 同关头像塔。和"玩的是什么游戏"无关。

   语义是固定的"各自一局"：
     · 点"开始"只开自己那一局，不影响房间里的任何人
     · 从第 1 关起步，打完一关自己进下一关
     · 塔上只画和你**同一关**的人 —— 别人打的是另一段内容，比位置没有意义

   各游戏要给的就三样：三个宿主元素（房间条 / 大堂 / 头像塔，布局留在各自的
   index.html 和 style.css 里）、一个"这一关的目标数"函数、几个回调。 */

const LANES = 3;              /* 泳道数，人多了就往同一条里叠（会往上抬一点错开） */
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

  const rosterEl = make("div", "roster");

  const rowStart = make("div", "lobbyrow");
  rowStart.append(startAtEl, startBtn);
  const rowName = make("div", "lobbyrow");
  rowName.append(nameLbl, nameEl);
  opts.lobby.append(rowStart, rowName, rosterEl);

  /* ------------------------------ 头像塔 ------------------------------ */

  const lanesEl = make("div", "lanes");
  for (let i = 0; i < LANES; i++) lanesEl.appendChild(make("div", "lane"));
  const chipsEl = make("div", "chips");
  const railtopEl = make("div", "railtop");
  opts.tower.append(lanesEl, chipsEl, railtopEl);

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
     纵向位置 = 他在这一关打完的比例。同一泳道里挨得太近的往上抬一点，别叠成一团。 */
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
    let i = 0;
    state.players.forEach(function (p, id) {
      if (!p.playing || p.level !== my) return;      /* 别的关卡的人不在这张图上 */
      list.push({
        id: id,
        name: p.name,
        ratio: Math.max(0, Math.min(1, p.pos / total)),
        /* 最后一关也打满了 = 整个题库都打完了，钉在顶上变金色 */
        finished: p.level === lastIdx && p.pos >= denomFor(p.level),
        me: id === sessionId,
        lane: i % LANES,
      });
      i += 1;
    });

    const lanes = {};
    list.forEach(function (p) {
      if (!lanes[p.lane]) lanes[p.lane] = [];
      lanes[p.lane].push(p);
    });
    Object.keys(lanes).forEach(function (k) {
      const arr = lanes[k].sort(function (a, b) { return b.ratio - a.ratio; });
      let prev = null;
      let lift = 0;
      arr.forEach(function (p) {
        lift = prev !== null && prev - p.ratio < 0.07 ? Math.min(lift + 0.055, 0.165) : 0;
        p.bottom = Math.min(1, p.ratio + lift);
        prev = p.ratio;
      });
    });

    const alive = {};
    list.forEach(function (p) {
      alive[p.id] = true;
      let slot = chips.get(p.id);
      if (!slot) {
        /* 外面这层只负责"站在多高"，好让 bottom 是一个干净的百分比、过渡能动；
           头像和名字在里面，用 translateY(50%) 把自己的中心对到那条线上。 */
        slot = make("div", "slot");
        const chip = make("div", "chip");
        chip.append(make("span", "av"), make("span", "nm"));
        slot.appendChild(chip);
        chipsEl.appendChild(slot);
        chips.set(p.id, slot);
      }
      const chip = slot.firstElementChild;
      slot.style.setProperty("--lane", String(p.lane));
      slot.style.bottom = (p.bottom * 100).toFixed(1) + "%";
      chip.classList.toggle("me", p.me);
      chip.classList.toggle("done", p.finished);
      chip.querySelector(".av").textContent = avatarFor(p.id);
      chip.querySelector(".nm").textContent = p.name;
      chip.title = p.name + (p.finished ? " · " + t("room.finishedAll") : "");
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
