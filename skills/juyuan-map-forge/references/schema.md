# sentences v2 数据结构

## 层级

```
Book（书）
└─ Chapter（章节）
   └─ Fragment（知识碎片 = 一局）
      └─ Unit（句元 = 棋盘格子）
```

- **书**：一本书一个目录，`maps/<book>/book.json`。
- **章节**：一个章节一个文件，`maps/<book>/NN-<chapter>.json`，文件里装多个知识碎片。
- **知识碎片**：原 v1 的 `MapDef`，仍含 `pages` 与 `units`，是真正开一局的对象。
- **句元**：原 v1 的 `UnitDef`，字段不变。

## Book

```ts
interface Book {
  schemaVersion: 2;
  id: string;            // 英文小写 slug，同时是目录名
  title: string;         // 中文书名
  author?: string;
  contentVersion?: number; // 2 = 按词级规则生成；1 = 旧内容迁移
  contentNote?: string;    // 旧内容必须说明“可能不合规”
  chapters: ChapterRef[];
}

interface ChapterRef {
  id: string;
  title: string;
  order: number;
  file: string;          // NN-<chapter>.json
}
```

## Chapter 文件

```ts
interface Chapter {
  id: string;
  title: string;
  density?: number;   // 开局错误比例，缺省 0.25
  fragments: Fragment[];
}

interface Fragment {
  id: string;                 // <chapterId>-NN
  title: string;              // 中文小标题
  order: number;
  recommendedRounds: number;  // 默认 12
  pages?: Page[];
  units: Unit[];
}

interface Page {
  id: string;                 // <fragmentId>-pN
  title: string;
  unitIds: string[];
}

interface Unit {
  id: string;                 // <fragmentId>-sNN
  paragraph: number;
  original: string;
  wrongOptions: [string, string, string];
}
```

## 命名

| 对象 | 规则 | 例 |
|---|---|---|
| 书目录 / book.id | 英文小写 kebab-case | `pharmacology` |
| 章节文件 | `NN-<chapter>.json`，两位序号 | `01-anticholinergic.json` |
| 章节 id | 英文小写 kebab-case | `anticholinergic` |
| 碎片 id | `<chapterId>-NN` | `anticholinergic-01` |
| 句元 id | `<fragmentId>-sNN` | `anticholinergic-01-s01` |
| 页 id | `<fragmentId>-pN` | `anticholinergic-01-p1` |

文件名一律英文；中文标题只写在 JSON 内容里。

## 硬性约束

1. `schemaVersion === 2`（书）。
2. 章节文件必须被 `book.json` 的 `chapters[].file` 引用，且存在。
3. 章节内 `fragments` 非空；碎片 `id` 在章节内唯一；句元 `id` 在碎片内唯一。
4. 四选一 = `original` + 3 段篡改，4 段两两不同，恰好 1 个忠实于原文。
5. 每段篡改相对 `original` 只有 1 段连续差异，不跨标点，差异段 ≤ 12 字。
6. 4 段文本最大/最小长度比 ≤ 1.3。
7. 不写 `wrongDisplay` / `correctOption` / `corruptNow`；开局随机与显示随机都由引擎负责。
8. `density` 若存在，必须 0 < density ≤ 0.5。
10. `pages` 若存在，必须完整覆盖且不重叠；页长 10–16，目标 12。

## 示例

`book.json`：

```json
{
  "schemaVersion": 2,
  "id": "pharmacology",
  "title": "药理学",
  "author": "",
  "contentVersion": 2,
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
      "pages": [
        { "id": "anticholinergic-01-p1", "title": "第 1 页", "unitIds": ["anticholinergic-01-s01"] }
      ],
      "units": [
        {
          "id": "anticholinergic-01-s01",
          "paragraph": 1,
          "original": "能与胆碱受体结合不产生或产生微弱拟胆碱作用，却能妨碍乙酰胆碱或胆碱受体激动药与胆碱受体的结合，",
          "wrongOptions": [
            "能与胆碱受体结合不产生或产生微弱拟胆碱作用，却能妨碍去甲肾上腺素或胆碱受体激动药与胆碱受体的结合，",
            "能与胆碱受体结合不产生或产生微弱拟胆碱作用，却不能妨碍乙酰胆碱或胆碱受体激动药与胆碱受体的结合，",
            "能与胆碱受体结合不产生或产生微弱拟胆碱作用，却能妨碍乙酰胆碱或胆碱受体激动药与胆碱受体的分离，"
          ]
        }
      ]
    }
  ]
}
```
