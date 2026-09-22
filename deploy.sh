#!/usr/bin/env bash
# 151 上的一键更新：拉取 → 重建 → 重启。
#
# 宝塔里的用法（二选一）：
#   1) 计划任务 → 类型「Shell 脚本」→ 脚本内容填这一行，然后点「执行」就是一键：
#        bash /www/wwwroot/127.0.0.1_3010/deploy.sh
#   2) 面板 → 文件 → 终端里直接跑同一行（面板的终端是 root，正好）。
#
# 为什么不写成简简单单三行（git pull / pnpm i / npm run build）—— 每一条都是这台上踩出来的：
#   · git 只能用 root 跑：仓库的部署密钥在 root 的 ~/.ssh 里，www 没有。而站点是 www 的，
#     所以拉完得把 root 建出来的新文件理回 www，否则下一次 www 跑的构建就写不动。
#     chown -R 会被面板给 .user.ini 加的 chattr +i 打断，所以按文件遍历、跳过它。
#   · npm 要用面板那套 node（PATH 里的 /usr/bin/npm 和它不是一个），而且 cache 得指到 www
#     能写的地方 —— 面板 npmrc 里那个 cache 目录 www 写不了，npm ci 会直接失败。
#   · playwright 的浏览器下载构建用不到，跳过能省一分钟。
#   · set -e + pull --ff-only：pull 失败就当场停。不然会把旧代码重新构建一遍，
#     日志里看着"部署成功"，线上却还是旧的 —— 比报错糟糕得多。
#   · 房间服务器只在 server/ 变了时才重启：重启会打断正在进行的游戏，
#     改个前端样式不该顺手把别人踢出房间。
#
# 想改端口/路径/进程名，用环境变量覆盖即可，例如：
#   SITE_PORT=3010 ROOM_PORT=2568 PM2_APP=game-rooms bash deploy.sh

set -euo pipefail

R=${R:-/www/wwwroot/127.0.0.1_3010}
NODE_DIR=${NODE_DIR:-/www/server/nodejs/v24.20.0/bin}
BRANCH=${BRANCH:-main}
SITE_PORT=${SITE_PORT:-3010}
ROOM_PORT=${ROOM_PORT:-2568}
# 一个进程挂所有游戏的房间，所以名字不叫 typing-room 了（那是它只会打字时的名字）
PM2_APP=${PM2_APP:-game-rooms}
OLD_PM2_APP=${OLD_PM2_APP:-typing-room}
LOG=${LOG:-/www/wwwlogs/edu_games-deploy.log}

if [ "$(id -u)" -ne 0 ]; then
  echo "这个脚本要用 root 跑（宝塔的 Shell 计划任务默认就是 root）：sudo bash $0" >&2
  exit 1
fi

# 输出同时落到日志里，方便回头查哪一次部署了什么
exec > >(tee -a "$LOG") 2>&1

export PATH="$NODE_DIR:/usr/bin:/bin:/usr/sbin:/sbin"
export npm_config_cache=/home/www/.npm
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
mkdir -p "$npm_config_cache"

# 仓库目录是 www 的，而 git 是 root 跑的 —— git 会因为"属主和当前用户不一致"直接拒绝干活
# （dubious ownership）。用 -c safe.directory 一次性顶掉，不往任何 .gitconfig 里留东西。
gitr() { git -c "safe.directory=$R" "$@"; }

step() { printf '\n===== %s =====\n' "$1"; }

step "拉取 origin/$BRANCH（$(date '+%F %T')）"
cd "$R"
OLD=$(gitr rev-parse HEAD)
gitr fetch --prune origin
gitr pull --ff-only origin "$BRANCH"
NEW=$(gitr rev-parse HEAD)
gitr --no-pager log --oneline -1

# root 拉下来的新文件属主是 root，理回 www（.user.ini 是面板锁住的，跳过）
step "属主理回 www"
find "$R" -name .user.ini -prune -o -print0 | xargs -0 chown www:www

if [ "$OLD" = "$NEW" ]; then
  step "没有新提交 —— 构建和重启都跳过"
else
  CHANGED=$(gitr diff --name-only "$OLD".."$NEW")
  echo "本次改动的文件："
  echo "$CHANGED" | sed 's/^/  /'

  # 一律用 www 跑：站点文件、node_modules、dist 都是 www 的
  as_www() { sudo -u www env PATH="$NODE_DIR:/usr/bin:/bin" HOME=/home/www \
               npm_config_cache="$npm_config_cache" PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
               bash -c "cd '$1' && $2"; }

  step "构建站点"
  if echo "$CHANGED" | grep -qx 'package-lock.json'; then
    echo "依赖有变动（package-lock.json），先 npm ci"
    as_www "$R" 'npm ci && npm run build'
  else
    echo "依赖没动，直接 npm run build"
    as_www "$R" 'npm run build'
  fi

  if echo "$CHANGED" | grep -q '^server/'; then
    step "房间服务器：装依赖并重启"
    if echo "$CHANGED" | grep -qx 'server/package-lock.json'; then
      as_www "$R/server" 'npm ci'
    fi
    # 改名那一次：老进程（typing-room）会一直占着 ROOM_PORT，新名字起不来 —— 先删掉它。
    # 之后每次跑这条都是空转（pm2 describe 找不到就直接跳过）。
    if [ "$PM2_APP" != "$OLD_PM2_APP" ] && pm2 describe "$OLD_PM2_APP" >/dev/null 2>&1; then
      echo "删掉旧进程名 $OLD_PM2_APP（它占着 $ROOM_PORT）"
      pm2 delete "$OLD_PM2_APP" || true
    fi
    if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
      pm2 restart "$PM2_APP"          # 不带 --update-env：只重启，不动它现有的环境变量
    else
      pm2 start "$R/server/index.js" --name "$PM2_APP" --interpreter "$NODE_DIR/node"
    fi
    pm2 save
  else
    step "只是站点改动，不动房间服务器（不打断正在进行的游戏）"
  fi
fi

step "自检"
for game in typing memory robot spot-the-difference operator-sorter/html; do
  code=$(curl -fsS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$SITE_PORT/games/$game/" || true)
  [ "$code" = "200" ] && echo "站点 /games/$game/ → 200" || echo "警告：/games/$game/ 返回 ${code:-连不上}"
done
cards=$(curl -fsS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$SITE_PORT/" || true)
[ "$cards" = "200" ] && echo "卡片墙 /            → 200" || echo "警告：卡片墙返回 ${cards:-连不上}"

# 运行时按 URL 取的文件（Vite 从入口摸不到）最容易在部署后 404 —— 单独点一次名。
# 之前只查了各游戏目录，operator-sorter 的示例题库就是这么漏掉的。
for f in games/operator-sorter/html/deck.datatypes.json games/operator-sorter/html/deck.sample.json; do
  code=$(curl -fsS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$SITE_PORT/$f" || true)
  [ "$code" = "200" ] && echo "题库 /$f → 200" || echo "警告：/$f 返回 ${code:-连不上}（检查 vite.config.js 的 GAME_STATIC）"
done
ss -ltn | grep -q ":$ROOM_PORT " && echo "房间服务器在听 $ROOM_PORT" || echo "警告：$ROOM_PORT 上没有监听"
chunk=$(ls -t "$R/dist/assets/" 2>/dev/null | grep -m1 '^typing-.*\.js$' || true)
[ -n "$chunk" ] && echo "构建产物：dist/assets/$chunk"
echo "线上跑的提交：$(gitr --no-pager log --oneline -1)"
echo "日志：$LOG"

step "完成（$(date '+%F %T')）"
