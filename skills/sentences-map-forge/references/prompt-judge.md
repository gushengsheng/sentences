# 判定提示词

对每个句子单独调用，不要和生成混在同一次对话。目标是抓出「两个选项都说得通」「差异说不清」「一个选项改了两处」。

---

原文：

{{original}}

四个选项：

A. {{opt1}}
B. {{opt2}}
C. {{opt3}}
D. {{opt4}}

任务：

1. 逐一比较每个选项与原文，指出**具体**的语义差异（改的是哪个词/数字/方向）。
2. 找出与原文语义完全一致的那一项，标记 `faithful`。**必须恰好 1 个。**
3. 检查每个非正确项：是否只改了 **1 处**，且相对原文只有 **1 段连续差异**、不跨标点。
4. 如果某非正确项的差异无法用一句话说清，标记 `vague`。
5. 如果一项同时改了两处，标记 `multi-change`。
6. 如果两个及以上选项都说得通，标记 `ambiguous`。

只输出 JSON：

```json
{
  "faithful": ["A"],
  "issues": [
    { "kind": "vague", "option": "C", "detail": "只改了程度，原句结论仍成立" }
  ]
}
```

## 判定标准

- `faithful` 必须恰好 1 个；不是 1 个 → 不可用。
- `vague` / `multi-change` / `ambiguous` 任一非空 → 不可用，重生成。
- 差异必须能落到以下算子之一：
  `scope` / `negation` / `number` / `name` / `direction` / `subject-object` /
  `time` / `degree` / `modality` / `unit` / `population` / `route` / `position` / `comparator`
- 忠实项就是 `original`；`wrongOptions` 的 3 段必须都是篡改。
- 注意：`degree` 必须是“明显→轻微 / 远大于→略大于”这种翻转结论的改法；`小→极小`、`较弱→更弱` 视为 vague。
- 注意：`modality` 必须是“可→必须 / 可能→一定”这种许可/确定性改变；`一般→必然` 若两者都成立，视为 vague。
