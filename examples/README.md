# 示例

**按大类分目录，每个大类下再按读者分三批。**

```
examples/
├── agent/<大类>/     给 agent 的：最小、每份只讲一件事
├── <大类>/           真实案例与示意数据：完整、能打开看
└── raw/              原始材料（裁判文书原文），不属于任何一批示例
```

现在只有事实图一类，所以是 `fact/`。

## 给 agent 的：`agent/fact/`

**这六份必须一直能通过校验**（`npm run verify` 会检查）。
它们不是文档，是**能跑的数据**：schema 一改就会失败，所以不会悄悄漂移。

| 文件 | 讲什么 |
|---|---|
| `1-minimal.json` | 最小可用：两个主体、三个时间点，必填字段各出现一次 |
| `2-single-actor.json` | 单主体怎么写，视角怎么写 |
| `3-groups.json` | `groups` + `groupId`，按性质分两侧 |
| `4-views.json` | `views` 的完整写法（三种看法） |
| `5-duration.json` | `dateEnd` / `approx` / `dateNote` |
| `6-sources.json` | `sources` + `sourceIds` |

每份 0.8~1.2 KB，读三份约 3 KB。**六份的所有视角都排得下**，
agent 照抄结构不会撞到"摆不下"。MCP 的 `antu_examples` 默认给的就是这一批。

## 给人和调试用的：`fact/`

完整、能打开看。一份 4~8 KB。

| 文件 | 说明 |
|---|---|
| `人脸识别第一案-单主体.json` | 真实案例（郭兵案），单主体 |
| `电梯劝烟案.json` | 真实案例（郑州电梯劝烟案），双主体 |
| `示例-*.json` | 示意数据：同侧双主体、两侧各两个主体、无分组、时间点数量、付款与结算 |

MCP 的 `antu_examples` 传 `group="real"` 列出这一批。

## `raw/` —— 原始材料

真实案例的裁判文书原文（下载所得，未经加工）。**不按大类分**：
一份判决书可能同时是几种图的底稿。

**写 JSON 时的事实以它为准**，不要凭印象补。原始材料本身不打包进成品 HTML，
只是在 `sources` 里标明"依据在哪一份、哪一页"，材料由用户自己去找。

MCP 的 `antu_examples` 传 `group="raw"` 列出，但**它不是示例，别拿它当模板**。

## 加一个新大类

```
examples/agent/<新大类>/   放几份最小示例
examples/<新大类>/         放真实案例（暂时没有也可以）
```

MCP 那边不用改代码：`antu_examples` 传 `type` 就会去新目录取。

## 怎么用

```bash
npm run diagram -- examples/agent/fact/1-minimal.json   # 出一份自包含 HTML
npm run verify                                           # 校验全部示例
```
