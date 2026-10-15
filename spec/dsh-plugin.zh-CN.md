# DeepSeek Harness（DSH）插件

> 状态：**P2 已在仓库落地**（issue [#79](https://github.com/zh-xx/Antu/issues/79)）。源码在 `tools/dsh/`；
> `npm run build:dsh` 生成可 `install_bundle` 的 `tools/dsh/package/`（尚未发 npm）。
> 下列决策于 2026-10-14 锁定。本文取代 #79 初稿中已过时的部分（Host 起 HTML 再 iframe、MCP 未发布、
> `/antu/view/<id>` 存储）。

## 目标

DSH 用户在对话里要一张图，**在聊天中看到它**（整张图，只有图），并能**打开自包含 HTML**（侧栏或文件）：悬停与
点击看细节、切换画法与主题、导出。插件自带 Host 工具（职责与 MCP 工具相同），之后再带一份短 skill。用户机器上
不必另装东西（不要求系统 Node，不要求 `npx`）。

## 已锁定的决策

| | 选择 |
| --- | --- |
| 工具来源 | **原生 Host 工具**（在 DSH 进程内 `import` `@zh-xx/antu/validate` 与 `/html`），长期路径不是「仅配置的 MCP bundle」 |
| 线名 | `antu_validate`、`antu_layout`、`antu_render`，以及只读参考工具 `antu_schema`、`antu_guide`、`antu_examples` …（不是 `mcp__antu__…`）。若仍临时挂着 MCP 行，卡片可同时注册 MCP 名 |
| `antu_render` | **写入**会话**工作区**下的自包含 HTML（绝对路径）。卡片从工具调用的**参数**（`spec`）画图；文件用于归档、转发与 `openFile` |
| 聊天卡片 | **只有图**：整张图缩进卡片（`mount()` 加 `cardUi`），没有标题行、没有按钮。点图任意位置打开大图。滚轮交给聊天。2026-10-15 看过效果图后决定：按可读字号打开只能看到图的一小块，不值得 |
| 大图 | DSH 右侧面板里的页面 `antu-diagram`，以**全屏**方式呈现（面板自带的全屏模式盖住整个窗口），带完整外壳：画法、主题、详情卡片、导出，以及**打开 HTML** |
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

### P1 — embed 卡片模式（引擎）— 已在仓库落地

- `@zh-xx/antu/embed` 的 `cardUi`：安静外壳 + `panOnScroll: false`（[embed.zh-CN.md](embed.zh-CN.md)）。
- `ui.panOnDrag` 可用同样方式关掉。
- 由 `test/embed.test.mjs` 与 `tools/verify/embed.mjs` 覆盖（滚轮不平移；外壳关掉）。

### P2 — `@zh-xx/antu-dsh` 0.x 首发 — 已在仓库落地

- Host：`antu_validate`、`antu_layout`、`antu_render`（进程内；HTML 写在会话 cwd），以及只读参考工具 `antu_schema`、`antu_guide`、`antu_examples`（字段表、机制说明、示例，取自已安装的 `@zh-xx/antu`）。
- Client：小入口 + 懒加载的 embed 块；为 `antu_render`（及必要时的 MCP 名）注册 `tool.call.toolview`。
- Client 需要 **DSH ≥ 0.2.0-rc.2**（`require.async` 加载包内 `client.embed.js`）。在 0.1.x 上卡片显示升级提示，而不是把 slot 打崩。
- 内存 skill `antu-diagram`；「在侧栏打开」先用 `openFile` 打开写出的 HTML。
- **大图**：点聊天里的图，在右侧面板打开页面 `antu-diagram` 并请求全屏，用完整 embed（不用 `cardUi`）画同一份 `argsRaw` 里的 `spec`。
  DSH 0.2.0-rc.2 公开的 `ctx.sidebarRight` 没有全屏接口；插件在控制器有 `commandTarget` / `toggleFullscreen` 时用它们，否则由面板自己的全屏按钮来切。
- 安装：`npm run build:dsh` 同时打出 `zh-xx-antu-dsh-*.tgz`（优先于对裸 `package/` 做 link）。同版本号的新 tgz 会被 pnpm 当成没变，更新时先 `remove` 再 `add`，然后重启 DSH（见 `tools/dsh/README.md`）。
- CI：`test/dsh-plugin.test.mjs`（helpers、manifest、`build.mjs`、Host `apply` 冒烟）。trusted publisher / 发 npm 仍待做。

### P2.x — 先可靠，再发布（接下来，按此顺序）

1. **稳住（已在仓库）。** Client 的纯逻辑放在 `tools/dsh/src/card-model.mjs`（参数、状态、有哪些画法、图怎么打开），有单元测试；
   `client.js` 只接 React 和 DSH 插槽，辅助函数由 `build:dsh` 内联进去。`outPath` 里的符号链接循环会被拒绝。
2. **不靠 DSH 的卡片检查。** `tools/verify/` 下加一条浏览器检查：用真实 React 和一个桩 `__ModuleLoader__` 载入构建出的
   `client.js` 与 `client.embed.js`，喂入 `antu_render` 调用块（正常、被截断、画法不对、0.1.x 形状的 `require`），断言：卡片挂载、
   画法与主题按钮能切换、`argsRaw` 变化后重新挂载而不报“已挂载”、卡片上滚轮不被拦截、高亮按钮跟着当前视图。它覆盖卡片和标签页，不覆盖 DSH 本身。
3. **按版本在真实 DSH 上验。** 用 tgz 在 `0.2.0-rc.2` 和最新的 `0.2.x` alpha 上各做一遍 P2 验收，把结果（DSH 版本、模型、哪些通过）
   写进 `tools/dsh/README.md`。`0.1.x` 按设计只有 Host 工具，卡片显示“需要更高版本”，不抛堆栈。
4. **界面文字的中文。** 剩下的几处字（“Open HTML”“Preparing diagram…”“Open full view”）现在只有英文。会话给卡片传了本地化入口（`t`，命名空间
   `conversation`）；插件怎么加自己的词典，要先读 DSH 源码再定。在那之前保持英文，不凭猜测写。
5. **发布。** `@zh-xx/antu-dsh` 目前是 `private`。需要维护者：npm 账号或 trusted publisher、包名；Release 工作流增加“构建、测试、打包、
   附上 tgz、发布”（与 `@zh-xx/antu` 同一流程）；次版本号由维护者确认。`@deepseek-ai/*` 的 peer 范围按第 3 步的发现复核。
   第 3 步在真实 DSH 上通过之前，不发布任何东西。

不在计划内：托管服务、给别的宿主的第二个包、在聊天里编辑 JSON。

### P3 — 按需再做

- 能从会话日志重建的侧栏标签（资源类型，或 Host projection + `wire.view`），不只靠最近一次点击传入的 params。
- 暗色图主题；不离卡片的宿主内 PNG 导出。

## 验收（P2）

在没有系统 Node 的 Desktop 上，**DSH ≥ 0.2.0-rc.2**：`install_bundle` → `application: applied`；一次调用 `antu_render` 的回合出现可切
画法的卡片；宿主明暗两种主题下都读得清；卸载无残留。维护者记下 DSH 版本与所用模型（#53 一类写法）。

## 相关

- Issue [#79](https://github.com/zh-xx/Antu/issues/79)。[#121](https://github.com/zh-xx/Antu/issues/121) /
  [#122](https://github.com/zh-xx/Antu/issues/122) 作为 #79 的重复项关闭（未实现）。
- [embed.zh-CN.md](embed.zh-CN.md)、[mcp-server.zh-CN.md](mcp-server.zh-CN.md)、[versioning.md](versioning.md)。
- 源码脚手架：[tools/dsh/](../tools/dsh/)。
