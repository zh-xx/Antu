# Antu in an application: `@zh-xx/antu/embed`, `/validate`, `/html`

> Status: **working** (2026-10, issue #152). This is the entry point for **an application's own code**; for an
> agent it is the MCP server (`spec/mcp-server.md`) or the command line of the skill.

## 0. In one sentence

An application draws an Antu diagram inside its own window (`mount`), checks the JSON its model wrote before it
keeps it (`validate`), and makes the self-contained page on its own server or command line (`renderHtml`).

## 1. What stays the same

- **The JSON is the only contract.** A host hands over the same JSON an agent writes; nothing in it is about
  the host. The kind and the theme stay parameters of the drawing, as on the viewer page.
- **The same diagram.** The viewer page and a mounted diagram are drawn by the same code
  (`src/embed/core.jsx`): `src/main.jsx` is the viewer page's environment around it, `mount` is a host's.
  What the verifier checks on the viewer page holds for a mounted diagram too.
- **No network.** A mounted diagram makes no request; the bundle has everything inside.

## 2. The host entries

| Import | Runs in | What it gives | Built by |
| --- | --- | --- | --- |
| `@zh-xx/antu/embed` | the browser | `mount`, `validate`, `normalize`, `kindsOf`, `kindIcon`, `kindLabel` | `vite.embed.config.js` → `embed/antu-embed.js` |
| `@zh-xx/antu/validate` | Node or the browser | `validate`, `normalize`, `layout`, `describe`, `guide`, `kinds`, `versions` | `vite.api.config.js` → `lib/validate.mjs` |
| `@zh-xx/antu/html` | Node | `renderHtml` | `vite.api.config.js` → `lib/html.mjs` |
| `@zh-xx/antu/types` | TypeScript only | `FactSpec`, `ProcedureSpec`, `RelationshipSpec`, `JustificationSpec`, `AntuDiagramSpec` | generated `types/antu-specs.d.ts` (issue #294) |

Each runtime entry is one ES module with every dependency inside, as the command line and the MCP server are; the
package has no dependencies to install. Declarations (`.d.ts`) come with each; `test/embed.test.mjs` keeps the
runtime entries to their code. `@zh-xx/antu/types` has **no runtime**: it is declarations only, generated from
the same `*_FIELDS` tables as `describe()` / `antu_schema` (`node tools/gen/spec-types.mjs`; a test fails when
stale). Nothing else of the package is meant to be imported (its `exports` lists only these).

### Diagram JSON types (`@zh-xx/antu/types`)

A host that builds Antu JSON in TypeScript imports the shape instead of re-declaring it:

```ts
import type { ProcedureSpec } from '@zh-xx/antu/types'
import { validate } from '@zh-xx/antu/validate'

const spec: ProcedureSpec = {
  type: 'procedure',
  title: 'Purchase',
  nodes: [{ id: 'n1', kind: 'start', label: 'Begin' }],
  edges: [],
}
const { ok, errors } = validate(spec)
```

Closed enums that the field tables already name (procedure node `kind`, outcomes, domains, relationship entity /
relation kinds, justification node kinds and stances, …) are string-literal unions. Conditionally required
fields (`req: '*'`) are optional in TypeScript; cross-field rules stay in runtime `validate()`. Agents and plain
JS hosts are unchanged.

## 3. `mount`

```js
import { mount } from '@zh-xx/antu/embed'

const diagram = mount(document.getElementById('flow'), spec, {
  lang: 'zh',
  ui: { header: false },
  onEvent: (e) => {
    if (e.type === 'select' && e.sources[0]?.loc?.clause) showClause(e.sources[0].loc.clause)
  },
})
await diagram.ready
```

The element needs a size: the diagram fills it (`height: 100%` of it), and fits itself again when it changes.

What is drawn lives in the element's **shadow root**, not among its children: `el.children` and
`el.querySelectorAll(…)` find nothing, which reads as "nothing was drawn". A host's tests look in
`el.shadowRoot`; the root is open for that.

### Stable selectors for host tests

Inside the open shadow root (issue #166). Prefer these over React Flow's type-specific classes
(`.react-flow__node-pnode`, `.react-flow__node-rnode`, …), which are implementation detail:

| Find | Selector |
| --- | --- |
| A diagram node whose JSON id is `x` | `[data-antu="node"][data-id="x"]` |
| A flowchart rule row (`rule:x`) | `[data-pin-id="rule:x"]` |
| A dock chip (by name) | `[data-chip="…"]` (e.g. `trace`, `stagger`) |

`data-id` is the item id from the JSON (React Flow puts it on the node wrapper). `data-antu="node"` is
Antu's own mark on nodes that are JSON items (decoration layers and the minimap ghost, whose ids start
with `__`, are not marked). Antu's focus / pin path uses the same selectors. Do not scrape text content
to identify a node when an id is available.

### What it promises

- **Its own React inside.** React is not a peer dependency: the host's framework and React version do not
  matter. (The cost is size, below.)
- **A shadow root.** The diagram is drawn in a shadow root on the element, with the stylesheet inside it. The
  host's CSS does not reach the diagram, not even `!important` rules on every element: the diagram's root
  resets what would be inherited (font, colour, line height) and sets the viewer page's font. The diagram's CSS
  does not reach the host.
- **No globals.** Nothing is read from or written to `window`, the document's title or language, or
  `localStorage` (unless `prefs` asks for it). Two diagrams on a page know nothing of each other.
- **The window is shared.** The left and right keys step through the kinds only while the focus is inside the
  diagram; a click inside its menus is not taken for a click outside.

### Options

| Option | Default | |
| --- | --- | --- |
| `kind` | the type's first | the kind it opens in, until the reader picks another. A name that is not a kind of the spec's type makes `mount` throw, naming the field, as `renderHtml` and `setKind` refuse it |
| `kinds` | all of the type's | the kinds the reader may pick from; one fixes the kind. A name in it that is not a kind of the type, or a `kind` not in it, makes `mount` throw. (After `update` to a spec of another type, a `kind` and `kinds` that are not its own are let go, and it opens in its first kind) |
| `theme` | `document` | the theme it opens in: `document`, `modern`, `legal`, `dark` (`spec/theme.md`). The reader can still switch, unless the label card is left out |
| `themeTokens` | none | host colour / font overlays on the named theme (issue #293): `{ accent?, canvas?, chromeBg?, text?, textMuted?, line?, chromeBorder?, font?, fontHead? }`. Colours are CSS colour strings; `font` / `fontHead` are font-family lists. Applied after the named theme’s variables. Ignored while the active theme is `document` (black-and-white filing). Unknown keys and invalid values are skipped; a `canvas` that fails contrast against ink (or host `text`) and the theme’s sides is dropped; `text` / `textMuted` that fail against the effective canvas are dropped. `chromeBorder` is applied as `1px solid <colour>`. CLI / MCP / agents do not take this |
| `lang` | the browser's | `zh` or `en`: the language of the page's own words. The case is never translated |
| `ui` | all `true` | `{ header, capsule, minimap, zoom, panOnScroll, panOnDrag }`: pieces of the page's chrome to leave out (the label card at the top left, the control capsule at the bottom, the minimap, the zoom buttons). `panOnScroll: false` stops the wheel from panning the diagram so a host page (a chat card) can still scroll; `panOnDrag: false` stops press-and-drag from panning; pinch-zoom stays on. For a chat card, prefer spreading [`cardUi`](#card-ui) |
| `prefs` | `'none'` | where the reader's choices (kind, fields, orientation …) are kept: `'none'` while mounted only; `'local'` in the viewer page's `localStorage` key (`antu.prefs`); or the host's store `{ read(): object, write(patch) }`. Each diagram's choices are keyed by its content; only the theme and the language are shared |
| `initial` | none | how it opens, ahead of the reader's stored choices (`AntuViewState`, below); `headerFolded` is the old alias of `shell.headerFolded`. An unknown key, a wrong type or a value outside an enum makes `mount` throw |
| `locked` | none | values forced for this mount (`AntuViewState`, below); their controls are hidden, not disabled. An unknown key, a wrong type or a value outside an enum makes `mount` throw |
| `persist` | `true` | which of the reader's changes reach the prefs store: `true` (all), `false` (none: kept while mounted), or an array of the names below. An unknown name makes `mount` throw |
| `fitInsets` | auto chrome | `{ top?, right?, bottom?, left? }` in CSS pixels kept clear when fitting (issue #166). Fit already clears the label card and the dock capsule; each side you set replaces that auto measure for that side |
| `onEvent` | none | `(event) => void`; a handler that throws is reported on the console and does not stop the diagram |

### Configuring what a reader sees

`initial` and `locked` take the same view state; `persist` says which of the reader's changes are kept.

```ts
interface AntuViewState {
  theme?: 'document' | 'modern' | 'legal' | 'dark'
  lang?: 'zh' | 'en'
  shell?: { headerFolded?: boolean; dockFolded?: boolean }
  view?: {
    flow?: { states?: boolean; conditions?: boolean; detail?: boolean; mainLine?: boolean; stages?: boolean; rules?: boolean;
             orientation?: 'vertical' | 'horizontal'; linkStyle?: 'straight' | 'curved' }
    route?: { labels?: boolean; states?: boolean }
  }
}
```

- **`initial`** sets the opening value. It wins over the stored preferences (as `initial.headerFolded` already did), and the reader's click in this mount still wins over it. `initial.theme` and `initial.lang` mean the same as the top-level `theme`/`lang` options; if both are given, the top-level option wins.
- **`locked`** forces a value and hides its control (not disabled). A locked `shell.dockFolded: true` hides the dock whole, with no way to open it; a locked `false` means the dock is open with no fold button. A locked `shell.headerFolded` removes the label card's fold toggle. `locked.theme` forces the theme and hides the theme switch; `locked.lang` forces the language and hides the language switch. A locked `view.flow.*` / `view.route.*` leaves out that switch.
- **`persist`** is `true` (the default: as today), `false` (the reader's changes are kept while mounted but never reach the prefs store), or a list of the names that may be written.

The value of every configurable item comes from, highest first:

1. `locked`
2. the reader's change made during this mount
3. `initial`
4. the page's preset (the viewer page only, as today)
5. the stored preferences
6. the built-in default (the States switch is on in every theme, `statesByDefault`; the rule table is off)

A write through `prefs.write` is allowed by the name of its prefs key. A write whose name is not allowed stays in memory for this mount, and `read()` returns the stored values with those on top. The names:

| Name | The prefs keys it covers |
| --- | --- |
| `theme` | `theme` |
| `lang` | `lang` |
| `kind` | `kinds` |
| `shell.headerFolded` | `headerFolded` |
| `shell.dockFolded` | `dockFolded` |
| `view.flow` | `flowFieldsByDiagram`, `orientations`, `linkStyle` (each is a map keyed by the diagram's content) |
| `view.route` | `procedureRouteFieldsByDiagram` |

Phase 1 covers these items; a `view.flow` or `view.route` entry for a diagram of another type is ignored, not an error, and the other kinds of diagram have no view state yet.

| Item | `initial` / `locked` path | Prefs key |
| --- | --- | --- |
| Theme | `theme` | `theme` |
| Language | `lang` | `lang` |
| Label card folded | `shell.headerFolded` (alias `headerFolded`) | `headerFolded` |
| Dock folded | `shell.dockFolded` | `dockFolded` |
| Flowchart switches | `view.flow.states` · `.conditions` · `.detail` · `.mainLine` · `.stages` · `.rules` | `flowFieldsByDiagram` |
| Flowchart orientation | `view.flow.orientation` | `orientations` |
| Flowchart link style | `view.flow.linkStyle` | `linkStyle` |
| Route map condition labels | `view.route.labels` | `procedureRouteFieldsByDiagram` |
| Route map states | `view.route.states` | `procedureRouteFieldsByDiagram` |

### The handle

| | |
| --- | --- |
| `ready` | a promise: resolves once the diagram is drawn and fitted; rejects, with `error.errors`, when the spec is not valid |
| `update(spec)` | draw another spec in the same place; the reader's choices are kept per diagram content, as on the viewer page |
| `setKind(kind)` | `false` when it is not a kind of the type (or not in `kinds`) |
| `setTheme(theme)`, `setLang(lang)` | `false` when it is not one |
| `setThemeTokens(tokens \| null)` | merge host colour / font overlays (same allowlist as `themeTokens`); `null` clears. Returns whether the applied set changed. Unknown keys and bad values are skipped |
| `select(id)` | pin the card of the item `id` of the spec, as if the reader had clicked it: the host hears `select` as usual. `select(null)` unpins. `false` when no card of that item is drawn in this kind (or the kind pins nothing, as the route map) |
| `focus(id)` | move the view to centre the item `id`, keeping the zoom unless the item would not fit in the window at it. `false` when it is not drawn in this kind |
| `highlight(ids)` | ring these items in the theme’s accent colour (`--antu-accent`, defaulting to side1); `highlight([])` clears. The ring stays through `update` and a change of kind or theme until it is called again, leaves pinning and the reader's hover alone, and is not in `exportPng`. Ids that name no item are passed over |
| `fitView()` | fit the whole diagram into view again |
| `exportPng({ pixelRatio })` | a `Promise<Blob>`: the PNG the page's own export makes (no label card, a margin in the theme's background, 2 device pixels per design pixel by default), not saved anywhere. Waits until the spec now mounted is drawn; refused (with `errors`) while it is not valid |
| `destroy()` | take the diagram off; the element can be mounted again. A second `mount` on a mounted element throws |

A call made right after `mount`, before the diagram is drawn, is kept and carried out when it is (`select` and
`focus` then answer from the spec: `true` when it has an item of that id).

`select`, `focus` and `highlight` take the ids of the spec, the same ids `select` events report. They are found
on the canvas the way those events name them back: a rule of the flowchart is a row of its rule table, and an
item a view draws more than once (a relation path, a copy in the justification tree) is found by any of its
copies; `focus` goes to the first, `highlight` rings them all.

### Card UI

A diagram inside a chat message (DeepSeek Harness and the like) should not bring the full page chrome, and
must not steal the conversation's scroll. Export `cardUi` and spread it:

```js
import { mount, cardUi } from '@zh-xx/antu/embed'

mount(el, spec, {
  lang: 'zh',
  ui: { ...cardUi },
  // host-side buttons call setKind / setTheme / fitView
})
```

`cardUi` is `{ header: false, capsule: false, minimap: false, zoom: false, panOnScroll: false }` (frozen).
The host draws its own kind/theme controls with its theme tokens; the diagram keeps Antu's themes
(default `document`). See [dsh-plugin.md](dsh-plugin.md).

### Events

| `type` | Fields | When |
| --- | --- | --- |
| `select` | `id`, `collection`, `sourceIds`, `sources` | the reader pins a card open (`id` the item's id; `collection` the array of the JSON it is in: `nodes`, `rules`, `events`, `entities` …; `sources` its sources as written in `sources`, with their `loc`), or closes it (`id: null`) |
| `kindchange` | `kind` | the kind changed after the first drawing (the reader, or `setKind`) |
| `themechange` | `theme` | the theme changed after the first drawing (the reader, or `setTheme`): a host that follows its own light and dark can tell its own change from the reader's by comparing `theme` with what it set |
| `invalid` | `errors` | the spec (at `mount` or `update`) is not valid; in place of the diagram the page lists the problems, as the viewer page does |

A card that is not one item of the JSON (a run of events gathered on the time scale) is told with its canvas id
and `collection: null`. A host ignores event types and fields it does not know: new ones are additions
(`spec/versioning.md`).

### A kind picker of the host's own

A host that wants its own way to choose the kind (the DSH chat card shows a strip of small sketches) can ask the embed for what each choice looks like:

- `kindsOf(type)` the kinds of a type, the first being the one it opens in;
- `kindIcon(kind)` a small sketch of the kind as one `<svg viewBox="0 0 80 48">` string (the drawing the page's own picker shows), or `null` when the kind has none. Its colours are CSS variables, **three** of them: set `--antu-text-3` (the ink), `--antu-line` (the tint of the boxes) and `--antu-bg` (the ground the sketch sits on; a few sketches, such as the route map and the matrix, paint with it, and it falls back to white, so a dark host must set it) where you put the markup, and it follows your theme;
- `kindLabel(kind, lang)` the name of the kind as the picker shows it, in `zh` or `en` (anything else gives English), or `null` for an unknown kind.

The host then calls `handle.setKind(kind)`; `kindchange` tells it the kind changed.

### What it costs

The bundle is about 2.9 MB (750 kB gzipped): React, React Flow, ELK and the stylesheet, as in the viewer page
(2.2 MB). Vite leaves an ES library unminified so that a host's bundler can drop what it does not use; the host's
own build minifies it.

## 4. `@zh-xx/antu/validate`

The checks, notes and geometry report of the command line and the MCP server (`tools/lib/report.mjs`), as data:

| | |
| --- | --- |
| `validate(spec, { lang }?)` | `{ ok, errors, notes }`. Each error names its field: ``nodes[2] (n-3): `kind` is "bogus", …`` — give them back to the model as they are. `notes` are not errors (given only when there are none). Default English (agents / MCP); pass `{ lang: 'zh' }` for Chinese host UI messages (issue #166) |
| `normalize(spec)` | `{ spec, changes }`: a copy with what is wrong in the marks but not in the content repaired, and what was done (below). The input is not modified |
| `layout(spec, { kind, orientation })` | the geometry report of `antu layout`: `{ ok: true, type, kind, text, … }`, or `{ ok: false, reason, errors? }` |
| `describe(type?)` | the field table of one type (`antu_schema`); `{ ok: true, text }` or `{ ok: false, reason }` |
| `guide(type?, { lang }?)` | the mechanism notes of one type (`antu_guide` / `spec/agent/<type>/guide.md`), for a host that builds a prompt without copying the file (issue #166). English only; `lang` is accepted and ignored. `{ ok: true, text }` or `{ ok: false, reason }` |
| `kinds()` | `{ type: [kind, …] }`, the first kind being the one a diagram opens in |
| `versions()` | what `antu versions --json` prints |

The errors are strings, as everywhere else in Antu: the field path is the first part of each, written by the
type's own validator.

A `type` that is not one of the four is an error (since this change; it used to pass, and nothing could draw
it). A way of drawing written as the type, the likeliest slip, says which type it belongs to:
``\`type\` is "flow", which is a way of drawing a procedure diagram, not a type: write `"type": "procedure"` …``.
This holds on every surface: the MCP server, the command line, the page, and these entries.

### `normalize`

A model gets the content of a diagram right far more often than its marks. `normalize` repairs the marks,
deterministically, and lists each change in `changes` (in words an agent can read), so a host can call it
before `validate` and spend a round with the model only on what code cannot decide. Nothing in Antu calls it
by itself. It is in `@zh-xx/antu/embed` as well, the same function.

- **procedure, the main line.** When the edges marked `main` are already one chain from the start to an end
  (or nothing is marked), nothing changes. Otherwise (two marked edges out of one node, or a chain that breaks
  or loops back, such as an automatic renewal marked main) the main line is marked again along a path from the
  start to the normal end: an `end` whose `outcome` is `positive`, else any `end`. The path keeps to the edges
  that were already marked wherever it can; the marks off it are removed. When no end can be reached, nothing
  changes, and `validate` reports the problem as before.
- **The other types:** nothing yet (`changes: []`).

It never adds or removes a node or an edge, and never changes anything but the marks named above.

## 5. `@zh-xx/antu/html`

`renderHtml(spec, { kind, theme })` returns the page `antu render` writes, as a string: one self-contained HTML
file that opens offline. `kind` is the kind it opens in (the reader can still switch); `theme` fixes the page to
that theme. It refuses what `render` refuses: an invalid spec (the problems in `error.errors`), a kind the type
does not have, a theme that does not exist. Node only: in the package it reads the viewer template beside it.

## 6. How it is checked

- `test/embed.test.mjs`: which item a pinned card stands for, on every example and every kind; the stylesheet
  moved into a shadow root; the environment of a mounted diagram; the two Node entries; the declarations
  against the code; the package's `exports`.
- `tools/verify/embed.mjs` (a section of `npm run verify`): a host page with hostile CSS and two diagrams side by
  side, the bundle the package ships, in a real browser. Isolation both ways, the globals untouched, every
  option, the view state (`initial`, `locked`, `persist`), every event, every function of the handle, mounting
  again.

## 7. Not here

- A React component (`<AntuDiagram />`). It would make React a peer dependency and tie the host's version to
  Antu's; a React host wraps `mount` in a `useEffect` in a few lines.
- Anything about a host's own data on the diagram (risks, comments). The diagram draws the JSON.
