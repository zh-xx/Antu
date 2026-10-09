# justification · Schema draft v0

> Status: **implemented** (status line checked against 0.12.1). Validation (§5), layout (§6.1), the look and the interface (§6.2) are implemented; **the corpus is two fictional case diagrams, and there are six small examples for an agent**. Items marked **⚠ proposal** stand until the sponsor changes them; §7 lists the questions still open and how the schema goes on until they are answered.
> Basis: the shared conventions layer of `spec/v0-architecture.md` (id references / everything carries a label / loose where optional), and the classification of differences in its §3 (a new top-level type only when the elements do not fit an existing one). Written after `spec/relationship/schema-draft.md`.
> Scope: justification = **one side's reasoning for "why the decision goes this way"**: norms plus facts, and how they lead, layer by layer, to a conclusion. What happened over time → `fact`; who stands in what relation to whom → `relationship`; the path of a procedure → `procedure`.

> **This document is for the designer.** The field table and mechanism note an agent writing JSON will use come after the schema is settled.

---

## 0. Decisions

Taken by the sponsor (2026-09):

1. **Three kinds of statement: fact, inference, judgement.** Each is questioned in a different way: a fact by asking for evidence, an inference by asking about the logic, a judgement by asking about the value call. The diagram has to tell them apart.
2. **Fact nodes are written in the justification diagram itself**, with their own text, time and source, and **do not refer** to events of the fact diagram. The cost is that one event is written twice; the gain is that a justification diagram stands on its own.
3. **One diagram draws one side's reasoning.** For now that is all, e.g. the court's reasons alone. Prosecution and defence as two trees with the judge choosing comes later.

Proposed by me (**⚠ proposal**, see §7):

4. **Nodes are `nodes`, connections are `links`**, with `from` / `to`. A link runs **from the supporting side to the supported side**: a fact to an element, an element to a conclusion.
5. **Six node `kind`s**: `conclusion`, `norm`, `element`, `fact`, `inference`, `judgement`.
6. **Points of decision carry `holds`**: `yes` / `no`. Elements, inferences, judgements and conclusions can hold or be rejected (the conclusion of the "special defence" issue is "no").
7. **A link has a `stance`**: `for`, `against`, `basis` (the norm it rests on). In sentencing, "serious fault of the victims" mitigates and "harm far outweighs the interest protected" does not; both must be drawable.
8. **`groups`** frame the "issues" (one box per issue), the same idea as fact's `groups`, procedure's `stages` and relationship's `groups`.
9. **`sources` is reused unchanged** (`spec/source-schema-draft.md`): `statute` for norms, `case` for precedents, and `case` / `evidence` and so on for where a fact comes from.
10. **No `views`.**

---

## 1. Envelope

```jsonc
{
  "specVersion": 1,
  "type": "justification",
  "title": "The Fang Yuan case · the reasoning on excessive defence",
  "speaker": "Example Higher People's Court (appeal, fictional)"   // optional: whose reasoning this is
}
```

`speaker` is the provenance of the tree and shows on the title card. A diagram has one `speaker` (decision 3).

---

## 2. Content layer draft

An extract of the reasoning of the Fang Yuan appeal judgment; the whole is `examples/justification/fang-yuan-defense-excess.en.json`.

```jsonc
{
  "type": "justification",
  "title": "The Fang Yuan case · the reasoning on excessive defence",
  "speaker": "Example Higher People's Court (appeal, fictional)",

  "groups": [
    { "id": "g-1", "label": "Issue 1: was the stabbing defensive?" },
    { "id": "g-3", "label": "Issue 3: did it clearly exceed the necessary limit?" }
  ],

  "nodes": [
    { "id": "c-1", "kind": "conclusion", "label": "Excessive defence; guilty of intentional injury; four years' imprisonment", "holds": "yes" },

    { "id": "n-1", "kind": "norm", "label": "Model Provision A(1): lawful defence needs five conditions together", "sourceIds": ["s-3"], "groupId": "g-1" },
    { "id": "e-2", "kind": "element", "label": "Time: the attack is under way", "holds": "yes", "groupId": "g-1" },
    { "id": "f-6", "kind": "fact", "label": "The police officer warned both sides not to fight, then left the room to look for the caller",
      "date": "2032-04-14T22:22", "sourceIds": ["s-1"], "groupId": "g-1" },
    { "id": "f-7", "kind": "fact", "label": "Fang and Liang tried to leave with the police; Jiang and others blocked them and forced Fang to sit",
      "date": "2032-04-14", "sourceIds": ["s-1"], "groupId": "g-1" },

    { "id": "i-2", "kind": "inference", "label": "When the police came in there was no fierce standoff, and after the warning the other side did not fight",
      "holds": "yes", "sourceIds": ["s-2"], "groupId": "g-3" },
    { "id": "j-2", "kind": "judgement", "label": "The attack Fang faced was neither urgent nor serious", "holds": "yes", "groupId": "g-3" }
  ],

  "links": [
    { "from": "n-1", "to": "e-2", "stance": "basis" },
    { "from": "f-6", "to": "e-2", "stance": "for" },
    { "from": "f-7", "to": "e-2", "stance": "for" },
    { "from": "f-6", "to": "i-2", "stance": "for" },
    { "from": "i-2", "to": "j-2", "stance": "for" },
    { "from": "e-2", "to": "c-1", "stance": "for" }
  ],

  "sources": [
    { "id": "s-1", "type": "case", "name": "Fictional Case A · facts of the case",
      "loc": { "caseNo": "(2032) Shi Xing Zhong No. 1", "court": "Example Higher People's Court" } },
    { "id": "s-2", "type": "case", "name": "Fictional Case A · reasons for the judgment",
      "loc": { "caseNo": "(2032) Shi Xing Zhong No. 1", "court": "Example Higher People's Court" } },
    { "id": "s-3", "type": "statute", "name": "Model Provision A",
      "loc": { "lawName": "Model Act (fictional)", "article": 1, "version": "model edition" } }
  ]
}
```

---

## 3. Field rules

### Diagram-level fields

| Field | Required | Type | Meaning |
|---|---|---|---|
| `speaker` | ❌ | string | Whose reasoning this tree is; in the envelope |
| `groups` | ❌ | object[] | `{ id, label }`, one per issue |
| `nodes` | ✅ | object[] | The nodes, below |
| `links` | ✅ | object[] | The connections between nodes, below |
| `sources` | ❌ | object[] | The diagram's source table; the seven types and location fields are reused as they are |

### Each item of `nodes[]`

| Field | Required | Type | Meaning |
|---|---|---|---|
| `id` | ✅ | string | Unique in the diagram; referred to by `links` |
| `kind` | ✅ | string enum | Six, see §4.1 |
| `label` | ✅ | string | The one sentence shown on the node |
| `detail` | ❌ | string | Full text that does not fit in the node (the text of a statute, the judgment's own words); in the popover |
| `holds` | ❌ | `yes` / `no` | Whether the statement holds in this reasoning; **only for** `conclusion`, `element`, `inference`, `judgement` |
| `combine` | ❌ | `all` / `any` | How what it rests on combines: `all` = every one is needed ("and"), `any` = one is enough ("or"); **only on** `conclusion`, `element`, `inference`, `judgement`; omitted = not stated, see §4.6 |
| `date` | ❌ | ISO date or date-time | **`fact` only**: when it happened (`2032-04-14` or `2032-04-14T22:22`) |
| `groupId` | ❌ | string | Refers to an id in `groups` |
| `sourceIds` | ❌ | string[] | Refers to ids in this diagram's `sources` |

### Each item of `links[]`

| Field | Required | Type | Meaning |
|---|---|---|---|
| `from` | ✅ | string | Id of the supporting side (or the norm); **the link starts here** |
| `to` | ✅ | string | Id of the supported side |
| `stance` | ❌ | `for` / `against` / `basis` | Default `for`, see §4.3 |
| `label` | ❌ | string | A short phrase on the line (e.g. "limits how far the sentence is reduced"); not shown if omitted |

---

## 4. Mechanism

### 4.1 The six node kinds  **⚠ proposal**

| `kind` | What it is | Where it stands in the reasoning | How it can be questioned | Dedicated fields |
|---|---|---|---|---|
| `conclusion` | A conclusion: the end of the whole diagram, or the summing-up of one issue | Top | A premise fails, or it does not follow | `holds` |
| `norm` | A norm: a statute, a judicial interpretation, a precedent | Leaf; points only to an element or a conclusion | Whether it applies, how it is read | `sourceIds` (to `statute` / `case`) |
| `element` | An element: one constituent requirement a norm breaks into | Between norm and facts | Whether it is met | `holds` |
| `fact` | A fact: something the court found happened | Leaf; at the bottom | Whether there is evidence | `date`, `sourceIds` |
| `inference` | An inference: a statement drawn from facts ("the lights were visible, so he should have known the police had not left") | Between facts and judgements | Whether the reasoning holds | `holds` |
| `judgement` | A judgement: the judge's value call on a body of facts ("the attack was not urgent") | Near the conclusion | Whether the value call is reasonable | `holds` |

**Where fact ends and inference begins**: what the "facts of the case" part of a judgment states, with a time and an action, is a fact; what the "reasons" part draws from facts to reach the conclusion is an inference. When unsure, ask: "does this sentence say what happened, or what may therefore be taken to be so?"

### 4.2 `holds`: upheld, or rejected

A statement adopted in this reasoning is `yes`; one it expressly rejects is `no`.

The rejected side is drawn too. The typical case is **special defence**, where the court says "it was not special defence". Draw:
- a conclusion "It was special defence: no criminal liability", `holds: "no"`;
- an element "a violent crime gravely endangering the person is under way", `holds: "no"`;
- a judgement "the acts were unlawful detention, insult and minor beating" pointing `against` that element.

That `no` conclusion then points `against` the final conclusion ("it would have defeated it, but it did not hold").

Omitting `holds` means the reasoning does not say.

### 4.3 The stance of a link (`stance`)  **⚠ proposal**

| `stance` | Meaning | Usual `from → to` |
|---|---|---|
| `for` (default) | `from` supports `to` | fact → element, fact → inference, inference → judgement, element → conclusion |
| `against` | `from` opposes `to` | judgement → element (saying it is not met), a rejected conclusion → the final conclusion |
| `basis` | `from` is the norm `to` rests on | norm → element, norm → conclusion |

`basis` can only start from a `norm`.

**One conclusion can have both `for` and `against`**, as sentencing issues usually do: "truthful confession" and "serious fault of the victims" are `for` (mitigating), "harm far outweighs the interest protected" is `against` (limits how far the sentence is reduced).

### 4.6 `combine`: and, or

When a node rests on several things, the reader's first question is "does it fall if one is missing?" The five conditions of lawful defence must **all** be met; some norms say "any one will do".

- `combine: "all"`: everything it rests on (the `for` links into it) is needed. Without one, it does not hold.
- `combine: "any"`: any one is enough.
- Omitted: the reasoning does not say; the reader takes it from the norm (the earlier reading).

Only `for` links count. `against` and `basis` do not: a norm the node rests on is its premise, and opposition is a different thing.

On the diagram a small mark stands in the node's top line: `all of` or `any of` (`且` / `或` in Chinese); the popover says it in full ("All of what it rests on is needed"). Paint only, no change to the geometry.

`combine` and `holds` on one node should agree, and validation says so when they do not (rules 20, 21).

### 4.4 Issues (`groups`)

A judgment's reasoning is usually organised by issue ("was it defensive", "was it special defence", "was it excessive"). An issue is a group; a node is in at most one group.

**A norm goes in the issue it settles.** A norm used in two issues (Art. 20(2) governs both "excess" and "reduced sentence") is written as two `norm` nodes, each in its own group, with the same `sourceIds`.

### 4.5 Sources (`sources`) and "no views"

`sources` uses the shared seven types unchanged. Here:

- Statutes: `statute`, with `lawName`, `article`, `version` in `loc`; the paragraph goes in the node's `label` ("Art. 20(2)").
- Judgments: `case`. **Different parts of one judgment may be two sources** ("facts of the case" and "reasons"), so facts and inferences each point to the right part, with no new field.
- Evidence: `evidence` (see §7, item 2).

There are no `views`, for the reason given for relationship: a view is a fact concept.

---

## 5. Validation rules  **⚠ proposal**

A draft; there is no code. Errors are reported one by one, with the field path and the id.

| # | Rule | Result |
|---|---|---|
| 1 | `nodes` and `links` are non-empty arrays | error |
| 2 | `id` is required and unique among `nodes` | error |
| 3 | `node.kind` is one of the six; every node has a non-empty `label` | error |
| 4 | `from` and `to` refer to existing nodes; no `from === to` | error |
| 5 | `stance` is `for` / `against` / `basis`; `basis` can only start from a `norm` | error |
| 6 | No duplicate links (same `from`, `to`, `stance`) | error |
| 7 | `groupId` and `sourceIds` refer to existing ids | error |
| 8 | `holds` is `yes` / `no` and does not appear on `fact` or `norm` | error |
| 9 | `date` appears only on `fact` and is an ISO date or date-time | error |
| 10 | The links form no cycle | error |
| 11 | A `fact` or `norm` has no incoming link (they are leaves; the evidence layer is §7, item 2) | error |
| 12 | At least one `conclusion` has no outgoing link (the end of the diagram) | error |
| 13 | More than one end conclusion | **hint** (is it one tree?) |
| 14 | Apart from the end conclusion, a node with no outgoing link (it supports nothing) | **hint** |
| 15 | A `fact` with no `sourceIds` | **hint** (where was it found?) |
| 16 | A `norm` with no `sourceIds` | **hint** (which provision?) |
| 17 | An element with `holds: "yes"` whose `for` links all come from `holds: "no"` nodes | **hint** (premises rejected, conclusion upheld) |
| 18 | A conclusion or element with no `for` or `basis` among its incoming links (not one with `holds: "no"`: a rejected node needs no support) | **hint** (nothing supports it) |
| 19 | `combine` is `all` / `any`, and only on the four kinds that can be supported (error); a node with fewer than two `for` links says `combine` (hint: nothing to combine) | error / **hint** |
| 20 | `combine: "all"` and `holds: "yes"`, yet something it rests on is rejected | **hint** (all needed, one rejected) |
| 21 | `combine: "any"` and `holds: "no"`, yet something it rests on holds | **hint** (one is enough, and one holds) |

Structural errors block drawing; hints do not. The same split as relationship and procedure.

---

## 6. Presentation  **⚠ proposal**

### 6.1 Layout (implemented)

`src/renderers/justification/tree/layout.js`, pure geometry, no browser.

- **A tree from the conclusion down.** A link runs from the supporting side to the supported one, so ELK is given every link the other way round, and the conclusion is on top (on the left when horizontal).
- **A fact (or a norm) is one node in the data and is drawn once in every issue that uses it.** Facts and norms are leaves and can support things in several issues (the abuse supports both "was it defensive" and "the victims' fault"). It is written once, and drawn once in each issue box that uses it; a copy's tag says "same as". Each issue box then holds all it needs, and no line runs across the picture to a fact in another box. A leaf used in one issue only stands in that issue, whatever its own `groupId` says.
- **Inside one issue, a fact used by several nodes is drawn beside each of them** (and a norm that is the basis of three or more elements likewise). With one copy the lines to the nodes it supports run across the layers between them and cross whatever stands there; with a copy at each use the facts form a tree and cross nothing. The dock has "Merge repeats" to draw each once instead (fewer nodes, longer lines, more crossings); it is the reader's choice, remembered per diagram, and the data does not change. Measured on the two real cases: crossings between links went from 11 and 6 (corridor, Fang Yuan, horizontal) to 0 and 0, at the cost of 5 and 4 more nodes drawn than in the merged picture (the Fang Yuan diagram: 49 drawn, 45 merged).
- **Each issue is laid out several ways and the one with fewest crossings is kept**: ELK is run with several seeds and two ways of layering, with the norm above its elements or among the facts; the best of each kind is then routed for real and the one with fewest real crossings wins. The seeds are fixed, so the same data gives the same picture (seed 0 of ELK is time-based, so it is never used).
- **A norm stands one layer above its elements**, beside the issue's conclusion, with its lines running down to the elements. It is close to them, and its lines do not have to go round to the facts' layer.
- **One box per issue, each laid out on its own.** ELK's layered algorithm lays out each issue from the links inside it, so a box is as big as its content (ELK cannot lay out a box around nodes in different layers; the relationship diagram's camps are the same). Nodes in no issue (the end conclusion) form a group of their own above all the issues, centred.
- **Issues stand side by side, tops aligned** (across when vertical; stacked when horizontal).
- **Links use the same orthogonal router** (`procedure/flow/router.js`): fewest bends, then shortest, clear of every node and issue title. Links of one stance into one node share a trunk (five facts into one element read as one bundle). A link inside an issue is first sought inside that issue's box, a link between issues in the rectangle around its two ends, and only then among everything; with every link seeing every node the example took several seconds.
- **Only a link that has a `label` gets one**, on its own line.
- **The written order is kept** among nodes that share a parent (ELK's `forceNodeModelOrder`).
- **Horizontal is the vertical picture transposed**, one code path. **Horizontal is the default**: the conclusion at the left, the facts at the right, read like a sentence; vertically the facts of a big issue make one very wide row.
- `holds` and `stance` are paint only and do not change the geometry.

Known shortcomings: the lines from each issue's conclusion to the end conclusion are long (unavoidable with issues side by side); the example (40 nodes, 48 links, five facts drawn twice) takes about a second to lay out, and the last few layouts are cached by content.

### 6.2 Look (implemented)

`src/renderers/justification/tree/`: `JustificationNode.jsx`, `LinkLayerNode.jsx`, `JustificationRenderer.jsx`, `JustificationDock.jsx`. The issue boxes are the relationship graph's group boxes.

- **Six kinds of node, six looks** (the paint comes from the theme, see `spec/theme.md`, and is put on as SVG attributes so an exported picture keeps it; the drawing is the same in every theme, so the kinds also differ in black and white): a conclusion is a heavy box; a norm a square-cornered, grey-filled box; an element a pill; a fact a hairline box; an inference a dotted box; a judgement a strong, grey-filled box. A small line at the top names the kind ("Fact", "Element", ...); a fact carries its time on it, `holds` shows as "✓ upheld" or "✗ rejected", and a copy says "shown again".
- **A rejected node** (`holds: "no"`) is faded, has a dashed outline and its text struck through, so it reads in greyscale too.
- **The stance of a link**: support is the plain line; opposition is dashed (red in the `legal` theme); a norm's basis is dotted. One arrowhead per stance.
- **Pointing at a node lights its whole chain**: everything it rests on (down to the facts and norms) and everything it leads to (up to the end conclusion) stay, the rest fades. Every copy of a fact lights together, each with its own way up. That is the natural question about a node in a reasoning: "what is this based on, and where does it lead?"
- Hover peeks, click pins: the popover holds the full text (`detail`), what it rests on, what it leads to, and the sources.
- **The dock**: a labels switch (only when a link has a `label`), horizontal / vertical (horizontal first, and the default), curved / straight, language, export image. There is no "filter by kind of node": a reader of a reasoning follows a chain, they do not filter by kind.
- **Folding an issue** is the reader's choice, not something in the data. The title of each issue box is a button (with a small arrow): a click folds the issue up to what it sums up to (its conclusion; for an issue with none, the element that goes straight to the end conclusion). The box becomes a small dashed one, its title ends with "N folded", and the other nodes of the issue, and the links that touched them, are not drawn. Another click opens it. The dock has "Fold issues": fold all, or open all. Folding lays the diagram out again and refits the view (the geometry changes), and is remembered per diagram in the browser. A fact that another issue still uses keeps its copy there. A folded node's popover still tells everything it rests on. With every issue folded the Fang Yuan diagram is six nodes and fits a screen.
- Lighting, fading and the labels switch are paint only; they do not change the geometry, and the view is never thrown back to the overview (issue #21).

---

## 7. Questions still open, and how to go on meanwhile

1. **"And" or "or" between elements? (answered, see §4.6)** A node has an optional `combine: "all" | "any"`; omitted means not stated.
2. **An evidence layer.** What evidence was each fact found from? A judgment's reasons often do not say; one needs the first-instance judgment or the file. **For now:** a `fact` is a leaf with only `sourceIds`; the evidence layer is left for later (a source of type `evidence` can already be cited).
3. **Two sides in opposition.** Prosecution and defence, one tree each, and the judge choosing on each issue. **For now:** one side's reasoning only, see decision 3.
4. **Defeasibility.** Legal norms have exceptions and defences, and a conclusion may fall when it is rebutted (the "rebuttal" and "qualifier" of Toulmin's model). **For now:** `against` and rejected `holds: "no"` nodes express the commonest kind, nothing more.
5. **Are six node kinds too many?** Candidates to merge: `element` into `judgement`, or `inference` into `judgement`. **For now:** six, because decision 1 needs fact, inference and judgement apart.
6. **Does `holds` need "undecided"?** On some issues the court reaches no conclusion. **For now:** omitting it means "not stated".
7. **First corpus.** I propose the Fang Yuan case first (it has clear norm elements and fact-finding); the marketplace and the corridor-charging case can follow. **For now:** one Fang Yuan diagram.

---

## 8. Not in this round

- The renderer and the interface (how a node looks, pointing to highlight);
- an evidence layer;
- prosecution against defence;
- richer forms of reasoning (exceptions, qualifiers, weights).

---

## 9. Compared with the other types

| | Fact | Procedure | Relationship | Justification |
|---|---|---|---|---|
| Structure | time points and events on lanes | a free graph of nodes and edges | a free graph of parties and relations | a tree of support, top down |
| Time | an axis | the flow | one `asOf` date | only fact nodes carry a date |
| Grouping | `groups` (sides) | `stages` (columns) | `groups` (boxes) | `groups` (issues) |
| What an edge means | none | flow (may carry a condition) | the kind of relation | support / oppose / basis |
| Dedicated fields | dates | `condition`, `main` | `share`, `amount`, `secures` | `holds`, `stance` |
