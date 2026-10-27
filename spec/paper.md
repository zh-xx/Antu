# Paper size as a layout input

Status: **draft** (issue #123; quantities, layout report, and paper preview viewport after 0.17.0). Status line checked against 0.17.0.

English is authoritative; Chinese: [paper.zh-CN.md](./paper.zh-CN.md).

## Problem

The `document` theme is for print and filing, and comments next to `PIXEL_RATIO = 2` named A4 as the reason that resolution is clear enough. **A4 was nowhere as a number.** Layout and `antu_layout` judged fit against a screen canvas (`REFERENCE_CANVAS`, 1600×900). The browser decided page breaks and scale only at print time, so the same JSON was one picture on screen and another on paper.

The print slice (#271) hid the chrome under `@media print`, set `@page` to A4 with 12 mm margins, and added a Print action that fits the diagram to the printable area before opening the dialog. That path introduced millimetres and CSS-pixel sizes; `src/core/paper.js` makes those sizes the shared **paper levels**. The layout report now takes the same levels as an optional input.

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

## Layout report (`paper` on `layoutReport`)

`tools/lib/report.mjs`:

```js
layoutReport(spec)                    // paper defaults to screen
layoutReport(spec, { paper: 'a4l' })  // fit / text size judged on 1032×703
```

- `CANVAS` exported from the report module is `paperOf('screen').canvas`.
- A bad `paper` fails softly (`{ ok: false, reason }`), like a bad `kind`.
- The success payload includes `paper` and `canvas` so callers can see which level was used.
- `layoutMessage` passes `paper` through. **CLI / MCP do not yet expose a flag**; callers that import the engine can already pass it.

Default when nothing asks for paper: same numbers as before this work (screen canvas).

## Preview viewport (Layout-B)

The HTML viewer and `mount` can open already laid out for a paper level, without pressing Print.

| How | Where |
| --- | --- |
| Viewer page | `window.__ANTU_PRESET__.paper` (same preset object `renderHtml` / `renderToFile` already write); a bad value refuses the page |
| `mount(el, spec, { paper })` | option; a bad value refuses the mount |

- `screen` (default): canvas fills the window, as before.
- `a4l` / `a4p`: the app sets `data-paper` and `--antu-paper-w` / `--antu-paper-h`; `.antu-canvas` is that size, centred on the type root (`safe center` + `margin: auto` — when the window is smaller than the sheet, the start edge stays reachable by scroll). Fit uses the measured paper box, so what you see matches `layoutReport(..., { paper })`.
- Print: if the page is already on an A4 level, Print keeps that sheet; otherwise it still picks orientation from the diagram's shape.

There is no dock control yet: the level is chosen by preset / mount option (CLI `--paper` comes next).

## Done / not yet

**Done**

- Spec + `src/core/paper.js` (`screen` \| `a4l` \| `a4p`).
- Print path shares those quantities.
- **Layout-A**: `layoutReport` / `layoutMessage` take optional `paper`; fold-on-open for justification uses `paperOf('screen')`.
- **Layout-B**: viewer preset + `mount({ paper })` size the canvas to the paper level.
- **CLI**: `--paper screen|a4l|a4p` on `layout` (the report and its text-size line are computed on that sheet),
  `render` and `preview` (the page opens on it). An unknown value exits 2 and names the levels.

**Next** (still issue #123), in this order:

1. **MCP** — the same `paper` argument; `antu_layout` reporting page count and smallest type size on that level.
2. Then: `PIXEL_RATIO` derived from the paper level; multi-page break when content does not fit; suggestions for which kinds fit at a level; optional dock control.

When content does not fit one sheet, the intended direction (not implemented yet) is to **break and report the page count**, not to scale everything onto one page and push type under the readable floor.

## Acceptance for the slices so far

- `paperOf('a4p'|'a4l'|'screen')` returns the table above; a bad level throws.
- `printableArea` / Print preparation use the same CSS-pixel sizes as `paperOf`.
- `layoutReport(spec, { paper: 'a4l' })` judges fit on 1032×703; omitting `paper` matches the old screen report.
- With `preset: { paper: 'a4l' }` (or `mount(..., { paper: 'a4l' })`), the preview canvas is 1032×703 CSS px.
- Without any new CLI/MCP `paper` flag, existing tool calls are unchanged.
