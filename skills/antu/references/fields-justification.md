# Fields of the justification diagram

```
Fields of a justification spec. "yes" means required.

[envelope]
  type       yes string     always "justification"
  specVersion no integer    which generation of this format the file follows (now 1); omit = the current one. Write it: it is how an older file is recognised after a breaking change
  title      yes string     diagram title, shown at the top left
  speaker    no string     whose reasoning this is, e.g. the court; one side only

[groups]
  id         yes string     nodes reference it via groupId
  label      yes string     one issue of the reasoning, e.g. "Issue 1: was it defensive?"
  · a node is in at most one group; omit groups and no boxes are drawn; nodes in no group stand above the issues

[nodes]
  id         yes string     unique among nodes; links reference it via from/to
  kind       yes string     conclusion / norm / element / fact / inference / judgement. fact = what the court found happened; inference = drawn from facts; judgement = a value call on facts
  label      yes string     the one sentence shown on the node
  detail     no string     full text that does not fit (a statute, the judgment's own words); in the popover
  holds      no yes|no     whether the statement holds in this reasoning; only on conclusion / element / inference / judgement; omit = not stated
  combine    no all|any    all | any: all = every one of what it rests on is needed ("and"), any = one is enough ("or"); only on conclusion / element / inference / judgement; omit = not stated
  date       no ISO date   facts only: when it happened, YYYY-MM-DD or YYYY-MM-DDTHH:MM
  groupId    no string     references groups
  sourceIds  no string[]   which materials it rests on (a norm: the statute or case)

[links]
  from       yes string     node id; the link runs from the supporting side (or the norm) to the supported one
  to         yes string     node id
  stance     no string     for / against / basis; default for. basis: the norm `to` rests on (only from a norm). against: opposes `to`
  label      no string     a short phrase on the line; omit and none is shown

[sources]
  id         yes string     nodes reference it via sourceIds
  type       yes string     statute / case / evidence and four more, the same seven as fact
  name       yes string     material name, e.g. "Fictional Case A · reasons"
  loc        no object     location, e.g. { caseNo, court } or { lawName, article, version }

Cross-field rules (dangling references, a cycle, a fact or norm with something supporting it, no end
conclusion, holds or date on the wrong kind) are not listed above: call antu_validate after writing.
It reports each problem.
```
