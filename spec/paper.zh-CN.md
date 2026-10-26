# 纸张尺寸作为布局输入

状态：**草案**（issue #123；第一刀在 0.17.0 之后、审阅中）。状态行对照 0.17.0。

英文版 [paper.md](./paper.md) 为准。

## 问题

`document` 主题面向打印与归档，`PIXEL_RATIO = 2` 旁的注释把 A4 当作「够清楚」的理由，但 **代码里从来没有 A4 这个数**。布局和 `antu_layout` 按屏幕画布（`REFERENCE_CANVAS`，1600×900）判断是否装得下；分页和缩放要到浏览器打印时才定，同一份 JSON 在屏幕上和纸上不是同一张图。

打印切片（#271）在 `@media print` 下藏掉 chrome，用 `@page` 设 A4 与 12 mm 边距，并加了「打印」：先按可印区域排好再打开对话框。那条路径引入了毫米和 CSS 像素；本文与 `src/core/paper.js` 把这些尺寸收成布局与工具将要共用的 **纸张档位**。

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

## 未指定纸张时

没有传入纸张档位的调用与本切片之前相同：布局与报告仍用屏幕画布。在 `layout` / `render` / `preview` / MCP 上增加可选的 `paper` 参数 **不在本切片**。

## 本切片 / 尚未做

**这里已做**

- 规格 + `src/core/paper.js`（`screen` \| `a4l` \| `a4p`）。
- 打印路径共用这些量（边距、可印 CSS 像素、`@page` 尺寸字符串）。

**延后**（仍属 issue #123），按这个顺序：

1. **布局** — `CANVAS` / `fitZoom` / `textSizeLines` 吃档位，使 HTML 预览不必点「打印」就按 A4 排。这时 `paperOf('screen')` 才会在测试之外有真实调用方（今天只有打印路径在用 `a4l` / `a4p`）。
2. **命令行** — `layout` / `render` / `preview` 上可选的 `paper`。
3. **MCP** — 同样的 `paper` 参数；`antu_layout` 按该档位报告页数与最小字号。
4. 然后：`PIXEL_RATIO` 由纸张档位推导；一页装不下时的分页打断；哪些画法在该档位装得下的建议。

一页装不下时，既定方向（尚未实现）是 **分页并报告页数**，而不是缩到一页把字压到可读线以下。

## 本切片验收

- `paperOf('a4p'|'a4l'|'screen')` 返回上表；错误档位抛错。
- `printableArea` / 打印准备使用的 CSS 像素与 `paperOf` 相同。
- 没有新的 `paper` 参数时，既有布局与工具调用不变。
