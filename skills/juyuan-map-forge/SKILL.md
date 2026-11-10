---
name: juyuan-map-forge
description: 把医学/教材文本锻造成 sentences v2 的三级地图：书（Book）→章节（Chapter）→知识碎片（Fragment）→句元（Unit）。负责切句、碎片规划、词级四选一生成、单段 diff 校验、语义判定、DP 分页，输出 public/maps/<book>/book.json 与 NN-<chapter>.json，并自动生成 index.json。用户说“把这本书/这一章做成地图 / 新增一本书 / 做个知识碎片”时使用。
---

# sentences v2 地图锻造炉

## 产出

```
public/maps/
  index.json                  ← scripts/index-books.mjs 自动生成
  <book>/
    book.json                 ← 书元信息 + 章节索引
    NN-<chapter>.json         ← 一章，内含多个知识碎片
```

层级：**书 → 章节 → 知识碎片（= 一局）→ 句元（棋盘格子）**。

- 书：一本书一个目录。
- 章节：教材的一章/一节；一章一个文件。
- 知识碎片：原 v1 的「一局」，含 `pages` 与 `units`，18–30 个句元。
- 句元：原 v1 的 `UnitDef`，字段不变。

## 内容类型（不要混）

| 类型 | 适用 | 规则 |
|---|---|---|
| `medical`（默认） | 医学教材、说明文、讲义 | 本 skill 的词级规则 |
| `vocabulary` | 英语背单词 | 拼写/中文释义篡改，**另立 skill**，不要套医学规则 |

本 skill 只处理 `medical`。遇到英语单词书，停，先确认 vocabulary 规则。

## 硬规则（用户亲自定，违反即返工）

1. **只做词级替换**：限定/范围、判断/否定、数字、名词/专名、方向、主客、时间、程度、情态、单位、人群、给药途径、部位/侧别、比较词。
2. 篡改文本与 `original` 的字符 diff **只能有 1 段连续差异**，且不跨 `，。；：、`，差异段 ≤ 12 字。
3. **一个选项只改一处**。
4. 四选一 = `original` + 3 段篡改，**恰好 1 个忠实项**（就是 `original`）。
5. 禁止：因果倒置、`只有…才 / 如果…就`、语序对调、增删分句、改标点、一个选项改两处。
6. 4 段文本（`original` + 3 段篡改）两两不同。
7. 4 段文本最大/最小长度比 ≤ 1.3。
8. 不引入原文之外的人名、数字、事件。
9. 开局哪些句是错的、错误显示哪一段，由引擎随机；内容里**不写** `corruptNow`。

## 命名

| 对象 | 规则 | 例 |
|---|---|---|
| 书目录 / `book.id` | 英文小写 kebab-case | `pharmacology` |
| 章节文件 | `NN-<chapter>.json` | `01-anticholinergic.json` |
| 章节 id | 英文小写 kebab-case | `anticholinergic` |
| 碎片 id | `<chapterId>-NN` | `anticholinergic-01` |
| 句元 id | `<fragmentId>-sNN` | `anticholinergic-01-s01` |
| 页 id | `<fragmentId>-pN` | `anticholinergic-01-p1` |

文件名一律英文；中文标题只写在 JSON 内容里。

## 工作目录

```
.work/<bookId>/
  chapters/01-<chapter>.txt       ← 一章一个纯文本
  plan.json                       ← 章节 / 碎片规划
  01-<chapter>/
    sentences.json                ← split.mjs 输出
    units-1.json, units-2.json…   ← 每 6–8 句一片
    units.json                    ← 合并后
    pages.json                    ← paginate.mjs 输出
  meta.json                       ← build-book.mjs 输入
```

## 流程

### 0. 拆书

一本书按「章」拆成多个 txt；一章一个文件。不要一章里混两章内容。
章文件名带两位序号：`01-anticholinergic.txt`、`02-...txt`。

### 1. 切句

```bash
node skills/juyuan-map-forge/scripts/split.mjs \
  .work/<bookId>/chapters/01-<chapter>.txt \
  .work/<bookId>/01-<chapter>/sentences.json
```

输出 `{ headings, sentences }`。每句带 `quality`：

- `high`：≥18 字、完整句末标点、无碎片特征 → 正常生成。
- `medium`：12–17 字，或“其/也/但/这…”开头 → 可生成，人工留意。
- `low`：<12 字、无句末标点 → **跳过，不做句元**。

### 2. 规划知识碎片

原则：

- 一个碎片 **18–30 个句元**，1–3 页，目标页长 12。
- 在标题/段落边界切；不要把同一小节硬拆两半。
- 一章 <15 句 → 整章一个碎片；>40 句 → 按小节拆 2–4 个碎片。
- 标题取小节标题；没有标题就取该碎片首句的主题词。
- 碎片 `id` = `<chapterId>-NN`；顺序 = 阅读顺序。

先在 `.work/<bookId>/plan.json` 写清章节与碎片边界，再生成。

### 3. 生成四选一

**分批**：每批 6–8 句，不要一次丢 30 句。用 `references/prompt-generate.md`。

每个句元字段：

```json
{
  "id": "anticholinergic-01-s01",
  "paragraph": 1,
  "original": "原句逐字",
  "wrongOptions": ["错1", "错2", "错3"],
  "errorOps": ["name", "negation", "direction"]
}
```

- `id` 用 `<fragmentId>-sNN`；`paragraph` 照抄 sentences。
- 3 个算子互异，来自 `references/error-ops.md` 的 14 类。
- 每 6–8 句写一个分片，最后合并；不要一次写整个碎片。

```bash
node skills/juyuan-map-forge/scripts/merge-units.mjs \
  .work/<bookId>/01-<chapter>/units.json \
  .work/<bookId>/01-<chapter>/units-1.json \
  .work/<bookId>/01-<chapter>/units-2.json
```

### 4. 内容硬校验

```bash
node skills/juyuan-map-forge/scripts/validate-content.mjs \
  .work/<bookId>/01-<chapter>/units.json \
  .work/<bookId>/01-<chapter>/sentences.json
```

必须 `PASS`。失败项按 `references/prompt-generate.md` 的重生成策略处理；连续两次失败就丢弃该句元。

### 5. 语义判定

对每个句元用 `references/prompt-judge.md` 起独立判定：

- 恰好 1 个 `faithful`；
- 每个非正确项只有 1 处差异、可命名；
- 无 `vague` / `multi-change` / `ambiguous`。

失败 → 换算子重生成；不要用结构改写补。

### 6. 分页

```bash
node skills/juyuan-map-forge/scripts/paginate.mjs \
  .work/<bookId>/01-<chapter>/units.json \
  .work/<bookId>/01-<chapter>/pages.json 12
```

DP 求最优切分，页长接近 12，尽量在段落边界断开。

### 7. 组装 v2 书

写 `.work/<bookId>/meta.json`：

```json
{
  "book": {
    "id": "pharmacology",
    "title": "药理学",
    "author": "",
    "contentVersion": 2,
    "contentNote": ""
  },
  "chapters": [
    {
      "id": "anticholinergic",
      "title": "胆碱受体阻断药",
      "order": 1,
      "file": "01-anticholinergic.json",
      "fragments": [
        {
          "id": "anticholinergic-01",
          "title": "总论与药动学",
          "order": 1,
          "recommendedRounds": 12,
          "unitsFile": ".work/pharmacology/01-anticholinergic/units.json",
          "pagesFile": ".work/pharmacology/01-anticholinergic/pages.json"
        }
      ]
    }
  ]
}
```

然后：

```bash
node skills/juyuan-map-forge/scripts/build-book.mjs .work/<bookId>/meta.json
```

会写 `public/maps/<bookId>/book.json` + 章节文件，并自动调用 `scripts/index-books.mjs` 更新 `index.json`。

### 8. 最终校验

```bash
node scripts/validate-map.mjs public/maps/<bookId>/book.json
node scripts/index-books.mjs
```

必须 `PASS`。**没有通过校验的书不允许进 `public/maps/`。**

### 9. 报告

汇报：书、章节数、碎片数、每碎片句元数、页数、错误密度、PASS/FAIL、全部 warning、被丢弃的句元编号、人工抽检建议。

## 新增一本书（SOP）

1. 在 `public/maps/` 下选英文目录名：`<bookId>`（小写 kebab-case）。
2. 把书按章拆成 `.work/<bookId>/chapters/01-<chapter>.txt`、`02-...`。
3. 对每章跑 `split.mjs`，看 `quality` 统计。
4. 在 `.work/<bookId>/plan.json` 规划：每章拆几个碎片、每个碎片多少句、标题。
5. 每碎片按 6–8 句一批生成 `units-N.json`，合并成 `units.json`。
6. 跑 `validate-content.mjs`，再跑 `prompt-judge` 语义判定，修到全 PASS。
7. 跑 `paginate.mjs ... 12` 得 `pages.json`。
8. 写 `meta.json`（book + chapters + fragments）。
9. 跑 `build-book.mjs`，再跑 `validate-map.mjs public/maps/<bookId>/book.json`。
10. 跑 `npm run build`（prebuild 会重建 `index.json`），刷新页面确认菜单出现新书。

## 质量红线

- 找不到 4 个互异单点算子 → 丢弃该句，不硬凑。
- 两个选项都说得通 → 重生成。
- 差异依赖原文之外的知识 → 重生成。
- 连续两次失败 → 丢弃并记录编号。
- 旧 v1 内容迁移进 v2 时，`contentVersion` 标 1，`contentNote` 说明“可能未按 v2 词级规则生成”，不要假装合规。

## 兼容与迁移

- 旧 `public/maps/<pack>.json`（v1 `schemaVersion:1`）由 App 的迁移层读成「单章书」；skill 不再产出 v1。
- 旧 skill 的 `build.mjs` 已废弃，v2 用 `build-book.mjs`。
- 校验器仍兼容三种输入：`book.json` / 章节 JSON / v1 地图包。
- 注意：`scripts/validate-map.mjs` 只做结构校验；「恰好 1 个 faithful」「长度 < 30%」由 `validate-content.mjs` + `prompt-judge` 负责。校验器里的 5 文本长度分支是历史 bug，不要依赖它。

## 参考

- `references/schema.md`：完整数据结构与命名。
- `references/error-ops.md`：14 个允许算子 + 禁止项 + 反例。
- `references/prompt-generate.md`：生成提示词。
- `references/prompt-judge.md`：语义判定提示词。
- `references/add-book.md`：新增一本书的逐步清单。
- `references/book-meta.example.json`：book meta 示例。
- `references/content-types.md`：医学 vs 英语单词的边界。
