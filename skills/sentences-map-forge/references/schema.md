# sentences 数据结构

## 层级

```
Book（书）
└─ Chapter（章节）
   └─ Fragment（知识碎片 = 一局）
      └─ Unit（句子 = 棋盘格子，界面里叫「领地」）
```

- **书**：一个目录，`public/maps/<book>/book.json`。
- **章节**：一个文件，`public/maps/<book>/NN-<chapter>.json`，内含多个碎片。
- **知识碎片**：开一局的对象，含 `pages` 与 `units`。
- **句子**：棋盘上的判定单位。界面里叫「领地」，代码里是 `Unit`。

## 类型

```ts
interface Book {
  schemaVersion: 2;
  id: string;              // 英文 kebab-case，同时是目录名
  title: string;
  author?: string;
  contentVersion?: number; // 2 = 按本规则生成；1 = 旧内容迁移
  contentNote?: string;
  chapters: ChapterRef[];
}

interface ChapterRef {
  id: string;
  title: string;
  order: number;
  file: string;            // NN-<chapter>.json
}

interface Chapter {
  id: string;
  title: string;
  density?: number;        // 开局错误比例，缺省 0.25
  fragments: Fragment[];
}

interface Fragment {
  id: string;              // <chapterId>-NN
  title: string;
  order: number;
  recommendedRounds: number; // 默认 12
  pages?: Page[];
  units: Unit[];
}

interface Page {
  id: string;              // <fragmentId>-pN
  title: string;
  unitIds: string[];
}

interface Unit {
  id: string;              // <fragmentId>-sNN
  paragraph: number;
  original: string;        // 忠实项就是它
  wrongOptions: [string, string, string];
}
```

## 命名

| 对象 | 规则 | 例 |
|---|---|---|
| 书目录 / book.id | 小写 kebab-case | `pharmacology` |
| 章节文件 | `NN-<chapter>.json` | `01-anticholinergic.json` |
| 章节 id | 小写 kebab-case | `anticholinergic` |
| 碎片 id | `<chapterId>-NN` | `anticholinergic-01` |
| 句子 id | `<fragmentId>-sNN` | `anticholinergic-01-s01` |
| 页 id | `<fragmentId>-pN` | `anticholinergic-01-p1` |

文件名一律英文，中文标题写在 JSON 内容里。

## 硬性约束

1. `schemaVersion === 2`。
2. 章节文件必须被 `book.json` 的 `chapters[].file` 引用，且存在。
3. `fragments` 非空；碎片 id 在章节内唯一；句子 id 在碎片内唯一。
4. 4 段文本（`original` + 3 段篡改）两两不同。
5. 每段篡改相对 `original` 只有 1 段连续差异，不跨 `，。；：、`，差异段 ≤ 12 字。
6. 4 段文本最大/最小长度比 ≤ 1.3。
7. 不写开局状态字段（哪句错、错时显示哪段，都由引擎随机）。
8. `density` 若存在，必须 0 < density ≤ 0.5。
9. `pages` 若存在，必须完整覆盖且不重叠，页长 10–16。

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
  "density": 0.25,
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
