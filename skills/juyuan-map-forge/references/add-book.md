# 新增一本书 · 操作清单

> 目标：`public/maps/<book>/book.json` + `NN-<chapter>.json`，并让菜单出现新书。

## 0. 准备

- 选定英文目录名 `<bookId>`（小写 kebab-case，如 `pharmacology`）。
- 把书按「章」拆成纯文本：`.work/<bookId>/chapters/01-<chapter>.txt`、`02-...`。
- 一章一个文件；文件名带两位序号；章节 id 用英文 kebab-case。

## 1. 切句

```bash
node skills/juyuan-map-forge/scripts/split.mjs \
  .work/<bookId>/chapters/01-<chapter>.txt \
  .work/<bookId>/01-<chapter>/sentences.json
```

看输出里的 `high / medium / low` 数量；`low` 句跳过。

## 2. 规划碎片

- 每个碎片 18–30 个句子，1–3 页。
- 在标题/段落边界切；不要把一个知识块切两半。
- 一章 <15 句 → 一个碎片；>40 句 → 按小节拆 2–4 个碎片。
- 碎片 id：`<chapterId>-NN`。

把规划写进 `.work/<bookId>/plan.json`，再生成。

## 3. 生成句子

- 每批 6–8 句，按 `references/prompt-generate.md`。
- 每片写 `units-1.json`、`units-2.json`…；用 `merge-units.mjs` 合并成 `units.json`。
- 每个句子 3 个算子互异。
- `id` = `<fragmentId>-sNN`；`paragraph` 照抄。

## 4. 内容校验

```bash
node skills/juyuan-map-forge/scripts/validate-content.mjs \
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
node skills/juyuan-map-forge/scripts/paginate.mjs \
  .work/<bookId>/01-<chapter>/units.json \
  .work/<bookId>/01-<chapter>/pages.json 12
```

## 7. 写 meta 并组装

复制 `references/book-meta.example.json`，改成你的书、章、碎片、文件路径，然后：

```bash
node skills/juyuan-map-forge/scripts/build-book.mjs .work/<bookId>/meta.json
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
