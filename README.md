# 小队远征 · Phase 2（账号 + 云存档 + 异步竞技场）

## 文件说明
- `server.js` — 零依赖 Node.js 服务器（账号/存档/竞技场/静态托管，一体）
- `logic.js` — 与客户端共享的战斗逻辑（服务器端裁决竞技战斗，防作弊）
- `game.html` — 游戏客户端（手机/电脑浏览器直接玩）

## 本地试玩
```bash
node server.js
# 打开 http://localhost:3000
```

## 路线一：本机运行 + 内网穿透（0 元，最快，适合先试玩）
1. 安装 Node.js（nodejs.org，选 LTS）
2. 三个文件放同一目录，运行 `node server.js`
3. 注册 cpolar（cpolar.com）或花生壳、natapp，安装客户端后运行 `cpolar http 3000`
4. 把得到的公网地址发给朋友即可
- 注意：电脑要一直开着；免费隧道地址每次重启会变

## 路线二：国内云服务器（约 50~100 元/年，稳定长期）
1. 腾讯云/阿里云购买轻量应用服务器，新人有优惠
2. 选香港/境外机房可免 ICP 备案（内地机房用域名需备案，先直接用 IP 访问）
3. 控制台网页上传三个文件（无需 Git/GitHub）
4. 安装 Node.js 后运行 `node server.js`，长期运行建议 pm2：`npm i -g pm2 && pm2 start server.js`
5. 安全组放行 3000 端口，访问 `http://服务器IP:3000`

## 路线三：GitHub + Render（海外免费托管，需能访问 GitHub）
1. GitHub 新建仓库，上传三个文件
2. render.com → New Web Service → 连接仓库
3. Build Command 留空，Start Command = `node server.js`
4. 免费档首次访问约 30 秒冷启动

## 玩法说明（Phase 2 新增）
- 注册/登录后点「☁️ 上传存档&快照」→ 队伍镜像进入竞技场
- 「挑战」打的是对方快照镜像，对方无需在线（异步打榜）
- 胜 +20 积分、负 +5，排行榜按积分排名
- 换设备登录 → 「⬇️ 从云端恢复」

## 下一步（Phase 3）
公会系统：建公会/加入公会、捐献金币、共同建设资源设施、按贡献分配收益。
