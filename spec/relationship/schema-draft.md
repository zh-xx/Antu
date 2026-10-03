# relationship · Schema draft v0

> Status: **implemented** (status line checked against 0.5.1; the sponsor accepted the draft as good enough for now, 2026-09; not final). Implemented and released: validation, layout, the renderer, the dock, the examples for agents; the type is in the skill. Items marked **⚠ proposal** are proposals that stand until the sponsor changes them; §7 lists the open questions and what the schema does for each in the meantime. Sub-types are not decided here (the first one, `graph`, is in §6.1).
> Basis: the shared conventions layer of `spec/v0-architecture.md` (id references / everything carries a label / loose where optional), and the classification of differences in its §3 (different domain semantics → controlled enum, no new top-level type). The shape follows `spec/procedure/schema-draft.md`.
> Scope: relationship = **who stands in what relation to whom, at one point in time**. What happened over time → `fact`; the path of a procedure → `procedure`; norms + facts → a conclusion → `justification`.

> **This document is for the designer.** An agent writing JSON will use the field table from `antu_schema` and a short mechanism note under `spec/agent/relationship/` (both to be written once the schema is final).

---

## 0. Decisions

Taken by the sponsor (2026-09):

1. **What the first version draws**: four families of relation: **equity and control**, **contracts and debts**, **guarantees and joint liability**, **status and kinship** (spouse, parent and child, employment, agency).
2. **What the diagram is for**: the overview of *who is related to whom, and how* in a case, used beside the fact diagram and the procedure diagram. Every relation can carry its source (a contract, a registry record). It is not a due-diligence equity-penetration chart (that would centre on shareholding percentages and levels).
3. **Time**: one diagram is **a cross-section at one point in time**. The envelope may carry an optional `asOf` date; the diagram itself has no time axis. To show how relations changed, draw two diagrams side by side.

Proposed by me (**⚠ proposal**, see §7):

4. **Parties are `entities`, relations are `relations`** (each with `from` / `to`), a free graph, the same idea as procedure's `nodes` + `edges`. The name `relations` is business language; `edges` would match procedure literally.
5. **One `kind` enum on every relation** (§4.1), with dedicated optional fields for the kinds that need them (`share` for equity, `amount` for a debt, `secures` for a guarantee), rather than one bag of free-text labels. Reason: the four families read differently and are drawn differently, and the dedicated fields are what validation can check.
6. **`groups`** for the camps and clusters a reader wants boxed together (plaintiff side and defendant side; a corporate group). Same idea as fact's `groups` and procedure's `stages`.
7. **`sources` reuses the seven types and structured location unchanged** (`spec/source-schema-draft.md`).
8. **No `views`.** As in procedure, a view is a fact concept.

---

## 1. Envelope

```jsonc
{
  "specVersion": 1,
  "type": "relationship",
  "title": "Zhang San v. Li Si · Parties and relations",
  "asOf": "2023-03-10"      // optional: the date these relations hold (ISO date)
}
```

`asOf` is shown on the label card when present ("as of 2023-03-10"). It changes nothing else.

---

## 2. Draft content layer

The example covers the four families in one small case.

```jsonc
{
  "type": "relationship",
  "title": "Zhang San v. Li Si · Parties and relations",
  "asOf": "2023-03-10",

  "groups": [
    { "id": "g-1", "label": "Creditor side" },
    { "id": "g-2", "label": "Debtor side" }
  ],

  "entities": [
    { "id": "e-1", "kind": "person",  "label": "Zhang San", "role": "Lender", "groupId": "g-1" },
    { "id": "e-2", "kind": "person",  "label": "Li Si", "role": "Borrower", "groupId": "g-2" },
    { "id": "e-3", "kind": "person",  "label": "Wang Wu", "role": "Guarantor", "groupId": "g-2" },
    { "id": "e-4", "kind": "company", "label": "Xinghe Trading Co.", "groupId": "g-2" },
    { "id": "e-5", "kind": "person",  "label": "Zhao Liu", "role": "Li Si's spouse", "groupId": "g-2" }
  ],

  "relations": [
    { "id": "r-1", "from": "e-1", "to": "e-2", "kind": "debt",
      "label": "Loan", "amount": "CNY 500,000", "sourceIds": ["s-1"] },
    { "id": "r-2", "from": "e-3", "to": "e-1", "kind": "guarantee",
      "label": "Joint and several guarantee", "secures": "r-1", "sourceIds": ["s-2"] },
    { "id": "r-3", "from": "e-2", "to": "e-4", "kind": "equity", "share": 60,
      "sourceIds": ["s-3"] },
    { "id": "r-4", "from": "e-2", "to": "e-5", "kind": "kinship", "label": "Spouses" }
  ],

  "sources": [
    { "id": "s-1", "type": "contract", "name": "Loan contract", "loc": { "file": "loan-contract.pdf", "page": 1 } },
    { "id": "s-2", "type": "contract", "name": "Guarantee contract", "loc": { "file": "guarantee.pdf", "page": 1 } },
    { "id": "s-3", "type": "evidence", "name": "Business registration record", "loc": { "file": "registry.pdf", "page": 2 } }
  ]
}
```

---

## 3. Field rules

### Diagram-level fields

| Field | Required | Type | Notes |
|---|---|---|---|
| `asOf` | ❌ | ISO date string | the date the relations hold, in the envelope |
| `groups` | ❌ | object[] | `{ id, label }`, see §4.3 |
| `entities` | ✅ | object[] | the parties, see below |
| `relations` | ✅ | object[] | how the parties stand to each other, see below |
| `sources` | ❌ | object[] | the source table inside the diagram; the seven types and location fields fully reuse fact |

### Each item of `entities[]`

| Field | Required | Type | Notes |
|---|---|---|---|
| `id` | ✅ | string | unique in the diagram, referenced by `relations` |
| `kind` | ✅ | string enum | `person` / `company` / `organization` / `government` / `other`, see §4.2 |
| `label` | ✅ | string | the name shown on the entity |
| `role` | ❌ | string | the role in this case ("Lender", "Guarantor"), one short line under the name |
| `detail` | ❌ | string | registered capital, ID number, the details that do not fit on the box; all of it in the popover |
| `groupId` | ❌ | string | references an id in `groups` |
| `sourceIds` | ❌ | string[] | references ids in this diagram's `sources` |

### Each item of `relations[]`

| Field | Required | Type | Notes |
|---|---|---|---|
| `id` | ✅ | string | unique among relations (`secures` refers to it) |
| `from` | ✅ | string | id of an entity; **the direction of the relation runs from here**, see §4.1 |
| `to` | ✅ | string | id of an entity |
| `kind` | ✅ | string enum | see §4.1 |
| `label` | ❌ | string | a short phrase on the line. When omitted the renderer supplies one from `kind` and the dedicated fields ("Holds 60%") |
| `detail` | ❌ | string | terms, dates, the full text; in the popover |
| `directed` | ❌ | boolean | override of the kind's default, see §4.1 |
| `share` | ❌ | number (0–100) | **`equity` only**: the percentage held |
| `amount` | ❌ | string | **`debt` and `contract`**: the sum, as it should be read ("CNY 500,000") |
| `secures` | ❌ | string | **`guarantee` only**: the id of the relation this guarantee secures |
| `sourceIds` | ❌ | string[] | references ids in this diagram's `sources` |

`amount` is a string on purpose: it is displayed, not computed, and a currency or a range ("about CNY 500,000") does not fit a number.

---

## 4. The mechanisms

### 4.1 Relation kinds (`kind`) and direction  **⚠ proposal**

| `kind` | Meaning | Direction `from → to` | Default | Dedicated fields |
|---|---|---|---|---|
| `equity` | holds shares / a capital contribution | holder → the entity held | directed | `share` |
| `control` | actual control, concerted action, appointment, without a shareholding | controller → controlled | directed | |
| `contract` | a contract between the parties (sale, lease, service…) | either way (write the payer / the offeror first if it matters) | **undirected** | `amount` |
| `debt` | a claim and its debt | **creditor → debtor** | directed | `amount` |
| `guarantee` | a guarantee, mortgage, pledge, or joint liability | **guarantor → creditor** | directed | `secures` |
| `kinship` | spouse, parent and child, sibling, heir | either way | **undirected** | |
| `employment` | employer and employee | employer → employee | directed | |
| `agency` | authorisation, agency | principal → agent | directed | |
| `other` | anything else | | directed | |

- `directed` overrides the default (a parent-to-child `kinship` can be `directed: true`).
- The direction rule is one sentence per kind and is written into the agent note; the enum is small enough for an agent to hold.
- A `debt` and the `contract` it comes from are two relations on the same pair. That is intended: the contract says what was agreed, the debt says who owes whom.

### 4.2 Entity kind (`kind`)

`person` (natural person), `company` (a legal-person enterprise), `organization` (a partnership, an institution, a social organisation, a non-legal-person entity), `government` (an administrative or judicial organ), `other` (for instance an unnamed group such as "the debt collectors").

The kind decides the shape and colour of the box only. It carries no legal meaning of its own.

### 4.3 Groups (`groups`)

A group is a labelled box around the entities that name it in `groupId` (plaintiff side and defendant side; a corporate group). An entity is in at most one group; groups do not nest. Groups are optional, and an entity with no `groupId` stands outside every box.

### 4.4 A guarantee points at the debt it secures (`secures`)

A guarantee secures **one particular claim**, not the debtor in general. `secures` names that claim (a `debt` or `contract` relation), so the guarantee is drawn from the guarantor to the creditor **and** visibly attached to the claim. Without it the reader cannot tell which of two loans a guarantee is for.

### 4.5 Sources (`sources`) and "no views"

Entities and relations reference sources through `sourceIds`; the table is the one every diagram carries (`spec/source-schema-draft.md`). There is no `views`: it is a fact concept.

---

## 5. Validation rules  **⚠ proposal**

Errors, reported one by one with the field path and the id, in the same style as fact and procedure:

| # | Rule | Result |
|---|---|---|
| 1 | `entities` and `relations` are non-empty arrays | error |
| 2 | `id` is present and unique within `entities`, and within `relations` | error |
| 3 | `entity.kind` and `relation.kind` are in their enums | error |
| 4 | `label` is present and non-empty on every entity | error |
| 5 | `from` and `to` refer to existing entities | error |
| 6 | no self-relation (`from === to`) | error |
| 7 | no duplicate relation (same `from`, `to`, `kind`, `label`) | error |
| 8 | `groupId` and `sourceIds` refer to existing ids | error |
| 9 | `share` is a number in 0–100 and appears only on `equity` | error |
| 10 | `amount` appears only on `debt` and `contract` | error |
| 11 | `secures` appears only on `guarantee`, and refers to an existing `debt` or `contract` relation | error |
| 12 | `asOf`, when written, is an ISO date | error |
| 13 | the `equity` shares into one entity add up to more than 100 | **hint**, not an error (the data may be wrong, or it may be a mistake in the source) |
| 14 | an entity with no relation at all | **hint** (it floats beside the diagram) |
| 15 | a `guarantee` with no `secures` | **hint** (which claim does it secure?) |
| 16 | an equity cycle (cross-holding) | **hint**, allowed (it exists in the real world) |

Structural errors stop the drawing; hints do not. This is the same split as procedure's (`spec/procedure/schema-draft.md` §5, §6.3).

---

## 6. Presentation (the renderer's job)  **⚠ proposal**

### 6.1 The first sub-type, `graph`

- **Layout: compact camps side by side.** A group is a camp, and camps stand side by side (the two sides of a dispute face each other across a channel). Each camp is laid out by ELK's layered algorithm on its own, from the directed relations inside it only, so a holder stands above what it holds and a box is as tall as its own content. An undirected relation (a marriage, a contract) sets no level, so the two parties stand side by side. Within a camp, an entity whose links go to the camp on the left stands on the left (and the same on the right), so a guarantor of the creditor faces the creditor. Each camp is then moved up or down, as a whole, by the median height its links to the camps already set would climb, so those links run level. Whoever is in no group stands in a column between the camps (after the last when there are more than two), each at the median height of the entities it relates to, so its links run level too. The horizontal orientation is the same picture transposed. (Two earlier layouts were measured and dropped: groups as ELK compound nodes scattered a camp whose members sit on different levels; rows shared by all camps kept the up-and-down order across camps but left most of a small camp's box empty and sent the links between camps round each other.)
- **Links**: routed by the orthogonal router of procedure's cross-stage links (`flow/router.js`): fewest bends, then shortest, clear of every entity and group title, with a straight run into the target; a side offers two more ports (a quarter of the way along, as top and bottom do), so a second link need not go round. A crossing costs less here than in the flowchart (a bend or so), so a link does not go right round the picture to avoid one. Links of the same kind into the same entity (two guarantees of one debtor, three regulators' penalties on one company) may run along each other and share the port, so they arrive as one trunk rather than side by side. A camp whose parties have no relation among themselves (three regulators acting on one company) is stacked in a column, not laid in a row, so each has its own line out; a party between the camps stands clear of a straight line across them; and a link between two parties of one camp on different levels keeps to top and bottom, leaving the side ports to the links from other camps. Within a camp, several orders of the parties are tried and the one whose picture crosses fewest lines is kept (the lines that leave the camp count too, as a level line to the side a party faces), so a party's own family does not stand between it and the camp it faces. Labels are tried at more places along a line, so they overlap each other less. The channel between two camps is widened to the widest label of a link across it, and two parties standing level with an undirected relation between them are moved apart until its label fits. Curved by default with a straight option. The files move to a shared place when a third diagram uses them.
- **Labels**: lines are routed first, labels placed after, each **on its own line** (the label's background hides the line under it), at the spot that covers least of anything else: entities worst, then other labels and titles, then other lines. Beside the line, as the flowchart does, was tried first and kept landing on some other relation's line in a corridor that several relations share. In the horizontal picture the gap between two rows grows to hold the widest label.
- **A relation's look** follows its kind: colour and line by kind (`equity` blue, `debt` red, `guarantee` violet dashed, `kinship` a double line, `contract` grey, `control` heavy), an arrowhead only when directed, the kind's name as the default label, in the interface language.
- **A guarantee and its claim**: when one of a guarantee's two parties is looked at, the claim it secures stays lit with it and a dotted tie joins the middle of the guarantee to the claim's line, which is when the reader asks "what is this guarantee for". Drawn all the time, the ties made a busy picture busier.
- **Hover and click** as everywhere: hovering an entity lights it and fades the relations that do not touch it, its overlay lists what it is related to; clicking pins the overlay with `detail` and the sources. Looking at an entity never moves the view.

### 6.2 The control capsule

| Control | Form | Notes |
|---|---|---|
| Orientation | segmented | vertical / horizontal |
| Link style | segmented | curved (default) / straight |
| Kinds | toggles | one chip per kind that the data uses: show / hide that family of relations. This is the relationship diagram's answer to fact's views: the same data, one family at a time |
| Relation labels | toggle | show / hide the labels on the lines |
| Group boxes | toggle | available when `groups` is written |
| Export image | action | reuses the shared export |

The remembering rules are procedure's (§6.2 there): orientation and the toggles are remembered per diagram, link style once for all.

### 6.3 Scale

A cross-section of a case has few parties, usually 4 to 15. Past about 25 entities the diagram is reported with a hint (as procedure does for layers), not an error.

### 6.4 The second sub-type, `focus` (issue #87)

> Status of this section: **implemented, a first attempt** (not confirmed). It is not a "camps view": the graph already draws the groups as camps side by side; a mock-up of one looked the same as the graph's own picture of the same example, so that idea was dropped.

One party in the middle, the parties tied to it around it, those tied to them further out: it answers "who is this party tied to, and how" for one party at a time, for cases whose graph is too busy. Code: `src/renderers/relationship/focus/`.

- **The centre** is the party with most relations (the first written on a tie), or the one the reader clicked (remembered per diagram; the dock's "Default centre" puts it back). Clicking the centre pins its overlay; hovering any party peeks at it.
- **Rings** by the number of steps from the centre. Ring 1: the first group on the left, the second on the right, the rest split between the top and the bottom, each camp's parties together and its name over each box. Further rings stand where their parents stand. The ellipses are wider than tall, and a ring grows until no two boxes touch, so a bigger case gives a bigger picture, never a denser one.
- **Relations touching the centre** are drawn in full and straight; the others are lighter and thinner. A relation that a straight line could not draw without running through a party (two parties on opposite sides) goes round the outside of the rings.
- **Parties no relation reaches** from the centre are not dropped: each connected group of them is laid out the same way around its own busiest party, in rows under the picture, with a caption.
- Entity boxes, label boxes, relation paint, the overlay, "what it secures" and the kind chips are the graph's, so the two kinds cannot disagree. No orientation, link style or group boxes: they do not apply.
- A "relations: []" is not valid JSON (validation requires at least one), so the centre always has something; an entity nothing relates to is an island of one.

---

## 7. Open questions, and what the schema does meanwhile

The sponsor has not answered these. **Until one is answered, the default below is what is built.** Changing a default touches the schema and validation, not the layout or the renderer.

1. **Names.** `entities` / `relations` (mine) or `entities` / `edges` (the same words as procedure)? Only the words differ. **Default now:** `entities` / `relations`.
2. **The kind enum.** Nine kinds (§4.1), or fewer? Candidates to merge: `control` into `equity`, `employment` and `agency` into one `authority`. More kinds read better; fewer are easier for a model to choose between. **Default now:** the nine kinds of §4.1.
3. **Undirected relations.** `contract` and `kinship` default to no arrowhead. Is that right, or should a contract always show who is the offeror? **Default now:** no arrowhead for those two.
4. **Dedicated fields.** Only `share`, `amount`, `secures` in v1? Others that come to mind: `guaranteeMode` (surety / mortgage / pledge), `since` (when the relation began). The time question (§0.3) says no, but a bare `since` date shown in the popover would be cheap. **Default now:** only those three.
5. **Groups.** Should an entity be allowed in several groups (a person on both the family side and the company side)? Boxes cannot overlap in a drawing, so I said no. **Default now:** at most one group per entity.
6. **First corpus.** I propose rewriting the parties of existing fact examples (the Fang Yuan case, Lin Fang v. Zhao Lei, the fictional marketplace case) as relationship diagrams, plus one equity structure and one guarantee case written from scratch, the way procedure was tested on seven contracts. Are there real cases you would rather I use? **Default now:** the three fact cases plus one equity structure and one guarantee case.

---

## 8. Out of scope this round

- relations over time (a start and end date on each relation, a date filter);
- the display of conflicting sources (cross-examination), which extends inside the justification family;
- amounts as numbers (sums, totals, consistency checks);
- editing;
- a second sub-type (a matrix or a table of relations).

---

## 9. Compared with the other two

| | fact | procedure | relationship |
|---|---|---|---|
| Structure | slots of events on lanes | free graph of nodes and edges | free graph of entities and relations |
| Time | the axis | the flow | a single `asOf` date |
| Grouping | `groups` (sides) | `stages` (columns) | `groups` (boxes) |
| Views | yes | no | no; kind filters instead |
| Dedicated fields | dates | `condition`, `main` | `share`, `amount`, `secures` |
| Layout | own grid | ELK per stage + router | ELK layered + router |
