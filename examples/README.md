# 示例

分两批，服务两种读者。**目录就这么分的，别再混着放。**

## `agent/` —— 给 agent 看的

小、每份只讲一件事。**这六份必须一直能通过校验**（`npm run verify` 会检查）。

它们不是文档，是**能跑的数据**：schema 一改它们就会失败，所以不会悄悄漂移。

| 文件 | 讲什么 |
|---|---|
| `1-minimal.json` | 最小可用：两个主体、三个时间点，必填字段各出现一次 |
| `2-single-actor.json` | 单主体怎么写，视角怎么写 |
| `3-groups.json` | `groups` + `groupId`，按性质分两侧 |
| `4-views.json` | `views` 的完整写法（三种看法） |
| `5-duration.json` | `dateEnd` / `approx` / `dateNote` |
| `6-sources.json` | `sources` + `sourceIds` |

每份 0.8~1.2 KB，读三份约 3 KB。**六份的所有视角都排得下**，
agent 照抄结构不会撞到"摆不下"。

MCP 的 `antu_examples` 默认给的就是这一批。

## 根目录这一层 —— 给人和调试用的

真实案例与接近真实的示意数据，完整、能打开看。一份 4~8 KB。

| 文件 | 说明 |
|---|---|
| `fact-人脸识别第一案-单主体.json` | 真实案例（郭兵案），单主体 |
| `fact-电梯劝烟案.json` | 真实案例（郑州电梯劝烟案），双主体 |
| `fact-示例-*.json` | 示意数据：同侧双主体、两侧各两个主体、无分组、三个/四个时间点、建设工程付款与结算 |

MCP 的 `antu_examples` 传 `group="real"` 列出这一批。

## `raw/` —— 原始材料

真实案例的裁判文书原文（下载所得，未经加工）。

**写 JSON 时的事实以它为准**，不要凭印象补。原始材料本身不打包进成品 HTML，
只是在 `sources` 里标明"依据在哪一份、哪一页"，材料由用户自己去找。

## 命名规则

```
examples/
├── agent/                           给 agent 的小示例（编号排序，1 在最前）
├── fact-<案件简称>.json              真实案例
├── fact-示例-<要演示的写法>.json      示意数据
└── raw/<案号>-<案件简称>-<审级>.md    原始文书
```

`type` 前缀按大类来：`fact-` / `relationship-` / `procedure-` / `justification-`。
后三类还没做。

## 怎么用

```bash
npm run diagram -- examples/agent/1-minimal.json    # 出一份自包含 HTML
npm run verify                                       # 校验全部示例（含 agent 那批）
```
