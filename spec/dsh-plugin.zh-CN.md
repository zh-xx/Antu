# DeepSeek Harness（DSH）插件

> 状态：**规划中**（issue [#79](https://github.com/zh-xx/Antu/issues/79)）。尚无可安装的包。
> 下列决策于 2026-10-14 锁定。本文取代 #79 初稿中已过时的部分（Host 起 HTML 再 iframe、MCP 未发布、
> `/antu/view/<id>` 存储）。

## 目标

DSH 用户在对话里要一张图，**在聊天中看到它**（可交互卡片），并能**打开自包含 HTML**（侧栏或文件）：悬停与
点击看细节、切换画法与主题、导出。插件自带 Host 工具（职责与 MCP 工具相同），之后再带一份短 skill。用户机器上
不必另装东西（不要求系统 Node，不要求 `npx`）。

## 已锁定的决策

| | 选择 |
| --- | --- |
| 工具来源 | **原生 Host 工具**（在 DSH 进程内 `import` `@zh-xx/antu/validate` 与 `/html`），长期路径不是「仅配置的 MCP bundle」 |
| 线名 | `antu_validate`、`antu_layout`、`antu_render` …（不是 `mcp__antu__…`）。若仍临时挂着 MCP 行，卡片可同时注册 MCP 名 |
| `antu_render` | **写入**会话**工作区**下的自包含 HTML（绝对路径）。卡片从工具调用的**参数**（`spec`）画图；文件用于归档、转发与 `openFile` |
| 聊天卡片 | **可交互**的 `mount()`，收起外壳（`ui.header/capsule/minimap/zoom: false`）；画法/主题由宿主侧按钮切换。不是纯缩略图（缩略图只作降级） |
| 包 | 独立 **`@zh-xx/antu-dsh`**，版本号与 `@zh-xx/antu` **同号**。源码在 `tools/dsh/`；**构建产物不入库** |
| Skill | 从有 Host 工具那一期起随插件带；名称**不要**裸用 `antu`（避免与 `skills/antu/` 撞名）。正文教 Host 工具名，不教命令行 |
| 宿主暗色 | 图仍用案图主题（默认 `document`，浅色）。卡片外壳用 DSH 的 `--dsw-alias-*`。暗色图主题另开 issue |
| 会话真相 | 会话日志是唯一真相。不做插件自管的 `/antu/view/<id>`。卡片读工具调用的 `argsRaw`；不要在结果里再塞一份 `spec` |

## 为什么不用 iframe / 不以 MCP 为终局

- DSH 官方实践：不要由 Host 提供 HTML 再用 iframe 嵌（拿不到主题 token、明暗、`ctx.locale`）。案图页面是**交付物**；
  聊天卡片是**插件 UI**，须在 Client 的 `tool.call.toolview` 里用 `mount()`（`@zh-xx/antu/embed`）。
- 仅配置的 MCP bundle（`npx … antu-mcp`）对已有 Node 的机器是有用的止疼方案（见 [tools/dsh/README.md](../tools/dsh/README.md)），
  **不是**给 Desktop 用户的产品：系统不一定有 `npx`、首次下载很大，且 `antu_render` 默认输出路径跟的是 MCP 进程
  cwd，不是会话工作区。

## 分期

### P0 — 本文与脚手架（不发 npm）

- 在此锁定计划；#79 正文与本文对齐（维护者可从本文粘贴）。
- `tools/dsh/` 脚手架，以及 README 里的临时 MCP 配方。
- 卡片用的 embed 选项：`ui.panOnScroll: false`，避免滚轮抢走对话滚动（见 [embed.zh-CN.md](embed.zh-CN.md)）。

### P1 — embed 卡片模式（引擎，minor）

- 聊天卡片需要的选项：默认滚轮不平移图；可收起外壳。
- 由 verify / embed 检查覆盖。

### P2 — `@zh-xx/antu-dsh` 0.x 首发

- Host：`antu_validate`、`antu_layout`、`antu_render`（进程内；HTML 写在会话 cwd）。
- Client：小入口 + 懒加载的 embed 块；为 `antu_render`（及必要时的 MCP 名）注册 `tool.call.toolview`。
- 内存 skill；「在侧栏打开」先用 `openFile` 打开写出的 HTML。
- CI：构建、manifest 冒烟、Host `apply` 冒烟。为新包配置 trusted publisher。

### P3 — 按需再做

- 能从日志重建的整页侧栏标签（资源类型，或 Host projection + `wire.view`）。
- 暗色图主题；不离卡片的宿主内 PNG 导出。

## 验收（P2）

在没有系统 Node 的 Desktop 上：`install_bundle` → `application: applied`；一次调用 `antu_render` 的回合出现可切
画法的卡片；宿主明暗两种主题下都读得清；卸载无残留。维护者记下 DSH 版本与所用模型（#53 一类写法）。

## 相关

- Issue [#79](https://github.com/zh-xx/Antu/issues/79)。[#121](https://github.com/zh-xx/Antu/issues/121) /
  [#122](https://github.com/zh-xx/Antu/issues/122) 作为 #79 的重复项关闭（未实现）。
- [embed.zh-CN.md](embed.zh-CN.md)、[mcp-server.zh-CN.md](mcp-server.zh-CN.md)、[versioning.md](versioning.md)。
- 源码脚手架：[tools/dsh/](../tools/dsh/)。
