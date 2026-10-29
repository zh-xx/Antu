// Declarations of `@zh-xx/antu/embed` (src/embed/index.js). The contract is in spec/embed.md;
// test/embed.test.mjs checks that every function the module exports is declared here and nothing else.

/** An Antu JSON: the envelope (`type`, `specVersion`, `title`) and the content of its type */
export interface AntuSpec {
  type: string
  specVersion?: number
  title?: string
  [field: string]: unknown
}

export type AntuTheme = 'document' | 'modern' | 'legal' | 'dark'
export type AntuLang = 'zh' | 'en'

/** Host colour / font overlays on a named theme (`mount({ themeTokens })`, issue 293) */
export interface AntuThemeTokens {
  /** Brand / highlight colour (`--antu-accent`); defaults to the theme's side1 */
  accent?: string
  /** Diagram ground (`--antu-canvas`, and `--antu-bg` when set) */
  canvas?: string
  /** Dock / chrome wash (`--antu-chrome-bg`) */
  chromeBg?: string
  /** Body ink (`--antu-text`) */
  text?: string
  /** Secondary ink (`--antu-text-2`) */
  textMuted?: string
  /** Divider / soft edge (`--antu-line`, and `--antu-line-soft`) */
  line?: string
  /** Chrome border colour; applied as `1px solid <colour>` (`--antu-chrome-border`) */
  chromeBorder?: string
  /** Body font-family (`--antu-font`) */
  font?: string
  /** Heading font-family (`--antu-font-head`) */
  fontHead?: string
}

/**
 * How a mounted diagram opens and what it shows (issue 200). Every value a reader can change may be set here:
 * the theme and language, the label card and dock folds, and every switch of the flowchart and route map.
 * Unknown keys, wrong types and values outside an enum make `mount` throw.
 */
export interface AntuViewState {
  theme?: AntuTheme
  lang?: AntuLang
  shell?: { headerFolded?: boolean; dockFolded?: boolean }
  view?: {
    flow?: {
      states?: boolean
      conditions?: boolean
      detail?: boolean
      mainLine?: boolean
      stages?: boolean
      rules?: boolean
      orientation?: 'vertical' | 'horizontal'
      linkStyle?: 'straight' | 'curved'
    }
    route?: { labels?: boolean; states?: boolean }
  }
}

/** The names `persist` may list: one per prefs key whose write may reach the host's store */
export type AntuPersistName = 'theme' | 'lang' | 'kind' | 'shell.headerFolded' | 'shell.dockFolded' | 'view.flow' | 'view.route'

/** A source as written in the spec's `sources` (`loc` is shaped by the source's `type`, e.g. a contract's { file, clause, page }) */
export interface AntuSource {
  id: string
  type?: string
  name?: string
  loc?: Record<string, unknown>
  [field: string]: unknown
}

export type AntuEvent =
  | {
      /** The reader pinned an item's card open, or closed it (`id` null) */
      type: 'select'
      /** The item's id in the spec; a canvas node's own id when it is not one item (a run of events on the scale) */
      id: string | null
      /** The top-level array the item is in (`nodes`, `rules`, `events`, `entities`, …); null when none */
      collection: string | null
      sourceIds: string[]
      /** The item's sources as written in `sources` */
      sources: AntuSource[]
    }
  | { type: 'kindchange'; kind: string }
  | { type: 'themechange'; theme: AntuTheme }
  | { type: 'invalid'; errors: string[] }

export interface AntuPrefsStore {
  read(): Record<string, unknown>
  /** Merge the patch into what is kept */
  write(patch: Record<string, unknown>): void
}

export interface MountOptions {
  /** The kind it opens in, until the reader picks another. Not a kind of the spec's type: `mount` throws. */
  kind?: string
  /** The kinds the reader may pick from; one fixes the kind. A name that is not a kind of the type: `mount` throws. */
  kinds?: string[]
  /** The theme it opens in (the reader can still switch, unless the label card is left out) */
  theme?: AntuTheme
  /**
   * Host colour / font overlays on the named theme (issue 293). See `AntuThemeTokens`.
   * Ignored while the active theme is `document`. Unknown keys and invalid values are skipped.
   */
  themeTokens?: AntuThemeTokens
  /** The language of the page's own words; the case is never translated. Default: the browser's. */
  lang?: AntuLang
  /**
   * Pieces of the page's chrome to leave out; all shown by default.
   * `panOnScroll: false` lets the wheel scroll the host page (a chat card).
   * `panOnDrag: false` stops press-and-drag from panning. See `cardUi`.
   */
  ui?: {
    header?: boolean
    capsule?: boolean
    minimap?: boolean
    zoom?: boolean
    panOnScroll?: boolean
    panOnDrag?: boolean
  }
  /** Where the reader's choices are kept: 'none' (default) while mounted only, 'local' in the viewer page's localStorage key, or the host's store */
  prefs?: 'none' | 'local' | AntuPrefsStore
  /** How it opens, ahead of the reader's stored choices (the reader can still change it). `headerFolded` is the old alias of `shell.headerFolded`. An unknown key or a wrong value: `mount` throws. */
  initial?: AntuViewState & { headerFolded?: boolean }
  /** Values forced for this mount; their controls are hidden (a locked `shell.dockFolded: true` hides the dock). An unknown key or a wrong value: `mount` throws. */
  locked?: AntuViewState
  /** Which of the reader's changes reach the prefs store: true (all, the default), false (none, kept while mounted), or a list of names. An unknown name or a wrong type: `mount` throws. */
  persist?: boolean | AntuPersistName[]
  /**
   * Extra room (CSS px) kept clear when fitting the diagram (issue 166).
   * Each side that is a finite number replaces the auto measure for that side
   * (label card top/left, dock capsule bottom); omitted sides keep auto.
   */
  fitInsets?: { top?: number; right?: number; bottom?: number; left?: number }
  onEvent?: (event: AntuEvent) => void
}

export interface AntuHandle {
  /** Resolves once the diagram is drawn and fitted; rejects (with `errors`) when the spec is not valid */
  readonly ready: Promise<void>
  /** Draw another spec in the same place */
  update(spec: AntuSpec): void
  /** False when `kind` is not a kind of the type (or not in `kinds`) */
  setKind(kind: string): boolean
  setTheme(theme: AntuTheme): boolean
  /**
   * Overlay host colours on the named theme (issue 293). Merges into the current set; `null` clears.
   * Returns whether the applied set changed.
   */
  setThemeTokens(tokens: AntuThemeTokens | null): boolean
  setLang(lang: AntuLang): boolean
  /** Pin the card of the item `id`, as a reader's click would (a `select` event follows); `null` unpins. False when no card of it is drawn in this kind. */
  select(id: string | null): boolean
  /** Move the view to the item `id`, keeping the zoom unless it would not show it. False when it is not drawn in this kind. */
  focus(id: string): boolean
  /** Ring these items in the theme's accent colour until called again; `[]` clears. Ids that name no item are passed over. */
  highlight(ids: string[]): void
  fitView(): void
  /** The PNG the page's own export makes (no label card, a white margin), not saved anywhere. Waits until the spec now mounted is drawn; rejects (with `errors`) while it is not valid. */
  exportPng(options?: { pixelRatio?: number }): Promise<Blob>
  /** Take the diagram off the element */
  destroy(): void
}

/** Draw `spec` inside `element` (in a shadow root; the element needs a height). Throws if one is already mounted there, or if `kind`/`kinds` name a way of drawing the spec's type does not have. */
export function mount(element: HTMLElement, spec: AntuSpec, options?: MountOptions): AntuHandle

/**
 * Recommended `ui` for a chat card: no label card, capsule, minimap or zoom buttons, and the wheel
 * does not pan the diagram (the host page can still scroll). Spread into `mount(…, { ui: { …cardUi } })`.
 */
export declare const cardUi: Readonly<{
  header: false
  capsule: false
  minimap: false
  zoom: false
  panOnScroll: false
}>

/**
 * Check a spec the way the diagram checks it before drawing; each error names its field.
 * Pass `{ lang: 'zh' }` for Chinese host UI messages; default English for agents (issue 166).
 */
export function validate(spec: unknown, options?: { lang?: AntuLang }): { ok: boolean; errors: string[] }

/** Repair what is inconsistent in the marks of a spec but not in its content (a procedure's main line); the input is not modified, `changes` says what was done */
export function normalize(spec: unknown): { spec: unknown; changes: string[] }

/** The kinds a type can be drawn in, the first being the one it opens in */
export function kindsOf(type: string): string[]

/**
 * A small sketch of a kind as one `<svg viewBox="0 0 80 48">` string, for a host that draws its own picker. Its colours are CSS
 * variables to set where the markup goes: `--antu-text-3` (ink), `--antu-line` (the tint of the boxes) and `--antu-bg` (the ground it sits on: a few sketches paint with it and it falls back to white, so a dark host must set it). `null` for a kind with no sketch.
 */
export function kindIcon(kind: string): string | null

/** The name of a kind as the page's picker shows it, in `zh` or `en` (anything else gives English); `null` for an unknown kind */
export function kindLabel(kind: string, lang?: AntuLang): string | null
