# Layout engines and rules

> Purpose: to look up which **layout family** each diagram kind uses, which third-party
> engines exist in the industry, what Antu has already measured, and what is out of scope.
> Related: the canvas is React Flow (`docs/reference/react-flow-features.md`); architecture §6
> (`docs/architecture/v0-architecture.md`); the ELK door is `src/renderers/procedure/flow/elk.js`.
> Open direction only: issue [#190](https://github.com/zh-xx/Antu/issues/190) (**Mainline-first**).

Status markers: **✅ in use** | **considered** | **not needed**

**React Flow does not lay out the graph.** It paints nodes and edges at positions Antu
already computed. Questions about zoom, minimap, handles, or export belong in
`docs/reference/react-flow-features.md`, not here.

---

## 1. Families of layout (how nodes are placed)

Engines are implementations of a **family**. Swapping engines inside one family changes
quality, size, and licence; swapping **families** changes how the picture reads.

| Family | Idea | Typical use | Engines / libraries (examples) | In Antu |
|---|---|---|---|---|
| Layered / Sugiyama | Break cycles → assign layers → reduce crossings → place coordinates → route edges | Flowcharts, dependency graphs | elkjs layered, dagre, Graphviz `dot` | ✅ procedure `flow` (per stage); relationship `graph` and justification `tree` (per camp / issue) |
| Force-directed | Edges as springs, nodes repel; iterate to a steady state | Social / knowledge graphs | d3-force, cola.js, cytoscape cose, Graphviz `fdp` / `neato`, ELK force | not needed (non-deterministic; poor fit for orthogonal, archive-ready legal diagrams) |
| Orthogonal routing | Horizontal and vertical segments, few bends, clear of boxes | Often layered on top of a placement | ELK edge routing; Antu `flow/router.js` | ✅ after nodes are placed |
| Tree / hierarchy | A root (or roots); children fan out by depth | Org charts, equity trees | d3-hierarchy, Reingold–Tilford, ELK mrtree; Antu `relationship/layered.js` | ✅ relationship `equity`, `authority` |
| Radial / rings | A centre and concentric rings | Focus / “who is around X” | d3 radial; custom | ✅ relationship `focus` |
| Grid / matrix / table | Row × column carries meaning | Timelines, adjacency matrices | Almost always custom rules | ✅ fact `timeline`, relationship `matrix`, `related` |
| Spine + hang | Fix a main spine first; hang branches off it | Metro maps, route maps, chronicles | Usually custom | ✅ procedure `route`; fact `chronicle` (spine) |
| Constraint solvers | Declare “left of / above”; solve | UML, complex UI | cola.js, KIWI, commercial | not needed today |
| Spectral / MDS | Embed from a matrix or distances | Research visualisation | Rare in product UIs | not needed |

---

## 2. What each Antu kind uses today

Thirteen ways of drawing. **ELK appears in three**; the other ten are Antu’s own geometry.

| Type | Kind | Engine / rule | Entry |
|---|---|---|---|
| Fact | `timeline` | Custom grid (row = time slot; column = side × party) | `src/renderers/fact/timeline/layout.js`, `grid.js` |
| Fact | `chronicle` | Custom single-column spine (time · spine · card) | `src/renderers/fact/chronicle/layout.js` |
| Fact | `scale` | Custom proportional time axis and lanes | `src/renderers/fact/scale/layout.js` |
| Procedure | `flow` | **ELK layered** per stage column (default); optional **Mainline-first** prototype (`fields.engine = 'mainline'` / dock switch, #190) places the spine first then hangs branches — no ELK on that path; only in columnMode (stages on, >1 stage) | `layout.js`, `columns.js`, `mainline.js`, `spine.js`, `elk.js`, `router.js`, `straighten.js`, `polish.js` |
| Procedure | `route` | Custom spine-first (no ELK): main line left → right, branches hang below | `src/renderers/procedure/route/layout.js` |
| Relationship | `graph` | **ELK layered per camp**; camps side by side; every relation routed by Antu | `src/renderers/relationship/graph/layout.js` |
| Relationship | `focus` | Custom rings around a centre party; islands below | `src/renderers/relationship/focus/layout.js` |
| Relationship | `matrix` | Custom party × party table | `src/renderers/relationship/matrix/layout.js` |
| Relationship | `equity` | Custom layered tree (`relationship/layered.js`) | `src/renderers/relationship/equity/layout.js` |
| Relationship | `authority` | Same layered helper (control / employment / agency) | `src/renderers/relationship/authority/layout.js` |
| Relationship | `related` | Custom table centred on one party | `src/renderers/relationship/related/layout.js` |
| Relationship | `path` | Custom shortest chains left → right | `src/renderers/relationship/path/layout.js` |
| Justification | `tree` | **ELK layered per issue**; issues side by side; Antu router (with trunk bundling) | `src/renderers/justification/tree/layout.js` |

Shared bricks (not third-party engines):

| Brick | Role |
|---|---|
| `procedure/flow/elk.js` | Synchronous wrapper around elkjs (`elkLayoutSync`) |
| `procedure/flow/router.js` | Orthogonal link routing after placement |
| `procedure/flow/straighten.js`, `polish.js` | Post-ELK mending for the flowchart |
| `relationship/layered.js` | Level classification and placement for equity / authority |
| `relationship/sections.js` | Stacked sections under a scoped picture |

Why relationship `graph` and justification `tree` do not give ELK the whole picture: a camp
or issue is a **box around nodes that sit in different layers**. ELK’s layered algorithm
cannot keep that box coherent in one pass (measured on the relationship example), so each
group is laid out alone and the groups are then set side by side — the same pattern as
procedure stage columns.

---

## 3. How ELK is isolated and tuned

There is no separate ELK IDE in this repository. Tuning is options + corpus checks.

1. **One door.** `elkLayoutSync` in `elk.js` talks to elkjs’s FakeWorker dispatcher so
   layout returns in the same tick. CLI, MCP `antu_layout`, unit tests, and the renderer
   all stay synchronous. The path uses elkjs internals, so the package version is pinned
   and tests exercise it on every run.
2. **Options, not a GUI.** Each call sets `layoutOptions` (layered algorithm, direction,
   spacing, label room, main-link straightness priority). Flow tries several
   `nodePlacement` strategies and keeps the one with the least bending (`columns.js` /
   `layout.js`).
3. **Corpus as the scoreboard.** Real examples under `examples/` and tests such as
   `test/procedure-layout.test.mjs` pin crossings, overlaps, and main-line geometry.
4. **Mending after ELK.** Straighten / polish / the orthogonal router fix what global
   placement leaves wrong. That is Antu code, not ELK.

**Why ELK was chosen for flow** (from the header of `elk.js`): on the seven real contracts
plus the rule drafts, ELK layered gave **0 edge crossings on 8 of 9** graphs (2 on the
hardest). The earlier hand-written layout gave **12 and 38** on contracts 01 and 03;
**dagre** gave **7 and 11**. Cost: about **1.6 MB** of engine code in every generated HTML.

---

## 4. Other engines (same family or not)

| Option | Family | Status | Notes |
|---|---|---|---|
| **elkjs** (current) | layered (+ other algorithms unused here) | ✅ in use | Best measured crossings for Antu’s flow corpus; large bundle |
| **dagre** | layered | considered | Smaller; worse crossings on contracts 01 / 03 |
| **Graphviz `dot`** | layered | considered | Strong quality; awkward in-browser size and sync story |
| Pre-ELK hand-written columns | custom | considered (replaced for flow) | Much worse crossings on hard contracts |
| Self-written full Sugiyama | layered | not needed | Rebuilds what ELK already does well for Antu’s cases |
| Force layouts | force | not needed | Non-deterministic; bad archive / print fit |
| yFiles / commercial orthogonal suites | layered + ortho | not needed | Licence cost |
| AntV G6 / cytoscape as the paint shell | various plugins | not needed | React Flow is already the shell; layout is separate |

For procedure **flow**, a Mainline-first prototype now lives beside the default
(`fields.engine = 'mainline'`; see `mainline.js`). Compare with
`node tools/layout-scan/run.mjs`. It is not the default until measured flip criteria say so.
Swapping ELK for another **layered** third-party engine remains unlikely to beat it on this corpus.

---

## 5. Debugging layout without an engine IDE

| Tool | What it gives |
|---|---|
| MCP / CLI `antu_layout` | Geometry only (positions, size); no HTML |
| Unit tests on `examples/` | Crossings, overlaps, bends, determinism |
| `tools/verify` (browser) | Screenshots against real Chrome |
| Prefer numbers over eyeballing alone | Crossing counts, bend counts, overlap asserts |

When a picture looks wrong: decide whether the fault is **placement** (ELK options or
custom rules), **routing** (`router.js`), or **paint** (React Flow / CSS). Only the first
two belong here.

---

## 6. Out of scope

- Flipping the flowchart **default** to Mainline-first before corpus gates (#190). The
  prototype is opt-in (`fields.engine = 'mainline'` / dock switch); pairing while both exist:
  **current layout** (ELK + polish) vs **Mainline-first**. `route` already follows spine-first
  for a different read of the same JSON.
- Adding a second third-party layout dependency without a **measured** comparison on the
  same corpus that justified ELK.
- React Flow features → [`docs/reference/react-flow-features.md`](react-flow-features.md); themes, paper size, or JSON schemas → `spec/`.

Chinese counterpart: [layout-engines.zh-CN.md](layout-engines.zh-CN.md).
