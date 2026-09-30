# Fields of the relationship diagram

```
Fields of a relationship spec. "yes" means required.

[envelope]
  type       yes string     always "relationship"
  specVersion no integer    which generation of this format the file follows (now 1); omit = the current one. Write it: it is how an older file is recognised after a breaking change
  title      yes string     diagram title, shown at the top left
  asOf       no ISO date   the date these relations hold; the diagram is a cross-section at one point in time

[groups]
  id         yes string     entities reference it via groupId
  label      yes string     the camp or cluster boxed together, e.g. "creditor side"
  · an entity is in at most one group; groups do not nest; omit groups and no boxes are drawn

[entities]
  id         yes string     unique among entities; relations reference it via from/to
  kind       yes string     person / company / organization / government / other; fixes the shape and colour only
  label      yes string     the name shown on the box
  role       no string     the role in this case, one short line under the name, e.g. "guarantor"
  detail     no string     registered capital, ID number and the like; the full text in the popover
  groupId    no string     references groups
  sourceIds  no string[]   which materials it rests on

[relations]
  id         yes string     unique among relations (a guarantee's secures refers to it)
  from       yes string     entity id; the direction of the relation runs from here
  to         yes string     entity id
  kind       yes string     equity / control / contract / debt / guarantee / kinship / employment / agency / other. equity: holder -> held. debt: creditor -> debtor. guarantee: guarantor -> creditor. control/employment/agency: the controlling / employing / authorising side first
  label      no string     a short phrase on the line; omit it and the engine writes one from the kind ("Holds 60%")
  detail     no string     terms, dates; the full text in the popover
  directed   no boolean    override of the kind's default: contract and kinship have no arrowhead, the rest do
  share      no number     equity only: the percentage held, 0 to 100
  amount     no string     debt and contract only: the sum as it should be read, e.g. "CNY 500,000"
  secures    no string     guarantee only: the id of the debt or contract relation it secures
  sourceIds  no string[]   which materials it rests on

[sources]
  id         yes string     entities and relations reference it via sourceIds
  type       yes string     contract / evidence / statute and four more, the same seven as fact
  name       yes string     material name, e.g. "loan contract"
  loc        no object     location, e.g. { file, page }

Cross-field rules (dangling references, a relation from an entity to itself, share and amount on the
wrong kind, a guarantee that secures something that is not a claim) are not listed above: call
antu_validate after writing. It reports each problem.
```
