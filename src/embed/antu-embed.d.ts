// Declarations of `@zh-xx/antu/embed` (src/embed/index.js). The contract is in spec/embed.md;
// test/embed.test.mjs checks that every function the module exports is declared here and nothing else.

/** An Antu JSON: the envelope (`type`, `specVersion`, `title`) and the content of its type */
export interface AntuSpec {
  type: string
  specVersion?: number
  title?: string
  [field: string]: unknown
}

export type AntuTheme = 'document' | 'modern' | 'legal'
export type AntuLang = 'zh' | 'en'

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
  /** The language of the page's own words; the case is never translated. Default: the browser's. */
  lang?: AntuLang
  /** Pieces of the page's chrome to leave out; all shown by default */
  ui?: { header?: boolean; capsule?: boolean; minimap?: boolean; zoom?: boolean }
  /** Where the reader's choices are kept: 'none' (default) while mounted only, 'local' in the viewer page's localStorage key, or the host's store */
  prefs?: 'none' | 'local' | AntuPrefsStore
  /** How it opens, ahead of the reader's stored choices (the reader can still change it). An unknown key or a wrong value: `mount` throws. */
  initial?: { headerFolded?: boolean }
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
  setLang(lang: AntuLang): boolean
  /** Pin the card of the item `id`, as a reader's click would (a `select` event follows); `null` unpins. False when no card of it is drawn in this kind. */
  select(id: string | null): boolean
  /** Move the view to the item `id`, keeping the zoom unless it would not show it. False when it is not drawn in this kind. */
  focus(id: string): boolean
  /** Ring these items in the theme's colour until called again; `[]` clears. Ids that name no item are passed over. */
  highlight(ids: string[]): void
  fitView(): void
  /** The PNG the page's own export makes (no label card, a white margin), not saved anywhere. Waits until the spec now mounted is drawn; rejects (with `errors`) while it is not valid. */
  exportPng(options?: { pixelRatio?: number }): Promise<Blob>
  /** Take the diagram off the element */
  destroy(): void
}

/** Draw `spec` inside `element` (in a shadow root; the element needs a height). Throws if one is already mounted there, or if `kind`/`kinds` name a way of drawing the spec's type does not have. */
export function mount(element: HTMLElement, spec: AntuSpec, options?: MountOptions): AntuHandle

/** Check a spec the way the diagram checks it before drawing; each error names its field */
export function validate(spec: unknown): { ok: boolean; errors: string[] }

/** The kinds a type can be drawn in, the first being the one it opens in */
export function kindsOf(type: string): string[]
