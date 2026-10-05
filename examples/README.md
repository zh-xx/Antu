# 示例

**按大类分目录，每个大类下再按读者分三批。**

```
examples/
├── agent/<大类>/     给 agent 的：最小、每份只讲一件事
├── <大类>/           完整的案例与示意数据：能打开看（案例都是虚构的）
└── raw/              虚构的判决书全文和一份合同（与案例配套），不属于任何一批示例
```

现在有事实图、程序图、关系图、证成图四类：`fact/`、`procedure/`、`relationship/`、`justification/`。

## 给 agent 的：`agent/fact/`

**这六份必须一直能通过校验**（`npm run verify` 会检查）。
它们不是文档，是**能跑的数据**：schema 一改就会失败，所以不会悄悄漂移。

| 文件 | 讲什么 |
|---|---|
| `1-minimal.*` | 最小可用：两个主体、三个时间点，必填字段各出现一次 |
| `2-single-actor.*` | 单主体怎么写，视角怎么写 |
| `3-groups.*` | `groups` + `groupId`，按性质分两侧 |
| `4-views.*` | `views` 的完整写法（三种看法） |
| `5-duration.*` | `dateEnd` / `approx` / `dateNote` |
| `6-sources.*` | `sources` + `sourceIds` |
| `7-undated.*` | 材料没给日期的事件：不写 `date`，卡片上显示“日期不详”（同时演示两个主体用 `groups` 分两侧） |

每份 0.8~1.2 KB，读三份约 3 KB。**六份的所有视角都排得下**，
agent 照抄结构不会撞到"摆不下"。MCP 的 `antu_examples` 默认给的就是这一批。

## 给人和调试用的：`fact/`

完整、能打开看。一份 4~8 KB。

**成对存放**：每份都有 `.zh-CN.json`（中文内容）与 `.en.json`（英文内容）。
语言后缀用 `.zh-CN`，与仓库根的 `README.zh-CN.md` 一致。
两份**结构完全相同，只有文本值不同**。当事人、事件描述、视角名这些属于**数据**，
由 JSON 自带；标题栏、按钮、报错属于**界面文案**，由 `src/core/messages/` 提供，
切语言不换数据（见 `src/core/i18n.js` 文件头）。

| 文件（同名前缀） | 说明 |
|---|---|
| `neighbour-corridor-charging.*` | 虚构案例（楼道充电劝阻案），双主体 |
| `gym-membership-face-scan.*` | 虚构案例（健身房刷脸入场），单主体 |
| `marketplace-platform-liability.*` | 虚构案例（网络商城），平台经营与监管查处 |
| `fang-yuan-loan-and-conflict.*` | 虚构案例（方远案），借贷与催收冲突 |
| `lin-fang-v-zhao-lei-private-lending.*` | 虚构案例（林芳诉赵磊），民间借贷 |
| `sample-*.json` | 示意数据：三个时间点、无分组、同侧双主体、两侧各两个主体、四方四个时间点、建设工程付款与结算 |

八批示例**已全部成对**：`fact/` 11 对、`agent/fact/` 7 对、`procedure/` 7 对、`agent/procedure/` 7 对、`relationship/` 5 对、`agent/relationship/` 5 对、`justification/` 2 对、`agent/justification/` 6 对。

MCP 的 `antu_examples` 传 `group="real"` 列出这一批。

## 给人和调试用的：`procedure/`

七份真实合同的履行流程，取自法析（faxi）的黄金样本，逐份对着它已生成的
`business_flowchart.mmd` 反推。**写程序图时以它们为准**，schema 定稿的验收标准就是这七份。

| 文件（同名前缀） | 节点 / 边 | 阶段 / 条款 | 特点 |
|---|---|---|---|
| `01-software-development-contract.*` | 14 / 16 | 5 / 2 | 3 个判定点，3 条整改后复验的回边 |
| `02-purchase-contract.*` | 12 / 12 | 0 / 0 | 没有阶段和条款的一份，11 层，2 个终点 |
| `03-labour-outsourcing-contract.*` | 9 / 9 | 2 / 7 | 条款最多，其中一条导致合同解除；2 条回边（每月循环） |
| `04-non-disclosure-agreement.*` | 4 / 3 | 0 / 1 | 最小的一份，没有判定点 |
| `05-premises-lease.*` | 19 / 19 | 4 / 4 | 14 层，3 个终点，2 条回边 |
| `06-epc-general-contract.*` | 21 / 21 | 4 / 4 | 15 层，2 个判定点，2 条回边 |
| `07-share-acquisition-agreement.*` | 21 / 20 | 4 / 4 | 5 个终点，一个节点 4 条出边，没有回边 |

## 给 agent 的：`agent/procedure/`

**这七份必须一直能通过校验**（与 fact 那批是同一条要求）。每份不超过 2 KB（实际 0.5~1.6 KB）。

**成对存放**：每份都有 `.zh-CN.json`（中文内容）与 `.en.json`（英文内容），
两份**结构完全相同，只有文本值不同**，与 `fact/` 那批同一个口径。

| 文件（同名前缀） | 讲什么 |
|---|---|
| `1-minimal.*` | 最小可用：起点、过程、终点，主干怎么标 |
| `2-decision.*` | 判定点：菱形、出边的条件、回边怎么写 |
| `3-branches.*` | 一个过程节点挂多条分支（不必是菱形） |
| `4-stages.*` | 阶段、主体与 `outcome`，以及 `document` / `note` 两种节点 |
| `5-inferred-spine.*` | 不标 `main`，让引擎自己认主干 |
| `6-merged-edges.*` | 同一目标的多条边：条件不同，渲染时合并成一条 |
| `7-rules.*` | `rules`：违约、延期、解除权这类随时可能触发的条款，写成规则而不是分支（v1.1） |

MCP 的 `antu_examples` 传 `type="procedure"` 默认给的就是这一批；
要看七份真实合同，加 `group="real"`。

## 给人和调试用的：`relationship/`

案件当事方一览：谁和谁有关系，某一天的横截面（`asOf`）。三份案例的当事方取自
`fact/` 里对应的虚构案件，两份示意数据从零写成。**成对存放**，口径与上面两类相同。

| 文件（同名前缀） | 主体 / 关系 | 说明 |
|---|---|---|
| `fang-yuan-parties.*` | 7 / 9 | 虚构案例（方远案）：借贷、房产抵押担保、夫妻与母子、指使催债，两个阵营 |
| `marketplace-parties.*` | 9 / 10 | 虚构案例（网络商城）：控制、持股、雇佣、合作与三家机关的查处，仓联公司居中 |
| `lin-fang-v-zhao-lei-parties.*` | 3 / 4 | 虚构案例（林芳诉赵磊）：两笔借款，案外人居中，最小的一份 |
| `sample-loan-guarantee.*` | 5 / 4 | 示意数据：一笔借款加担保 |
| `sample-group-guarantee.*` | 8 / 9 | 示意数据：集团股权结构与为它担保的两方 |

MCP 的 `antu_examples` 传 `type="relationship", group="real"` 列出这一批。

## 给 agent 的：`agent/relationship/`

**这五份必须一直能通过校验**，也不带任何提示（note）。每份 0.4~1.3 KB，成对存放。

| 文件（同名前缀） | 讲什么 |
|---|---|
| `1-minimal.*` | 最小可用：两个主体、一条关系，必填字段各出现一次 |
| `2-equity.*` | 股权与控制：`share` 写持股比例，箭头从持有人指向被持有的公司 |
| `3-guarantee.*` | 合同、债权与担保：`secures` 指向被担保的那笔债 |
| `4-groups.*` | `groups` + `groupId`：两个阵营，不分组的主体居中 |
| `5-kinship.*` | 身份与雇佣、代理：亲属默认无向，`directed` 改写；`asOf` 写横截面日期 |

MCP 的 `antu_examples` 传 `type="relationship"` 默认给的就是这一批。

## 给人和调试用的：`justification/`

一方对"为什么这样裁判"的说理：规范加事实，一层一层推出结论，按争点分框。两份都是按裁判说理的写法虚构的，
**成对存放**，口径与上面几类相同。

| 文件（同名前缀） | 节点 / 连线 | 说明 |
|---|---|---|
| `fang-yuan-defense-excess.*` | 40 / 48 | 虚构案例（方远案二审）：五个争点，被否定的特殊防卫，量刑里"从轻"与"限制从轻"并存，5 条事实在两个争点里各画一份 |
| `neighbour-corridor-liability.*` | 34 / 38 | 虚构案例（楼道充电劝阻案二审）：三个争点，被否定的一般侵权和公平责任，二审为什么可以对没上诉的部分改判 |

MCP 的 `antu_examples` 传 `type="justification", group="real"` 列出这一批。

## 给 agent 的：`agent/justification/`

**这六份必须一直能通过校验**，也不带任何提示（note）。每份 1.5~2.3 KB，成对存放。

| 文件（同名前缀） | 讲什么 |
|---|---|
| `1-minimal.*` | 最小可用：一个结论、一条规范、一个要件、两条事实，连线的方向 |
| `2-against-and-rejected.*` | 被否定的一方：`holds: "no"` 的要件，和以 `against` 指向它的评价 |
| `3-issues.*` | `groups`：一个争点一个框，终点结论摆在框之上 |
| `4-shared-fact.*` | 一条事实支持两个争点：写一遍，图上在两个争点里各画一份 |
| `5-sources.*` | 事实的 `date`，`detail` 放不进节点的全文，规范和事实指向 `statute` / `case` / `evidence` 来源 |
| `6-all-or-any.*` | `combine`：要件须全部具备（`all`，且），理由具备一个即可（`any`，或） |

MCP 的 `antu_examples` 传 `type="justification"` 默认给的就是这一批。

## `raw/` —— 原始材料

与上面各案例配套的**虚构**判决书全文，以及一份虚构的采购合同（配 `procedure/02-purchase-contract.*`）：
人物、单位、日期、金额、条款都是编造的，由案例数据整理而成，不对应任何真实案件或合同，
也不是法律意见。**不按大类分**：一份判决书可能同时是几种图的底稿。

**写 JSON 时的事实以它为准**，不要凭印象补。原始材料本身不打包进成品 HTML，
只是在 `sources` 里标明"依据在哪一份、哪一页"，材料由用户自己去找。
真实使用时，原始材料是用户自己的案卷，不在本仓库里。

MCP 的 `antu_examples` 传 `group="raw"` 列出，但**它不是示例，别拿它当模板**。

## 加一个新大类

```
examples/agent/<新大类>/   放几份最小示例
examples/<新大类>/         放完整案例（虚构的；暂时没有也可以）
```

MCP 那边不用改代码：`antu_examples` 传 `type` 就会去新目录取。

## 怎么用

```bash
npm run diagram -- examples/agent/fact/1-minimal.zh-CN.json   # 出一份自包含 HTML
npm run verify                                           # 校验全部示例
```
