import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const resolve = (p) => path.resolve(root, p);

/* games/external/** holds third-party builds captured by index.mjs. They are
   shipped exactly as they were downloaded, so Vite must not see them as
   entry points or rewrite anything inside them: copy the tree verbatim once
   the bundle is written instead. */
function copyExternalGames() {
  return {
    name: "copy-external-games",
    closeBundle() {
      const from = resolve("games/external");
      const to = resolve("dist/games/external");
      if (!fs.existsSync(from)) return;
      fs.rmSync(to, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.cpSync(from, to, { recursive: true });
      console.log(`\n  games/external -> ${path.relative(root, to)}`);
    },
  };
}

/* 有些游戏目录里带着"运行时按 URL 取"的静态文件 —— 不是 import 进来的，而是用户
   自己拼在地址栏上的：operator-sorter 的示例题库就是（?deckUrl=./deck.datatypes.json）。
   Vite 只发它从入口模块摸得到的东西，这类文件不会进 dist；而开发时 dev server 直接
   对着仓库目录，所以一直到部署才暴露成 404（游戏那边 fetch 失败会静默退回内置题库，
   更难发现）。这里按**原路径**拷过去，让 ./deck.datatypes.json 这种相对地址在开发和
   线上表现一致。新增这类文件时，把它的目录挂到下面这张表里。 */
const GAME_STATIC = [
  { dir: "games/operator-sorter/html", test: /^deck\..+\.json$/ },
];

function copyGameStatic() {
  return {
    name: "copy-game-static",
    closeBundle() {
      for (const { dir, test } of GAME_STATIC) {
        const from = resolve(dir);
        if (!fs.existsSync(from)) {
          console.warn(`\n  ! ${dir} 不存在，运行时取的文件没发出去`);
          continue;
        }
        const names = fs.readdirSync(from).filter((n) => test.test(n));
        if (!names.length) {
          console.warn(`\n  ! ${dir} 里没有匹配 ${test} 的文件，运行时取的文件没发出去`);
          continue;
        }
        const to = path.resolve(root, "dist", dir);
        fs.mkdirSync(to, { recursive: true });
        for (const n of names) fs.copyFileSync(path.join(from, n), path.join(to, n));
        console.log(`\n  ${dir} -> ${path.relative(root, to)}（${names.join(", ")}）`);
      }
    },
  };
}

/* 变量追踪的「导入我的代码」要用真 CPython 现算 trace，那份运行时是 Pyodide。
   它**只在老师点那个按钮时才下载** —— 学生玩的时候一个字节的 wasm 都不碰
   （所以这里不能走 import，否则会被打进初始包）。

   运行时原样发到 dist/pyodide/，Vite 不解析也不改写；开发时用一段中间件
   直接从 node_modules 供同样的路径，这样 /pyodide/... 在开发和线上一致，
   而且 13MB 的 wasm 不必提交进仓库（dist/ 本来就不入库）。 */
const PYODIDE_FILES = [
  "pyodide.mjs",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
];

function pyodideRuntime() {
  const from = resolve("node_modules/pyodide");
  return {
    name: "pyodide-runtime",

    /* 直接 use 而不是 return 一个函数：前者排在 Vite 自己的中间件之前，
       否则 /pyodide/pyodide.mjs 会先被 Vite 的转换中间件接走。 */
    configureServer(server) {
      server.middlewares.use(function (req, res, next) {
        const m = /^\/pyodide\/([\w.-]+)$/.exec(String(req.url || "").split("?")[0]);
        if (!m || PYODIDE_FILES.indexOf(m[1]) < 0) return next();
        const file = path.join(from, m[1]);
        if (!fs.existsSync(file)) return next();
        res.setHeader("Content-Type", m[1].endsWith(".wasm") ? "application/wasm"
          : m[1].endsWith(".zip") ? "application/zip"
            : m[1].endsWith(".json") ? "application/json"
              : "text/javascript");
        fs.createReadStream(file).pipe(res);
      });
    },

    closeBundle() {
      if (!fs.existsSync(from)) {
        console.warn("\n  ! node_modules/pyodide 不在 —— 变量追踪的「导入我的代码」用不了（npm i pyodide）");
        return;
      }
      const to = resolve("dist/pyodide");
      fs.mkdirSync(to, { recursive: true });
      let n = 0;
      for (const f of PYODIDE_FILES) {
        if (!fs.existsSync(path.join(from, f))) continue;
        fs.copyFileSync(path.join(from, f), path.join(to, f));
        n += 1;
      }
      console.log(`\n  node_modules/pyodide -> ${path.relative(root, to)}（${n} 个文件，只在导入代码时才下载）`);
    },
  };
}

export default defineConfig({
  server: { host: true },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve("index.html"),
        "memory": resolve("games/memory/index.html"),
        "order": resolve("games/order/index.html"),
        "robot": resolve("games/robot/index.html"),
        "typing": resolve("games/typing/index.html"),
        "trace": resolve("games/trace/index.html"),
        "branch-trace": resolve("games/branch-trace/index.html"),
        "operator-sorter": resolve("games/operator-sorter/html/index.html"),
        "operator-sorter-embed": resolve("games/operator-sorter/html/embed-demo.html"),
        "spot-the-difference": resolve("games/spot-the-difference/index.html"),
        "spot-the-difference-play": resolve("games/spot-the-difference/play/index.html"),
      },
    },
  },
  plugins: [copyExternalGames(), copyGameStatic(), pyodideRuntime()],
});
