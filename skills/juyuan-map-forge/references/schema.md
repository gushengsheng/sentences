# 数据结构

```ts
interface MapPack {
  schemaVersion: 1;
  id: string;
  title: string;
  source?: string;
  description?: string;
  maps: MapDef[];
}

interface MapDef {
  id: string;
  title: string;
  order: number;
  recommendedRounds: number;
  units: UnitDef[];
  pages?: PageDef[];
}

interface PageDef {
  id: string;
  title?: string;
  unitIds: string[];
}

interface UnitDef {
  id: string;                 // 全局唯一，推荐 `${mapId}-s${序号}`
  paragraph: number;          // 渲染分组用
  original: string;           // 原文；正确时地图显示它
  wrongDisplay: string;       // 错误时地图显示它；脉冲改写也用它
  correctOption: string;      // 4 选 1 的忠实项
  wrongOptions: [string, string, string];
  corruptNow: boolean;        // 开局是否就是错的
}
```

## 硬性约束

1. `schemaVersion === 1`
2. 地图 `id` 在包内唯一；句元 `id` 在地图内唯一
3. 4 个选项两两不同，且 `original`、`wrongDisplay` 不等于任何选项
4. `original !== wrongDisplay`
5. `pages` 若存在，`unitIds` 必须完整覆盖且不重叠
6. 错误密度 15%–35%

## 示例

```json
{
  "id": "u01",
  "paragraph": 1,
  "corruptNow": false,
  "original": "蜜蜂是社会性昆虫，一个蜂群通常由一只蜂王、少量雄蜂和数万只工蜂组成。",
  "wrongDisplay": "蜜蜂是独居昆虫，每只个体都独自筑巢觅食。",
  "correctOption": "蜂群里有一位蜂王、若干雄蜂和大量工蜂。",
  "wrongOptions": [
    "蜂群里有两只蜂王、少量雄蜂和数万只工蜂。",
    "蜂群由一只蜂王、数万只雄蜂和少量工蜂组成。",
    "蜂群里只有蜂王和雄蜂两类个体。"
  ]
}
```
