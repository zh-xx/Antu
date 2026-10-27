# Paper size (print quantities only)

Status: **settled for now** (issue #123). The HTML diagram is the primary presentation; paper does not reshape content. Status line checked against 0.17.0+.

English is authoritative; Chinese: [paper.zh-CN.md](./paper.zh-CN.md).

## Product decision

Antu turns one JSON document into **one** self-contained HTML diagram. Content comes first; the offline HTML page is how that content is shown. Paper size is **not** a layout input that constrains or reflows the diagram, and a picture that would not fit one A4 sheet is **not** printed across many pages.

What we keep from #123:

- A4 exists as a number (margins, printable CSS pixels).
- Browser print / Save as PDF hides the chrome and uses a fixed A4 `@page`.
- The Print action fits the picture onto **one** sheet (orientation from the diagram's shape), then opens the browser dialog.

What we are not doing:

- Opening the HTML viewer or `mount` as an A4-shaped preview viewport.
- Exposing `paper` on the CLI or MCP.
- Reporting “how many sheets” as a product path, or printing across sheets.
- Using paper size to force authors or agents to shrink or split content. If a diagram is hard to read when fitted to one sheet, change kind or split the diagram — same vocabulary the rest of the product already uses.

## Paper is not a theme

A **theme** answers “what does this role look like” (`spec/theme.md`): paint, corners, type face. **Paper** here only answers how wide and tall the **printable** area is for the print path. It is not a field of a theme and not a field of the diagram JSON.

## Levels (shared quantities)

| Level | Meaning | Drawing area (`canvas`) |
| --- | --- | --- |
| `screen` | The reference window used by the geometry report by default | `REFERENCE_CANVAS` — 1600×900 CSS px |
| `a4p` | A4 portrait, less the print margins | 703×1032 CSS px |
| `a4l` | A4 landscape, less the print margins | 1032×703 CSS px |

Only these three exist (no A3, no Letter). They live in `src/core/paper.js` so print CSS and the Print action share one conversion. They are **not** offered as a viewer preset or a `mount` option.

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

The viewer Print button chooses portrait vs landscape from the diagram's own shape (`paperFor` in `printPaper.js`), then resolves that orientation to `a4p` or `a4l` through `paperOf`.

## Optional `paper` on `layoutReport` (internal)

`tools/lib/report.mjs` still accepts an optional `paper` so a caller that imports the engine can judge fit against an A4 canvas if they want a diagnostic. Default remains `screen`. **CLI and MCP do not expose this flag** and will not: agents should keep producing content for the HTML page, not for a sheet of paper.

```js
layoutReport(spec)                    // paper defaults to screen
layoutReport(spec, { paper: 'a4l' })  // optional internal diagnostic only
```

## Done / not doing

**Done**

- Spec + `src/core/paper.js` (`screen` \| `a4l` \| `a4p`) as print quantities.
- Print path shares those quantities; chrome hidden under `@media print`; one-sheet Print action.
- Optional `paper` on `layoutReport` / `layoutMessage` (engine import only; not agent-facing).

**Not doing** (closed on #123 without merge: #284–#287; preview viewport from #276 reverted)

- CLI `--paper` / MCP `paper`.
- A4-shaped HTML preview (`preset.paper`, `mount({ paper })`).
- Multi-page / across-sheets print, or a product sheet-count line that leads there.

## Acceptance

- `paperOf('a4p'|'a4l'|'screen')` returns the table above; a bad level throws.
- `printableArea` / Print preparation use the same CSS-pixel sizes as `paperOf`.
- Omitting `paper` on `layoutReport` matches the screen report.
- The HTML viewer and `mount` always fill the window (or host element); they ignore any `paper` key on a preset.
- Without a CLI/MCP `paper` flag, existing tool calls are unchanged.
