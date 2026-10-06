# 案图 Antu

[![验证](https://github.com/zh-xx/Antu/actions/workflows/verify.yml/badge.svg)](https://github.com/zh-xx/Antu/actions/workflows/verify.yml)

[English](README.md) | **中文**

案图把一份 JSON 变成一个自包含的 HTML 法律图。页面可以离线打开，也可以归档、打印或作为附件发送。可以由 AI agent 阅读案件材料并写出
JSON，再由引擎据此画图；同一份 JSON 得到的图是一致的。案图目前处于 0.x 阶段，关系图和证成图的格式仍是草案。

## 你能得到什么

四类法律内容，每一类都有几种画法。页面里有选择器可以切换，JSON 里没有任何字段决定画法。下面是页面自己在选择器里显示的示意图，每种画法一张；点名字可以打开一个能用这种画法画出来的案例（`npm run diagram -- <文件>`，再在页面里选画法）。

<table>
<tr><th rowspan="2" align="left" valign="middle">关系图</th><td align="center"><a href="examples/relationship/marketplace-parties.zh-CN.json"><img src="assets/kinds/graph.svg" width="88" alt="关系图"><br>关系图</a></td><td align="center"><a href="examples/relationship/marketplace-parties.zh-CN.json"><img src="assets/kinds/focus.svg" width="88" alt="聚焦图"><br>聚焦图</a></td><td align="center"><a href="examples/relationship/marketplace-parties.zh-CN.json"><img src="assets/kinds/chain.svg" width="88" alt="担保链图"><br>担保链图</a></td><td align="center"><a href="examples/relationship/marketplace-parties.zh-CN.json"><img src="assets/kinds/matrix.svg" width="88" alt="关系矩阵"><br>关系矩阵</a></td><td align="center"><a href="examples/relationship/marketplace-parties.zh-CN.json"><img src="assets/kinds/equity.svg" width="88" alt="股权图"><br>股权图</a></td></tr>
<tr><td align="center"><a href="examples/relationship/marketplace-parties.zh-CN.json"><img src="assets/kinds/authority.svg" width="88" alt="控制与任职图"><br>控制与任职图</a></td><td align="center"><a href="examples/relationship/marketplace-parties.zh-CN.json"><img src="assets/kinds/related.svg" width="88" alt="关联方清单"><br>关联方清单</a></td><td align="center"><a href="examples/relationship/marketplace-parties.zh-CN.json"><img src="assets/kinds/path.svg" width="88" alt="关系路径图"><br>关系路径图</a></td><td align="center"><a href="examples/relationship/marketplace-parties.zh-CN.json"><img src="assets/kinds/summary.svg" width="88" alt="集团汇总图"><br>集团汇总图</a></td></tr>
<tr><th rowspan="1" align="left" valign="middle">事实图</th><td align="center"><a href="examples/fact/neighbour-corridor-charging.zh-CN.json"><img src="assets/kinds/timeline.svg" width="88" alt="时间图"><br>时间图</a></td><td align="center"><a href="examples/fact/neighbour-corridor-charging.zh-CN.json"><img src="assets/kinds/chronicle.svg" width="88" alt="大事记"><br>大事记</a></td><td align="center"><a href="examples/fact/neighbour-corridor-charging.zh-CN.json"><img src="assets/kinds/scale.svg" width="88" alt="比例时间轴"><br>比例时间轴</a></td></tr>
<tr><th rowspan="1" align="left" valign="middle">程序图</th><td align="center"><a href="examples/procedure/05-premises-lease.zh-CN.json"><img src="assets/kinds/flow.svg" width="88" alt="流程图"><br>流程图</a></td><td align="center"><a href="examples/procedure/05-premises-lease.zh-CN.json"><img src="assets/kinds/route.svg" width="88" alt="路线图"><br>路线图</a></td></tr>
<tr><th rowspan="1" align="left" valign="middle">证成图</th><td align="center"><a href="examples/justification/fang-yuan-defense-excess.zh-CN.json"><img src="assets/kinds/tree.svg" width="88" alt="说理树"><br>说理树</a></td></tr>
</table>

关系图画主体、角色和法律关系；事实图画时间、参与人和事件经过；程序图画程序路径与可能分支；证成图画由规范与事实推出的结论。关系图和证成图的 schema 仍是草案。

三种外观，叫**主题**：`document` 文书黑白（方正、纯黑白，适合打印和归档，默认）、`modern` 现代简洁、`legal` 法律蓝。读者在页面里
切换，调用时也可以把页面固定成某一个。只有图本身受主题影响，详见 [spec/theme.md](spec/theme.md)。

## 试一试

```bash
npm install
npm run diagram -- examples/fact/neighbour-corridor-charging.zh-CN.json
# → examples/fact/neighbour-corridor-charging.zh-CN.html   （用浏览器打开）
```

想让 agent 来做，见下面的[接入 agent](#接入-agent)。

在生成的页面后加 `?lang=en` 或 `?lang=zh` 可指定界面语言。数据本身不翻译：案件内容随 JSON 走。

## 怎么工作

```
agent ──> 提取关键信息 ──> 一份 JSON ──> 引擎 ──> 图
```

| 角色 | 职责 | 确定性 |
|---|---|---|
| 模型 | 读文书、提取事实、理解语义 | 每次的结果可能不同 |
| 引擎 | 按规范画图 | 同一份 JSON 得到同一张图，与由哪个模型写出无关 |
| JSON 规范 | 两者之间唯一的接口 | 有版本号（见 [spec/versioning.md](spec/versioning.md)） |

引擎不写 JSON，agent 不画图。对模型的要求只有一件事：把信息提取成 JSON；画图交给引擎。

**为什么另定一套规范？**

1. 通用图表的语法建立在节点、边、状态机之上，没有为诉讼地位、证据出处这类要素预留位置。案图的规范是为这四类内容专门写的。
2. 图不取决于由哪个模型来提取信息，因为画图的是引擎。
3. 同一份 JSON 在任何时间、任何环境下得到同一张图，所以交给法院或对方当事人的图可以复现。
4. 出处在提取事实时就记录下来：每一条事实写明出自哪份材料、第几页、依据哪一条法律，因此图画出来时，出处已经在图上。

### 出处

| 环节 | 做法 |
|---|---|
| 挂载 | 事件挂证据、文书；主张挂法条、判例；关系挂合同、登记记录 |
| 定位 | 结构化定位，可校验、可反查：案号、合同页码、法条条号 |
| 引用 | 来源表仅存一份，多处表达引用同一个 id |
| 边界 | 图上仅标明依据所在材料与页码。原始材料不打包，不跳转，由使用者自行查阅 |

### 你得到的页面

一个自包含的 HTML 文件，约 2.3 MB（大部分是布局引擎 ELK），引擎与数据都在文件里，不发起网络请求，不需要服务器，可以离线打开，也可以归档、传阅或作为邮件附件发送。

## 接入 agent

有两种方式，对应两类用户。

### 技能包（大多数人）

最省事的办法：对你的 agent（Claude Code、Codex 等读技能包的客户端）说一句话，它会自己把最新的技能包装上：

> 请为你自己安装案图 Skill：运行 `npx skills add zh-xx/Antu -g -y`。

也可以自己在终端里运行：`npx skills add zh-xx/Antu -g`。需要装有 [Node.js](https://nodejs.org) 18 或更新。之后用 `npx skills update -g` 把技能包更新到最新的发布（我们见过它报告「已是最新」，还没有见过它发现并更新到一个新发布）。agent 可能会请你确认这条命令；技能包是以 agent 的权限运行的，所以装之前请看一眼装的是什么；安装器还会匿名上报使用情况，设环境变量 `DISABLE_TELEMETRY=1` 可以关掉。如果安装器找不到它认识的 agent，或者你只想装给某一个 agent，加上 `-a <agent 的名字>`（例如 `-a claude-code`）。**这条命令本身我们在沙箱里试过（能找到技能包、装上、并显示已是最新）；这一句话在真实客户端里的效果我们还没试过**（#53）。

技能包是 [`skills/antu/`](skills/antu/)：`SKILL.md`（怎么选图、怎么如实地写 JSON、怎么出页面）、四类图的说明和字段表、示例，以及一个查看页模板和把数据填进去的 Python 脚本。不需要联网；有 Node 18 以上时多一个单文件命令行 `scripts/antu.mjs`（`validate` 校验、`layout` 排版报告、`render` 出页面、`preview` 截图看图），让 agent 交稿前先自查，电脑上有 Chrome、Edge 或 Chromium 时还能看一眼成图；没有 Node 就用 Python 脚本。它是**上一次发布**的状态（规则见 [spec/versioning.md](spec/versioning.md)），所以新版本在发布之后才会出现；它做的页面里写着版本号：`<meta name="generator" content="antu X.Y.Z">`。

放进去的其他办法：把 `skills/antu/` 整个目录拷到 `~/.claude/skills/antu/`（Claude Code）或 `~/.codex/skills/antu/`（Codex，然后重启）；或者，对能「导入本地技能包」的客户端（如 WorkBuddy），到 [Releases](https://github.com/zh-xx/Antu/releases) 下载 `antu-skill-<版本>.zip` 导入。**这几种我们还没有在真实客户端里试过。**

### MCP 服务（给自己配置 MCP 的人）

案图也是一个 MCP 服务，发布在 npm 上，包名 [`@zh-xx/antu`](https://www.npmjs.com/package/@zh-xx/antu)，并登记在 [MCP 注册表](https://registry.modelcontextprotocol.io)里，名字是 `io.github.zh-xx/antu`。各个 MCP 客户端存放服务列表的地方不一样，所以这里只给一段配置文本；放到你的客户端要求的位置（见它自己的文档）：

```json
{
  "mcpServers": {
    "antu": {
      "command": "npx",
      "args": ["-y", "-p", "@zh-xx/antu", "antu-mcp"]
    }
  }
}
```

需要装有 [Node.js](https://nodejs.org) 18 或更新；`npx` 在第一次启动时下载这个包（约 2 MB），之后会再检查。**包本身我们试过（从 npm 装进空文件夹，能启动，并列出它的七个工具）；这段配置在真实客户端里我们还没试过**（#53）。

agent 可以读取规范、查看示例、校验、计算几何、生成页面，并截图核对效果。校验只能确认 JSON 合法，不能确认成图合格，建议截图看一眼。`antu_render` 不指定路径时，把页面写在服务启动时所在的文件夹；`antu_preview` 需要电脑上有 Chrome、Edge 或 Chromium（没有就会说明，其余工具照常可用）。agent 的参考资料为 5.4k token（字段表 3.2k 字符 + 机制说明 5.1k 字符）。

未接入 MCP、也不用技能包时，按以下顺序阅读。

- **事实图（时间图）**：[spec/fact/schema-draft.md](spec/fact/schema-draft.md)（字段定义）、[spec/fact/timeline-rules.md](spec/fact/timeline-rules.md)（事件排布规则），并参考 [examples/fact/neighbour-corridor-charging.zh-CN.json](examples/fact/neighbour-corridor-charging.zh-CN.json)。
- **证成图（说理树）**：[spec/agent/justification/guide.md](spec/agent/justification/guide.md)（一页机制说明）、[spec/justification/schema-draft.zh-CN.md](spec/justification/schema-draft.zh-CN.md)（字段定义、规则、排布和画法，草案），并参考 [examples/agent/justification/2-against-and-rejected.zh-CN.json](examples/agent/justification/2-against-and-rejected.zh-CN.json)，或一份（虚构的）完整案例，如 [examples/justification/neighbour-corridor-liability.zh-CN.json](examples/justification/neighbour-corridor-liability.zh-CN.json)。
- **程序图（流程图）**：[spec/agent/procedure/guide.md](spec/agent/procedure/guide.md)（一页机制说明）、[spec/procedure/schema-draft.zh-CN.md](spec/procedure/schema-draft.zh-CN.md)（字段定义与排布规则），并参考 [examples/agent/procedure/7-rules.zh-CN.json](examples/agent/procedure/7-rules.zh-CN.json)，或一份真实合同，如 [examples/procedure/05-premises-lease.zh-CN.json](examples/procedure/05-premises-lease.zh-CN.json)。
- **关系图**：[spec/agent/relationship/guide.md](spec/agent/relationship/guide.md)（一页机制说明）、[spec/relationship/schema-draft.zh-CN.md](spec/relationship/schema-draft.zh-CN.md)（字段定义与排布规则，暂定），并参考 [examples/agent/relationship/3-guarantee.zh-CN.json](examples/agent/relationship/3-guarantee.zh-CN.json)，或一份（虚构的）完整案例，如 [examples/relationship/fang-yuan-parties.zh-CN.json](examples/relationship/fang-yuan-parties.zh-CN.json)。

## 更多

- 供人阅读的设计文档在 [`spec/`](spec/)：[架构](spec/v0-architecture.md)、[来源的 7 类字段](spec/source-schema-draft.md)、[主题](spec/theme.md)、[MCP 服务端](spec/mcp-server.md)，以及各类图（[事实图](spec/fact/)、[程序图](spec/procedure/schema-draft.zh-CN.md)、[关系图](spec/relationship/schema-draft.zh-CN.md)、[证成图](spec/justification/schema-draft.zh-CN.md)）。给 agent 看的说明在 [`spec/agent/`](spec/agent/)。
- [CHANGELOG.md](CHANGELOG.md)，版本号的规则见 [spec/versioning.md](spec/versioning.md)。
- 已知问题与需求记录在 [GitHub issues](https://github.com/zh-xx/Antu/issues)。参与贡献前，请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

Copyright (C) 2026 Ji Cheng。

案图是自由软件，采用 **GNU Affero 通用公共许可证第 3 版，或（由你选择）任何更新的版本**（[`LICENSE`](LICENSE)，SPDX 标识 `AGPL-3.0-or-later`）。简单说：你可以使用、研究、修改和分享它，包括商业用途。如果你发布了修改后的版本，或者让别人通过网络使用它（例如做成在线服务），就必须用同一许可证公开你的修改、保留版权和许可声明，并提供源代码。不提供任何担保。这段话只是概括，以许可证原文为准。

- **附加许可（AGPL 第 7 条）。** 用案图生成的页面里，既有案图的代码，也有你提供的图的数据。图的数据，以及你用自己的材料画出的图的内容，不属于案图，不受这个许可证约束：你可以保密、公开或出售，条件由你定。许可证约束的是页面里案图的代码，页面里的声明必须保留。同样的文字（英文）放在每一份生成的页面里和命令行的开头。
- 仓库里的一切（代码、示例、规范和指南），除下面点名的以外，都在同一许可证之下。
- 页面和命令行里包含的其他项目的代码，保留各自的许可证。它们的声明在 [`skills/antu/THIRD-PARTY-NOTICES.md`](skills/antu/THIRD-PARTY-NOTICES.md)，也放在每一份生成的页面里和命令行的开头，连同案图的许可证和该版本源码的位置。
- `examples/` 里的案例和 `examples/raw/` 里的判决书都是虚构的：人物、公司、日期、金额和条款均为编造，不对应任何真实案件，适用同一许可证。
- 0.5.0 及以前的版本发布时没有许可证文件。许可证从 0.5.1 起适用。
