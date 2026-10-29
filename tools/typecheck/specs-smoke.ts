// Smoke consumer for `@zh-xx/antu/types` (issue 294).
// Checked by `npm run typecheck` / `tsc -p tsconfig.types.json` so a broken generated
// declaration fails CI, not only a host's first import.
import type {
  AntuDiagramSpec,
  FactSpec,
  JustificationSpec,
  ProcedureSpec,
  RelationshipSpec,
} from '@zh-xx/antu/types'

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

const relationship: RelationshipSpec = {
  type: 'relationship',
  title: 'Smoke',
  entities: [{ id: 'e1', kind: 'person', label: 'A' }],
  relations: [],
}

const justification: JustificationSpec = {
  type: 'justification',
  title: 'Smoke',
  nodes: [{ id: 'n1', kind: 'conclusion', label: 'Holds' }],
  links: [],
}

const any: AntuDiagramSpec = procedure
void fact
void relationship
void justification
void any

// Negative cases (route A): one sample per diagram type + nested slot events.
// Keep each bad assignment on one line so `@ts-expect-error` covers nested fields.
// If the generator loosens a literal / element type, these become unused → tsc fails.

// @ts-expect-error type must be the literal "fact"
const badType: FactSpec = { type: 'factt', title: 'x' }
// @ts-expect-error misspelled keys must error
const badKey: FactSpec = { type: 'fact', title: 'x', eventz: [] }
// @ts-expect-error title must be a string
const badTitle: FactSpec = { type: 'fact', title: 42 }
// @ts-expect-error a slot's events must be FactEvent[] (not a bare string)
const badSlotStr: FactSpec = { type: 'fact', title: 'x', slots: [{ events: 'nope' }] }
// @ts-expect-error slot event elements must be FactEvent (catches unknown[] loosen)
const badSlotEl: FactSpec = { type: 'fact', title: 'x', slots: [{ events: [{}] }] }
// @ts-expect-error domain must be the closed union
const badDomain: ProcedureSpec = { type: 'procedure', title: 'x', domain: 'arbitration' }
// @ts-expect-error procedure node kind must be the closed union
const badProcKind: ProcedureSpec = { type: 'procedure', title: 'x', nodes: [{ id: 'n1', kind: 'banana', label: 'Nope' }] }
// @ts-expect-error relationship entity kind must be the closed union
const badEntityKind: RelationshipSpec = { type: 'relationship', title: 'x', entities: [{ id: 'e1', kind: 'robot', label: 'A' }] }
// @ts-expect-error justification node kind must be the closed union
const badJustKind: JustificationSpec = { type: 'justification', title: 'x', nodes: [{ id: 'n1', kind: 'premise', label: 'Nope' }] }

void badType
void badKey
void badTitle
void badSlotStr
void badSlotEl
void badDomain
void badProcKind
void badEntityKind
void badJustKind
