# 新游戏模板

这个仓库真正的资产不是某几个游戏，而是「知识 → 关卡库 → 能直接嵌进课堂」的这套载体。
按下面的契约写，新游戏自动继承：双语、关卡库外链、顺序解锁、embed 回传、离线可用。

参考实现：`games/memory/`（最短，先看它）、`games/order/`、`games/slice/`、`games/robot/`。

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

## 1. 入口与视图

一个 HTML 入口，`<body data-view="list">` / `data-view="game"` 切两个视图，不换页。
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

基座提供主题变量（`--bg --panel --panel-2 --line --line-2 --text --dim --accent --green --red --gold --mono`）
和公共组件（`.bar .brand .back .spacer .readout .btn .panel .lead .celebrate`）。只写本游戏特有的部分。

共享 JS：
- `src/game-ui/feedback.js` 的 `celebrate({title, lines, actionLabel, onAction, onDismiss})` —— 半透明通关卡，不会自动消失
- `src/game-ui/progress.js` —— 参数、进度、关卡库加载、回传

## 7. 体验底线

- 键盘可达，`:focus-visible` 有描边；按钮就是 `<button>`
- `prefers-reduced-motion` 下关掉装饰动画（`base.css` 已兜一层）
- 每关都要有「重试」，卡住永远有出路
- 通关要有明确反馈：统一用 `celebrate()`
- 失败要给出**信息**（哪里错了、该看什么），不是只说「错了」
