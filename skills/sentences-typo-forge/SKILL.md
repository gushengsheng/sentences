---
name: sentences-typo-forge
description: 脚本版地图锻造：把一章教材文本变成「单字找茬」地图。每个句子保留原文，3 段篡改各只换 1 个形近字/常用字；按小节切碎片，书名带（脚本版）。全程脚本，不调用 LLM。
---

# sentences 脚本版地图（单字找茬）

## 产出

```
public/maps/<bookId>-script/
  book.json
  01-<chapterId>.json
```

书名 `<原书名>（脚本版）`，`book.id` 为 `<原id>-script`。

## 数据

| 文件 | 内容 |
|---|---|
| `data/shape-similar.json` | 形近字表：`char → [候选]`，只收常用字 |
| `data/common-chars.json` | 常用字表（从语料频次取前 3500） |

替换优先级：**形近字表 → 常用字表随机兜底**。跳过标点、拉丁字母、数字、空白。

## 命令

```bash
# 1) 从 calibre 解包的 EPUB 抽一章（含小节）
node skills/sentences-typo-forge/scripts/extract-epub.mjs \
  <epub解包目录> 26 .work-typo/<id>/chapter.json

# 2) 生成、组装、校验一条龙
node skills/sentences-typo-forge/scripts/build-typo-book.mjs \
  --chapter .work-typo/<id>/chapter.json \
  --book <id>-script \
  --title "<书名>（脚本版）" \
  --chapter-id <id> \
  --file 01-<id>.json \
  --work .work-typo/<id> \
  [--min=30] [--max=55]
```

## 流程

1. **抽章**：按目录锚点切，保留段落；章节名取目录原文（去「第X章」序号）
2. **切句**：`。！？` 断句；超过 `--max`（默认 55）在 `；：，` 处切
3. **拼短句**：同小节内不足 `--min`（默认 30）的句子按序拼接，标点原样，不添字
4. **切碎片**：一小节 = 一片；超过 30 句均分；小节名 = 碎片名，不跨小节
5. **独立性**：片首为「其/该/此/这/它/上述/因此/所以/但/而/也…」时，复制上一片末句，标 `carried`
6. **单字替换**：每句挑 3 个不同位置，各换 1 个字；优先避开首尾 3 字
7. **分页**：每页 12 句
8. **组装校验**：`build-book.mjs` → `validate-map.mjs`

## 红线

1. 章节名取自目录，一字不改；碎片不跨章
2. 碎片名 = 所在小节标题，内容必须落在该小节内
3. 碎片 18–30 句；小节不足 18 句时保留独立，不为凑数拆并
4. 正文字句 100% 进入碎片；删了什么必须落日志
5. 切句只切不改，拼接必须等于原段
6. 每段篡改与原文只差 1 个字，3 处位置互不相同
7. 只换汉字；标点、拉丁字母、数字、空白不动
8. 四段文本唯一、等长；替换字不得等于原字
9. `original` 必须能在源文本逐字定位
10. `density` 不写，默认 0.25
11. 脚本版独立成书，不覆盖人工版
12. 全脚本，不调 LLM/子 agent

## 表格

- 有表头：每行拼成 `列名：值，列名：值。`，标 `derived: true`
- 无表头 / 合并单元格 / 拼不出：跳过并写进 `report.json`
- 数字、单位、拉丁药名原样，不换算
- 行超过 55 字在 `；` 处切；切不开则跳过并记录

## 报告

`build-typo-book.mjs` 在 `--work` 目录写 `report.json`：碎片数、句数、跳过数、英文摘要跳过数、每片句数。
