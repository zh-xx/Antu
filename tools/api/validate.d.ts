// Declarations of `@zh-xx/antu/validate` (tools/api/validate.mjs). The contract is in spec/embed.md;
// test/embed.test.mjs checks that every function the module exports is declared here and nothing else.

export interface ValidateResult {
  ok: boolean
  /** Each names its field, e.g. `nodes[2] (n-3): \`kind\` is "bogus", …` */
  errors: string[]
  /** Not errors, but the author should see them; only when there are no errors */
  notes: string[]
}

export type LayoutResult =
  | ({ ok: true; type: string; kind: string; text: string } & Record<string, unknown>)
  | { ok: false; reason: string; errors?: string[] }

export interface VersionsReport {
  release: string
  types: Array<{
    type: string
    specVersion: number
    diagrams: Array<{ kind: string; version: number; status: 'experimental' | 'stable' | 'deprecated'; since: string }>
  }>
}

/** Default English (agents). Pass `{ lang: 'zh' }` for Chinese host UI messages (issue 166). */
export function validate(spec: unknown, options?: { lang?: 'zh' | 'en' }): ValidateResult
export function layout(spec: unknown, options?: { kind?: string; orientation?: 'vertical' | 'horizontal' }): LayoutResult
export interface NormalizeResult {
  /** A repaired copy; the input is not modified */
  spec: unknown
  /** What was changed, in words an agent can read; empty when nothing was */
  changes: string[]
}

/** Repair what is inconsistent in the marks of a spec but not in its content (a procedure's main line). Call it before `validate` */
export function normalize(spec: unknown): NormalizeResult
/** The field table of one type, the text `antu_schema` serves; `reason` names the available types when the type is unknown */
export function describe(type?: string): { ok: true; text: string } | { ok: false; reason: string }
/**
 * The mechanism notes of one type (`antu_guide` / `spec/agent/<type>/guide.md`).
 * English only; `lang` is accepted and ignored (issue 166).
 */
export function guide(type?: string, options?: { lang?: 'zh' | 'en' }): { ok: true; text: string } | { ok: false; reason: string }
/** Each type and its kinds, the first kind being the one a diagram opens in */
export function kinds(): Record<string, string[]>
export function versions(): VersionsReport
