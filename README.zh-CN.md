# 案图 antu

[![验证](https://github.com/zh-xx/Antu/actions/workflows/verify.yml/badge.svg)](https://github.com/zh-xx/Antu/actions/workflows/verify.yml)

[English](README.md) | **中文**

法律工作可视化渲染内核。输入一份 JSON，输出一个自包含的 HTML 文件，可离线打开、归档、传阅。

在成品 HTML 后加 `?lang=en` 或 `?lang=zh` 可指定界面语言。数据本身不翻译：案件内容随 JSON 走。

---

# 案图是什么

案图把法律工作的四类内容绘制成图。其规范为这四类内容专门定义，不沿用通用图表语法。

## 四类图

| 图 | 绘制内容 | 状态 |
|---|---|---|
| 关系图 | 主体、角色、法律关系 | 关系图子类可用（schema 暂定） |
| 事实图 | 时间、参与人、事件经过 | 时间图已可用 |
| 程序图 | 程序路径与可能分支 | 流程图已可用 |
| 证成图 | 规范与事实推出结论 | 搁置 |

## 为什么用案图

**一、通用可视化工具的语法不适用于法律工作。** 通用工具的语法建立在节点、边、时序、状态机等概念之上。法律工作的结构是主体、法律关系、程序路径与论证说理。通用工具可以完成绘制，但其语法中没有为诉讼地位、证据出处这类法律要素预留位置。

**二、成图质量不应取决于所用的大语言模型。** 通行的做法是让模型直接生成图形，模型能力不同，成图质量差异明显。案图不采用这一路径。模型只负责从案件材料中提取关键信息并输出一份 JSON，渲染由固定的引擎完成。因此，无论使用何种模型，成图结果一致。

**三、同一份输入应当产生同一张图。** 交付给法官或对方当事人的图，如果每次生成结果不同，就无法复现。案图的渲染过程不经过模型，同一份 JSON 在任何时间、任何环境下渲染，结果完全相同。

**四、出处自生成时即已确定。** 通行的做法是在成图之后追问结论的依据，再通过对话补充查证。案图要求提取信息时即写明每一条事实出自哪一份材料、第几页、依据哪一条法律。成图时，出处已在图上。

法律工作对交付材料的要求是可复现、可溯源。以上四点分别指向这两项要求。

---

# 案图怎么工作

## 分工

```
agent ──> 提取关键信息 ──> 一份 JSON ──> 引擎 ──> 图
```

| 角色 | 职责 | 确定性 |
|---|---|---|
| 模型 | 读文书、提取事实、理解语义 | 允许不确定 |
| 引擎 | 按规范渲染成图 | 完全确定，与模型无关 |
| JSON 规范 | 两者的分界，唯一接口 | 固定不变 |

这一分工把“生成一张符合法律规范的图”这一模型能力差异较大的任务，转换为“将信息提取为 JSON”这一各类模型均可完成的任务。引擎不生成 JSON，agent 不承担渲染。两者的边界是 JSON 规范。

图形能够符合法律工作的需要，原因是规范本身为法律工作设计，而非套用通用图表语法。

## 出处

| 环节 | 做法 |
|---|---|
| 挂载 | 事件挂证据、文书；主张挂法条、判例；关系挂合同、登记记录 |
| 定位 | 结构化定位，可校验、可反查：案号、合同页码、法条条号 |
| 引用 | 来源表仅存一份，多处表达引用同一个 id，不重复复制 |
| 边界 | 图上仅标明依据所在材料与页码。原始材料不打包，不跳转，由使用者自行查阅 |

## 产物

一份 JSON 生成一个自包含的 HTML 文件，约 1.9 MB（大部分是布局引擎 ELK），引擎与数据均在文件内，不发起网络请求，不需要服务器，可离线打开。适用于归档、传阅、作为邮件附件发送。

## 用法

```bash
npm install
npm run diagram -- examples/fact/elevator-smoking-case.zh-CN.json
# → examples/fact/elevator-smoking-case.zh-CN.html
```

## 接入 agent

```json
{
  "mcpServers": {
    "antu": {
      "command": "node",
      "args": ["/绝对路径/antu/tools/mcp/server.mjs"]
    }
  }
}
```

agent 可以读取规范、查看示例、校验、计算几何、生成成品，并截图核对效果。校验仅能确认 JSON 合法，不能确认成图效果合格，因此截图核对是必要步骤。agent 的参考资料为 4.5k token（字段表 2.9k 字符 + 机制说明 4.0k 字符）。

未接入 MCP 时，按以下顺序阅读。

- **事实图（时间图）**：[spec/fact/schema-draft.md](spec/fact/schema-draft.md)（字段定义）、[spec/fact/timeline-rules.md](spec/fact/timeline-rules.md)（事件排布规则），并参考 [examples/fact/elevator-smoking-case.zh-CN.json](examples/fact/elevator-smoking-case.zh-CN.json)。
- **程序图（流程图）**：[spec/agent/procedure/guide.md](spec/agent/procedure/guide.md)（一页机制说明）、[spec/procedure/schema-draft.zh-CN.md](spec/procedure/schema-draft.zh-CN.md)（字段定义与排布规则），并参考 [examples/agent/procedure/7-rules.zh-CN.json](examples/agent/procedure/7-rules.zh-CN.json)，或一份真实合同，如 [examples/procedure/05-premises-lease.zh-CN.json](examples/procedure/05-premises-lease.zh-CN.json)。

## 设计文档

`spec/` 目录下，供人阅读：架构 [v0-architecture.md](spec/v0-architecture.md)、来源的 7 类字段 [source-schema-draft.md](spec/source-schema-draft.md)、事实图 [spec/fact/](spec/fact/)、程序图 [spec/procedure/schema-draft.zh-CN.md](spec/procedure/schema-draft.zh-CN.md)、MCP 服务端 [mcp-server.md](spec/mcp-server.md)。给 agent 看的说明在 [spec/agent/](spec/agent/)。

已知问题与需求在 [GitHub issues](https://github.com/zh-xx/Antu/issues) 里管理。贡献者的做事规矩见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

未定。仓库当前为 private，尚无 LICENSE 文件。
