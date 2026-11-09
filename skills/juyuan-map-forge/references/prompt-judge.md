# 判定提示词

对每个句元单独调用，不要和生成混在同一次对话。目的是抓出“两个选项都说得通”和“差异说不清”的坏题。

---

原文：{{original}}

四个选项：

A. {{opt1}}
B. {{opt2}}
C. {{opt3}}
D. {{opt4}}

任务：

1. 逐一比较每个选项与原文，指出**具体**的语义差异（改了什么要素）。
2. 与原文语义完全一致的那一项，标记为 `faithful`。
3. 如果出现两个及以上 `faithful`，说明题目有歧义。
4. 如果某个非正确项的差异无法用一句话说清，标记为 `vague`。

只输出 JSON：

```json
{
  "faithful": ["A"],
  "vague": [],
  "issues": ["C 把‘夏季’改成了‘冬季’，差异明确"]
}
```

## 判定标准

- `faithful` 必须恰好 1 个。
- `vague` 非空 → 该题不可用，重生成。
- 差异描述必须落到算子表里的某一类（`number` / `name` / `negation` / `causal` / `condition` / `scope` / `time` / `subject-object` / `wording`）。
