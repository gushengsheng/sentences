---
name: juyuan-map-forge
description: 把一段纯文本锻造成「句元战棋」的可玩地图包（JSON）。负责切句、为每个句元生成 1 正 3 错 1 备用的四选一、硬校验、语义判定、DP 分页，输出到 public/maps 并更新清单。用户说“把这段文本做成地图 / 做个战役 / 生成关卡”时使用。
---

# 句元地图锻造炉

把文本变成 `MapPack` JSON。产出直接放进 `句元战棋/public/maps/`，游戏启动即可选到。

## 硬约束（先读）

1. **不发明事实**：只改写字面，不引入原文没有的人名、数字、事件。
2. **每个句元必须 5 个文本**：原文（`original`）、1 个忠实改写（`correctOption`）、3 个篡改项（`wrongOptions`）、1 个备用篡改（`wrongDisplay`）。
3. **`original` 与 `wrongDisplay` 不得与任何选项字符串相同**，否则玩家可以靠字面匹配作弊。
4. **每个篡改项只改 1 个语义要素**，并在结果里记 `errorOp`。
5. **长度差 < 30%**，不能用长短区分对错。
6. 校验不通过就重生成；连续两次失败，降级为装饰句元或丢弃，**不许凑合**。

## 输入

- 文本：用户粘贴的内容，或一个文件路径。
- 可选：包名、战区数、每战区句元数（默认 30–45）、错误密度（默认 25%）。
- 页内句元数固定 10–16，由分页脚本决定，不是用户参数。

## 流程

### 1. 切句

```bash
node skills/juyuan-map-forge/scripts/split.mjs <文本文件> .work/sentences.json
```

输出 `[{ index, paragraph, text }]`。脚本会合并过短句、在标点处二次切过长句。

### 2. 可错性筛选

按下表给每句打分，只让“高”和“中”进入可错句元池，“低”的留作装饰句元（`scoreable: false`，但当前 schema 里直接剔除或作为普通正确句元）。

| 级别 | 特征 |
|---|---|
| 高 | 含数字、专名、因果连词、条件句、限定词（所有/只/必须/一定） |
| 中 | 主谓宾完整、可独立理解 |
| 低 | 诗意、歧义、强依赖上下文、口语碎片 |

### 3. 生成四选一

**分批**：每批 6–8 句，不要一次丢 50 句（质量会断崖式下滑）。

用 `references/prompt-generate.md` 的模板，逐批输出 JSON，累积到 `.work/units.json`。

每条生成结果形如：

```json
{
  "id": "u01",
  "paragraph": 1,
  "corruptNow": false,
  "original": "原文原句",
  "wrongDisplay": "备用篡改版",
  "correctOption": "忠实改写",
  "wrongOptions": ["篡改1", "篡改2", "篡改3"]
}
```

### 4. 硬校验

```bash
node scripts/validate-map.mjs .work/pack.json
```

（校验器在项目根目录的 `scripts/` 下，不在 skill 里。）

失败项按 `references/prompt-generate.md` 的“重生成策略”处理。

### 5. 语义判定

对每个句元，用 `references/prompt-judge.md` 起一次独立调用，检查：

- 正确项是否真的与原文等价；
- 3 个篡改项是否各自有**唯一、可命名**的语义错误；
- 是否出现“两个选项都说得通”。

判定失败 → 换一种 `errorOp` 重生成该句元。

### 6. 分页

```bash
node skills/juyuan-map-forge/scripts/paginate.mjs .work/units.json .work/pages.json 14
```

DP 求最优切分：页长接近目标、尽量在段落边界断开、页间长度均衡。

### 7. 组装并写盘

```bash
node skills/juyuan-map-forge/scripts/build.mjs .work/meta.json
```

`meta.json` 形如：

```json
{
  "packId": "bee",
  "title": "蜜蜂与蜂群",
  "source": "原文本出处",
  "maps": [
    {
      "id": "bee-01",
      "title": "第一战区 · 蜂群与分工",
      "order": 1,
      "recommendedRounds": 9,
      "unitsFile": ".work/units-map1.json",
      "pagesFile": ".work/pages-map1.json"
    }
  ]
}
```

输出 `public/maps/<packId>.json` 并自动更新 `public/maps/index.json`。

### 8. 报告

向用户汇报：战区数、每战区句元数、错误密度、校验通过率、重生成次数、需要人工抽检的句子编号。

## 质量红线

- 一眼假的干扰项（“蜜蜂是鸟类”）只允许出现在初级难度包。
- 两个选项意思都能成立 → 必须重生成。
- 篡改点依赖原文之外的知识 → 必须重生成。
- 连续两次失败 → 丢弃该句元，不要降低标准。

## 输出位置

```
句元战棋/public/maps/<packId>.json
句元战棋/public/maps/index.json   （自动更新）
句元战棋/reports/<packId>.md       （可选）
```

## 注意

- 选项顺序**不要在文件里洗牌**，引擎会按 seed 洗。
- 同一个句元的 5 个文本必须互不重复（含 `original` 与 `wrongDisplay`）。
- 生成完必须跑一次校验器，**没有通过校验的地图不允许进 `public/maps/`**。
