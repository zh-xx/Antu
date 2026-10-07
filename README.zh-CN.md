# 案图 Antu

[![验证](https://github.com/zh-xx/Antu/actions/workflows/verify.yml/badge.svg)](https://github.com/zh-xx/Antu/actions/workflows/verify.yml)
[![CodeQL](https://github.com/zh-xx/Antu/actions/workflows/codeql.yml/badge.svg)](https://github.com/zh-xx/Antu/actions/workflows/codeql.yml)
[![版本](https://img.shields.io/github/v/release/zh-xx/Antu)](https://github.com/zh-xx/Antu/releases)
[![npm](https://img.shields.io/npm/v/@zh-xx/antu?label=npm)](https://www.npmjs.com/package/@zh-xx/antu)
[![许可证: AGPL-3.0-or-later](https://img.shields.io/github/license/zh-xx/Antu)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933)](package.json)
[![状态: 0.x](https://img.shields.io/badge/%E7%8A%B6%E6%80%81-0.x%20draft-orange)](CHANGELOG.md)
[![在线演示](https://img.shields.io/badge/%E6%BC%94%E7%A4%BA-online-blue)](https://zh-xx.github.io/Antu/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)

[English](README.md) | **中文**

案图把一份 JSON 变成一个自包含的 HTML 法律图。页面是一个约 2.3 MB 的文件，不发起网络请求，不需要服务器；可以离线打开，也可以归档、打印或作为附件发送。可以由 AI Agent 阅读案件材料并写出
JSON，再由引擎据此画图；同一份 JSON 得到的图是一致的。案图目前处于 0.x 阶段，关系图和证成图的格式仍是草案。

## 图的类型

四类法律内容，每一类有多种画法。页面里的选择器可以切换画法，JSON 中没有任何字段决定画法。

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

## 使用

```bash
npm install
npm run diagram -- examples/fact/neighbour-corridor-charging.zh-CN.json
```

页面生成在 JSON 文件旁边。页面的界面语言用 `?lang=en` 或 `?lang=zh` 指定；案件内容不翻译。

## 原理

```
Agent ──> 提取关键信息 ──> 一份 JSON ──> 引擎 ──> 图
```

| 角色 | 职责 | 确定性 |
|---|---|---|
| 模型 | 读文书、提取事实、理解语义 | 每次的结果可能不同 |
| 引擎 | 按规范画图 | 同一份 JSON 得到同一张图，与由哪个模型写出无关 |
| JSON 规范 | 两者之间唯一的接口 | 有版本号（见 [spec/versioning.md](spec/versioning.md)） |


引擎不写 JSON，Agent 不画图：模型只负责把信息写进 JSON，画图由引擎完成。JSON 规范自成一套，原因有四：

1. 通用图表语法建立在节点、边和状态机之上，没有为诉讼地位、证据出处这类要素预留位置。
2. 图不取决于由哪个模型提取信息。
3. 同一份 JSON 在任何时间、任何环境下得到同一张图，交给法院或对方当事人的图可以复现。
4. 出处在提取事实时记录：每一条事实写明所依据的材料、页码和条文，图上随之标出。材料本身不打包，也不跳转。

## 接入 Agent

Agent 的参考资料，以事实图为例，是约 3.3k 字符的字段表和约 5.8k 字符的机制说明。

### Skill

```
npx skills add zh-xx/Antu -g
```

Skill 位于 [`skills/antu/`](skills/antu/)；每个[发布](https://github.com/zh-xx/Antu/releases)也附有 `antu-skill-<版本>.zip`。

命令行每天向 npm 注册表询问一次是否有更新的案图版本（一次 GET 请求，不含任何图的内容）；有则在输出末尾给出提示。设置 `ANTU_NO_UPDATE_NOTIFIER=1` 可关闭。

### MCP

MCP 服务是 npm 包 [`@zh-xx/antu`](https://www.npmjs.com/package/@zh-xx/antu)，在 [MCP 注册表](https://registry.modelcontextprotocol.io)中登记为 `io.github.zh-xx/antu`。

```json
{
  "mcpServers": {
    "antu": {
      "command": "npx",
      "args": ["-y", "-p", "@zh-xx/antu@latest", "antu-mcp"]
    }
  }
}
```

工具：`antu_schema`、`antu_guide`、`antu_examples`、`antu_validate`、`antu_layout`、`antu_render`、`antu_preview`。

## 文档

- 供人阅读的设计文档在 [`spec/`](spec/)：[架构](spec/v0-architecture.md)、[来源的 7 类字段](spec/source-schema-draft.md)、[主题](spec/theme.md)、[MCP 服务端](spec/mcp-server.md)，以及各类图（[事实图](spec/fact/)、[程序图](spec/procedure/schema-draft.zh-CN.md)、[关系图](spec/relationship/schema-draft.zh-CN.md)、[证成图](spec/justification/schema-draft.zh-CN.md)）。给 Agent 看的说明在 [`spec/Agent/`](spec/Agent/)。
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
