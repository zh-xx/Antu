# Mechanism notes for an agent

> This is an **operating note**, not the specification. The field list is served by
> `antu_schema`, examples by `antu_examples`, and the design rationale lives in
> `spec/relationship/schema-draft.md` (you do not need it to write JSON).
>
> **This file is English on purpose.** It goes into a model's context, the same as
> the field table and the validation errors. See the header of `src/core/i18n.js`.

## In one sentence

A relationship JSON describes **who stands in what relation to whom, at one point in time**.
The engine draws a graph: parties are boxes, relations are lines between them, and camps are
boxes around parties.

The reader can also switch to a **focus view**: one party in the middle (by default the one with most
relations; the reader clicks another), the parties tied to it around it, the others further out. It
suits a case with many parties, where the graph is too busy. The **guarantee chain** shows one block per
claim (a `debt`) with its guarantors beside it and what stands behind each; for a loan or guarantee
dispute. **Write `secures` on every guarantee**: without it the chain ties a guarantee to a claim only when
its creditor has exactly one, and puts it apart otherwise. The **matrix** puts the parties down and across and names the relations in each cell: for "is there any
relation between A and B". The **equity tree** draws the `equity` relations in levels with the `share` on each
line, so **write `share` on every equity relation**. The same JSON draws in all five;
`kind: "focus"`, `"chain"`, `"matrix"` or `"equity"` on antu_layout / antu_preview / antu_render shows it.

## Three things, three places

```
entities    the parties          "Zhang San", "Xinghe Trading Co."
relations   what is between them from -> to, with a kind: debt, equity, guarantee ...
groups      the camps            "creditor side", "debtor side" (optional)
```

It is a cross-section: write the relations as they stand on one date (`asOf`, optional). Do not
write a history. If the relations changed, write two diagrams.

## The kind of a relation, and its direction

The direction runs from `from` to `to`. Write it the way the kind says:

```
equity       holder -> the entity held             share: 60
control      controller -> controlled              (control without a shareholding)
debt         creditor -> debtor                    amount: "CNY 500,000"
guarantee    guarantor -> creditor                 secures: "r-1"
contract     either way, no arrowhead              amount: "CNY 80,000"
kinship      either way, no arrowhead              spouses, parents and children
employment   employer -> employee
agency       principal -> agent
other        anything else
```

`directed: true/false` overrides the kind's default arrowhead. A loan usually needs **two**
relations on the same pair: the `contract` (what was agreed) and the `debt` (who owes whom).

## A guarantee says which claim it secures

A guarantee secures **one particular claim**, not the debtor in general. Put the id of the `debt`
(or `contract`) relation in `secures`. Without it the validator gives a hint, and a reader cannot
tell which of two loans the guarantee is for.

## Entities

`kind` is `person` / `company` / `organization` / `government` / `other` and fixes the shape only.
`label` is the name; `role` is the role **in this case** on one short line ("Lender", "Guarantor").
Keep labels short; put registered capital and the like in `detail` (its full text shows on click).

## Groups

`groups` boxes together the parties a reader should see as one camp. An entity is in at most one
group (`groupId`); groups do not nest. Leave a party out of every group and it stands outside the boxes.

## After writing

```
antu_validate   each problem with its path and id: relations (r-2): `secures` points at ...
                on a pass it can still add notes (an entity nothing relates to, shares over 100%)
antu_layout     counts, layers, size per orientation; no rendering
antu_preview    a screenshot: are the camps clear, do the lines cross badly
antu_render     the self-contained HTML
```

**Passing validation is only the pass mark.** Always look with `antu_preview` before delivering.

## Also easy to get wrong

- **Referenced ids must exist**: `from` / `to`, `groupId`, `sourceIds`, `secures`.
- **`share` is only for `equity`, `amount` only for `debt` and `contract`, `secures` only for `guarantee`.**
- **An entity nothing relates to floats beside the diagram** (a hint): relate it or leave it out.
- **`amount` is a string**, written the way it should be read, with the currency.
