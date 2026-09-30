# Fields of the procedure diagram

```
Fields of a procedure spec. "yes" means required.

[envelope]
  type       yes string     always "procedure"
  specVersion no integer    which generation of this format the file follows (now 1); omit = the current one. Write it: it is how an older file is recognised after a breaking change
  title      yes string     diagram title, shown at the top left

[domain]
  domain     no string     which class of flow this is: litigation / administrative / contract-performance / approval / negotiation / other

[actors]
  id         yes string     unique within the diagram; nodes reference it via actorIds
  name       yes string     display name, e.g. "Party A"
  role       no string     role, e.g. "owner"
  · actorIds on a node is display-only (it marks who acted); it never affects placement

[stages]
  id         yes string     nodes reference it via stageId
  label      yes string     stage name, e.g. "requirements sign-off"
  · array order is the order in the flow; omit stages and no stage bands are drawn

[sources]
  id         yes string     nodes reference it via sourceIds
  type       yes string     contract / evidence / judgment and four more, the same seven as fact
  name       yes string     material name, e.g. "software development services contract"
  loc        no object     location, e.g. { file, clause, page }

[nodes]
  id         yes string     unique within the diagram; edges reference it via from/to
  kind       yes string     shape: start / step / decision / end / document / note (decision = a diamond decision point; it needs at least 2 outgoing edges, each with a condition)
  label      yes string     the line shown on the node; about 12 full-width characters per line
  detail     no string     amounts, deadlines and the like; one line inside the box, the full text in the popover
  actorIds   no string[]   references actors; display-only
  stageId    no string     references stages; decides which stage band it falls in
  outcome    no string     outcome (drives colour, not shape): positive / negative / neutral, default neutral
  sourceIds  no string[]   which materials it rests on

[rules]
  · Optional (v1.1). Contingent clauses: breach, delay liability, rights to terminate
  · a rule is NOT a step: write it here, not as a node with edges out of some step
  id         yes string     unique among rules and nodes
  when       yes string|str[] the trigger; an array means "any one of these"
  then       yes string     the consequence, with amounts, e.g. "penalty 0.1% per day, capped at 5%"
  stageIds   no string[]   the stages it applies in; omit = throughout. One rule for all its stages, never one copy per stage
  outcome    no string     colour: positive / negative / neutral
  endId      no string     only if it ends the contract: the id of the end node it leads to
  sourceIds  no string[]   which clause it rests on

[edges]
  from       yes string     id of the source node
  to         yes string     id of the target node
  condition  no string     the condition for taking this edge (a human-readable phrase such as "pass" or "Party B's fault"). Required on every outgoing edge of a decision
  main       no boolean    whether this edge is on the main line. If marked, it must connect through to an end; if unmarked the engine infers it
  · several edges may run between the same pair of nodes (different conditions); they are merged into one link with the conditions shown side by side

Cross-field rules (dangling references, whether a decision has enough
outgoing edges, isolated nodes, whether the main line connects through) are
not listed above: call antu_validate after writing. It reports each problem.
```
