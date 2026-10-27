# 纸张尺寸（仅打印用量）

状态：**现阶段已定**（issue #123）。HTML 图是主呈现；纸张不重排、不约束内容。状态行对照 0.17.0+。

英文版 [paper.md](./paper.md) 为准。

## 产品决定

案图把一份 JSON 画成 **一张** 可离线打开的 HTML 法律图。内容优先；离线 HTML 页才是呈现方式。纸张尺寸 **不是** 用来约束或重排图的布局输入；装不进一张 A4 时，也 **不会** 拆成多页去打印。

#123 里留下的：

- A4 作为数量存在（边距、可印 CSS 像素）。
- 浏览器打印 / 另存为 PDF 时藏掉 chrome，并用固定的 A4 `@page`。
- 「打印」把图 **拟合到一张纸**（方向由图自身宽高比决定），再打开浏览器对话框。

明确不做的：

- 把 HTML viewer 或 `mount` 收成 A4 形状的预览视口。
- 在 CLI 或 MCP 上暴露 `paper`。
- 把「要几张纸」做成产品路径，或跨页打印。
- 用纸张尺寸逼作者或 agent 缩内容、拆内容。一张图拟合到一页仍难读时，换画法或拆图——与产品里已有说法一致。

## 纸张不是主题

**主题**回答「这个角色长什么样」（`spec/theme.md`）：颜色、圆角、字体。这里的 **纸张** 只回答打印路径里可印区域有多宽、多高。它不是主题字段，也不是图 JSON 里的字段。

## 档位（共用数量）

| 档位 | 含义 | 绘图区域（`canvas`） |
| --- | --- | --- |
| `screen` | 几何报告默认用的参考窗口 | `REFERENCE_CANVAS` — 1600×900 CSS px |
| `a4p` | A4 纵向，减去打印边距 | 703×1032 CSS px |
| `a4l` | A4 横向，减去打印边距 | 1032×703 CSS px |

目前只有这三档（不做 A3、Letter）。数量在 `src/core/paper.js`，让打印 CSS 与「打印」动作共用一套换算。它们 **不是** viewer 的 preset，也不是 `mount` 选项。

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

viewer 上的「打印」按图自身的宽高比选纵向/横向（`printPaper.js` 的 `paperFor`），再经 `paperOf` 落到 `a4p` 或 `a4l`。

## `layoutReport` 上可选的 `paper`（内部）

`tools/lib/report.mjs` 仍接受可选的 `paper`，直接导入引擎的调用方若需要，可按 A4 画布做诊断。默认仍是 `screen`。**CLI 与 MCP 不暴露该旗标**，也不会暴露：agent 应按 HTML 页产出内容，而不是按一张纸。

```js
layoutReport(spec)                    // 默认 screen
layoutReport(spec, { paper: 'a4l' })  // 仅内部可选诊断
```

## 已做 / 不做

**已做**

- 规格 + `src/core/paper.js`（`screen` \| `a4l` \| `a4p`）作为打印用量。
- 打印路径共用这些量；`@media print` 藏 chrome；一页「打印」动作。
- `layoutReport` / `layoutMessage` 可选 `paper`（仅引擎导入；不对 agent 暴露）。

**不做**（#123 上未合并关闭：#284–#287；#276 的纸面预览已撤回）

- CLI `--paper` / MCP `paper`。
- A4 形状的 HTML 预览（`preset.paper`、`mount({ paper })`）。
- 跨页打印，或导向跨页的产品级「页数」行。

## 验收

- `paperOf('a4p'|'a4l'|'screen')` 返回上表；错误档位抛错。
- `printableArea` / 打印准备使用的 CSS 像素与 `paperOf` 相同。
- `layoutReport` 省略 `paper` 时与屏幕报告一致。
- HTML viewer 与 `mount` 始终铺满窗口（或宿主元素）；忽略 preset 上的任何 `paper` 键。
- 没有 CLI/MCP `paper` 旗标时，既有工具调用不变。
