// @ts-check
// ============================================================
//  src/embed/hostTypes.js — the source of truth for `@zh-xx/antu/embed` types (issue 227)
//
//  Pure JSDoc: no runtime logic. `node tools/gen/api-dts.mjs` emits these typedefs (and the entry
//  signatures that use them) into `src/embed/antu-embed.d.ts`; do not edit that file by hand.
//  The host contract itself is in spec/embed.md.
//
//  Object-literal `@typedef {{ … }}` keeps index signatures, `readonly`, and method syntax.
//  `@typedef {object}` + `@property` is used where member docs matter most for hosts (tokens,
//  mount options) and where no index signature is needed.
// ============================================================

/**
 * An Antu JSON envelope (loose). For a typed diagram shape, prefer
 * `import type { ProcedureSpec /* … *\/ } from '@zh-xx/antu/types'` (issue 294).
 * @typedef {{
 *   type: string,
 *   specVersion?: number,
 *   title?: string,
 *   [field: string]: unknown,
 * }} AntuSpec
 */

/**
 * The named themes a diagram can be drawn in
 * @typedef {'document' | 'modern' | 'legal' | 'dark'} AntuTheme
 */

/**
 * The languages the page's own words are written in
 * @typedef {'zh' | 'en'} AntuLang
 */

/**
 * Host colour / font overlays on a named theme (`mount({ themeTokens })`, issue 293)
 * @typedef {object} AntuThemeTokens
 * @property {string} [accent] Brand / highlight colour (`--antu-accent`); defaults to the theme's side1
 * @property {string} [canvas] Diagram ground (`--antu-canvas`, and `--antu-bg` when set)
 * @property {string} [chromeBg] Dock / chrome wash (`--antu-chrome-bg`)
 * @property {string} [text] Body ink (`--antu-text`)
 * @property {string} [textMuted] Secondary ink (`--antu-text-2`)
 * @property {string} [line] Divider / soft edge (`--antu-line`, and `--antu-line-soft`)
 * @property {string} [chromeBorder] Chrome border colour; applied as `1px solid <colour>` (`--antu-chrome-border`)
 * @property {string} [font] Body font-family (`--antu-font`)
 * @property {string} [fontHead] Heading font-family (`--antu-font-head`)
 */

/**
 * How a mounted diagram opens and what it shows (issue 200; phase 2 issue 329). Every value a reader can
 * change may be set here: the theme and language, the label card and dock folds, and every switch of the
 * flowchart, route map, fact and relationship views. Justification has no view state yet. Unknown keys,
 * wrong types and values outside an enum make `mount` throw.
 * @typedef {{
 *   theme?: AntuTheme,
 *   lang?: AntuLang,
 *   shell?: { headerFolded?: boolean, dockFolded?: boolean },
 *   view?: {
 *     flow?: {
 *       states?: boolean,
 *       conditions?: boolean,
 *       detail?: boolean,
 *       mainLine?: boolean,
 *       stages?: boolean,
 *       rules?: boolean,
 *       orientation?: 'vertical' | 'horizontal',
 *       linkStyle?: 'straight' | 'curved',
 *     },
 *     route?: { labels?: boolean, states?: boolean },
 *     fact?: {
 *       summary?: boolean,
 *       actors?: boolean,
 *       sources?: boolean,
 *       grid?: boolean,
 *       stagger?: boolean,
 *       orientation?: 'vertical' | 'horizontal',
 *       byParty?: boolean,
 *     },
 *     relationship?: {
 *       labels?: boolean,
 *       groups?: boolean,
 *       orientation?: 'vertical' | 'horizontal',
 *       linkStyle?: 'straight' | 'curved',
 *     },
 *   },
 * }} AntuViewState
 */

/**
 * The names `persist` may list: one per prefs key whose write may reach the host's store.
 * Shared maps (`orientations`, `linkStyle`) are allowed when any of the listed `view.*` names that
 * use them is in the persist list (issue 329).
 * @typedef {'theme' | 'lang' | 'kind' | 'shell.headerFolded' | 'shell.dockFolded' | 'view.flow' | 'view.route' | 'view.fact' | 'view.relationship'} AntuPersistName
 */

/**
 * A source as written in the spec's `sources` (`loc` is shaped by the source's `type`, e.g. a contract's { file, clause, page })
 * @typedef {{
 *   id: string,
 *   type?: string,
 *   name?: string,
 *   loc?: Record<string, unknown>,
 *   [field: string]: unknown,
 * }} AntuSource
 */

/**
 * A thing the reader did, or a problem with the spec. A `select` carries the item's own sources;
 * the other events are named by `type` alone.
 * @typedef {(
 *   {
 *     type: 'select',
 *     id: string | null,
 *     collection: string | null,
 *     sourceIds: string[],
 *     sources: AntuSource[],
 *   }
 *   | { type: 'kindchange', kind: string }
 *   | { type: 'themechange', theme: AntuTheme }
 *   | { type: 'invalid', errors: string[] }
 * )} AntuEvent
 */

/**
 * Where the host keeps the reader's choices (`mount({ prefs })`)
 * @typedef {object} AntuPrefsStore
 * @property {() => Record<string, unknown>} read
 * @property {(patch: Record<string, unknown>) => void} write Merge the patch into what is kept
 */

/**
 * What `mount` accepts as its third argument
 * @typedef {object} MountOptions
 * @property {string} [kind] The kind it opens in, until the reader picks another. Not a kind of the spec's type: `mount` throws.
 * @property {string[]} [kinds] The kinds the reader may pick from; one fixes the kind. A name that is not a kind of the type: `mount` throws.
 * @property {AntuTheme} [theme] The theme it opens in (the reader can still switch, unless the label card is left out)
 * @property {AntuThemeTokens} [themeTokens] Host colour / font overlays on the named theme (issue 293). Ignored while the active theme is `document`. Unknown keys and invalid values are skipped.
 * @property {AntuLang} [lang] The language of the page's own words; the case is never translated. Default: the browser's.
 * @property {{
 *   header?: boolean,
 *   capsule?: boolean,
 *   minimap?: boolean,
 *   zoom?: boolean,
 *   panOnScroll?: boolean,
 *   panOnDrag?: boolean,
 * }} [ui] Pieces of the page's chrome to leave out; all shown by default. `panOnScroll: false` lets the wheel scroll the host page (a chat card). `panOnDrag: false` stops press-and-drag from panning. See `cardUi`.
 * @property {'none' | 'local' | AntuPrefsStore} [prefs] Where the reader's choices are kept: 'none' (default) while mounted only, 'local' in the viewer page's localStorage key, or the host's store
 * @property {AntuViewState & { headerFolded?: boolean }} [initial] How it opens, ahead of the reader's stored choices (the reader can still change it). `headerFolded` is the old alias of `shell.headerFolded`. An unknown key or a wrong value: `mount` throws.
 * @property {AntuViewState} [locked] Values forced for this mount; their controls are hidden (a locked `shell.dockFolded: true` hides the dock). An unknown key or a wrong value: `mount` throws.
 * @property {boolean | AntuPersistName[]} [persist] Which of the reader's changes reach the prefs store: true (all, the default), false (none, kept while mounted), or a list of names. An unknown name or a wrong type: `mount` throws.
 * @property {{ top?: number, right?: number, bottom?: number, left?: number }} [fitInsets] Extra room (CSS px) kept clear when fitting the diagram (issue 166). Each side that is a finite number replaces the auto measure for that side; omitted sides keep auto.
 * @property {(event: AntuEvent) => void} [onEvent]
 */

/**
 * What `mount` returns: draw, change the view, export or take the diagram away
 * @typedef {{
 *   readonly ready: Promise<void>,
 *   update(spec: AntuSpec): void,
 *   setKind(kind: string): boolean,
 *   setTheme(theme: AntuTheme): boolean,
 *   setThemeTokens(tokens: AntuThemeTokens | null): boolean,
 *   setLang(lang: AntuLang): boolean,
 *   select(id: string | null): boolean,
 *   focus(id: string): boolean,
 *   highlight(ids: string[]): void,
 *   fitView(): void,
 *   exportPng(options?: { pixelRatio?: number }): Promise<Blob>,
 *   destroy(): void,
 * }} AntuHandle
 */

export {}
