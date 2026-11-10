# 新增一本书 · 操作清单

> 目标：`public/maps/<book>/book.json` + `NN-<chapter>.json`，并让菜单出现新书。

## 0. 准备

- 选定英文目录名 `<bookId>`（小写 kebab-case，如 `pharmacology`）。
- 把书按「章」拆成纯文本：`.work/<bookId>/chapters/01-<chapter>.txt`、`02-...`。
- 一章一个文件；文件名带两位序号；章节 id 用英文 kebab-case。

## 1. 切句

```bash
node skills/sentences-map-forge/scripts/split.mjs \
  .work/<bookId>/chapters/01-<chapter>.txt \
  .work/<bookId>/01-<chapter>/sentences.json
```

看输出里的 `high / medium / low` 数量；`low` 句跳过。

## 2. 拼接碎片 + 独立性审查

- 按自然段落/小节拼碎片，大致 20–30 句一片，不用卡死。
- 逐片检查第一句能否独立成立；不独立（开头是“该药 / 其 / 它”）就把上一片末尾相关句子复制到本片开头。
- 允许少量重复。
- 碎片 id：`<chapterId>-NN`。

## 3. 生成句子

- 每批 6–8 句，按 `references/prompt-generate.md`。
- 每片写 `units-1.json`、`units-2.json`…；用 `merge-units.mjs` 合并成 `units.json`。
- 每个句子 3 个算子互异。
- `id` = `<fragmentId>-sNN`；`paragraph` 照抄。

## 4. 内容校验

```bash
node skills/sentences-map-forge/scripts/validate-content.mjs \
  .work/<bookId>/01-<chapter>/units.json \
  .work/<bookId>/01-<chapter>/sentences.json
```

必须 PASS。失败就改；连续两次失败丢弃该句子并记录。

## 5. 语义判定

按 `references/prompt-judge.md` 逐句判定：

- 恰好 1 个 `faithful`；
- 每个非正确项只有 1 处差异；
- 无 `vague` / `multi-change` / `ambiguous`。

## 6. 分页

```bash
node skills/sentences-map-forge/scripts/paginate.mjs \
  .work/<bookId>/01-<chapter>/units.json \
  .work/<bookId>/01-<chapter>/pages.json 12
```

## 7. 写 meta 并组装

复制 `references/book-meta.example.json`，改成你的书、章、碎片、文件路径，然后：

```bash
node skills/sentences-map-forge/scripts/build-book.mjs .work/<bookId>/meta.json
```

会写 `public/maps/<bookId>/book.json` + 章节文件，并自动跑 `scripts/index-books.mjs`。

## 8. 最终验收

```bash
node scripts/validate-map.mjs public/maps/<bookId>/book.json
node scripts/index-books.mjs
```

必须 PASS。然后 `npm run build`（prebuild 会重建 index），刷新页面确认新书出现。

## 9. 报告

书 / 章节数 / 碎片数 / 每碎片句子数 / 页数 / 错误密度 / PASS/FAIL / warning / 丢弃句子编号。
