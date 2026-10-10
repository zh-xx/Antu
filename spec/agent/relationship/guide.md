# Mechanism notes for an agent

> This is an **operating note**, not the specification. The field list is a separate
> document, the examples are separate files, and the design rationale lives in
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
suits a case with many parties, where the graph is too busy. **Write `secures` on every guarantee**: it
names the claim (a `debt`) the guarantee secures, and the graph ties the two lines together. The **matrix**
puts the parties down and across and names the relations in each cell: for "is there any
relation between A and B". The **equity tree** draws the `equity` relations in levels with the `share` on each
line, so **write `share` on every equity relation**. The **authority chart** draws `control`, `employment` and `agency` as an organisation chart; the **related-party
list** is a table of one party's relations (to paste into a brief); the **path** draws the shortest chains between
two parties in one picture, one start and one end. The same JSON draws in all seven;
`kind: "focus"`, `"matrix"`, `"equity"`, `"authority"`, `"related"` or `"path"` on `layout`, `preview` and `render` shows it.

## Three things, three places

```
entities    the parties          "Zhang San", "Xinghe Trading Co."
relations   what is between them from -> to, with a kind: debt, equity, guarantee ...
groups      the camps            "creditor side", "debtor side" (optional)
```

It is a cross-section: write the relations as they stand on one date (`asOf`, optional). Do not
write a history. If the relations changed, write two diagrams.

## A relation is a tie that stands, not something that happened

Write what ties the parties to each other: a debt owed, a shareholding, a marriage, a job, a guarantee,
an instruction to act for someone. **Do not write acts as relations**: a push, a blow, a stabbing, an
insult, a lock changed, a visit to press for payment. Those happened once; they belong in a fact
diagram. Leave them out, and offer the user a fact diagram for them.

The test: is the sentence still true the day after? "A owes B" is; "A pushed B" is not.

An act that leaves a tie behind is written as the tie: lending money is a `debt` (with its `contract`);
"C sent people to collect the debt" is `agency` from C to those people; pledging a house for a loan is a
`guarantee` with `secures`. Many acts between the same two parties are no reason for a relation.

Write only the ties the material states. "Her family", "the company's people" do not say who is whose
mother or who works where: leave such a tie out rather than guess it.

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
other        a standing tie none of the above fits (a lease, a licence); never an act
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

**Two names are two parties** unless the material says they are one. A judgment that hides names writes
"Fang X" for one person and "Fang Yuan" for another; do not merge them because they look alike, and do
not merge them with a note saying you did. If it matters and the material does not say, ask the user.

## Groups

`groups` boxes together the parties a reader should see as one camp. An entity is in at most one
group (`groupId`); groups do not nest. Leave a party out of every group and it stands outside the boxes.

## After writing

```
validate    each problem with its path and id: relations (r-2): `secures` points at ...
            on a pass it can still add notes (an entity nothing relates to, shares over 100%)
layout      counts, layers, size per orientation; no rendering
preview     a screenshot: are the camps clear, do the lines cross badly
render      the self-contained HTML
```

**Passing validation is only the pass mark.** Always look with `preview` before delivering.

## Also easy to get wrong

- **Referenced ids must exist**: `from` / `to`, `groupId`, `sourceIds`, `secures`.
- **`share` is only for `equity`, `amount` only for `debt` and `contract`, `secures` only for `guarantee`.**
- **An entity nothing relates to floats beside the diagram** (a hint): relate it or leave it out.
- **`amount` is a string**, written the way it should be read, with the currency.

## The examples

Each adds one idea (`<name>.zh-CN.json`, `<name>.en.json`):

- `1-minimal`: one loan
- `2-equity`: who holds whom, how much
- `3-guarantee`: names the claim it secures
- `4-groups`: camps
- `5-kinship`: undirected beside directed relations
