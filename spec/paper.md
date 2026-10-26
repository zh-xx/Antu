# Paper size as a layout input

Status: **draft** (issue #123; first slice in review after 0.17.0). Status line checked against 0.17.0.

English is authoritative; Chinese: [paper.zh-CN.md](./paper.zh-CN.md).

## Problem

The `document` theme is for print and filing, and comments next to `PIXEL_RATIO = 2` named A4 as the reason that resolution is clear enough. **A4 was nowhere as a number.** Layout and `antu_layout` judged fit against a screen canvas (`REFERENCE_CANVAS`, 1600×900). The browser decided page breaks and scale only at print time, so the same JSON was one picture on screen and another on paper.

The print slice (#271) hid the chrome under `@media print`, set `@page` to A4 with 12 mm margins, and added a Print action that fits the diagram to the printable area before opening the dialog. That path introduced millimetres and CSS-pixel sizes; this document and `src/core/paper.js` make those sizes the shared **paper levels** layout and tools will eventually take as an input.

## Paper is not a theme

A **theme** answers "what does this role look like" (`spec/theme.md`): paint, corners, type face. **Paper** answers how wide and tall the drawing area is. They are different kinds of thing. `paper` is its own input; it is not a field of a theme and not a field of the diagram JSON.

## Levels

| Level | Meaning | Drawing area (`canvas`) |
| --- | --- | --- |
| `screen` | Today's default: the reference window | `REFERENCE_CANVAS` — 1600×900 CSS px |
| `a4p` | A4 portrait, less the print margins | 703×1032 CSS px |
| `a4l` | A4 landscape, less the print margins | 1032×703 CSS px |

Only these three exist for now (no A3, no Letter).

### Fixed quantities

- A4: 210×297 mm (portrait: the long side is the height).
- Print margins: 12 mm on every edge (`@page { margin: 12mm }`).
- CSS pixels in print: 96 per inch, so one millimetre is `96 / 25.4` CSS px. Rounded with `Math.round`.
- Printable width (portrait) = `(210 − 2×12) × (96/25.4)` → **703**; height → **273 mm → 1032**. Landscape swaps the two.

`src/core/paper.js` is the **authoritative source** for these quantities. The print helpers in `src/shell/printPaper.js` re-export or wrap them and must not invent a second conversion. The stylesheet still has to write `margin: 12mm` as a CSS literal (CSS cannot import the JS constant); a unit test keeps that literal equal to `PRINT_MARGIN_MM`.

## `paperOf`

```js
import { paperOf, PAPER_LEVELS, isPaperLevel } from '../src/core/paper.js'

paperOf('screen')
// { level: 'screen', canvas: { width: 1600, height: 900 } }

paperOf('a4p')
// { level: 'a4p', canvas: { width: 703, height: 1032 },
//   orientation: 'portrait', pageSize: 'A4 portrait', marginMm: 12 }
```

- Unknown levels throw, naming the allowed ones.
- `screen` has no print sheet fields (no `orientation` / `pageSize` / `marginMm`).
- A4 levels carry what `@page` and the Print action need.

The viewer Print button still chooses portrait vs landscape from the diagram's own shape (`paperFor` in `printPaper.js`), then resolves that orientation to `a4p` or `a4l` through `paperOf`. That is a convenience for the button; it is not a fourth level.

## Default when nothing asks for paper

Callers that do not pass a paper level behave as before  this slice: layout and reports use the screen canvas. Wiring an optional `paper` argument on `layout` / `render` / `preview` / MCP is **not in this slice**.

## This slice / not yet

**Done here**

- Spec + `src/core/paper.js` (`screen` \| `a4l` \| `a4p`).
- Print path shares those quantities (margins, printable CSS px, `@page` size strings).

**Deferred** (still issue #123), in this order:

1. **Layout** — `CANVAS` / `fitZoom` / `textSizeLines` take a level so HTML preview lays out *as* A4 without pressing Print. This is when `paperOf('screen')` gains a real caller beyond tests (today only `a4l` / `a4p` are used, by the Print path).
2. **CLI** — optional `paper` on `layout` / `render` / `preview`.
3. **MCP** — the same `paper` argument; `antu_layout` reporting page count and smallest type size on that level.
4. Then: `PIXEL_RATIO` derived from the paper level; multi-page break when content does not fit; suggestions for which kinds fit at a level.

When content does not fit one sheet, the intended direction (not implemented yet) is to **break and report the page count**, not to scale everything onto one page and push type under the readable floor.

## Acceptance for this slice

- `paperOf('a4p'|'a4l'|'screen')` returns the table above; a bad level throws.
- `printableArea` / Print preparation use the same CSS-pixel sizes as `paperOf`.
- Without any new `paper` argument, existing layout and tool calls are unchanged.
