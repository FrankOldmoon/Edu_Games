# 新游戏模板

这个仓库真正的资产不是某几个游戏，而是「知识 → 关卡库 → 能直接嵌进课堂」的这套载体。
按下面的契约写，新游戏自动继承：双语、关卡库外链、顺序解锁、embed 回传、离线可用。

参考实现：`games/memory/`（最短，先看它）、`games/order/`、`games/robot/`。

## 目录

```
games/<id>/
├── index.html          唯一入口：关卡列表 + 游戏本体同页
├── levels.json         关卡库：只有结构，没有人类可读文案
├── capture.png         卡片墙缩略图
└── assets/
    ├── style.css       第一行 @import "../../../src/game-ui/base.css"
    ├── i18n.js         接上共享 i18n 运行时（固定写法，照抄）
    ├── game.js         游戏逻辑
    └── locales/
        ├── en.js       默认 + 兜底，键必须完整
        └── zh-CN.js
```

顶点两个位置要登记：`vite.config.js` 的 `rollupOptions.input`、`src/main.js` 的 `GAMES`。

想加**房间（多人）**就到第 9 节 —— 那是共用的一层（`server/` + `src/game-ui/room/`），
不用每个游戏各写一遍。

## 1. 入口与视图

一个 HTML 入口，`<body data-view="list">` / `data-view="game"` 切两个视图，不换页。
`show(view)` 只改 `body.dataset.view`，显示哪半边交给 `base.css` 的
`body[data-view] .list-only / .game-only` —— 不要再手动 toggle `hidden`。

**顶栏只有一条**，里面的元素按 `list-only` / `game-only` 各归各位，
这样两个视图和 `spot-the-difference` 的列表页 / 游戏页逐项对得上：

```html
<header class="bar">
  <button class="back game-only" id="btnToList" data-i18n="ui.toList">← Level list</button>
  <span class="brand list-only" data-i18n="ui.appTitle">…</span>
  <span class="lvname game-only" id="lvName"></span>
  <span class="progress list-only" id="progText"></span>
  <span class="spacer"></span>
  <span id="lang"></span>
  <span class="clock game-only" id="clock">0:00</span>
  <span class="counter game-only" id="counter"></span>
  <button class="btn list-only" id="btnReset" data-i18n="ui.reset">Reset progress</button>
  <button class="btn game-only" id="btnRetry" data-i18n="ui.retry">Retry</button>
  <!-- 本游戏特有的按钮接在最后 -->
</header>

<main>
  <section id="viewList" class="list-only">
    <p class="lead" id="lead"></p>
    <div class="levels" id="levels"></div>
    <div class="err" id="err" hidden></div>
  </section>
  <section id="viewGame" class="game-only">
    <p class="lead" id="tip"></p>
    <div class="timebar" id="timebar"></div>
    <!-- 本游戏特有的面板 -->
  </section>
</main>
```

列表视图 = 游戏名 + 进度 + 语言 + 重置；游戏视图 = 返回 + 关卡名 + 语言 + 计时 + 读数 + 操作。
顺序不要改，改了就不齐了。

`vite.config.js`：

```js
"<id>": resolve("games/<id>/index.html"),
```

`src/main.js`（缩略图用 `import`，Vite 才会把它发到 `dist/`）：

```js
import <id>Thumb from "../games/<id>/capture.png";
// GAMES 里加一条
{ name: "…", desc: "…", url: "./games/<id>/", thumb: <id>Thumb, tag: "HTML5" },
```

## 2. 关卡库 `levels.json`

只放**结构**和**与语言无关**的数据：代码、坐标、答案、步数上限、关卡 id。
**任何人类可读的文案都不进关卡库**——关卡名、提示、说明全部放语言包，按关卡 id 索引。
理由：文案要双语，关卡库要能被老师换成自己的；混在一起两件事都会变脏。

```json
{ "levels": [ { "id": "m01", "cols": 4, "pairs": ["int", "str"] } ] }
```

## 3. i18n

`assets/i18n.js` 固定写法：

```js
import { createI18n } from "../../../src/i18n/index.js";
import en from "./locales/en.js";
import zhCN from "./locales/zh-CN.js";

export const i18n = createI18n({ packs: { en: en, "zh-CN": zhCN } });
export const t = i18n.t;

export function mountSwitcher() {
  return i18n.mountSwitcher(document.getElementById("lang"));
}
```

- 静态文案：`data-i18n="ui.start"`（还有 `data-i18n-html` / `-title` / `-placeholder`）
- 动态文案：`t("ui.level", { n: 3 })`
- **两份语言包的键必须完全对齐**；`en` 是默认兼兜底，缺键会直接显示英文
- 切换语言要重画的地方挂 `i18n.onChange(render)`

## 4. 进度与 URL 参数

用 `src/game-ui/progress.js`，不要自己再写一遍：

```js
import { params, createProgress, startIndex, loadBank, reportResult } from "../../../src/game-ui/progress.js";

const levels = await loadBank(new URL("../levels.json", import.meta.url));
const prog = createProgress("<id>", levels.map(l => l.id));
```

共用参数，语义与两个老游戏一致：

| 参数 | 含义 |
| --- | --- |
| `lang=en\|zh-CN` | 语言（由 i18n 运行时接管） |
| `level=<n>` | 从第 n 关开始 |
| `id=<关卡 id>` | 从指定关卡开始 |
| `unlock=1` / `all=1` | 全部解锁（老师演示） |
| `embed=1` | 跳过列表直接开玩 |
| `json=<url>` | 换一个关卡库 |

## 5. embed 回传契约

每关结束（成功或失败）都回传一次：

```js
reportResult("<id>", {
  level: 3,                 // 第几关（从 1 开始）
  levelId: "m03",
  levelTitle: "Container types",
  correct: 4, total: 5,     // 本关的得分项
  rate: 0.8,                // 本关 0..1
  progress: 0.4,            // 整个游戏 0..1
  finished: false,          // 是不是最后一关
  locale: i18n.getLocale(),
});
```

内部会 `postMessage` 给 parent，并派发同名 DOM 事件 `<id>:result`。
宿主页示例见 `games/operator-sorter/html/embed-demo.html`。
（`operator-sorter` 早于这个契约，用的是 `correct_rate`，保持原样，不要混用。）

## 6. 样式

`assets/style.css` 第一行：

```css
@import "../../../src/game-ui/base.css";
```

基座提供主题变量（`--bg --panel --panel-2 --line --line-2 --text --dim --accent --green --red --gold --mono`）、
顶栏与按钮（`.bar .brand .back .spacer .readout .progress .lvname .counter .btn`）、
布局（`main` 的 1180px 居中 + `fadeIn`、`.lead .panel`、`body[data-view] .list-only / .game-only`）、
关卡卡片（`.levels / .lv` 三态 + `--i` 错开浮入）、倒计时、报错、通关卡。
游戏自己的 CSS 只写本游戏特有的部分，不要重写上面任何一条。

共享 JS：
- `src/game-ui/levels-ui.js` 的 `renderLevelList({host, levels, done, isOpen, hrefFor, onPick, labelNo, labelDone, labelStart, labelLocked})`
  —— **关卡列表只有这一种画法**，多页式传 `hrefFor` 出 `<a>`、单页式传 `onPick` 出 `<button>`，
  两者外观一致，`--i` 依次浮现的顺序也在里面。不要在游戏里再手写一遍卡片标记。
  关卡文案（`name` / `tip`）由调用方按语言包组装好再传进来。
- `src/game-ui/feedback.js` 的 `celebrate({title, lines, actionLabel, onAction, onDismiss})` —— 半透明通关卡，不会自动消失；
  默认会放一轮 **通关烟花**（`src/game-ui/fireworks.js` 的 `launchFireworks`），不要就传 `fireworks: false`。
  **烟花先放、卡片 3 秒后才弹**（卡片是模态的，一出来就把刚做完的那一盘盖住了）；这几秒里会铺一层透明的
  `.celebrate-blocker` 挡住底下的游戏，所以调用方不用自己防"刚赢下的手又点回面板上"。没有烟花可看时
  （传了 `fireworks: false`，或系统开了"减少动态效果"）卡片直接弹，不让人干等。`isCelebrating()`
  从调用那一刻就是 true —— 拿它挡输入是对的，别去看卡片在不在 DOM 里。
- `src/game-ui/timer.js` —— 计时器只有两种，别在游戏里再写第三种：
  - `createCountdown({el, bar, label, onTick, onExpire})` —— 每关**倒计时**，
    数字胶囊（`.clock`）和 slider 进度条（`.timebar`）都在里面；`bar:` 传一个空容器，填充条和滑块由它生成并驱动。
    配套 `limitMs(level, unit, base, per)` 把关卡库里的 `timer: {base, per}` 换算成毫秒
  - `createStopwatch({el, label, onTick})` —— **正计时**（只往上走、没有上限，`start(ms)` 能从已有偏移起步）。
    给"比总用时"的游戏用：`games/typing` 就是这一类
  - `createBar(host)` —— 那条滑块本身。倒计时拿它表示"还剩多少"，正计时拿它表示"完成了多少"，
    结构只有这一份，都只是喂一个 0..1 的比例
- `src/game-ui/progress.js` —— 参数、进度、关卡库加载、回传

## 7. 体验底线

- **关卡列表和其它 Python 游戏长得一模一样**：同样的 `main` 宽度、同样的顶栏、同样的卡片，
  卡片依次浮现（`--i` × 38ms）也是自动的 —— 一律走 `renderLevelList`，不要自己再画一套。
- **每关都有计时，而且是两份**：数字（`.clock` 胶囊）+ slider 进度条（`.timebar`，轨道 + 填充 + 圆钮），
  两个都交给 `createCountdown`，不在游戏里各写一遍。剩不到 10 秒两份一起变红，被扣时间一起闪。
  限时规则写进关卡库的 `timer: {base, per}`，`unit` 是这个游戏自己的单位（对数 / 行数 / 项数 / 步数上限），
  这样规则在数据里、老师能改。超时就把出问题的区域加上 `.failed`、给出重试，并把 `timedOut: true` 回传。
  **例外：比速度的游戏用正计时**（`createStopwatch` + `createBar`，见 `games/typing`）：
  没有上限就没有超时、没有 `.failed`、也没有 `timedOut`，滑块改成表示完成进度，
  关卡库里不用写 `timer`。两条路都行，但同一个游戏里不要混着来。
- 失败要给出**信息**（哪里错了、该看什么），不是只说「错了」；超时干脆把正确答案摆出来
- 键盘可达，`:focus-visible` 有描边；按钮就是 `<button>`
- `prefers-reduced-motion` 下关掉装饰动画（`base.css` 已兜一层）
- 每关都要有「重试」，卡住永远有出路

## 8. 两个容易踩的坑

- **给 `transform-style: preserve-3d` 的元素加 `opacity < 1`**：会把 3D 上下文拍平，
  `backface-visibility: hidden` 随之失效，翻牌卡片配对成功后反而显示背面（`memory` 踩过）。
  翻牌状态只用正面的颜色表达。
- **i18n 的点路径**：`t("levels.m06.defs.upper()")` 会被点号拆坏。
  按**数据键**取文案（键里可能有点号、括号）时，直接 `import` 语言包读属性，别走 `t()`。

## 9. 房间（多人，可选）

不是每个游戏都要，但要就只有**一套**：`typing`、`memory`、`robot`、`spot-the-difference`
共用同一层，第五个游戏接进来只需要写清楚"这个游戏的进度是什么"。

语义是固定的**各自一局**：点开始只开自己那一局、从第 1 关起步、过关自己进下一关；
房间只同步"谁在、他在第几关、这一关打了多少"。塔上**只画和你同一关的人** ——
别人打的是另一段内容，比位置没有意义。所以没有开赛时间、没有名次、没有"等其他人"。

**过一关要让外面那份关卡列表也解锁**：房间里的过关要顺手 `prog.mark(id)` / `markDone(...)`，
否则会出现"在房间里打到第 5 关，回列表还锁着"。

服务器（一个进程挂所有游戏的房间）：

- `server/roomkit.js` —— 房间号注册表（键是 `<游戏>/<房号>`）、名字清洗、防刷限流。和游戏无关。
- `server/schemas/progress.js` —— 通用的 `Player`（`name playing level pos connected`）
  和 `ProgressState`（`levelIds players`）。"一关一个进度数"的游戏直接用。
- `server/rooms/ProgressRoom.js` —— **服务器验不了的那些游戏**用这一个工厂：

  ```js
  makeProgressRoom({ game, bank, keep, goal })
  //   game 房间类型名（也是 roomId 前缀）
  //   bank 题库路径（相对 server/）
  //   keep 这一关要不要用（默认都要）
  //   goal 这一关的目标数 —— 塔上的分母，也是范围检查的上限
  ```

  它只管范围：关卡一关一关往前、进度不超过本关目标数；关卡由客户端推。因为**每条上报
  都带完整真相**，被限流丢掉一条下一条自己就修正回来了 —— 不需要"回推权威位置"。
- `server/rooms/TypingRoom.js` —— 唯一**能验**的房间：目标文本在服务器手上，逐字符比对、
  由服务器推进关卡。这种要手写。

客户端（`src/game-ui/room/`）：`net.js` 管 `?room=` / `?ws=` / `?username=` 和进房握手；
`panel.js` 生成房间条 / 大堂 / 同关头像塔；`locales/` 是共用文案，
由游戏的 `i18n.js` 用 `Object.assign({}, en, roomEn)` 并进 `room.*`。
游戏的 HTML 只留三个**空宿主**（`#roomBar` `#lobby` `#tower`，布局自己决定，外面套
`.arena > .mainpane + .tower`），样式在 `base.css` 里（`.roombar / .lobby / .roster / .tower`，
含那条把 `[hidden]` 钉死的规则）。

塔是按"一个班"画的，游戏里别自己去摆：泳道**按进度排序**（爬得高的在最左边），
一条泳道站得下几个由塔自己的高度算出来（`TOWER_PITCH`），人多了就往右加泳道，
超出那一格的部分靠左右滑（结构是 `.tower > .tower-scroll > .strip`，
宽度来自 `--lanes` × `--lanew` 两个 CSS 变量）。同一条泳道里间距不够就把上面的往上顶，
顶到天花板再整体下压 —— 所以再多的人也不会叠在一起。这些都在 `panel.js` 的 `paintTower`。

一间房默认 50 人（`MAX_CLIENTS` 环境变量可改）。到上限 Colyseus 会把房间锁上，
`net.js` 认得出这个 locked 并抛一个带 `full` 标记的错 —— 页面要照着说"房间满了、
换个房号"，别说成"连不上服务器"（学生真的会以为服务器坏了）。

两条必须知道的：

- **roomId 要带游戏前缀**（`<游戏>-<房号>`）：matchmaker 的房间表是按 roomId 全局唯一存的、
  没有查重，所以两个游戏的 py1 会互相顶掉。学生看到 / 输入 / 分享的仍然是 `py1`。
  两边同一规则：`server/roomkit.js` 的 `roomIdFor` 与 `src/game-ui/room/net.js` 的 `roomIdFor`。
- **"一页一关"的游戏要改原地换关**：`spot-the-difference` 原来是完成一关就换页，
  换页等于重新进房、塔上的进度会断 —— 房间模式下改成原地重画（`setupLevel(idx)`）。
  单人仍然换页，两条路并存。

细节与四个例子见 README 的 [Sharing a room](../README.md#sharing-a-room)。
课堂要的是"同房间、看得见谁在第几关"，不是防作弊 —— 这一点要说清楚。
