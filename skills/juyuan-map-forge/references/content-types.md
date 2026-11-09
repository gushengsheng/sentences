# 两套内容类型

> 不要把医学规则套到英语单词上，也不要把单词规则套到教材上。

## medical（已实现）

适用：医学教材、讲义、说明文、科普。

- 篡改单位是“词/短语”，不是整句。
- 只允许 `references/error-ops.md` 的 14 个算子。
- 相对原文只有 1 段连续差异，不跨标点。
- 四选一恰好 1 个 faithful。

流程见 `SKILL.md`，生成提示词见 `references/prompt-generate.md`。

## vocabulary（待细化）

适用：英语背单词、词表、例句。

暂定方向（**不要现在用医学规则生成**）：

- 拼写篡改：`abandon → abondon`、`receive → recieve`；
- 中文释义篡改：`放弃 → 获得`、`坚持 → 放弃`；
- 词性/搭配篡改：`v. → n.`、`look after → look for`；
- 形近词/同根词替换：`adapt → adopt`、`effect → affect`。

需要单独定：

- 拼写错误是否算“错误选项”（可能太容易靠眼熟排除）；
- 一个选项改几个字母；
- 释义篡改的粒度（整条释义 vs 一个义项）；
- 四选一里是否保留音标/词性提示。

在 vocabulary 规则定稿前，遇到单词书：停下，向用户确认，不要复用 `validate-content.mjs` 的字符 diff 规则（拼写题不适用）。
