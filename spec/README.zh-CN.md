# 规范（契约）

这里定义**什么算合法**：图的 JSON、版本号、embed / MCP 行为、主题与纸张用量，以及 Agent 会加载的短说明。

若一处改动会让旧文件或旧工具调用变错，应放在这里。架构缘由、库速查、渲染长文在 [`docs/`](../docs/)。

| 分区 | 内容 |
|---|---|
| 根目录（`versioning`、`theme`、`paper`、`embed`、`mcp-server`、`source-schema-draft`、`versions`） | 跨图种的产品 / API 契约 |
| `fact/`、`procedure/`、`relationship/`、`justification/` | 各图种 schema 草案、变更切片、排布规则（`timeline-rules`） |
| [`agent/`](agent/) | 给 Agent 的机制说明（仅英文） |

设计长文与参考手册见 [`docs/README.zh-CN.md`](../docs/README.zh-CN.md)。
英文权威稿：[README.md](README.md)。
