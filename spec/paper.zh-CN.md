# 纸张尺寸作为布局输入

状态：**草案**（issue #123；数量、布局报告与纸张预览视口已在 0.17.0 之后接线）。状态行对照 0.17.0。

英文版 [paper.md](./paper.md) 为准。

## 问题

`document` 主题面向打印与归档，`PIXEL_RATIO = 2` 旁的注释把 A4 当作「够清楚」的理由，但 **代码里从来没有 A4 这个数**。布局和 `antu_layout` 按屏幕画布（`REFERENCE_CANVAS`，1600×900）判断是否装得下；分页和缩放要到浏览器打印时才定，同一份 JSON 在屏幕上和纸上不是同一张图。

打印切片（#271）在 `@media print` 下藏掉 chrome，用 `@page` 设 A4 与 12 mm 边距，并加了「打印」：先按可印区域排好再打开对话框。那条路径引入了毫米和 CSS 像素；`src/core/paper.js` 把这些尺寸收成共用的 **纸张档位**。布局报告现在把同样的档位作为可选输入。

## 纸张不是主题

**主题**回答「这个角色长什么样」（`spec/theme.md`）：颜色、圆角、字体。**纸张**回答画布有多宽、多高。两者不是一类东西。`paper` 是独立输入，不是主题字段，也不是图 JSON 里的字段。

## 档位

| 档位 | 含义 | 绘图区域（`canvas`） |
| --- | --- | --- |
| `screen` | 今天的默认：参考窗口 | `REFERENCE_CANVAS` — 1600×900 CSS px |
| `a4p` | A4 纵向，减去打印边距 | 703×1032 CSS px |
| `a4l` | A4 横向，减去打印边距 | 1032×703 CSS px |

目前只有这三档（不做 A3、Letter）。

### 固定量

- A4：210×297 mm（纵向：长边为高）。
- 打印边距：四边各 12 mm（`@page { margin: 12mm }`）。
- 打印里的 CSS 像素：每英寸 96，故 1 mm = `96 / 25.4` CSS px，用 `Math.round`。
- 纵向可印宽 = `(210 − 2×12) × (96/25.4)` → **703**；高 → **273 mm → 1032**。横向对调。

这些数以 `src/core/paper.js` 为**权威来源**。`src/shell/printPaper.js` 里的打印辅助只再导出或包装，不得另写一套换算。样式表仍须把 `margin: 12mm` 写成 CSS 字面量（CSS 读不到 JS 常量）；单测保证该字面量与 `PRINT_MARGIN_MM` 一致。

## `paperOf`

```js
import { paperOf, PAPER_LEVELS, isPaperLevel } from '../src/core/paper.js'

paperOf('screen')
// { level: 'screen', canvas: { width: 1600, height: 900 } }

paperOf('a4p')
// { level: 'a4p', canvas: { width: 703, height: 1032 },
//   orientation: 'portrait', pageSize: 'A4 portrait', marginMm: 12 }
```

- 未知档位抛错，并写出允许的名字。
- `screen` 没有打印页字段（无 `orientation` / `pageSize` / `marginMm`）。
- A4 档位带上 `@page` 与「打印」动作需要的字段。

viewer 上的「打印」仍按图自身的宽高比选纵向/横向（`printPaper.js` 的 `paperFor`），再经 `paperOf` 落到 `a4p` 或 `a4l`。这是按钮的便利，不是第四档。

## 布局报告（`layoutReport` 的 `paper`）

`tools/lib/report.mjs`：

```js
layoutReport(spec)                    // 默认 screen
layoutReport(spec, { paper: 'a4l' })  // 按 1032×703 判断 fit / 字号
```

- 报告模块导出的 `CANVAS` 即 `paperOf('screen').canvas`。
- 错误的 `paper` 软失败（`{ ok: false, reason }`），与错误的 `kind` 一样。
- 成功结果带上 `paper` 与 `canvas`，调用方能看见用的是哪一档。
- `layoutMessage` 会把 `paper` 传下去。**CLI / MCP 尚未暴露旗标**；直接导入引擎的调用方现在就可以传。

未指定纸张时：与改动前相同（屏幕画布）。

## 预览视口（Layout-B）

HTML viewer 与 `mount` 可以一打开就按纸张档位排，不必点「打印」。

| 方式 | 位置 |
| --- | --- |
| viewer 页面 | `window.__ANTU_PRESET__.paper`（与 `renderHtml` / `renderToFile` 已有的 preset 相同）；非法值拒绝打开页面 |
| `mount(el, spec, { paper })` | 选项；非法值拒绝挂载 |

- `screen`（默认）：画布铺满窗口，与以前一样。
- `a4l` / `a4p`：App 设置 `data-paper` 与 `--antu-paper-w` / `--antu-paper-h`；`.antu-canvas` 为该尺寸，在类型根上居中（`safe center` + `margin: auto`——窗口比纸矮时仍能滚到起始边）。Fit 按测到的纸框算，所见与 `layoutReport(..., { paper })` 一致。
- 打印：若页面已是 A4 档，Print 沿用该纸；否则仍按图的宽高比选方向。

尚无 dock 控件：档位由 preset / mount 选项决定（下一步才是 CLI `--paper`）。

## 已做 / 尚未做

**已做**

- 规格 + `src/core/paper.js`（`screen` \| `a4l` \| `a4p`）。
- 打印路径共用这些量。
- **Layout-A**：`layoutReport` / `layoutMessage` 接受可选 `paper`；说理图的默认折叠按 `paperOf('screen')` 判断。
- **Layout-B**：viewer preset + `mount({ paper })` 把画布收成纸张尺寸。
- **命令行**：`layout` / `render` / `preview` 上的 `--paper screen|a4l|a4p`——`layout` 的几何报告与字号行按该档位算，
  `render` 与 `preview` 生成的页面直接按该档位打开；非法值以退出码 2 失败并列出可用档位。

**下一步**（仍属 issue #123），按这个顺序：

1. **MCP** — 同样的 `paper` 参数；`antu_layout` 按该档位报告页数与最小字号。
2. 然后：`PIXEL_RATIO` 由纸张档位推导；一页装不下时的分页打断；哪些画法在该档位装得下的建议；可选的 dock 控件。

一页装不下时，既定方向（尚未实现）是 **分页并报告页数**，而不是缩到一页把字压到可读线以下。

## 目前切片的验收

- `paperOf('a4p'|'a4l'|'screen')` 返回上表；错误档位抛错。
- `printableArea` / 打印准备使用的 CSS 像素与 `paperOf` 相同。
- `layoutReport(spec, { paper: 'a4l' })` 按 1032×703 判断 fit；省略 `paper` 与旧的屏幕报告一致。
- `preset: { paper: 'a4l' }`（或 `mount(..., { paper: 'a4l' })`）时，预览画布为 1032×703 CSS px。
- 没有新的 CLI/MCP `paper` 旗标时，既有工具调用不变。
