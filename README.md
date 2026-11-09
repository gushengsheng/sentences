# sentences · v2.0

把一本书拆成句子战场。每一句都可能被悄悄换成错误的说法，你占领、识破、修正——读得懂，才打得赢。

![对局界面](docs/ui-game.png)

## 结构

```
书        药理学
└─ 章节    胆碱受体阻断药
   └─ 知识碎片  总论与药动学      ← 这一层是一局
      └─ 句元（棋盘上的判定单位）
```

菜单只到「知识碎片」这一层；句元只在对局棋盘上出现。

## 规则速览

| 项 | 规则 |
|---|---|
| 棋盘 | 句元按原句切分，没有邻接限制，任意可点 |
| 句元属性 | 归属（无主 / A / B）、正确性（正确 / 错误） |
| 收入 | 每回合 `max(1, 1 + 己方正确数 − 己方错误数)` |
| 占领 | 1 AP，揭示并归己方 |
| 修正 | 1 AP，4 选 1；选对变正确，**选错会把句子改错** |
| 转化 | 2 AP，把对方句元打回无主 |
| 放弃 | 0 AP，丢掉己方句元 |
| 腐化脉冲 | 每 3 轮结束，己方每个正确句元有 1/4 概率变错，无提示 |
| 胜负 | 到指定轮数后，比较「下一轮会到账的 AP」，多者胜；平局先手胜 |

## 运行

```powershell
npm install --include=dev
npm run dev
```

打开 `http://127.0.0.1:5175/`。手机连同一 Wi-Fi 访问 `http://<电脑IP>:5175/`。

## 构建

```powershell
npm run build
```

`prebuild` 会先扫描 `public/maps/*/book.json` 生成 `public/maps/index.json`，再打包。产物在 `dist/`。

```powershell
npx vite preview --host 0.0.0.0 --port 4173
```

## 部署到 GitHub Pages

免费账号的 Pages 只支持公开仓库。整套流程的产物地址是：

```
https://<你的用户名>.github.io/<仓库名>/
```

### 一次性准备

```powershell
# 这台机器用 schannel 推 GitHub 会报 SEC_E_NO_CREDENTIALS，必须换 openssl 后端
git config --global http.sslBackend openssl

# 提交身份（仓库里每个提交都会带上）
git config --global user.name  "你的用户名"
git config --global user.email "你的邮箱"
git config --global init.defaultBranch main
```

### 建仓库并首次推送

在 <https://github.com/new> 建一个 **Public** 仓库，**不要**勾 README / .gitignore / license（否则第一次 push 会和本地历史打架），然后在项目目录里：

```powershell
git init
git add .
git commit -m "sentences v2"
git remote add origin git@github.com:<你的用户名>/<仓库名>.git
git push -u origin main
```

用 SSH 地址（`git@github.com:` 开头）比 HTTPS 省事，不用配 token。

### workflow

`.github/workflows/deploy.yml` 已经建好，推上去就自动跑：

`npm ci` → `npm run build`（注入 `GH_REPO` / `GITHUB_ACTIONS`）→ 上传 `dist` → 发布。

`vite.config.ts` 靠这两个变量把 `base` 设成 `/<仓库名>/`，所以**仓库叫什么名字都不用手改配置**。反过来说：**所有运行时 fetch 都必须经过 `assetUrl()` 拼 `import.meta.env.BASE_URL`**，写死 `/maps/...` 会在子路径下 404。

workflow 里 `actions/configure-pages` 带了 `enablement: true`，首次运行会自动把 Pages 源切成 GitHub Actions；如果没切成功，去 Settings → Pages → Source 手动选一次 GitHub Actions。

### 日常更新地图

改完内容后三步：**跑一下索引 → 提交 → 推送**。

```powershell
# 1. 只更新清单（快，改完 book.json 章节列表时用）
npm run index:books
#    或者连构建一起验证（推荐，能提前发现 base/资源路径问题）
npm run build

# 2. 提交
git add .
git commit -m "新增《书名》"

# 3. 推送，触发 Actions
git push
```

推送完去仓库 **Actions** 页等 `Deploy to GitHub Pages` 变绿（约 1 分钟），然后刷网页。手机端记得下拉强制刷新或清一次缓存——`index.json` 带缓存，改完内容没变大概率是缓存。

**新增一本书的完整动作**：

```powershell
# 1. 建目录（英文目录名，和 book.json 里的 dir 一致）
mkdir public/maps/mybook

# 2. 写 public/maps/mybook/book.json
#    写 public/maps/mybook/01-mybook.json（章节 + fragments + units）

# 3. 生成清单索引（这一步不做，菜单里看不到新书）
npm run index:books

# 4. 校验内容（尤其篡改项是否守词级规则）
node scripts/validate-map.mjs public/maps/mybook/book.json

# 5. 本地先看一眼
npm run dev     # http://127.0.0.1:5175/

# 6. 上线
git add .
git commit -m "新增《书名》"
git push
```

`public/maps/index.json` 是生成物，**不要手改**，每次内容变动后重跑 `index:books`（或 `build`，`prebuild` 会自动跑）即可。

### 排错

| 现象 | 原因 |
|---|---|
| `SEC_E_NO_CREDENTIALS` | `http.sslBackend` 没设成 `openssl` |
| Actions 红在 `npm ci` | `package.json` 改了但没提交 `package-lock.json`，本地先跑 `npm install` 再提交 |
| 部署成功但打开白屏 | `base` 不对：确认 workflow 里传了 `GH_REPO` 和 `GITHUB_ACTIONS` |
| 菜单少一书 | 忘了跑 `npm run index:books`，或 `book.json` 里章节 `file` 路径写错 |

## 地图目录

```
public/maps/
  index.json                  ← 自动生成，不要手改
  pharmacology/
    book.json                 ← 书元信息 + 章节索引
    01-anticholinergic.json   ← 章节（含 fragments）
```

`book.json`：

```json
{
  "schemaVersion": 2,
  "id": "pharmacology",
  "title": "药理学",
  "chapters": [
    { "id": "anticholinergic", "title": "胆碱受体阻断药", "order": 1, "file": "01-anticholinergic.json" }
  ]
}
```

章节文件：

```json
{
  "id": "anticholinergic",
  "title": "胆碱受体阻断药",
  "fragments": [
    {
      "id": "anticholinergic-01",
      "title": "总论与药动学",
      "order": 1,
      "recommendedRounds": 12,
      "pages": [{ "id": "p1", "title": "第 1 页", "unitIds": ["s01"] }],
      "units": [
        {
          "id": "s01",
          "paragraph": 1,
          "original": "原文",
          "wrongDisplay": "篡改版",
          "correctOption": "忠实改写",
          "wrongOptions": ["…", "…", "…"],
          "corruptNow": false
        }
      ]
    }
  ]
}
```

**新增一本书**：在 `public/maps/` 下建目录 → 放 `book.json` + 章节文件 → `npm run build`（或 `npm run index:books` 只更新清单）→ 刷新。上线到 Pages 的完整命令见「[日常更新地图](#日常更新地图)」。

文件夹与文件名用英文；中文标题写在文件内容里。

## 当前内容

| 书 | 章节 | 知识碎片 | 句元 |
|---|---|---|---|
| 药理学 | 胆碱受体阻断药 | 7 | 167 |
| 蜜蜂与蜂群 | 蜜蜂与蜂群 | 2 | 32 |
| 睡眠与节律 | 睡眠与节律 | 1 | 24 |

## 目录

```
src/
  engine.ts      规则引擎（纯函数风格，apply 原地修改状态）
  ai.ts          规则 AI（accuracy / expand / attack / strategy）
  mapsource.ts   地图来源抽象（v2 只有 HttpMapSource，为 APK 预留）
  store.ts       设置、进度、存档（localStorage）
  screens.tsx    主菜单、书、章节、碎片、对局设置、设置、文章回顾
  Game.tsx       对局界面
  App.tsx        路由（状态机）
public/maps/     书目录 + 自动生成的 index.json
scripts/
  index-books.mjs  扫描目录生成清单（prebuild）
  validate-map.mjs 校验书/章节/v1 包
  split.mjs / paginate.mjs / build.mjs（在 skills 里）
  check.mjs        引擎回归
  simulate.mjs     AI 对打
  bench.mjs        性能基准
skills/          地图锻造 skill
docs/            截图
游戏方案.md       规则定稿
开发方案.md       实现方案与数值
v2-简报.md        v2 需求与决策
```

## 校验

```powershell
node scripts/validate-map.mjs public/maps/pharmacology/book.json
node --experimental-strip-types --no-warnings scripts/check.mjs
```

## 已知限制

- 地图只能放在 `public/maps/` 重新部署，还没有运行时导入
- 进度存在浏览器 localStorage，换设备不跟随
- 手机端没有点击二次确认
- 没有 PWA 离线缓存
- 没有 APK（规划中）
- `bee` / `sleep` 两本书是 v1 手写内容，部分篡改未按词级规则生成（书里已标 `contentVersion: 1`）
