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
        "slice": resolve("games/slice/index.html"),
        "robot": resolve("games/robot/index.html"),
        "typing": resolve("games/typing/index.html"),
        "operator-sorter": resolve("games/operator-sorter/html/index.html"),
        "operator-sorter-embed": resolve("games/operator-sorter/html/embed-demo.html"),
        "spot-the-difference": resolve("games/spot-the-difference/index.html"),
        "spot-the-difference-play": resolve("games/spot-the-difference/play/index.html"),
      },
    },
  },
  plugins: [copyExternalGames()],
});
