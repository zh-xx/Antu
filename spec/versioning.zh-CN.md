# 版本号

三样东西各自带版本，并刻意分开。英文版 [versioning.md](./versioning.md) 为准。

| | 是什么 | 写在哪里 | 形式 |
| --- | --- | --- | --- |
| **发行版** | 引擎及其工具（渲染器、MCP 服务端、命令行）整体 | `package.json`（只写一处；MCP 服务端从那里读） | `major.minor.patch`，[SemVer](https://semver.org) |
| **格式世代** | 某一图类型的 JSON 格式（`fact`、`procedure`、`relationship`、`justification`） | 该类型的 knowledge（`src/renderers/<type>/schema.js` 里的 `specVersion`）；数据文件可在信封里写 `"specVersion"` | 每类型一个整数，从 1 起 |
| **画法** | 用某种方式画该类型 JSON（`relationship/equity`、`fact/chronicle` …） | 该类型 knowledge 里的 `diagrams`（`src/renderers/<type>/schema.js`），与 `layouts` 并列 | 从 1 起的整数，带状态与首次出现的发行版 |

## 发行版号

现处 0.x：**0.2.0** 是第一份带 changelog、也是第一份含全部四类图的发行。

- **`0.x.y` → 补丁（`y`）**：只修。没有新字段、新图类型、新工具。布局原先交叉线、现在不交叉了，样式修正，示例改正。随代码走的许可证与声明（`LICENSE`、第三方声明、页面里的声明块）也属此类：它们不属于下文的契约，改它们不触动契约。
- **`0.x.0` → 次要（`x`）**：任何增加，以及任何破坏。主版本仍为 0 时，次要发行可以破坏契约，但破坏一律写在 changelog 的 *Breaking* 下，并说明如何迁移。
- **`1.0.0`**：此后不抬主版本就不破坏下文契约。

**到 1.0.0 之前需要**：四类格式已定、不再称草案（`spec/*/schema-draft.md` 成为规范）；每类都有真实案例与 agent 示例；会改格式的未决点（证成图的证据层，issue #38；规范在图中如何站立）已拍板。这是维护者的判断，不是某个日期。

## 设计文档的状态

`spec/<type>/` 下的设计文档以状态行开头。用词含义：

| 词 | 含义 |
| --- | --- |
| **draft** | 已设计、尚未实现，或仍有会改格式的问题未决 |
| **implemented** | 代码已按它实现并已发行；文档里列出的未决问题不改动已有格式 |
| **confirmed** | 已实现，且维护者声明格式已定。只有维护者写这个词（1.0.0 需要它，见上） |

状态行还写 **「状态行对照 X.Y.Z 检查过」**：上次有人把该行对照代码（实现了什么、还开着什么）时的发行版号。它**不**表示整篇文档都核对过；全文对照代码不现实。若已注册类型没有设计文档、任一语言缺少该行、版本新于 `package.json`、或未列入 `tools/verify/run.mjs` 的泄漏检查，测试（`test/spec-status.test.mjs`）会失败。

## 什么算契约

| 契约的一部分（破坏它需要新版本） | 不算契约（任意发行都可改） |
| --- | --- |
| 各类型 JSON 的字段名、含义与是否必填 | 图如何排：节点位置、线怎么走、尺寸 |
| 什么数据算错误、哪条规则报它 | 外观：颜色、字体、界面 |
| MCP 工具的名称与参数（`antu_validate` …） | 提示与消息的措辞 |
| 命令行的子命令与选项（一旦有了） | 代码内部结构 |
| 给宿主代码的入口（`@zh-xx/antu/embed`、`/validate`、`/html`）：函数、选项、事件与返回值（[embed.md](embed.md)） | 挂载图 shadow root 里的元素与类名 |

**规则变严是破坏；变松不是。** 曾经通过的文件不能因为引擎升级而失败。（新的*提示*不算破坏：提示从不挡住画图。）

**给宿主代码的入口**跟发行版号走，与 MCP 工具一样；它们没有自己的号。新选项、新事件或事件里的新字段是增加（宿主必须忽略不认识的事件类型与字段）；改名或删除函数、选项或字段，或改含义，是破坏，写在 *Breaking* 并说明如何迁移。宿主可点名的画法与主题是 `versions()` 与 `spec/theme.md` 里的那些：退役一种画法是画法的破坏（见下文「画法」），不是入口的破坏。

## 格式世代（`specVersion`）

- 每类型一个整数。每个示例与每份 schema 草案都带 `"specVersion": 1`（测试保证示例诚实）。
- **只在该类型 JSON 破坏按旧版写的文件时才升高**：字段改名或删除、含义改变、规则变严。**不为**新增可选字段升高：旧文件仍然正确。
- **没有** `specVersion` 的文件按当前世代读。建议写上：破坏之后引擎靠它认出旧文件。
- 引擎报告（`antu_validate` 与渲染都经 `validateSpec`）：
  - `specVersion` 不是 ≥ 1 的整数：错误；
  - **新于**引擎对该类型所知：错误（引擎不知道字段含义）；
  - 旧于引擎所知：今天还没有更旧的世代。有了那天，changelog 条目说明如何带过来，引擎会指向它。
- 对某类型格式的破坏：引擎在 0.x 时一律是**次要**发行，从 1.0 起是**主要**发行。

## 管理一个类型（JSON 规范）

类型拥有 JSON 格式；改它影响该类型的每一张图。上文关于格式世代的说法仍然成立；这里补充如何记录变更、字段如何进退。

- **变更记录。** 每类型有 `spec/<type>/changes.md`。格式变更写成一条：世代、字段、改了什么（增加、弃用、改含义、删除），若文件必须改则说明如何改。发行版 changelog 用一行点名并指向该记录。测试要求当前世代有对应小节。
- **字段的生命。** 新字段增加时不抬世代。要去掉的字段先*弃用*：至少再读一个发行版，检查器用提示（从不用错误）点名替代物，记录里写明。删除字段或改含义则抬世代。
- **更旧的文件。** 引擎还能读时按原样读并给提示；不能读时错误说明要改什么。记录里有从每个世代带过来的说明。目前还没有迁移工具。
- **整个类型。** 新类型以草案进入（设计文档的状态用词）。类型退役须先标弃用至少一个发行版，并经维护者同意。

## 画法

画法是画某类型 JSON 的一种方式：名字是类型与方式的对（`fact/scale`、`relationship/equity`），方式是命令行与 MCP 工具上的 `kind`。画法管图画出来的样子；不动格式。画法列表是每类型 knowledge 里的 `diagrams`，名称与其 `layouts` 相同；两者不一致则该类型不能注册。每条有：

- **`version`**，从 1 起的整数。读者会注意到的画面变化时升高：布局、阅读顺序、默认展示什么。小修（间距、贴错的标签）不升高，只在 changelog 写一行。changelog 点名该行说的是哪种画法。
- **`status`**：`experimental`（新的或尚未定）、`stable` 或 `deprecated`。新画法从 `experimental` 起；只有维护者写 `stable`，与设计文档的 `confirmed` 一样。
- **`since`**，首次出现的发行版。

**去掉一种画法。** 先标 `deprecated` 并至少保留一个发行版。之后 `--kind` 与 MCP 的 `kind` 对已去掉的名字报错并点名该用哪种，不回落到默认（这条错误在真正去掉第一种画法时再写）。已经生成的页面是一个文件，不动。

**打磨。** 每种画法各自有一个 issue，列清单推进：布局质量、字号、主题、打印、示例与 agent 指南、测试。增加一种画法是增加，引擎在 0.x 时算次要发行。

全部类型与画法及其版本的列表是 `spec/versions.md`。由 `node tools/gen/versions.mjs` 从 registry 写出；过期则测试失败，故不手改。命令行（`antu versions`，可加 `--json`）与 MCP（`antu_versions`）说同一份列表。

读者点击类型名时，标签卡显示三个版本（引擎 / 格式世代 / 画法版本）。它们不在主阅读线上，打印与导出也不带。各画法的打磨仍记在 issue #131 下。

## 如何做一次发行

1. 变更经 pull request 上 `main`；每个 PR 说明是否触动契约。发行用的 pull request 写明**取哪个号、为什么**，维护者在跑发行前确认号码（第一次带许可证的发行曾标成 0.6.0 未经此步，后改号为 0.5.1）。
2. 破坏契约的变更同时抬该类型的 `specVersion`（在 `schema.js`，changelog 写如何迁移）。
3. 发行单独一个小 PR：`package.json`（及 `package-lock.json`）的 `version`、`CHANGELOG.md` 新小节，以及用 `npm run build:skill` 重建的 agent skill（见下）。同一 PR 把各设计文档状态行对照代码，并在「对照 … 检查过」里写入新发行号（见「设计文档的状态」）。
4. 合并后跑 **Release** 工作流（Actions → Run workflow；默认是 `main` 最新提交）。它读该提交 `package.json` 的 `version`；若提交不在 `main`、标签已存在、或 `CHANGELOG.md` 没有该版本小节则拒绝；然后创建标签 `vX.Y.Z` 与 GitHub release，说明取自该小节，并把 skill 附为 `antu-skill-X.Y.Z.zip`。若该提交上检查未通过或未跑完也拒绝（合并后等 CI），若 `skills/antu/` 不是该版本构建应写出的内容、或打出的 zip 解到空目录后通不过 skill 自检（`tools/verify/skill-cli.mjs --skill`）也拒绝。不从分支发行，不手打标签。

5. 已发行的版本再发 npm 包 `@zh-xx/antu` 及其 MCP registry 条目，用单独的 **Publish npm** 工作流（Actions → Run workflow）。若提交不在 `main`、标签 `vX.Y.Z` 不在该提交上、或检查未通过则拒绝；构建并打包测试（`tools/verify/npm-pack.mjs`），展示将要发布的内容。**默认是 dry run**：发到 npm 不可撤回，真正发布须有意选择，并等维护者批准 `npm` 环境。包、`server.json` 与 skill 携带 `package.json` 的同一版本（`test/npm-package.test.mjs`）。包的第一个版本不能用工作流身份，因为 npm 不能把尚不存在的包的受信发布者指到本工作流：由维护者手发，或同一工作流开 `use_token` 并用 `npm` 环境里的短时 token（事后删除）。之后每个版本都不用 token。设置写在 `.github/workflows/publish-npm.yml` 顶部。

## Agent skill（`skills/antu/`）

skill 是没有 MCP 时给 agent 画案图用的材料：一份 `SKILL.md`（如何选图、如何老实写 JSON、如何出页）、各类的指南与字段表、示例、viewer 页（引擎加数据位）、填充它的 Python 脚本，以及命令行（`scripts/antu.mjs`：validate、layout、render、preview；单文件打包，Node 18+）。它是 Claude Code、Codex 等 skill 安装器读的文件夹，也作为 zip 附在每次发行上，供导入本地 skill 包的客户端使用。

- **生成，从不手改**：`npm run build:skill` 从 `spec/agent/`、各类字段表、`examples/agent/`、`package.json` 的版本，以及 `tools/skill/` 里两份手写文件写出。某次变更往 skill 源里加的文件列在 `ADDED_SINCE_RELEASE`（`tools/build-skill.mjs`），去掉的列在 `REMOVED_SINCE_RELEASE`：单元测试允许发行前文件夹缺前者、留后者；发行工作流的检查不允许；发行 PR 清空两份列表。
- **它是上一次发行的状态。** 只在发行 PR 里重建，不在每次变更里重建，以免从仓库安装的人拿到比旁边 viewer 更新的指南。发行之间它故意落后于 `main`。测试保证它完整且盖着 `package.json` 的版本；发行工作流检查它等于一次构建。
- **它的版本就是引擎版本。** viewer 与从它做出的每页都带 `<meta name="generator" content="antu X.Y.Z">`，转发页面时能看出是哪台引擎画的。
- viewer（约 2 MB，git 里约 0.6 MB）与命令行（约 1.5 MB，git 里约 0.5 MB）每个发行提交一次。两者都不做字节级比较：viewer 须带标记与版本，命令行须能跑并报 `antu X.Y.Z`。命令行承诺 Node 18 或更新、旁边无需安装任何东西；CI 用 `tools/verify/skill-cli.mjs` 在 Node 18、20、22、24 上、不做 `npm ci` 守住这一点。跑两份副本：已提交文件夹（上一次发行）与本 PR 提交的构建（`node tools/build-skill.mjs --out DIR`），这样命令行的改动在发行前就测到，含真实浏览器的 `preview`。
