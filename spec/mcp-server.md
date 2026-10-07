# Antu's MCP server

> Status: **working** (2026-09). This is the entry point for **agents**.

## 0. In one sentence

Through it an agent reads the specification, views examples, validates its own JSON,
computes the geometry, produces the output, **and takes a look at the result**.

## 1. Three design principles

**One: there is no "generate JSON" tool in the MCP.**

The engine does not generate JSON; that is a founding principle of the project (see
`spec/v0-architecture.md` §1). Reading documents, extracting facts and writing JSON is the
agent's job. The server only provides **specification, examples, validation, geometry,
rendering and preview**. It does not write data on the agent's behalf.

**Two: let the agent see.**

This is the most easily overlooked principle, and the most important.

An agent, like a person, **cannot see what it has drawn**. Validation may pass and the
geometry may be sound, and the diagram can still look bad: cards jammed together, text
too small, the whole diagram too empty, column headings cut off.

`antu_preview` returns the result as a PNG so the agent can check it with its own eyes.
Without that step the agent can only write blind.

A real example: during this project's own development, several defects **passed every
validation check** and were only found by looking at the diagram:

- the "fit view" button on the canvas did nothing (a 0×0 decorative node made React
  Flow misjudge the state)
- the styles of the top-left card were deleted by accident, so the card pushed the
  canvas to the right and squeezed it into a sliver
- the direction arrow pointed the wrong way, and a small triangle was misaligned with
  its text

**Validation guarantees that the data is legal; it cannot guarantee that the diagram
looks good.** The preview covers that gap.

**Three: run locally rather than over the network wherever possible.**

Validation and geometry are **plain JS** and need no browser: given a JSON they work out
how large the content is, which orientation to use, and which views do not fit. The
preview reuses **the browser already installed on the machine** (how it is located is
in §4); no headless browser is bundled. The whole server makes no network requests.

## 2. Eight tools

Two groups. **Reference material for agents and documents for designers are two
different things**; do not mix them.

### For agents (needed to write JSON)

**The three reference tools are all dispatched by type**: pass `type` to get material
for that kind of diagram, omit it and you get `fact`. Two types exist so far, fact and
procedure; asking for another type returns an explicit "there is no such type yet" rather
than an empty table (an empty table reads as "this type exists, it is just empty").

| Tool | What it does | Size | Needs a browser |
|---|---|---|---|
| `antu_schema` | Field table: what is required, of what type, one line of explanation | 2858 characters ≈ 1.9k tokens | no |
| `antu_guide` | One page of mechanism notes: where an event is drawn, how views change, the "one event per cell" limit | 4042 characters ≈ 2.6k tokens | no |
| `antu_examples` | Lists examples (by default the six small ones in `examples/agent/fact/`); pass `file` to fetch any one | about 1 KB each | no |
| `antu_validate` | Validates, reporting each problem (with field path and event id); when it passes, notes each view that does not fit (not an error, but that view is left out of the view dropdown) | — | no |
| `antu_layout` | Computes the geometry: content size, fit zoom, suggested orientation, whether each view fits. For a procedure the suggested orientation is always the one the diagram opens with (vertical), and which orientation fits a screen better is reported apart | — | no |
| `antu_render` | Produces the self-contained HTML | — | no |
| `antu_preview` | Returns a PNG screenshot | one image | **yes** |
| `antu_versions` | Which diagram types and which ways of drawing (`kind`) there are, with the version and status of each and the generation of each type's JSON format; optional `type`. The same list as `antu versions` on the command line and `spec/versions.md` | a few lines | no |

`antu_layout`, `antu_render` and `antu_preview` take an optional `kind`: the way of drawing (a fact
diagram is `timeline`, the default, `chronicle` or `scale`; a relationship diagram is `graph`, the default, `focus`, `chain`, `matrix`, `equity`, `authority`, `related`, `path` or `summary`; a procedure diagram is `flow`, the default, or `route`). An unknown kind is refused with the list of
kinds. `antu_render` with a kind makes the page open in it; the reader can still switch.

`antu_render` and `antu_preview` also take an optional `theme`: the look of the page (`document`, black and white for print, the default; `modern`; `legal`, navy). Only the diagram is themed. Without `theme` the reader chooses in the label card and the choice is remembered; with it the page is fixed to that theme. An unknown theme is refused. See [theme.md](theme.md).

**The design is meant to avoid rework when a new type is added.** `antu_schema` used to
call `describeFactSchema()` directly and `antu_guide` read one fixed file, which amounts
to hard-coding fact into the tools; the day the relationship diagram arrived all three
tools would have needed changing. Now the field table, the mechanism notes and the
examples are all split by type, and adding a type means only: write its `schema.js`
(with field metadata), put a `guide.md` in `spec/agent/<type>/`, and put a few small
examples in `examples/agent/<type>/`. **Not one line of the tools changes.**

Together **5.4k tokens** is enough to start work, replacing the old "read the schema
document 8k + layout rules 3k + examples 5k".

**The three tools point at each other** (a chain in order of use) so an agent need not
guess what to call next:

```
antu_schema → antu_guide → antu_examples → antu_validate
```

Every tool description says which one to look at before and after.

### For designers (**not in the MCP**)

The eleven design documents under `spec/` describe why things were decided the way they
were. **The MCP exposes none of them.** The old approach hung them all out with a
"useful for writing data" label, which is the same as no separation at all: an agent
following the list would read tens of thousands of characters written for designers.

Whoever needs the design rationale is a person, and a person opens the file directly.
The MCP is not involved.

**There is exactly one resource:**

```
antu://agent/<type>/guide    mechanism notes for that type (currently only antu://agent/fact/guide)
```

Only that one. Whatever is under `spec/agent/` is here; nothing from the level above
ever appears.

**An assertion in the verifier guards that line**: the name of no human-facing document
(`spec/fact/schema-draft.md`, `spec/v0-architecture.md`, …) may appear in the MCP server
code.

### Why not hand-copy a "specification for agents"

This project has already been bitten four times by writing the same thing in two places
and having them drift (clashing class names, `1.12` in two places, the MCP dispatch
table, the HTML template in two places). Hand-copying the rules a fifth time would make
it five.

So the field table is **generated from `FACT_FIELDS` in the code**
(`renderers/fact/schema.js`), and the verifier has a guard: **a field marked required,
when removed, must make the validator complain.** Both sides state the same thing, and
changing one while forgetting the other is caught by the tests.

As for "common mistakes and how to fix them", **no static list is needed**: call
`antu_validate` after writing and the validator reports each problem and how to fix it.

## 3. An agent's full workflow

```
1. antu_examples      → see how a worked case is written
2. antu_schema        → the field table
3. antu_guide         → the mechanism notes
4. write JSON         ← the agent's own work
5. antu_validate      → fix any errors, loop until it passes
6. antu_layout        → check the geometry: too wide? which view does not fit?
7. antu_preview       → look at the diagram: does it look good?
   ↑ not satisfied, go back to step 4
8. antu_render        → produce the finished HTML and hand it to the user
```

Steps 5 to 7 are a loop. **Passing validation is only the pass mark; looking
comfortable is the delivery standard.**

## 4. Wiring it into an MCP client

The server runs over stdio. With a client such as Claude Desktop:

```json
{
  "mcpServers": {
    "antu": {
      "command": "node",
      "args": ["/absolute/path/to/antu/tools/mcp/server.mjs"]
    }
  }
}
```

It can also be run by hand to watch it wait:

```bash
npm run mcp          # start the server (waits for JSON-RPC on stdin)
npm run mcp:test     # run the whole flow with the bundled client
```

### Where the browser comes from

Only `antu_preview` needs a browser (the render check does too). The lookup order is:

```
ANTU_CHROME environment variable  →  known paths  →  PATH
```

**No vendor paths are piled up in the repository**: any Chromium-based browser can be
wired in through the environment variable, so if the machine has 360, QiAnXin, Edge or
the like (common on Kylin / UOS), point at it in the client's `env` rather than changing
code:

```json
{
  "mcpServers": {
    "antu": {
      "command": "node",
      "args": ["/absolute/path/to/antu/tools/mcp/server.mjs"],
      "env": { "ANTU_CHROME": "/opt/browser360/browser360" }
    }
  }
}
```

Same on the command line: `ANTU_CHROME=/its/path npm run verify`.

A few boundaries, all deliberate:

- **the environment variable is read every time**, not once at module load, otherwise
  setting it after the client imports the module would have no effect;
- **a wrong value is not an error, the search continues.** Pointing at a path that does
  not exist, or at a directory (one level short), counts as unset, so a typo does not
  block the whole path;
- **not finding a browser is a degradation, not an error**: `antu_preview` replies
  "preview is not possible, use `antu_layout` to judge the geometry for now", and every
  other tool keeps working;
- **an environment without `sh` (Windows, for instance)**: the PATH step comes up empty,
  the other two steps still work.

`tools/verify/run.mjs` has three assertions guarding this section (listed under
[browser lookup]), and they **need no browser**, so `npm run verify:fast` runs them too.

## 5. Self-test

`tools/mcp/client-test.mjs` is a **hand-written MCP client** that walks the flow in the
order a real client would:

```
handshake → list tools → list resources → read resource → list examples
→ validate bad JSON → validate real JSON → compute geometry → produce HTML → screenshot
```

Why it exists: MCP is a protocol, and reading the code cannot tell you whether a client
can actually drive it. It also demonstrates two things in passing: **validation and
geometry really do not need a browser**, and **the preview really does produce a real
image within seconds**.

Measured (corridor-charging case):

```
validation passes
vertical 948×901, fit zoom 0.849; horizontal 2362×345, 0.605; vertical suggested
4 views, of which "Chronological only" does not fit (two events in one slot fall in the same lane)
HTML produced: 419 KB
preview: 9 cards, 1400×820, about 2.4 seconds
```

## 6. The dependency cost (worth stating plainly)

The official SDK `@modelcontextprotocol/sdk` is used. It brings in **158 packages, about
73 MB** (express, hono, ajv, jose and others, mostly for the HTTP transport half).

- **It does not affect the browser bundle**: the SDK is only referenced by the MCP entry
  point, Vite never bundles it into the engine, and the self-contained HTML has not grown
  by a single byte;
- **it is only a development / integration dependency**: what an end user receives is
  still one HTML file, and they install none of this.

If that cost is unacceptable, the alternative is **to skip the SDK and implement
JSON-RPC over stdio directly** (about two hundred lines, zero new dependencies). The
price is maintaining protocol version compatibility yourself. For now the SDK is used:
**protocol correctness matters more than a few fewer packages**.

## 7. Not done yet

- geometry for types not built yet (relationship and others); fact and procedure are done
- incremental preview (each run starts a fresh Chrome, about 2.4 seconds; reusing an
  instance could bring it down to a few hundred milliseconds)
- returning the preview image alongside the previous one so an agent sees before and
  after in one go
