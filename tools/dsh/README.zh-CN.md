# DSH 插件（`@zh-xx/antu-dsh`）

规划：[spec/dsh-plugin.zh-CN.md](../../spec/dsh-plugin.zh-CN.md)（英文 [spec/dsh-plugin.md](../../spec/dsh-plugin.md)）。
DSH 约定（资源地址、provider、席位）：[spec/dsh-conventions.zh-CN.md](../../spec/dsh-conventions.zh-CN.md)
（英文 [spec/dsh-conventions.md](../../spec/dsh-conventions.md)）。
总 issue：[#79](https://github.com/zh-xx/Antu/issues/79)。英文版 [README.md](./README.md) 为准。

**已在 npm 上发布为 `@zh-xx/antu-dsh`**（自 0.16.1 起；插件与仓库同版本号，并精确依赖同一版本的 `@zh-xx/antu`）：`dsh plugin --profile <name> add @zh-xx/antu-dsh`，然后重启 DSH。要试自己的构建，用** tarball**（`npm run build:dsh`，见下）。

## 要求

| 侧 | 需要 |
| --- | --- |
| Host 工具 / skill | 能解析 `@deepseek-ai/dsh-tools` / `@deepseek-ai/dsh-skill`（peer `^0.2.0-rc.2 || ^0.2.1-rc.0`）以及 `@zh-xx/antu` 的 DSH |
| Client 聊天卡 + 全屏 | **DeepSeek Harness ≥ 0.2.0-rc.2** — 懒加载的 embed 块用 ModuleLoader `require.async('./client.embed.js')`。DSH **0.1.x** 没有 `require.async`，也没有包内 chunk 的 Host 路由；那些宿主上卡片会给出明确的升级提示，而不是把席位打崩 |

peer 标成可选，以便只装 Host 的配置文件仍能安装；在宿主提供 `require.async` 之前，Client 半边不会画出图。

## 布局

```
tools/dsh/
  README.md / README.zh-CN.md
  build.mjs           组装 package/ + npm pack tarball
  src/                Host / Client / skill 源码（提交）
  package/            包根 — 提交：package.json、cordis.patch.yml、locale/
  zh-xx-antu-dsh-*.tgz   build:dsh 产出（gitignore）
  .gitignore          生成的 Host/Client/embed + tgz 不进 git
```

`npm run build:dsh` 总会重建 embed，写出 `package/index.js`、`package/client.js`、
`package/lib/*`、`package/client.embed.js`，并打包 `tools/dsh/zh-xx-antu-dsh-<version>.tgz`。
`package/` 下的生成文件与 tarball 不提交（`spec/dsh-plugin.md`）。

## 测过的环境

| DSH | 何处 | 结果 |
| --- | --- | --- |
| 0.2.0-rc.2 | Linux 容器，无头 Chromium（明暗、中英） | 全部 P2 检查与聊天卡条通过 |
| 0.2.1-rc.2 | 维护者的 Mac | 通过（2026-10-18 报告，issue #219） |

peer 范围列了两者：预发布版只满足点名了同一 `x.y.z` 预发布的范围，所以单独写 `^0.2.0-rc.2` 会漏掉 `0.2.1-rc.2`。

## 装进 DSH

**从 npm**：`dsh plugin --profile <name> add @zh-xx/antu-dsh`，然后重启 DSH。

**或用 tarball**（peer 在 DSH 配置文件内解析）：

```bash
npm run build:dsh
# 然后安装 tools/dsh/zh-xx-antu-dsh-<version>.tgz
# Desktop: plugin_manager → install_bundle → .tgz 的绝对路径
# CLI:    dsh plugin --profile web add /abs/path/to/zh-xx-antu-dsh-<version>.tgz
```

用 `link:` 一类方式直接挂 `tools/dsh/package/` 目录常常会 `failed to import`，因为该目录没有 `@deepseek-ai/dsh-tools` 的 `node_modules`。请用 tgz（或已发布的 npm 包）。

### 改完插件之后

tarball 名只带版本号，同版本重建的 tgz 对 pnpm 看起来没变：`add` 会打印 `Already up to date` 并留下旧代码。测新构建：

```bash
npm run build:dsh                                  # 打包失败会保留上次好的 tgz 并说明原因
ls tools/dsh/zh-xx-antu-dsh-*.tgz                  # 安装前文件必须存在
dsh plugin --profile <name> remove @zh-xx/antu-dsh
dsh plugin --profile <name> add /abs/path/to/zh-xx-antu-dsh-<version>.tgz
```

然后**重启 DSH**：插件在启动时加载，正在跑的会话会留着旧代码。
若 `add` 只给退出码（例如 `254`），先确认 tgz 路径存在；DSH 的插件日志不含 pnpm 的错误正文。

## 注册了什么

| 侧 | 能力 |
| --- | --- |
| Host | 原生工具 `antu_validate`、`antu_layout`、`antu_render`（HTML 写在会话 cwd 下） |
| Host | 参考工具 `antu_schema`（字段表）、`antu_guide`（机制说明）、`antu_examples`（列表或取一条）— 从已安装的 `@zh-xx/antu` 读，无需搜文件系统 |
| Host | Memory skill `antu-diagram`（教 Host 线名，不是 CLI） |
| Client | 对 `antu_render` 与 `mcp__antu__antu_render` 的 `tool.call.toolview`（回合末尾在时：一行紧凑：标题、状态、**打开全屏**；否则整张卡） |
| Client | 文案跟 DSH 语言：`antuDsh` locale 命名空间带英文与简体中文；切语言会更新已打开的卡，无需重载。嵌入页说同一语言：字典键 `embed.lang`（`zh` / `en`）经 `t` 读出，作为 `mount({ lang })` 传入，切换时用 `setLang` |
| Client | `conversation.chat.turnTail` 数据 `antu-diagrams`：DSH「Completed in Ns」折叠之后的拟合图；折叠打开时 `ResizeObserver` 会再拟合 |
| Client | 回合末尾图上方一排小样（多于一种画法时），与画面同框（关系图 7、流程图 2、事实时间线 3）：当前高亮，一点即按该 kind 重画且不重挂。选择只记在内存，重载后回到调用自带的 kind；**打开全屏**用所选 kind。只有一种画法的图没有这条 |
| Client | 右侧栏资源类型 `antu-diagram`（全屏 embed）；点卡片打开其 `dsh-resource://antu/…` 地址，重载后标签页从 Session 历史恢复 |
| Client | 图经主题服务跟随 DSH 明暗：深色宿主用 `dark` 主题画，浅色宿主用调用所要的主题（浅色时也可是全屏上次的选择）；切换会重画打开的卡与全屏，无需重载 |

图画在回合末尾（`conversation.chat.turnTail`），在 DSH 把已完成回合的工具步骤折进折叠之后，这样不用打开折叠也能看见。卡片从工具调用的**参数**（`argsRaw`）读 `spec`，只显示画面——若有多种画法再加 kind 条——整图拟合（`cardUi`）。宿主变大时 `ResizeObserver` 调 embed 的 `fitView()`，隐藏时装上的卡不会空白。
点击打开全屏，在右侧栏全屏，带画法与主题开关、详情卡与导出。没有**打开 HTML** 按钮：文件路径在聊天里的 `antu_render` 结果中，且该按钮重载后会消失（issue #224）。标签页只按 `dsh-resource://antu/…` 地址保存；资源 provider 从 Session 历史重读 `antu_render` 调用，重载不需要私有缓存。没有 conversation 服务的 DSH 上，整张卡留在工具行。

## 过渡：机器上已有 Node 时用 MCP

在你的配置文件还没装上 `@zh-xx/antu-dsh` 之前，DSH 配置仍可用**仅配置**的 bundle 挂上现有 MCP 服务端（官方模板：
`cordis-plugin-development` → `templates/mcp/`）。

`package.json`：

```json
{
  "name": "@local/antu-mcp",
  "version": "0.14.0",
  "private": true,
  "type": "module",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: antu-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: antu
        transport: stdio
        command: npx
        args: ['-y', '-p', '@zh-xx/antu@0.18.0', 'antu-mcp']
        failOnStartupError: true
```

用 DSH 的 `plugin_manager` → `install_bundle` 与该文件夹的**绝对**路径安装。

### 这一权宜之计的限制（依赖它之前请读）

- 需要**系统 Node 与网络**跑 `npx`（Desktop 内嵌 Node 本身不够）。
- 钉死包版本（上面的 `@0.18.0`）；`@latest` 每台机器会漂。
- 工具名是 `mcp__antu__antu_validate` … — 不是最终的 Host 名。
- 对 `antu_render`，传**会话工作区内的绝对 `outPath`**。默认相对路径跟 MCP 进程 cwd，不是会话目录。
- `antu_preview` 需要机器上有基于 Chromium 的浏览器；必要时在该行的 `env` 设 `ANTU_CHROME`。
  聊天里的 PNG 只有在该模型接受图片时才会进**模型**。
- `@zh-xx/antu-dsh` 的 Client 半边也认 `mcp__antu__antu_render`，所以装了本插件 Client 后，权宜 MCP 行仍可显示可交互卡。

## 维护者检查（P2 验收）

在没有系统 Node 的 Desktop 上，**DSH ≥ 0.2.0-rc.2**：`npm run build:dsh` → 对 **tgz** 做 `install_bundle` →
`application: applied`；调用 `antu_render` 的回合在聊天里显示整图；
点击打开全屏且可读，带画法与主题开关；宿主明暗都可读；卸载不留行。记录所用 DSH 版本与模型（#53 风格）。

在 DSH 0.1.x 上 Host 工具仍可跑，但卡片必须显示 ≥ 0.2 的升级提示（不能是空白的
`tool.call.toolview` 崩溃）。
