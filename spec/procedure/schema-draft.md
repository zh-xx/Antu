# procedure · Schema v1.1

> Status: **v1.1, confirmed** (sponsor, 2026-09). v1: the five items in §7 were approved exactly as proposed. v1.1 adds the optional rule layer of §11 (contingent clauses written as `rules`, not as branches); every v1 JSON is still valid. The seven real contracts were rewritten with it (§11.4). This is what the implementation follows.
> Names, enum values and requiredness can still move if the renderer turns something up, but a change from here is a schema revision rather than a draft edit.
> The file keeps the `schema-draft` name for consistency with the fact one (and because the tooling refers to it by that name); the status is what says v1.1.
> Basis: the shared conventions layer of `spec/v0-architecture.md` (id references / everything carries a label / loose where optional), and the classification of differences in its §3 (different domain semantics → controlled enum, no new top-level type).
> Scope: procedure = **a path and its possible branches**. What has already happened → `fact`; who stands in what relation to whom → `relationship`; norms + facts → a conclusion → `justification`.
> The first sub-type: `flow` (flowchart). This draft serves this one top-level type only; the sub-type split is in §6.

> **This document is for the designer.** An agent writing JSON uses a different one: fields come
> from `antu_schema` over MCP, mechanisms from the procedure mechanism note for agents (to be
> written, in the same style as `spec/agent/fact/guide.md`).
> The two do not copy from each other; the division of labour is written in `spec/agent/README.md`.

---

## 0. Six decisions taken this round

1. **The data model is a free graph of `nodes` + `edges`**, not a layered structure of "a main-line
   array with branches attached". Reason: the spec stops at the top-level type, so if the structure
   holds, do not change it. A layered structure saves layout work, but when swimlane diagrams and
   state diagrams come along it will not hold them, and changing the schema then voids every JSON
   already written (see item 1 of §7).
2. **The main line is marked on edges** (`main: true`), not on nodes. Reason: the main line is a
   **path**; marking it on nodes produces errors such as "marked main but the chain is broken" that
   validation cannot catch. When it is not marked, the renderer infers it (see §4.1).
3. **`kind` narrows to 6 shapes**; the old prototype's "positive/negative result" is not a shape and
   becomes the separate `outcome` field (see §4.3).
4. **There are `stages`**, and nodes reference them via `stageId`. Contract flows fall into stages
   naturally; without it an agent can only write "stage 1" into the node text the way the current
   Mermaid output does, mixing stages and steps together (see §4.4).
5. **procedure has no `views`.** A view is a fact concept (looking at the same set of facts from a
   different side); a procedural path has no such dimension.
6. **`sources` reuses fact's 7 types and structured location**, rather than inventing another set
   (see §4.7).

---

## 1. Envelope (shared by all types)

```jsonc
{
  "specVersion": 1,
  "type": "procedure",
  "title": "Software Development Services Contract · Performance Flow"
}
```

The form of `specVersion` follows the open item in the v0 main document; this draft states no
separate position.

---

## 2. Draft content layer

The example is taken from the real performance flow of the faxi sample contract
(`tests/fixtures/samples/01_软件开发服务合同`), and its structure corresponds item by item to the
`business_flowchart.mmd` already generated for it.

```jsonc
{
  "type": "procedure",
  "title": "Software Development Services Contract · Performance Flow",

  // domain: which class of flow the whole diagram is. Controlled enum, see §4.2
  "domain": "contract-performance",

  // diagram-level party list (same shape and meaning as fact)
  "actors": [
    { "id": "a-1", "name": "Party A", "role": "Client" },
    { "id": "a-2", "name": "Party B", "role": "Developer" }
  ],

  // diagram-level stage list (ordered; the order is the order in the flow). See §4.4
  "stages": [
    { "id": "st-1", "label": "Signing" },
    { "id": "st-2", "label": "Requirements confirmation" },
    { "id": "st-3", "label": "System prototype" },
    { "id": "st-4", "label": "System delivery" },
    { "id": "st-5", "label": "Closing" }
  ],

  // the source table carried inside the diagram (option B): only the sources this diagram references
  "sources": [
    { "id": "s-1", "type": "contract", "name": "Software Development Services Contract",
      "loc": { "file": "软件开发服务合同.docx", "clause": 3, "page": 2 } },
    { "id": "s-2", "type": "contract", "name": "Software Development Services Contract",
      "loc": { "file": "软件开发服务合同.docx", "clause": 8, "page": 6 } }
  ],

  // nodes: what the flow contains. ids are unique in the diagram and referenced by edges
  "nodes": [
    { "id": "n-1",  "kind": "start", "label": "Contract signed and effective", "stageId": "st-1" },
    { "id": "n-2",  "kind": "step", "label": "Party A pays first installment",
      "detail": "CNY 360,000 · within 10 days of signing",
      "actorIds": ["a-1"], "stageId": "st-1", "sourceIds": ["s-1"] },

    { "id": "n-3",  "kind": "step", "label": "Requirements confirmation",
      "detail": "Due by 2026-06-30", "actorIds": ["a-2"], "stageId": "st-2" },
    { "id": "n-4",  "kind": "decision", "label": "Requirements confirmed?", "stageId": "st-2" },
    { "id": "n-5",  "kind": "decision", "label": "Delay in this stage?", "stageId": "st-2" },

    { "id": "n-6",  "kind": "step", "label": "Prototype development",
      "detail": "Due by 2026-08-31", "actorIds": ["a-2"], "stageId": "st-3" },
    { "id": "n-7",  "kind": "decision", "label": "Prototype accepted?", "stageId": "st-3" },
    { "id": "n-8",  "kind": "step", "label": "Party B rectifies",
      "actorIds": ["a-2"], "outcome": "negative", "stageId": "st-3" },
    { "id": "n-9",  "kind": "step", "label": "Party A pays second installment",
      "detail": "CNY 480,000", "actorIds": ["a-1"], "stageId": "st-3" },

    { "id": "n-10", "kind": "step", "label": "System delivery",
      "detail": "Due by 2026-11-30", "actorIds": ["a-2"], "stageId": "st-4" },
    { "id": "n-11", "kind": "decision", "label": "Final acceptance passed?", "stageId": "st-4" },
    { "id": "n-12", "kind": "step", "label": "Party B rectifies unconditionally",
      "actorIds": ["a-2"], "outcome": "negative", "stageId": "st-4" },
    { "id": "n-13", "kind": "step", "label": "Party A pays final installment",
      "detail": "CNY 360,000", "actorIds": ["a-1"], "stageId": "st-4" },

    { "id": "n-14", "kind": "step", "label": "Project complete",
      "outcome": "positive", "stageId": "st-5" },
    { "id": "n-15", "kind": "end", "label": "Contract terminated", "stageId": "st-5" },

    { "id": "n-16", "kind": "step", "label": "Party B pays penalty",
      "detail": "0.1% per day, capped at 5%",
      "actorIds": ["a-2"], "outcome": "negative", "stageId": "st-2", "sourceIds": ["s-2"] },
    { "id": "n-17", "kind": "step", "label": "Schedule extended",
      "outcome": "neutral", "stageId": "st-2" }
  ],

  // edges: how the flow moves. A back edge is just an ordinary edge, recognised by the renderer, see §4.6
  "edges": [
    // the main line (edges with main: true form one chain from start to end)
    { "from": "n-1",  "to": "n-2",  "main": true },
    { "from": "n-2",  "to": "n-3",  "main": true },
    { "from": "n-3",  "to": "n-4",  "main": true },
    { "from": "n-4",  "to": "n-6",  "condition": "Confirmed", "main": true },
    { "from": "n-6",  "to": "n-7",  "main": true },
    { "from": "n-7",  "to": "n-9",  "condition": "Accepted", "main": true },
    { "from": "n-9",  "to": "n-10", "main": true },
    { "from": "n-10", "to": "n-11", "main": true },
    { "from": "n-11", "to": "n-13", "condition": "Passed", "main": true },
    { "from": "n-13", "to": "n-14", "main": true },
    { "from": "n-14", "to": "n-15", "main": true },

    // branches and back edges
    { "from": "n-4",  "to": "n-3",  "condition": "Not confirmed" },
    { "from": "n-3",  "to": "n-5",  "condition": "Delayed" },
    { "from": "n-5",  "to": "n-16", "condition": "Party B's fault" },
    { "from": "n-5",  "to": "n-17", "condition": "Party A's fault" },
    { "from": "n-16", "to": "n-3" },
    { "from": "n-17", "to": "n-3" },
    { "from": "n-7",  "to": "n-8",  "condition": "Rejected" },
    { "from": "n-8",  "to": "n-7" },
    { "from": "n-11", "to": "n-12", "condition": "Failed" },
    { "from": "n-12", "to": "n-11" }
  ]
}
```

Points to note:

- **Nodes are nodes and edges are edges.** A node says only "what the flow contains"; the movement
  lives entirely in `edges`. Only then can the same data draw a flowchart today and other drawings
  later (swimlane, state diagram).
- **A condition is not a node.** The results of a decision ("confirmed / not confirmed") are written
  on the **edge's `condition`**, not as nodes. Written as nodes they double the node count and blur
  who owns the decision.
- **A back edge is an ordinary edge.** "Rectify until it passes" in the data is just an edge pointing
  back upstream; there is no marker such as `type: "loop"`. The renderer recognises it from the graph
  structure (see §4.6).
- **The main line is an annotation, not a new structure.** Marking 11 edges `main: true` states which
  one is the main line; there is no need to split the nodes into two sets.
- In a real contract the "delay decision" appears once in each of three stages. The example writes
  only the one in the requirements-confirmation stage; the other two are structurally the same
  (`n-3`/`n-6`/`n-10` each carry one group), and the example is kept short.

> **This example has been run through the 18 rules of §5 by machine**: 17 nodes, 21 edges, 5 stages,
> a single entry (`n-1`), a main-line chain of 12 nodes (`n-1` → … → `n-15`), all passing.
>
> It is an **excerpt**: the real `.mmd` for 01 has 26 nodes, 34 edges, 9 back edges and a longest
> chain of 12 layers (see the measured table in §8). The example keeps the delay branch of one stage
> only; the other two are structurally the same.

---

## 3. Field rules

### Diagram-level fields

| Field | Required | Type | Notes |
|---|---|---|---|
| `domain` | ❌ | string enum | which class of flow the whole diagram is, see §4.2 |
| `actors` | ❌ | object[] | party list: `{ id, name, role? }`. Same shape and meaning as fact |
| `stages` | ❌ | object[] | stage list (ordered): `{ id, label }`. See §4.4 |
| `sources` | ❌ | object[] | the source table inside the diagram; the 7 types and the location fields fully reuse fact, see §4.7 |
| `nodes` | ✅ | object[] | the nodes of the flow, see below |
| `edges` | ✅ | object[] | how the nodes move between each other, see below |

### Each item of `nodes[]`

| Field | Required | Type | Notes |
|---|---|---|---|
| `id` | ✅ | string | unique in the diagram, referenced by `edges` |
| `kind` | ✅ | string enum | shape: `start` / `step` / `decision` / `end` / `document` / `note`, see §4.3 |
| `label` | ✅ | string | the one line shown on the node; about 12 full-width characters per line, at most two lines |
| `detail` | ❌ | string | amounts, deadlines, conditions and the like. One line inside the box, the full text in the popover |
| `actorIds` | ❌ | string[] | references ids in `actors`. **Display only (marked on the node), not used for columns**, see §4.5 |
| `stageId` | ❌ | string | references an id in `stages` |
| `outcome` | ❌ | string enum | `positive` / `negative` / `neutral`, default `neutral`, see §4.3 |
| `sourceIds` | ❌ | string[] | references ids in this diagram's `sources` |

### Each item of `edges[]`

| Field | Required | Type | Notes |
|---|---|---|---|
| `from` | ✅ | string | id of the source node |
| `to` | ✅ | string | id of the target node |
| `condition` | ❌ | string | the condition for taking this edge (a human-readable phrase), such as "Confirmed" or "Party B's fault". **Required on every outgoing edge of `kind=decision`**, see §4.5 |
| `main` | ❌ | boolean | marks this edge as belonging to the main line. When unmarked the renderer infers it, see §4.1 |

**There is no `summary` field** (unlike fact). fact needs the three fields `label`/`summary`/`detail`
because every extra line on a card makes the whole diagram 126px taller, drops the overview zoom by
one step and shrinks the diagram's font by 15% to 19% (see `spec/fact/schema-draft.md`). A flowchart
node is a box, not an equal-height card, so there is no such knock-on effect, and `label` plus
`detail` suffice. This can be changed, but it drives the computation of node size.

---

## 4. The mechanisms

### 4.1 The main-line mechanism

**Main line = the single main line from the entry to the end, drawn down the centre of the diagram.**

Marked on edges rather than on nodes:

| Where it is marked | Consequence |
|---|---|
| **Edge** (this draft) | the main line is a path, so the annotation matches the semantics; "can you get from the entry to an end by following `main` edges" is checkable |
| Node | produces broken chains such as "marked main but neither outgoing edge is marked", and validation cannot catch them (it only sees a pile of isolated marks) |

When the data does not mark `main`, the renderer infers it in the order below, so that any valid
JSON can be laid out:

```
Start from the entry node; at each step take the "main outgoing edge", testing in order:
  ① an edge explicitly marked main: true                        → pick it
  ② the first outgoing edge whose condition is empty and whose
    target node has not been visited                            → pick it
  ③ if neither holds → take the first unvisited outgoing edge in the edges array
Stop when reaching a node with kind = "end".
```

When `main` is marked but the chain breaks, validation reports an error (see rule 16 of §5).
**It does not add the missing edge.**

**③ is not decoration, it is necessary.** Measured (§8): on reaching a diamond node, **all** of its
outgoing edges carry a `condition`, so ① and ② alone stop at step 4 and the main line breaks
half-way.

But ③'s choice is arbitrary (the first edge in the `edges` array), so when a diamond is not marked
`main`, the main line may not be the one the data author intended. Hence a hint (not an error):

```
a decision sits on the main line (it has one incoming main edge), has 2 or more outgoing
edges, and none of them is marked main
  → hint: mark which one is the main line
```

**This hint applies only to "a decision on the main line".** A side check hanging off the main line
does not count: for example `n-5` in the example ("delay in this stage"), which is a branch
throughout, whose two outgoing edges are both back edges and which should never have had a main
outgoing edge. Without that distinction the rule would misfire on every side decision in real data.

When a diamond picks the wrong main line, the symptom is: the breach path is drawn as the main line
and normal performance is pushed aside. Validation cannot stop this (both paths are legal), so only
a hint can make the agent look at it.

### 4.2 `domain`: which class of flow this diagram is

```
"domain": "contract-performance"

litigation              litigation procedure (filing / instance / enforcement)
administrative          administrative procedure (application / review / decision)
contract-performance    contract performance flow
approval                internal approval path
negotiation             negotiation / consultation
other                   other
```

Why contract flows and litigation procedures **share one schema and are separated by enum** instead
of opening a fifth top-level type: `spec/v0-architecture.md` §3 fixes the test, and **the only condition
for becoming a new top-level type is that "the element structure does not fit the existing types"**.
Contract flows and litigation procedures are both "steps + conditional branches"; their element
structure is identical and it fits, so it can only be a controlled enum.

**The field is optional**, and rendering does not read it today. The reason to keep it: when
archiving across diagrams the class of flow is visible at a glance, and later there is a basis for
taking default parameters by domain. If the sponsor considers it "a classification enum with no real
benefit" (the reason fact rejected `kind` at the time), deleting it moves nothing else. Listed for a
vote in §7.

### 4.3 Node shape (`kind`) and result (`outcome`)

**`kind` fixes the shape, `outcome` fixes the colour; the two dimensions do not mix.**

| `kind` | Shape | Used for |
|---|---|---|
| `start` | rounded rectangle | the entry to the flow, usually only one |
| `step` | rectangle | an action, one thing, the output of one stage |
| `decision` | diamond | a decision point, with ≥ 2 outgoing edges each carrying a `condition` |
| `end` | double-bordered rounded rectangle | an end of the flow, at least one |
| `document` | document shape (wavy bottom edge) | a file, voucher or slip produced |
| `note` | borderless with a folded corner | explanatory text that takes no part in the flow (it may have no outgoing edge) |

The six are a **closed set of shapes**. The old prototype had 9; the extras were
`outcome-positive` / `outcome-negative`, which have the same shape as `step` and differ only in
colour. **That is a result attribute, not a shape**, so it is pulled out into a separate field:

```
"outcome": "negative"      // positive / negative / neutral (default neutral)
```

Mapping (the old prototype's four colours → the new three values):

| Colour in the old prompt | New form |
|---|---|
| normal performance node `#e6e6fa` | omit (default `neutral`) |
| breach node `#ffff99` | `"outcome": "negative"` |
| completion node `#90ee90` | `"outcome": "positive"` |
| termination node `#ff6666` | **by meaning**: normal termination `neutral`, failed termination `negative` |

The last row is the problem this design solves: the old approach painted every "termination" red,
but in the example "project complete → contract terminated" is a normal closing, and red is wrong.
**The same label can be normal or abnormal in different contracts, and only the person reading the
contract knows, so it must be a data field rather than something hard-coded in the prompt.**

### 4.4 Stages (`stages`)

`stages` is an ordered diagram-level list; nodes reference it via `stageId`. When rendering it is
drawn as a stage box (a light filled frame round the stage's nodes, its name in the top-left corner).

**Why it deserves a field of its own.** The current Mermaid output writes the stage into the node
text:

```
C[Stage 1: Requirements confirmation by 2026-06-30]      ← stage and step mixed in one node
```

The consequence: stage boundaries cannot be drawn, nodes of the same stage scatter across the
diagram, and the reader has to piece it together from the text. With `stages`, a stage becomes
**structure**: it can be drawn, and nodes can be grouped by it.

- Omit `stages` and no stage boxes are drawn; nothing else changes;
- Write `stages` but leave a node without `stageId`: it belongs to no stage and renders as usual;
- A `stageId` referencing a non-existent id → error.

### 4.5 Conditions (`condition`) and parties (`actorIds`)

**`condition` is a first-class citizen.** Almost the whole legal meaning of a contract flowchart lies
in these phrases ("confirmed / not confirmed", "Party A's fault / Party B's fault", "accepted / rejected").

- The field is called `condition` rather than `label`: in fact, `label` means "what text is shown
  here", whereas this is "under what condition this edge is taken": semantics, not copy. One
  vocabulary across the project, so that one word does not have three uses;
- **Every** outgoing edge of `kind = "decision"` **must** have a `condition`; missing it is an error;
- An outgoing edge of a non-decision node may or may not have one; if present it is shown, if absent
  a clean line is drawn.

**`actorIds` is for display only.** The node marks "who did it" (for example a small line in the node
corner), but **no columns are derived from it**. Splitting into columns by party is the swimlane
diagram's job, and that is procedure's second sub-type, not a parameter of this one. The first
version limits it to display so as not to repeat the old project's path (the old prototype's
`swimlane` still sits at `enabled: false`).

**A node may have several outgoing edges, and not only a `decision` one. This was forced by
measurement, it is not optional.** Four of the seven real contracts use it, across 15 nodes: 01 has
3, 03 has 2, 06 has 6, 07 has 4. In the most extreme one (06) the whole diagram **has not a single
diamond**, and every branch is expressed by an ordinary node carrying several outgoing edges. `n-3`
(requirements confirmation) in the example is the same: one main edge leads to the decision point,
one with `condition: "Delayed"` leads to the delay decision.

Validation does not forbid it; the rendering rule is: **the one marked `main` runs along the main
line, the remaining outgoing edges spread out as branch columns.** Only `decision` carries the hard
requirement "≥ 2 outgoing edges, each with a condition".

### 4.6 Back edges

"Rectify until it passes" is normal in this kind of contract, so back edges must be supported, and
must be drawn legibly.

- **In the data a back edge is an ordinary edge**, with no marker;
- The renderer identifies them: one traversal from the entry; an edge pointing to a node that is
  still on the current path is a back edge;
- Drawing: a back edge arcs round one side of the main line and takes no part in layering (it does
  not pull the layer number back);
- **Limit**: a back edge may only return to a more upstream node, with no limit on the span, but two
  back edges are not allowed between the same pair of nodes.

The harm of a marker (such as `"loop": true`) is that the agent has to decide which edge is a back
edge, and a wrong call means it cannot be drawn; whereas the renderer has to traverse the graph once
anyway and can recognise it in passing.

### 4.7 Sources (`sources`) and "no views"

- **`sources` fully reuses fact's definition**: 7 types (`statute` / `case` / `contract` / `evidence` /
  `document` / `web` / `other`), with the structured location fields refined per type (a contract's
  `loc` is `{ file, clause(number), page }`). See `spec/source-schema-draft.md`;
- Nodes reference them via `sourceIds`; a dangling reference is an error;
- **procedure has no `views`.** A view is fact's mechanism (looking at the same set of facts from a
  different side); a procedural path has no "side" dimension and needs no several readings. It is
  written here to prevent someone later adding it by imitating fact.

---

## 5. Validation rule list (cross-field, reported one by one)

The field table (`PROCEDURE_FIELDS`) governs field-level rules only; below are the cross-field rules,
reported one by one by the validator, **with the field path and the node/edge id in the message**, in
fact's style:

```
nodes[4] (n-5): `kind` is "desicion", not in the vocabulary (start / step / decision / end / document / note)
edges[7]: `to` points to a non-existent node "n-99"
nodes[2] (n-3): dead end; a node that is neither end nor note must have an outgoing edge
```

| # | Rule | Error or hint |
|---|---|---|
| 1 | if `domain` is written it must be in the enum | error |
| 2 | `nodes` non-empty and `edges` non-empty | error |
| 3 | `node.id` unique in the diagram | error |
| 4 | `node.kind` within the six | error |
| 5 | `node.label` required and non-empty | error |
| 6 | the ids referenced by `actorIds` / `sourceIds` / `stageId` must exist | error |
| 7 | `edge.from` / `edge.to` point to existing nodes | error |
| 8 | self-loops forbidden (`from === to`) | error |
| 9 | duplicate edges forbidden (the same `from` + `to` + `condition` appearing twice) | error |
| 10 | at least one entry node with in-degree 0 | error |
| 11 | **every node must be reachable from the entry** (unreachable means silently dropped, invisible in the diagram) | error |
| 12 | at least one `kind = "end"` | error |
| 13 | a node that is neither `end` nor `note` must have an outgoing edge (the flow breaks here) | error |
| 14 | a `kind = "decision"` node must have ≥ 2 outgoing edges | error |
| 15 | every outgoing edge of a `kind = "decision"` node must have a `condition` | error |
| 16 | when `main: true` is marked, the `main` edges must lead from the entry to some `end` (broken chain) | error |
| 17 | if `outcome` is written it must be in the enum | error |
| 18 | array order clearly contradicts the `stages` order (a node's `stageId` comes before that of its upstream node) | hint, not an error |
| 19 | a decision on the main line has 2 or more outgoing edges but none is marked `main` | hint, not an error (see §4.1) |

Rule 11 is the same class as fact's "one slot, one event": **both prevent content from being silently
dropped.** The comment in `fact/timeline/layout.js` sets the reason out clearly, and that position is
copied here.

Rules 14 and 15 are "a decision point must really be a decision point": a diamond with only one
outgoing edge is meaningless, and a branch without a condition label leaves the reader unable to tell
where it goes.

**The rule 15 message must give the fix**, because such data really did appear in the measurements
(§8): in 03, "Party B submits the service list and invoice before the 25th of each month" was drawn
as a diamond, and its main outgoing edge had no condition. That node is in fact a **process node, not
a decision point**, so the message should not merely say "condition missing"; it must set out both
paths:

```
nodes[2] (n-3): kind is "decision" and its outgoing edge edges[1] has no condition.
  · If it really is a decision, give every outgoing edge a condition (e.g. "pass / fail");
  · If it is in fact a process, change kind to "step" (a process node may have several outgoing edges, one of them on the main line).
```

**No automatic repair.** The old prototype had a `postProcessLegalFlow` layer that de-duplicated
edges, reconnected isolated nodes and filled in labels for decision points. antu's position is
"validation reports, the agent fixes it": automatic repair swallows the agent's mistake, and it makes
it again next time. What must be distinguished:

| Class | Treatment |
|---|---|
| data errors (dangling references, isolated nodes, too few outgoing edges on a decision) | validation reports, does not repair |
| layout tolerance (order of nodes within a layer, which side a back edge goes round) | the renderer picks a default, no error |

---

## 6. Presentation (the renderer's job)

The data layer does not care about any of this. The same JSON under a different drawing method: not
one character of the data changes (the hard constraint in §3 of `spec/v0-architecture.md`).

### 6.1 The first sub-type, `flow` (flowchart)

**Implementation status (2026-09)**: the flowchart renders; the code is in
`src/renderers/procedure/flow/` (rules.js validation, metrics.js sizing, layout.js layout, palette.js
colours, FlowRenderer.jsx and its node / link / stage-band components), with unit tests in
`test/procedure-layout.test.mjs` and a browser check in `npm run verify`. Done and not done:

```
Done     placement and routing by ELK's layered algorithm (elkjs, flow/elk.js): layering,
         crossing minimisation, node placement, orthogonal routing, room reserved for every
         condition label; stages as boxes (ELK compound nodes); main-line edges prioritised for straightness;
         back-edge detection (drawn dashed), merging several edges into the same target, both
         orientations; the React renderer (six shapes by kind, three colours by outcome,
         hover / pinned overlay with provenance), nodes sized to their text, stage boxes, the control capsule (§6.2),
         image export
Not done **placing note nodes** (they take no part in the flow; ELK places them like any
         other node)
```

Measured on the 7 contracts and the two rule-layer drafts, both orientations:

| | hand-written layout (replaced) | dagre | **ELK (in use)** |
|---|---|---|---|
| crossings, 01 | 12 | 7 | **0** |
| crossings, 03 | 38 | 11 | **2** |
| crossings, the other five | 12 | 1 | **0** |
| labels on a node | avoided by rule | 0 | **0** (ELK reserves the space) |

Pinned by unit tests: no link runs behind a node, no two different links overlap, every label
clear of every node, links end on their node's outline (a diamond's slanted edge for a decision),
main links seldom bend (10 of 140), no link bends more than twice, stage boxes hold their own nodes and never overlap.

Why ELK over the hand-written layout: the hand-written one kept the main line in a single column
and hung everything off it. That made the main line rigid and forced the other branches to cross
it; the crossing count was the price. ELK treats the main line as a preference (edge priority),
not a column, and minimises crossings for the whole graph. **Cost:** elkjs adds about 1.4 MB, so
a generated HTML is about 1.9 MB instead of about 480 KB. It is called synchronously (see the
header of `flow/elk.js` for how and why); the elkjs version is pinned.

Decisions the renderer made, so they are not undone by accident:

- **Stages are boxes**: each stage is an ELK compound node holding its nodes, drawn as a light
  filled frame with the stage name in its corner; ELK routes links across the frames and keeps
  them from overlapping. If ELK cannot lay the boxes out, the diagram is laid out once more
  without them rather than fail.
- **A node is as big as its text** (`metrics.js` `sizeOf`): 14px text, wrapped past a cap, at
  most three lines; a diamond folds its text into a near-square block. Fixed 208×64 boxes left
  most of every box empty and, fitted to a screen, the text too small to read — what putting the
  same data through Mermaid showed.
- **Links bend as little as possible: straight first, then one bend** (`flow/straighten.js`).
  ELK's router takes every link out of a bottom and into a top, so two nodes not exactly in line
  cost a Z (two bends) and a loop four. After ELK, each link is offered simpler routes, fewest
  bends first: straight; out of a side and down into the top (the usual way out of a decision);
  out of the bottom and into a side; a loop straight back or round in a U. A route is taken only
  if it is clear of every node, stage title and label, lies on no other link and crosses no more
  of them. Several node placements are laid out and the one with the least bending is kept.
  Measured (corpus, both orientations): 132 bends before, 62 after; none above two.
- **Straight or curved links** is a presentation choice (§6.2): the curved style draws the same
  route with each turn as a wide arc, so switching moves no node and no label.
- **The main-line highlight follows the spine the engine settled on**, marked (`main: true`) or
  inferred, so a diagram with no `main` flags still shows its main line.

Measured (7 real contracts, both orientations lay out): 01 has twelve layers, 05 sixteen, 06 twenty;
in 03, 3 edges are merged into 2 links; 01 has 12 back edges recognised, 07 has 0.

- **The main line runs down the centre**, branch nodes spread left and right; several branches in one
  layer spread by their order in the `edges` array;
- **Stage boxes**: when `stages` is written, each stage's nodes are framed, with the stage name; formerly drawn along one side of
  the main line;
- **Edges**: main edges connect directly; branch edges carry a `condition` label and reserve label
  width; back edges arc round one side of the main line;
- **Nodes**: `label` is shown, `detail` shows its first line (truncated when it overflows), the
  popover shows the full text and the source;
- **Shape and colour**: per the mapping in §4.3;
- **Orientation**: vertical (top to bottom, default) / horizontal (left to right). As with fact this
  is a rendering parameter and does not enter the data.

Three rules forced by measurement (evidence in §8):

**One, outgoing edges other than the main one spread out as branch columns, whether or not the source
node is a `decision`.**
Four of the seven use ordinary nodes carrying branches. At render time only "is this edge marked
`main`" matters, not the shape of the source node.

**Two, several edges into the same target merge into one, with the conditions shown together.**
`B` in 03 has 7 outgoing edges, 3 of them into the same `N` and 2 into the same `O`, each with a
different condition. Drawn as 5 parallel lines they blur into one mass. Merged, the label reads:

```
N  ← Party B cannot meet 80% of the staffing need for 3 months running / was investigated for not
     signing an employment contract / was penalised by labour inspection for Party B's reason
```

**Three, there can be several ends, shown side by side.**
07 has 9 termination nodes (refund double the deposit / forfeit the deposit / arbitral award /
damages …), 05 has 4, 01 has 4. Several ends in one layer sit side by side in `edges` order, and
`outcome`'s colour distinguishes a good result from a bad one.
**No merging, no omission**; they really are different endings.

### 6.2 The control capsule (rendering parameters inside the sub-type)

| Control | Form | Notes |
|---|---|---|
| Orientation | segmented | vertical / horizontal |
| Link style | segmented | curved (default) / straight; remembered for every diagram |
| Condition labels | toggle | show / hide the `condition` on edges |
| Node detail | toggle | whether to show the `detail` line |
| Main-line highlight | toggle | bolden the main edges |
| Stage boxes | toggle | available when `stages` is written |
| Export image | action | reuses the export the canvas shell already has |

The rules for the four control forms (menu / toggle / segmented / action) follow §4.2 of
`spec/fact/rendering.md`; no separate set is invented. The language switch sits beside them, the
same one the timeline has.

### 6.3 How scale is computed, and what to do when it will not fit

"Will not fit" is different for a flowchart than for a timeline. A timeline has an objective hard
rule (one slot, one event); a flowchart has no corresponding hard rule, so there are two kinds of
treatment:

| Class | Test | Treatment |
|---|---|---|
| **Structural error** | rules 10 to 16 of §5 | validation reports, nothing is drawn |
| **Scale hint** | number of layers, widest layer, total nodes, content size, fit-to-screen scale | only numbers and advice are reported, no error |

The scale numbers are reported by MCP's `antu_layout` (layers, widest layer, how big the content is,
the fit-to-screen scale), and the agent decides whether to split the diagram. **No threshold is
hard-coded**, because in real contracts the 06 EPC general contract may reach thirty or forty nodes,
and hard-coding would block legal data, while not hard-coding still lets the agent see the risk.

---

## 7. The five items, as confirmed

**Confirmed as proposed (sponsor, 2026-09).** Kept here with the reasoning, because each one had a
real alternative and the reasoning is what makes a later change cheap to judge.

| # | Question | What this draft says | If rejected, what changes |
|---|---|---|---|
| 1 | Free graph of `nodes` + `edges`, or a layered "main line + branches" structure? | **Free graph**. Reason: the schema stops at the top-level type, and later swimlane and state diagrams need to consume the same schema | changing to a layered structure means rewriting the schema and voiding every example. The most expensive of the five |
| 2 | Is `main` marked on edges or on nodes? | **On edges**. Reason: the main line is a path, and marking nodes produces broken chains validation cannot catch | moving it to nodes means rewriting rule 16 as well |
| 3 | 6 `kind`s with `outcome` separate, or the old prototype's 9? | **6 + separate `outcome`**. Reason: positive/negative is an attribute, not a shape | reverting to 9 keeps the problem that every "termination" is painted red |
| 4 | Are `stages` needed? | **Yes**. Reason: contract flows fall into stages naturally, and without it stages can only be mixed into node text | delete `stages` and `stageId`, delete the stage boxes, nothing else changes |
| 5 | Is `domain` needed (fact rejected a classification enum at the time)? | **Yes, but optional and unread by rendering**. Reason: it classifies the whole diagram rather than its elements, and later there is a basis for default parameters by domain | delete it; nothing else moves |

---

## 8. Real-corpus regression (first round done)

**Writing the field table is not the final draft.** The standard for final is: the 7 real contracts
at hand can all be expressed with it, without needing any new field.

The corpus is drawn from 7 real contracts from faxi, each of which already has a
`business_flowchart.mmd`. This round first parses out the graph structure of the 7 and runs the rules
of §5 over them, then **translates each into procedure JSON**, landing in `examples/procedure/`:

| File (same prefix) | Nodes | Edges | Back edges | Longest chain | Stages | Features |
|---|---|---|---|---|---|---|
| `01-software-development-contract.*` | 26 | 37 | 9 | 12 | 5 | each of the three stages carries a delay branch |
| `02-purchase-contract.*` | 12 | 12 | 0 | 10 | 0 | the shortest; no back edges and no stages (tests the "no stages" path) |
| `03-labour-outsourcing-contract.*` | 15 | 26 | 6 | 7 | 2 | one node with 7 outgoing edges, 5 of them into 2 targets |
| `04-non-disclosure-agreement.*` | 6 | 6 | 0 | 5 | 0 | the smallest |
| `05-premises-lease.*` | 32 | 34 | 3 | 16 | 4 | most nodes, 4 ends |
| `06-epc-general-contract.*` | 26 | 31 | 3 | 20 | 4 | **not a single diamond**; every branch is an ordinary node with several outgoing edges |
| `07-share-acquisition-agreement.*` | 30 | 30 | 0 | 15 | 4 | 9 ends, the fullest set of branch conditions |

All seven pass the 19 rules of §5 (zero errors, zero hints). The three judgements made in translation
are recorded in §8.1.

**Note: these JSON files were reverse-engineered from the `.mmd`, not extracted from the contract
text.** The graph structure is reliable (node and edge counts match file by file), but content
accuracy is outside this round. Once the renderer is built, the contracts should be extracted again
from the source text.

### 8.1 Three judgements made in translation (none of them a new field)

1. **01 gained three back edges.** In the original `.mmd`, "schedule extended" is a dead end
   (`O`/`S`/`W` have no outgoing edge), yet it is not an end. It was completed by meaning into
   `schedule extended → back to this stage`, otherwise rule 13 would stop it. The edge count therefore
   goes 34 → 37.
2. **03 changed "submit the service list each month" from a diamond to a `step`.** The original `.mmd`
   draws it as a diamond, but its main outgoing edge has no condition and it is in fact a process node
   (rule 15 reports an error; the message is in §5).
3. **01 gained `condition: "Delayed"` on three branches.** In the original `.mmd`, edges such as
   `C → N` have no label, while `N` is "whether a delay is caused by Party A", so the meaning is clear.
   Beyond that **no condition was added or removed**: 06 has not one condition and is kept as it is (it
   exists precisely to test "what the renderer does when a branch has no condition").

### 8.2 Conclusion: it fits; the structure does not change

**All 7 fit into `nodes` + `edges` + `kind` + `stages` + `condition` + `outcome` + `main`, without
adding a single field.** All seven have a single entry and zero unreachable nodes; rules 10 and 11
produced no false positives.

### But five places need refinement (already back-filled into the sections above)

| # | Finding | Evidence | Back-filled into |
|---|---|---|---|
| 1 | **several outgoing edges on a non-`decision` node is the norm, not an exception** | 4 of the 7 use it, across 15 nodes | §4.5, upgraded from "supplementary" to required |
| 2 | rule 15 does report, and the message must give the fix | `C` in 03 ("submit the service list each month") is drawn as a diamond with no condition on the main outgoing edge. It is in fact a process node | §5 rule 15 gains the message |
| 3 | **there can be several ends** | 07 has 9 leaf nodes (refund the deposit / forfeit the deposit / arbitral award / damages …) | §6.1 gains the rendering rule |
| 4 | clause ③ of the main-line inference is necessary | on reaching a diamond every outgoing edge carries a condition, so ①② alone break at step 4 | §4.1 explanation + a validation hint |
| 5 | **several edges into the same target need merged rendering** | `B` in 03 has 7 outgoing edges, 3 into `N` and 2 into `O`, with different conditions | §6.1 gains the rendering rule |

### The two hardest

- **06 EPC general contract: longest chain 20 layers.** Twenty layers vertically means a diagram over
  2000px tall; in a 900px viewport the fit-to-screen scale drops below 0.4 and the text becomes
  unreadable. This is the only one where **splitting the diagram is advised**;
- **03 labour outsourcing contract: one node with 7 outgoing edges.** Five of them go into 2 targets.
  Spreading horizontally needs 7 columns, and this is the one the renderer most needs to handle.

These two numbers are also the evidence for "scale hints only, no error": stopping at a threshold
would have hit both 06 and 03 wrongly.

---

## 9. Out of scope this round

| Item | Reason |
|---|---|
| `views` | a procedural path has no side dimension, see §4.7 |
| swimlane columns (columns by party) | that is procedure's second sub-type, not a parameter of this one. In the first version `actorIds` is display-only |
| merging several entries at a decision | let the agent express it with one node; not done in the schema |
| hanging amounts and deadlines on edges and sorting by them | the text is in `detail`, but layout does not depend on it; **layout must not suggest a meaning the data does not carry** |
| drawing time/deadlines graphically | as with fact: real duration is not proportional to distance on the diagram, and drawing it would mislead (see §7 of `spec/fact/timeline-rules.md`) |
| automatic diagram repair (de-duplicating edges, reconnecting isolated nodes, filling in labels) | see the end of §5 |
| drag-to-edit nodes | as with fact, editing is out of the core scope |

---

## 10. Compared with fact

| Dimension | fact | procedure |
|---|---|---|
| Core structure | `slots[].events[]` (a linear narrative) | `nodes` + `edges` (a graph) |
| What decides position | `groupId` decides the side, `actorIds` decides the lane | the graph structure (main line + branches + back edges) |
| Time / order | the order of the `slots` array is the order | the graph's topology; there is no global order |
| Classification enum | **no** `kind` (event class is not enumerated) | **yes** `kind` (six shapes, needed to render) |
| Result attribute | none | `outcome` (positive / negative / neutral) |
| Grouping | `groups` (sides) | `stages` (stages) + `kind` (shape) |
| Several readings | `views` | none |
| Division of text | `label` / `summary` / `detail` | `label` / `detail` (no `summary`, see §3) |
| References | `actorIds` / `groupId` / `sourceIds` | `actorIds` / `stageId` / `sourceIds` |
| Sources | the same 7 types and structured location | **fully reused** |
| Test for "will not fit" | one slot, one event (a structural rule, error) | structural errors error; scale only hints (see §6.3) |

The difference in one sentence: **fact is "a narrative on one timeline"; procedure is "the movement on
one graph".** The former fixes order by array position, the latter fixes movement by edges; the
former's classification is superfluous, the latter's shape is necessary.

---

## 11. The rule layer (v1.1)

> Status: **part of v1.1** (sponsor, 2026-09). `rules` is optional; every v1 JSON is still
> valid. All seven contracts in `examples/procedure/` are written with it (02 needs no rule).

### 11.1 Why

Once the flowchart rendered, the 7 contracts were measured by structure, and most of their
complexity turned out not to come from the flow itself:

| Finding | Evidence | Cause |
|---|---|---|
| **The back edges are almost all fake** | 27 back edges, all 27 return to the main line, e.g. "Party B pays penalty → back to requirements confirmation" | Rule 13 (a non-end node needs an outgoing edge) forces the agent to give every consequence a way "back"; §8.1 item 1 added three exactly so |
| **One clause is copied per stage** | 12 of the 26 nodes in 01 repeat "delay caused by A / B? → extension / penalty", one set per stage | There is no way to say "this applies in stages 2 to 4" |
| **"At any time" is drawn as a branch of one step** | 03 hangs 10 conditional edges off two ordinary steps ("service period starts", "submit service list") | Termination rights and breach liability can fire at any time in the service period; they are not a decision at a point |
| **The old diagrams' mistakes are inherited** | 01: "delay caused by B? → no → back to requirements confirmation" | The corpus was reverse-engineered from the old pipeline's Mermaid output (§8 says so), not extracted from the contracts |

A contract's performance is two things: a **line of performance** (milestones, payments,
acceptance) and a set of **contingent clauses** (breach, delay liability, rights to terminate).
v1 has one grammar, the flowchart, so the second is folded into the first. The acceptance test
of §8, "it fits", tested expressiveness, not whether the encoding is right or draws clearly.

### 11.2 Fields

```json
"rules": [
  { "id": "r-2", "when": "Delay caused by Party B", "then": "Party B pays a penalty: 0.1% per day, capped at 5%",
    "outcome": "negative", "stageIds": ["st-2", "st-3", "st-4"], "sourceIds": ["s-1"] },
  { "id": "r-6", "when": ["Party B fails 80% of staffing for 3 months running", "Party B found not signing employment contracts"],
    "then": "Party A may terminate", "outcome": "negative", "stageIds": ["st-1"], "endId": "n-9" }
]
```

| Field | Required | Meaning |
|---|---|---|
| `id` | ✅ | unique among rules and nodes |
| `when` | ✅ | the trigger; an array means "any one of these" |
| `then` | ✅ | the consequence, amounts included |
| `stageIds` | ❌ | the stages it applies in; omitted = throughout. **One rule covers all its stages, never one copy per stage** |
| `outcome` | ❌ | colour, as on nodes |
| `endId` | ❌ | only if it ends the contract: the `end` node it leads to |
| `sourceIds` | ❌ | the clause it rests on |

**The dividing line:** a judgement made at a point that decides where the flow goes (acceptance
passed or not, renew or not) stays a node with edges; a clause that may fire at any time within a
period is a rule. A real loop such as "rectify, then inspect again" stays a back edge.

**Validation:** references must exist; `endId` must name an `end`; `when` must not be empty. An
end reached only through rules has no incoming edge, yet is neither an entry nor unreachable.
**Rule 13 does not need relaxing**: the consequences moved into rules, and the nodes left no
longer need a fake way "back".

### 11.3 Presentation

- Rules are **cards** in a lane beside the node field, level with the first stage they apply
  to, stacked in stage order, never overlapping;
- Outside the cards a **scope bar** spans the stages a rule covers; rules with the same range
  share one bar;
- Rules that end the contract join one **trunk** into their end: five grounds for termination
  read as five roads into one door, not five lines across the page. An end reached only through
  rules sits in the last layer, outermost;
- The capsule gains a "Rules" switch; off, the lane is given back.

### 11.4 Measured (the seven contracts, before → after)

| | Nodes | Edges | Back edges | Rules |
|---|---|---|---|---|
| 01 software development | 26 → 14 | 37 → 16 | 12 → 3 (rectify and re-inspect) | 2 |
| 02 purchase | 12 | 12 | 0 | 0: the quality dispute is a judgement at delivery, a real branch |
| 03 labour outsourcing | 15 → 9 | 26 → 9 | 6 → 2 (the monthly cycle, renewal) | 7 |
| 04 non-disclosure | 6 → 4 | 6 → 3 | 0 | 1 |
| 05 premises lease | 32 → 19 | 34 → 19 | 3 → 2 (the monthly rent, re-inspection) | 4 |
| 06 EPC | 26 → 21 | 31 → 21 | 3 → 2 (recommissioning, re-inspection) | 4 |
| 07 share acquisition | 30 → 21 | 30 → 20 | 0 | 4 |

With ELK (§6.1), all seven lay out with no crossing in either orientation.

The rewrite was made **by meaning, from the existing JSON**; the contracts themselves are not in
the repository. Judgements that should be checked against the originals: 01 drops "delay caused by
neither → back to requirements confirmation" (read as an error of the old diagram); 03 and 05 split
the one "terminated" end into expiry and rescission; 03 words Party A's termination trigger as
"30 days' written notice"; 05 and 03 draw the monthly payment as a cycle until the term ends; 06
scopes the delay rules to design, procurement and construction; 07 folds the warranty claim
procedure (notice, acceptance or arbitration) into one rule.

### 11.5 Still open

1. **Re-extract from the contracts**: the corpus is still derived from the old pipeline's `.mmd`,
   now rewritten by meaning; extracting from the originals would settle the judgements of §11.4;
2. Whether `when` should be structured (party, deadline, amount): one sentence is enough to draw,
   not enough to compute with.
