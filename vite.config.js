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
        "operator-sorter": resolve("games/operator-sorter/html/index.html"),
        "operator-sorter-embed": resolve("games/operator-sorter/html/embed-demo.html"),
        "spot-the-difference": resolve("games/spot-the-difference/index.html"),
        "spot-the-difference-play": resolve("games/spot-the-difference/play/index.html"),
      },
    },
  },
  plugins: [copyExternalGames(), copyGameStatic()],
});
