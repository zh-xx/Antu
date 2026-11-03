# 主题与设计尺度

状态：在用（issue #97）。界面里主题的名称在 `src/core/messages/`。英文版 [theme.md](./theme.md) 为准。

一张图按某个**主题**来画：主题回答「这个角色长什么样」。角色（当事人、关系、结果、证成树的节点……）和尺寸在每个主题里相同；主题只选颜料。同一份 JSON 在四个主题里画出同一张图，差别只在颜色、圆角和字体。

## 四个主题

| 主题 | 用途 | 样子 |
| --- | --- | --- |
| `document`（默认） | 打印、归档、装订 | 黑白、直角、完全无色；标题黑体，正文仿宋 |
| `modern` | 屏幕 | 圆角、浅灰、一种墨色 |
| `legal` | 屏幕、演示 | 主色海军蓝；红色只用于不利处 |
| `dark` | 深色宿主里的屏幕 | modern 的样子（圆角、一种墨色）配深石板底 |

`dark` 给页面本身是深色的宿主：DeepSeek Harness 插件用它跟随 DSH 的明暗（深色 DSH 里用 dark；浅色 DSH 里用调用所要的主题，或读者上次的选择）。

每一种含义也用不靠颜色的方式表达（线宽、虚线、双线、描边、形状、文字），所以黑白打印读起来一样。`dark` 画的线和 `modern` 相同，程序图的四种状态保留颜色，并为深色底提高了亮度。`document` 主题只画灰色；若 15 种画法里有一种在 document 下露出颜色，`tools/verify` 会失败；若某个视图或样式表自己写了颜色或字号，`test/theme-lock.test.mjs` 会失败。适用于每个主题的测试都包含 `dark`，`test/theme.test.mjs` 检查深色底上墨色、次要墨色和程序图状态的对比度。

两侧的颜色（`side1`、`side2`）也写成文字：栏目标题、泳道名、图例、阵营。每个主题里它们相对画布的对比度至少 4.5:1（`test/theme-contrast.test.mjs`）；modern 的 side 2 因此是 `#64748b`（曾是 `#94a3b8`，约 2.5:1）。

## 谁来选

1. `render` / `preview` 的 `--theme`，或 `antu_render` / `antu_preview` 的 `theme`：页面固定为该主题（预设）。
2. 否则读者用标签卡上的开关；选择记在浏览器里。
3. 否则 `document`。

命令行 `--theme`、MCP 的 `theme`、`mount({ theme })`、`initial.theme` 和 `locked.theme` 都接受这些 id，含 `dark`（`spec/embed.md`）。DSH 插件的 Host 工具不向模型提供 `dark`。

图的 JSON 里没有主题字段：同一份文件给不同读者看，外观不属于案情。

## 主题管什么

只管图本身：节点、线、标签、背后的色带和框。外圈的外壳（标签卡、缩放按钮、底栏、小地图、点阵网格和页面底）在 `document`、`modern`、`legal` 里保持同一种浅色外观；只有 `dark` 也会把外壳调暗。主题变量设在画布视口（`.react-flow__viewport`）上，导出图片复制的也是这一层，所以导出图带着主题。PNG 按屏幕上的样子导出：浅色主题仍导出白底；`dark` 导出其深色底。

## 尺度（`src/theme/scale.js`）

- 8 px 网格；节点高 40 / 48 / 64，宽从 120 起按 40 步进。
- 字号在每个主题里相同。阅读梯级：caption 11、body 12.5、title 14、heading 16、display 20。阅读字号的行高为其 1.4，再圆整到 2 px。
- 图和外壳已经在用的台阶，起名是为了建在其上的布局不会挪动、别处也不另造尺寸：tag 10、fine 10.5、meta 11.5、label 12、node 13、card 13.5（标签卡标题）、lead 15（规则表标题）、mark 17（外壳字形：关闭标记和步进箭头，不是阅读文字）。
- 样式表以 `--antu-type-*` 读取。默认写在 `:root`（挂载图里则是 `:host`）。同一批变量也和主题颜色一起写在视口上，导出图才能带走它们。视图的布局常量就是这些台阶。`test/theme-lock.test.mjs` 会在视图或样式表私自写字号时失败。外壳用同一套 token。颜色那套例外不适用于这里：页面底和导出纸可以保留自己的颜色，在 `src/shell/Canvas.jsx` 与 `src/shell/exportPng.js`。
- 时间比例尺上泳道侧线曾是 12 px 名称的 `0.82em`（约 9.8 px），现为 tag 台阶（10 px）。栏宽仍按名称字号量，图不会重排。
- 四种线宽：0.75（发丝）、1.1（普通）、1.75（加粗）、2.5（最粗）。
- 四种线型：实线、虚线、点线、双线。

## 一种含义一种画法

- 关系 kind 是线：equity 普通；control 最粗；contract 长虚线；debt 点划线；guarantee 虚线；kinship 双线；employment 点线；agency 圆点；other 发丝短虚线。
- 程序结果：positive 更粗的线，negative 虚线，neutral 普通线。
- 证成节点：结论最粗；规范与判断灰底；事实发丝；推理点线；支持普通线，反对虚线，规范依据点线。
- 事实图：side 1 圆、side 2 方（时间比例尺）；大事记按组用圆、方或菱形。

`test/theme.test.mjs` 检查每个主题都回答了每个角色，且同一族的角色在线宽、虚线或填充上有差别。

## 加一个主题

在 `src/theme/themes.js` 的 `THEMES` 里加一条，键与其它相同；在 `src/core/messages/en.js` 和 `zh.js` 的 `theme.*` 下加名称；把 id 加入 `THEME_IDS`。缺什么由测试指出。

## 宿主颜色覆盖（embed）

挂载宿主可向 `mount` 传入 `themeTokens`（issue #293，`spec/embed.md`）：在具名主题的 CSS 变量上叠一小份白名单。这不是第五个主题。当前主题为 `document` 时忽略覆盖。命令行、MCP 和 agent 仍只用具名主题。

| Token | CSS 变量 | 说明 |
| --- | --- | --- |
| `accent` | `--antu-accent` | 高亮 / 品牌；默认跟 side1 |
| `canvas` | `--antu-canvas`（及 `--antu-bg`） | 与墨色 / 两侧对比度 &lt; 4.5:1 则丢弃 |
| `chromeBg` | `--antu-chrome-bg` | 坞 / chrome 底色 |
| `text` | `--antu-text` | 正文墨色；与画布对比度 &lt; 4.5:1 则丢弃 |
| `textMuted` | `--antu-text-2` | 次要墨色；同一对比规则 |
| `line` | `--antu-line`（及 `--antu-line-soft`） | 分隔 / 软边 |
| `chromeBorder` | `--antu-chrome-border` | 仅颜色；写成 `1px solid …` |
| `font` | `--antu-font` | 正文字体族列表 |
| `fontHead` | `--antu-font-head` | 标题字体族列表 |

不在白名单（也不计划开放给宿主随意覆盖）：承载含义的关系 / 实体 / 程序着色、字号（布局锁定），以及任何对 `document` 的覆盖。

## 尚未

- 随包装字体（主题目前点名系统字体，并留了装入字体的位置）。字号已锁定；宿主已可通过 `themeTokens` 传 `font` / `fontHead`；随包提供 webfont 仍是 issue #97 上未完成的一块。
- 若需要更多宿主 token：`side1` / `side2`（语义色——须满足对比度）、`chip`、chrome 圆角。
