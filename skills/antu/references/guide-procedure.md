# Mechanism notes for an agent

> This is an **operating note**, not the specification. The field list is served by
> `antu_schema`, examples by `antu_examples`, and the design rationale lives in the
> human-facing documents under `spec/` (you do not need them to write JSON).
>
> **This file is English on purpose.** It goes into a model's context, the same as
> the field table and the validation errors. See the header of `src/core/i18n.js`.

## In one sentence

A procedure JSON describes: **what happens in what order, where the path splits, and what
may happen at any time along the way**. The engine draws a flowchart: steps are nodes,
the order is edges, contingent clauses are a table under the flow.

## Three things, three places

```
nodes   steps, decisions, outcomes         "Seller delivers", "Goods pass inspection?"
edges   the order between them             n-2 -> n-3, with a condition on a branch
rules   what may happen at any time        "if the seller is late: 0.1% per day"
```

**The most common mistake is writing a rule as nodes and edges.** A breach, a delay
penalty, a right to terminate is not a step after another step: it can fire at any moment
of a stage. As a branch off one step it claims a moment it does not have, and has to be
repeated per stage. Write it once in `rules`:

```json
{ "id": "r-1", "when": "Seller delivers late",
  "then": "Seller pays 0.1% of the price per day, capped at 5%",
  "outcome": "negative", "stageIds": ["st-1"], "sourceIds": ["s-1"] }
```

- `when`: one trigger, or an array of them (any one fires the rule);
- `stageIds`: the stages it applies in; omit for "throughout";
- `endId`: only when the rule ends the procedure (termination). It must be a node of kind
  `end`, and that node may have no incoming edge.

Rule of thumb: **if the same branch would leave several steps, or it leads nowhere, it is
a rule.**

## A node's look: two fields, never mixed

```
kind     shape:   start     pill, where the flow begins
                  step      box, something someone does
                  decision  diamond, a question the path splits on
                  end       double-bordered pill, where the flow stops
                  document  box with a wavy bottom, a paper produced
                  note      folded sheet, an explanation outside the flow
outcome  colour:  positive (green) / negative (red) / neutral (grey, default)
```

`outcome` is what the result means ("contract performed" positive, "terminated" negative).

## Edges

- **The main line** is the path when everything goes as agreed. Mark its edges
  `"main": true`, one chain from the start to an end. Unmarked, the engine guesses (the
  first unconditional edge out of each node): mark it.
- **A decision** needs two or more outgoing edges, **each with a `condition`**. One way
  out means it is a `step`. On the main line, mark which answer continues it.
- **A loop is an ordinary edge back** ("rectify" -> "inspect again"). Do not copy nodes
  to avoid it; it is drawn dashed.
- Edges may rejoin one node; two edges between the same pair need different conditions.

**Every node must lead somewhere**: all but `end` and `note` need an outgoing edge, and all
must be reachable from the start. A step that leads nowhere is almost always a
consequence that belongs in `rules` (the error says so). Only a `start` may have no
incoming edge (a `note`, and a rule's `endId`, aside): any other node without one is an
error, since nothing leads to it. Several `start` nodes are allowed, with a hint.

## Stages

`stages` is an ordered list; a node joins one with `stageId`. Each stage is drawn as a
framed box holding its nodes; the stages stand side by side as columns, the flow running down
each (a stage much taller than the rest is folded into two columns). Keep a stage's nodes
consecutive along the flow: an edge into an earlier stage draws backwards (fine for a loop, a
hint otherwise). Put every node in a stage, or none: with stages on only some nodes, the whole
diagram falls back to one long column.

Orientation and link style (curved / straight) are the reader's choice in the interface;
they are not in the data.

## After writing

```
antu_validate   each problem with its path and node id: nodes (n-4): kind is "decision" but ...
antu_layout     counts, layers, loops, rules, size per orientation; no rendering
antu_preview    a screenshot: is the main line obvious, are the branches readable
antu_render     the self-contained HTML
```

**Passing validation is only the pass mark.** Always look with `antu_preview` before
delivering.

## Also easy to get wrong

- **Referenced ids must exist**: `stageId`, `actorIds`, `sourceIds`, an edge's `from` /
  `to`, a rule's `stageIds` / `endId`.
- **Keep labels short.** A node shows about three lines of `label`; put the rest in
  `detail` (its first line shows under the label, all of it on click).
