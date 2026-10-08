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

export function validate(spec: unknown): ValidateResult
export function layout(spec: unknown, options?: { kind?: string; orientation?: 'vertical' | 'horizontal' }): LayoutResult
/** Each type and its kinds, the first kind being the one a diagram opens in */
export function kinds(): Record<string, string[]>
export function versions(): VersionsReport
