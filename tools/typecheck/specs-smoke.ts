// Smoke consumer for `@zh-xx/antu/types` (issue 294).
// Checked by `npm run typecheck` / `tsc -p tsconfig.types.json` so a broken generated
// declaration fails CI, not only a host's first import.
import type { AntuDiagramSpec, FactSpec, ProcedureSpec } from '@zh-xx/antu/types'

const procedure: ProcedureSpec = {
  type: 'procedure',
  title: 'Smoke',
  nodes: [{ id: 'n1', kind: 'start', label: 'Begin' }],
  edges: [],
}

const fact: FactSpec = {
  type: 'fact',
  title: 'Smoke',
  slots: [{ events: [{ id: 'e1', label: 'Signed' }] }],
}

const any: AntuDiagramSpec = procedure
void fact
void any

// Negative cases: if the generator loosens a literal to `string` / drops excess-property
// checks, these `@ts-expect-error` lines become unused and `tsc` fails (issue 294 review).
// @ts-expect-error type must be the literal "fact"
const badType: FactSpec = { type: 'factt', title: 'x' }
// @ts-expect-error misspelled keys must error
const badKey: FactSpec = { type: 'fact', title: 'x', eventz: [] }
// @ts-expect-error title must be a string
const badTitle: FactSpec = { type: 'fact', title: 42 }
void badType
void badKey
void badTitle
