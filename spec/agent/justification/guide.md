# Mechanism notes for an agent

> This is an **operating note**, not the specification. The field list is a separate
> document, the examples are separate files, and the design rationale lives in
> `spec/justification/schema-draft.md` (you do not need it to write JSON).
>
> **This file is English on purpose.** It goes into a model's context, the same as
> the field table and the validation errors. See the header of `src/core/i18n.js`.

## In one sentence

A justification JSON describes **one side's reasoning: how norms and facts lead, step by step, to a
conclusion**. The engine draws a tree: the conclusion first, what supports it below, and at the
bottom the facts and the norms.

## Three things, three places

```
nodes    the statements   conclusion, norm, element, fact, inference, judgement
links    who supports whom  from (the support) -> to (the supported), with a stance
groups   the issues         "Issue 1: was it defensive?" (optional, one box each)
```

Draw **one side's** reasoning (say, the court's reasons). Do not put the other side's tree in the same
diagram.

## The six kinds of node

```
conclusion  what is decided; the end of the diagram, or the summing-up of one issue
norm        a statute, interpretation or precedent (a leaf); sourceIds -> a statute / case source
element     one constituent requirement a norm breaks into ("time: the attack is under way")
fact        what the court found happened (a leaf); date, sourceIds
inference   a statement drawn from facts ("the lights were visible, so he should have known")
judgement   a value call on a body of facts ("the attack was not urgent")
```

Keep **fact, inference and judgement apart**; they are questioned differently (evidence, logic, value
call). A fact says what happened, with a time. An inference says what may therefore be taken to be so.
When unsure: does the sentence say what happened, or what follows from it?

## Links and their stance

A link runs from the supporting node to the supported one: fact -> element, element -> conclusion.

```
for      (default) from supports to
against  from opposes to        (a judgement saying an element is not met)
basis    from is the norm to rests on     (only from a norm)
```

## holds: upheld, or rejected

`holds: "yes"` on an element, inference, judgement or conclusion says the reasoning upholds it;
`holds: "no"` says the reasoning rejects it. **Draw the rejected side too**: a conclusion "it was
special defence" with `holds: "no"`, and the reasons it fails pointing `against` it. A fact and a norm
have no `holds`. Leave it out when the reasoning does not say.

## and / or: `combine`

When a node rests on several things, say whether all are needed or one is enough: `combine: "all"` (every
`for` link into it is needed: the five conditions of lawful defence) or `combine: "any"` (one is enough).
Leave it out when the reasoning does not say. Only `for` links count, and it belongs only on a conclusion,
element, inference or judgement. Keep it consistent with `holds`: an `"all"` node that holds cannot rest on a
rejected node.

## Issues

`groups` is one box per issue. A node is in at most one group. Put a norm in the issue it settles (a
norm used in two issues is two `norm` nodes with the same `sourceIds`). Nodes in no group (the end
conclusion) stand above the issues. **A fact that supports things in several issues is written once**: link it to each
element it supports, and the engine draws it in each of those issues (a copy says "same as"). Do not write
it twice.

## Big diagrams

A reader can fold each issue up to its conclusion (its box title is a button; the dock has "Fold issues"), so a
diagram of several issues can be read at a glance. Nothing to write for it: it is not in the JSON. Still split a
diagram that grows past about 60 nodes.

## After writing

```
validate    each problem with its path and id: links[3] (f-9 -> e-9): `to` refers to ...
            on a pass it can still add notes (a fact with no source, nothing supports a conclusion)
layout      counts, layers, size per orientation; no rendering
preview     a screenshot: is each issue clear, do the lines cross badly, is anything cut off
render      the self-contained HTML
```

**Passing validation is only the pass mark.** Always look with `preview` before delivering. A big diagram
(past about 40 nodes) is small on one screen: split it, one diagram per issue.

## Also easy to get wrong

- **Referenced ids must exist**: `from` / `to`, `groupId`, `sourceIds`.
- **A fact or a norm is a leaf**: nothing supports it (an evidence layer is not part of v0).
- **`holds` is not for facts and norms; `date` is only for facts** (`2032-04-14` or `2032-04-14T22:22`).
- **At least one conclusion has no outgoing link**: the conclusion the whole reasoning leads to.
- **Do not invent a date**: leave `date` out when the source does not give one.

## The examples

Each adds one idea (`<name>.zh-CN.json`, `<name>.en.json`):

- `1-minimal`: conclusion, norm, element, two facts
- `2-against-and-rejected`: the rejected side
- `3-issues`: one box per issue
- `4-shared-fact`: one fact, two issues
- `5-sources`: time and sources
- `6-all-or-any`: and / or
