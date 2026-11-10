---
name: sentences-map-forge
description: 把医学/教材文本锻造成 sentences 的地图：书 → 章节 → 知识碎片 → 句子。负责切句、碎片规划、词级四选一生成、单段 diff 校验、语义判定、分页，输出 public/maps/<book>/book.json 与 NN-<chapter>.json。用户说“把这本书/这一章做成地图”“新增一本书”“做个知识碎片”时使用。
---

# sentences 地图锻造

## 结构

```
书 Book          public/maps/<book>/book.json
└─ 章节 Chapter  public/maps/<book>/NN-<chapter>.json
   └─ 知识碎片 Fragment（一局）
      └─ 句子 Unit（棋盘格子，界面里叫「领地」）
```

- 一个碎片 25–30 个句子、1–3 页、推荐 12 轮。
- 每句 4 段文本：`original` + 3 段篡改；四选一就是这四段。
- 开局哪些句子是错的、错误时显示哪一段，全部由引擎随机；内容里不写。

## 内容类型

| 类型 | 适用 | 规则 |
|---|---|---|
| `medical`（本 skill） | 医学教材、讲义、说明文 | 下面的词级规则 |
| `vocabulary` | 英语单词 | 另立规则，见 `references/content-types.md`，不要套医学规则 |

## 硬规则

1. **只做词级替换**：限定/范围、判断/否定、数字、名词/专名、方向、主客、时间、程度、情态、单位、人群、给药途径、部位/侧别、比较词。
2. 每段篡改与 `original` 的字符 diff **只有 1 段连续差异**，不跨 `，。；：、`，差异段 ≤ 12 字。
3. 3 段篡改用 **3 个不同算子**；一段只改一处。
4. 4 段文本两两不同；最大/最小长度比 ≤ 1.3。
5. 禁止：因果倒置、`只有…才 / 如果…就`、语序对调、增删分句、改标点、一段改两处。
6. 不引入原文之外的人名、数字、事件。

## 命名

| 对象 | 规则 | 例 |
|---|---|---|
| 书目录 / `book.id` | 小写 kebab-case | `pharmacology` |
| 章节文件 | `NN-<chapter>.json` | `01-anticholinergic.json` |
| 章节 id | 小写 kebab-case | `anticholinergic` |
| 碎片 id | `<chapterId>-NN` | `anticholinergic-01` |
| 句子 id | `<fragmentId>-sNN` | `anticholinergic-01-s01` |
| 页 id | `<fragmentId>-pN` | `anticholinergic-01-p1` |

文件名一律英文，中文标题写在 JSON 内容里。

## 流程

### 1. 拆章

一本书按章拆成 `.work/<bookId>/chapters/01-<chapter>.txt`，一章一个文件。

### 2. 切句

```bash
node skills/sentences-map-forge/scripts/split.mjs \
  .work/<bookId>/chapters/01-<chapter>.txt \
  .work/<bookId>/01-<chapter>/sentences.json
```

- 整句上限 55 字，超长句优先在 `；：，` 处切开。
- 输出带 `quality`：`high`（≥18 字、有句末标点）、`medium`（12–17 字）、`low`（<12 字，跳过）。

### 3. 规划碎片

- 每碎片 **25–30 句**，1–3 页。
- 在标题/段落边界切，不把同一小节拆两半。
- 一章不足 25 句 → 整章一个碎片；超过 60 句 → 按小节拆 2–4 个。
- 碎片 id = `<chapterId>-NN`，顺序 = 阅读顺序。
- 规划写进 `.work/<bookId>/plan.json` 再生成。

### 4. 生成四选一

每批 6–8 句，用 `references/prompt-generate.md`：

```json
{
  "id": "anticholinergic-01-s01",
  "paragraph": 1,
  "original": "原句逐字",
  "wrongOptions": ["错1", "错2", "错3"],
  "errorOps": ["number", "negation", "direction"]
}
```

- `errorOps` 只用于校验和报告，`build-book` 会剥掉。
- 每批写 `units-N.json`，用 `merge-units.mjs` 合并成 `units.json`。

### 5. 内容校验

```bash
node skills/sentences-map-forge/scripts/validate-content.mjs \
  .work/<bookId>/01-<chapter>/units.json \
  .work/<bookId>/01-<chapter>/sentences.json
```

必须 PASS。

### 6. 语义判定

用 `references/prompt-judge.md` 逐句判定：恰好 1 个 faithful、其余每项只有 1 处差异、无 vague / multi-change / ambiguous。

### 7. 分页

```bash
node skills/sentences-map-forge/scripts/paginate.mjs \
  .work/<bookId>/01-<chapter>/units.json \
  .work/<bookId>/01-<chapter>/pages.json 12
```

### 8. 组装

写 `.work/<bookId>/meta.json`（参照 `references/book-meta.example.json`），然后：

```bash
node skills/sentences-map-forge/scripts/build-book.mjs .work/<bookId>/meta.json
```

### 9. 验收

```bash
node scripts/validate-map.mjs public/maps/<bookId>/book.json
node scripts/index-books.mjs
npm run build
```

必须 PASS，刷新页面确认新书出现。

## 质量红线

- 凑不出 3 个互异单点算子 → 丢弃该句，不硬凑。
- 两个选项都说得通 → 重生成。
- 连续两次失败 → 丢弃并记录编号。

## 可选参数

章节文件可写 `density`（开局错误比例，缺省 0.25，范围 0 < d ≤ 0.5）。不写就用默认；**不要**在句子里写任何开局状态。

## 参考

- `references/schema.md` 数据结构与命名
- `references/error-ops.md` 14 个算子与反例
- `references/prompt-generate.md` 生成提示词
- `references/prompt-judge.md` 判定提示词
- `references/add-book.md` 新增一本书清单
- `references/content-types.md` 医学 vs 英语单词
