# Antu · Architecture consensus v0 (record of the discussions)

> This document is the architecture consensus locked in after successive rounds of discussion with the project founder around 2025-09. It is the basis for finalising the specification and for writing code.
> Status: **consensus draft, not yet final**. Items marked "to be decided" must be confirmed before work starts.

---

## 1. Project positioning

Antu = a **rendering core for legal visualisation**. It does exactly three things:

1. define the **JSON specification** (schema) for several kinds of legal diagram;
2. provide a **preset renderer** for each diagram type (a registry, extensible);
3. take JSON → validate → dispatch by `type` → render it for the user to look at.

**What it explicitly does not do:**

- ❌ It does not generate JSON (document parsing and semantic extraction are the agent's job; the agent produces JSON that conforms to the specification)
- ❌ It does not bind itself to any particular legal semantics (the core does not know "plaintiff/defendant"; it knows only the JSON standard and the diagram types)
- ❌ Editing is later incremental work, outside the current core

## 2. The essence: a declarative visualisation specification

- The specification answers **What (what to draw)**; the engine answers **How (how to draw it)**.
- Analogy: a close relative of Mermaid (a standard syntax plus a rendering engine).
- The difference: Antu's "syntax" is **written for an LLM to generate**, not written by a person:
  - field names are plain, enums are closed and the structure is flat, so an LLM can fill it in correctly against the schema;
  - validation is therefore **a required step at the engine's entrance** (the validation gate), and an error must be able to say "which field is non-compliant" so the agent can correct it itself.

## 3. The diagram type system

### The criterion for splitting the top-level types

The split is by **what the diagram expresses and why** (not by visual shape; visual shape is the renderer's business).

| type | What it expresses | The legal thinking behind it | Status |
|---|---|---|---|
| `relationship` | Who is involved with whom, in what role, under what legal relationship | Defining the parties and the legal relationship | Nine ways of drawing available (schema provisional) |
| `fact` | The temporal narrative of facts that have occurred | Finding the facts | Timeline, chronicle and time scale available |
| `procedure` | The procedural path and its possible branches | How procedure operates | Flowchart and route map available |
| `justification` | Reasoning (argumentation) from norms plus facts to a conclusion | Legal argumentation | Reasoning tree available (schema draft in `spec/justification/`) |

**Boundary notes:**

- fact vs justification = the descriptive layer (what is) vs the argumentative layer (on what basis);
- relationship = static structure (a cross-section); procedure = dynamic process (a flow of time, including branches that are still open);
- where the timeline belongs: the timeline of substantive facts → fact; procedural progress and branch paths → procedure.

### Below the top level: sub-types divide the rendering layer, they are not data types

**The schema specifies only down to the top-level type.** `type` is the only type field in the envelope, and below the top-level type there is **no "sub-type" field**.

A top-level type has several **sub-types**. A sub-type is not a data type but one of several ways of drawing the same top-level type (renderers standing side by side); each has its own rendering rules, but every one of them must consume **the same schema**:

```
the fact JSON         ← the schema stops at this layer; there is no "which sub-type am I"
     │
     ▼  rendering layer
   ├─ timeline
   ├─ swimlane
   └─ (more to come)
```

**Hard constraint (the most important corollary of this rule):**

> **Any valid JSON of a top-level type must be renderable by any sub-type of that type.**

It must never be the case that "only one sub-type can draw this data". That is the price of "the schema stops at the top-level type", and it is also the point of the rule:
once a swimlane renderer is added, **every existing fact JSON can be viewed as a swimlane straight away, with not one character of the data changed**.
Conversely, whoever writes a sub-type renderer may not assume that some particular data "happens to suit" their way of drawing.

**Which sub-type to use is chosen while looking at the diagram.** Like the orientation, it is a switch in the rendering layer, not something in the data. Therefore:

- the question is not "what sub-type is this JSON" but "which way of drawing is this JSON using right now";
- sub-types of the same top-level type are **side by side**; none of them is "primary" at the data level. There is only a default value (the first one in registration order).

**The registry is therefore two-level**: `top-level type × sub-type → renderer component` (see `core/registry.js`).

**Difference from the earlier wording.** Earlier this read "no type tree: a different presentation mode is a rendering parameter, the same renderer with a changed way of drawing".
Under the current rule, sub-types are **renderers standing side by side**, not one renderer with different parameters.
A "rendering parameter" is something **inside** a sub-type, such as the orientation and the card fields inside the timeline; those do not even swap the renderer.

### Differences fall into three classes, each belonging to its own layer

| Source of the difference | Example | Which layer it belongs to |
|---|---|---|
| **A different sub-type (way of drawing)** | fact: timeline / swimlane | **Rendering layer**, renderers side by side over the same schema. Not reflected in the data layer |
| **Presentation parameters inside a sub-type** | timeline: vertical / horizontal, which fields the card shows | **Rendering parameters**, the same renderer with different parameters. Not reflected in the data layer |
| **Different domain semantics** | relationship types: contract / equity / guarantee / agency | **Controlled enum** plus dedicated optional fields, written into the schema |

Two key distinctions:

1. **The type of a diagram ≠ the type of an element**: `type` (the envelope) decides only what the whole diagram expresses; each element inside the diagram also has its own type (for instance person/company inside a relationship), and that is a controlled enum **internal to each kind of diagram**.
2. **The only test for becoming a new top-level type = the element structure does not fit into an existing type** (for instance the premise/claim structure of a justification differs from the entities/links of a relationship). If it fits, add an enum value, a parameter or a sub-type; only if it does not fit do you register a new type.

## 4. Source: the global provenance mechanism (not a fifth kind of diagram)

**Core insight**: Antu's deep product advantage is not that it "draws four kinds of diagram" but that **any expression can point to its origin**. Every expression must carry its provenance.

- What supports an expression is not only "evidence" in the procedural sense but **sources** in a broad sense: evidence, statutes, precedents and judgments, documents, contract clauses, registration records and so on are all values of the source `type` enum;
- the four diagram types are the **content layer** (what is expressed); source is the **resource layer** (what supports the expression), and it **exists uniformly beneath every diagram type**:
  - a fact event → carries evidence or documents
  - a justification claim → carries statutes or precedents
  - a relationship → carries contracts or registration records
- **no separate diagram type**: a source is an entity (with its own `id`), and the expressive elements of every kind of diagram attach to it by referencing it through `sourceIds`;
- **where `sources` live = option B (decided)**: every diagram JSON carries the `sources` table it references, so one diagram is self-contained, renders on its own and is easy to share; the engine never has to look across files; the redundancy is borne by the agent at generation time. A future path (option C: a case-level global table) is recorded as a candidate and not designed in advance;
- **structured location (decided)**: the `loc` of a source uses **structured location fields** per type (for instance statute → lawName+article; case → caseNo+court), which can be validated, jumped to and traced back to the original material. A stable foundation comes first;
- **reference rather than copy (zero-redundancy many-to-many)**: the source table is stored once and several expressions reference the same id; one expression may also reference several sources. Redundancy comes from embedding copies, not from many-to-many;
- **the cost of many-to-many sits in the engine** (checking that ids exist, resolving them back to content when rendering), not in the JSON itself; the JSON is in fact smaller and cleaner;
- a source carries a `type` enum (statute / case / contract / evidence / document / web / other), and the source should itself carry the information needed to trace back to the original material (a name, a location in the original such as a page number); for the fields of all seven types see `spec/source-schema-draft.md` §4;
- how to decide `type`: look at the role the source plays in the present case, not at how it was obtained (an online public record submitted as evidence → `evidence`; merely cited from outside the case → `web`);
- if the display of corroboration or contradiction between sources (cross-examination) is ever needed, it extends **inside the justification family** rather than adding a top-level type.

## 5. Layers of the JSON structure

### The envelope (shared by all four types, identical structure)

```jsonc
{
  "specVersion": 1,          // format generation of this type (optional; see spec/versioning.md)
  "type": "relationship",    // the routing key, required
  "title": "Zhang San v. Li Si, private lending dispute"
  // other optional metadata (case number, notes…): to be decided
}
```

The core unpacks only the envelope and routes by `type`; beyond the envelope it understands nothing.

### The content layer (deliberately not unified: each type is modelled on its own semantics)

Each type defines its own. Draft examples (**every field detail is still to be decided**; these only show the direction):

```jsonc
// relationship
{ "entities": [ { "id": "e1", "label": "Zhang San" } ], "links": [ { "source": "e1", "target": "e2", "label": "loan of CNY 500,000" } ] }

// fact
{ "events": [ { "date": "2023-03-10", "label": "loan contract signed", "detail": "…" } ] }

// procedure
{ "steps": [ { "id": "s1", "label": "case filed", "next": ["s2", "s3"] } ] }
```

**Trade-off principle (confirmed):** a schema that reads like **business language** and is easy for an LLM to fill in takes priority over making life easy for the renderer (unified nodes/edges).
Reason: LLM generation is the bottleneck, the renderer is not. Sacrificing the semantic clarity of the schema to make the renderer's life easy puts the cart before the horse.

### The shared conventions (agreed rules, obeyed by all four types)

1. references always use `id`;
2. content elements all carry a `label`;
3. expressive elements may have an optional `sourceIds` slot (to attach sources, see section 4);
4. optional fields are lenient: the renderer supplies defaults, and a missing field does not break rendering.

## 6. The shape of the rendering engine (conceptual)

```
JSON (envelope) ──> [validation gate] ──> route by top-level type ──> registry (top-level type × sub-type)
                                              ├─ relationship
                                              │    └─ graph, focus, matrix, equity, authority, related, path   ← done
                                              ├─ fact
                                              │    └─ timeline, chronicle, scale   ← done
                                              ├─ procedure
                                              │    └─ flow, route   ← done
                                              └─ justification   ← reasoning tree done
```

- **one top-level type = one schema**; **one sub-type = one renderer**. The schema specifies only down to the top-level type, and below it there is no "sub-type" field; for how sub-types divide see §3;
- adding a way of drawing means registering one sub-type renderer, **with the core itself untouched**;
- the underlying rendering technology is React Flow (chosen; already in use for the fact diagram).
- Layout: **each sub-type is on its own**, with no shared layout library. The fact timeline computes its own grid (`src/renderers/fact/timeline/grid.js`); the procedure flowchart lays each stage out on its own with ELK's layered algorithm (elkjs, `src/renderers/procedure/flow/elk.js`), chosen over dagre and the hand-written layout by measured crossings, and routes the links between stages with its own orthogonal router (`flow/router.js`; `spec/procedure/schema-draft.md` §6.1); the relationship views that read top to bottom share one layered layout (`src/renderers/relationship/layered.js`) and one line layer (`LineLayerNode.jsx`).
- the renderer is responsible for translating semantics into React Flow nodes/edges (the translation happens inside the renderer, not inside the specification).

## 6.1 The deliverable: one self-contained HTML file

**The engine's final output is not a website but a single HTML file.**

```
Agent reads case materials ──> produces one fact JSON ──> one self-contained HTML ──> double-click to open
```

- **one JSON, one HTML**. That file is that one diagram, and there is no "other diagram" to switch to inside the page.
  To see another one you need another file generated from another JSON;
- **the several ways of drawing the same JSON are switched inside this HTML** (the rendering-type switcher at the top left), without reloading the data.

Why a self-contained HTML rather than "a server plus browser access":

| What legal work actually needs | Self-contained HTML | Server-based approach |
|---|---|---|
| Archiving | one file | a server to keep running, an environment to maintain |
| Circulation (WeChat, email) | send it directly | send a link and an account |
| Submitting as an attachment | double-click and it opens | the other side may not be able to reach it |
| Reading offline | possible | not possible |

**This brings four hard constraints that code must hold to:**

1. **The page must make no network request of any kind.** The data is supplied inline in the page (`window.__ANTU_SPEC__`):
   in a **built file** `tools/make-html.mjs` injects it, and **during development** a plugin in `vite.config.js`
   injects the same JSON into `index.html`. Both sides go **the exact same way**, so the application code has
   only one path: no fetch, no list of examples, no "fall back when it cannot be fetched" branch.
   When the inline data is missing it reports a clear error instead of looking elsewhere (in a built file there is no "elsewhere");
2. **The engine must be bundled as an iife, not an ES module.** When opened over `file://`, `<script type="module">`
   is blocked by CORS (see `vite.engine.config.js`);
3. **Both styles and scripts must be inlineable as one block**, so the styles come out as a single file, with no chunking and no asynchronous loading;
4. **When inlining, `</script` inside the data must be escaped**, otherwise it closes the script block early.

How it is produced: `npm run diagram -- some-file.json [-o output.html]`, see `tools/make-html.mjs`.

### Sources state their origin only, with no jumping (decided)

The structured locations in `sources` (page 6 of the contract, the case number and so on) are written into the HTML as usual, but **the original materials are not bundled in**, and there is no "click a source to jump to the material". The page states only which material and which page a point rests on; the user finds the material themselves.

## 7. Confirmed / to be decided

### Confirmed
- [x] The core does not generate JSON; generating JSON is the agent's job
- [x] Two declarative pillars (specification + engine)
- [x] Types are divided by what they express; four top-level types, all with a renderer
- [x] Source = the global provenance mechanism, not a separate diagram type; every expression must carry its provenance, and reference rather than copy (zero-redundancy many-to-many)
- [x] Where `sources` live = option B (each diagram carries its own copy of the sources, so one diagram is self-contained); structured location fields (`loc` refined per type), a stable foundation first
- [x] The envelope is shared; the content layer is semantically independent; the shared conventions are agreed rules
- [x] **The schema stops at the top-level type**; sub-types divide the rendering layer, and any valid JSON can be rendered by any sub-type of its type (§3)
- [x] **The deliverable is a self-contained HTML file**: one JSON, one file, no network request inside the page, readable offline (§6.1)
- [x] **No sidebar**: the canvas fills the space, with a label card at the top left + a control dock at the bottom + zoom/minimap, four floating layers in all (`spec/fact/rendering.md` §4)
- [x] **Sources state their origin only, with no jumping**; original materials are not bundled (§6.1)
- [x] Trade-off principle: business language takes priority over renderer uniformity
- [x] Technology stack: React 19 + Vite + @xyflow/react 12 + elkjs (the procedure flowchart's layout; dagre was the earlier plan), JSX, useState
- [x] Guard against over-design: the smallest thing that runs comes first; get the relationship trio working first
- [x] No "sub-type tree" under a top-level type: differences are routed to rendering parameters / preset configuration / controlled enums; the only test for a new top-level type is that the element structure does not fit an existing type
- [x] Naming: 案图 in Chinese, code name `antu`; package name provisionally `antu-viz` (unclaimed, verified)
- [x] The source specification is final: all fields of the seven types (statute/case/contract/evidence/document/web/other) are fully refined (see `spec/source-schema-draft.md`)

### To be decided (confirm before starting)
- [x] The shape of `specVersion`: **decided**: a whole number per type, raised only when a type's JSON breaks a file written for the old one; optional in a file (see `spec/versioning.md`)
- [x] The fact content-layer schema: **final** (including the division of labour between label / summary / detail, see `spec/fact/schema-draft.md`)
- [x] The procedure content-layer schema: **v1, confirmed** (see `spec/procedure/schema-draft.md`)
- [ ] The field details of the content-layer schema for relationship: **schema provisional v0, accepted by the sponsor as good enough for now** (`spec/relationship/schema-draft.md`)
- [x] The shape of validation error messages: **implemented**. Every error carries a field path and an event id (e.g. `slots[0].events[1] (ev-2)`) and says what is wrong and how to fix it
- [ ] The range of optional envelope metadata
- [ ] The plugin shell (a dsh plugin / MCP / a standalone web page): postponed until the core matures.
      Half of its shape is already clear: **the deliverable is a self-contained HTML file** (§6.1), so it is not "building a website"
      but "generating a file"; what remains is which layer the generating action sits in (the agent running a command directly / an MCP tool / a dsh plugin)
- [ ] **Which top-level type the swimlane diagram belongs to.** The soul of a conventional swimlane is "steps plus transfer arrows",
      whereas fact data holds only "when, and who took part", **with no "who handed what to whom"**.
      Three candidates: (1) it belongs to procedure (a procedure diagram already carries a flow of time and branches, so the arrows have data behind them);
      (2) add a "direction of action" field to fact (a schema change); (3) drop the swimlane and build another fact sub-type instead.
      This touches the classification of differences in §3, and must be settled before the schema is touched

## 8. Near-term roadmap (suggested order, adjustable at any time)

1. [x] **Specification v0 final**: all seven source types fully refined; the fact content-layer schema final
2. [x] **Engine prototype**: envelope parsing + a **two-level registry** (top-level type × sub-type) + the fact timeline sub-type.
       Layout, cards, interaction, colour, validation, views and orientation all work; 8 examples, 23 views and
       46 view × orientation combinations tested and passing
3. [x] **Deliverable shape**: JSON → **self-contained HTML** (one file, readable offline, no network requests),
       see §6.1 and `tools/make-html.mjs`
4. **The next sub-type**: to be decided. Which top-level type the swimlane belongs to is not yet clear (see §7, to be decided);
   if another fact sub-type comes first, pick one that needs no new data (for instance a matrix layout with one column per group)
5. **The relationship type**: schema + renderer. In this kind of diagram `edges` are the main content,
   and the canvas's edge capabilities are really used here for the first time
6. [x] **The procedure type**: schema v1 + the flowchart renderer (`spec/procedure/schema-draft.md` §6.1)
7. **Revisit the earlier types**, then start justification
8. The data pipeline (on the agent side, documents → JSON) and the plugin shell: to be planned separately
