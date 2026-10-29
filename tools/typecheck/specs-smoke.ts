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
