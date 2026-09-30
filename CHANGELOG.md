# Changelog

The rules for the numbers are in [spec/versioning.md](spec/versioning.md). Newest first. *Breaking* lists
what breaks a file or a tool call written for the version before, with how to bring it over.

## 0.3.0

The agent skill gets a command line, so an agent without the MCP server can check its diagram before it draws it.

### Added
- **`scripts/antu.mjs` in the skill**: `validate`, `layout` and `render`, in one file with every dependency inside
  (Node 18 or newer, nothing to install, no network). It says the same words as the MCP tools `antu_validate` and
  `antu_layout`; `render` checks the data first and refuses a diagram with problems. `SKILL.md` tells the agent
  to use it when `node` runs, then the Python script, then a text replacement.

### Changed
- The texts of validation and of the geometry report now come from one place (`tools/lib/report.mjs`), shared
  by the MCP server and the command line. The words the MCP tools return are the same as before.
- The skill folder is 1.5 MB larger (the bundled command line; 0.5 MB in git and in the zip).

### Breaking
- None.

## 0.2.0

The first release with a changelog, and the first with all four kinds of diagram. The four JSON formats
are at `specVersion` 1.

### Added
- **Procedure diagram** (`procedure`): stages side by side, the clauses in a table under them.
- **Relationship diagram** (`relationship`): the parties in camps, relations as lines with their kinds.
- **Justification diagram** (`justification`): a court's reasoning as a tree from the end conclusion down,
  in issues; `holds`, `combine` (and / or on an element), norms and facts, sources.
  - An issue can be folded up to its conclusion (the box title, or "Fold issues" in the dock).
  - A fact used by several nodes of one issue is drawn beside each use; "Merge repeats" draws each once.
- **Agent skill** (`skills/antu/`, and a zip attached to each release): `SKILL.md` and the guides, field tables
  and examples of the four kinds, a viewer page and a Python script that fills it. For agents without the MCP
  server: Claude Code, Codex, WorkBuddy and the like read a folder with a `SKILL.md`. Needs no Node and no
  network. Pages now carry `<meta name="generator" content="antu X.Y.Z">`.
- `specVersion` now has a meaning: a whole number per type, checked by the validator (spec/versioning.md).
- MCP: `antu_validate` names the views of a fact diagram that do not fit; the tools dispatch by `type`.
- Bilingual messages (English by default, Chinese as an option); paired examples in both.

### Changed
- The MCP server reports the version from `package.json` instead of its own copy.
- Justification layout: each issue is laid out several ways and the one with fewest crossings is kept
  (the two real cases: 11 and 6 crossings before, none now). The result is the same every time (ELK's seed
  0 is time-based and is no longer used).

### Fixed
- The view is fitted to the size the layout computed, not to what React Flow can measure. A folded issue's
  box, wider than its nodes, was cut off by the canvas (#42); it also put the content off-centre.
- Relationship diagram: regulators' lines no longer run round the picture, labels crowd less (#32).

### Breaking
- None for a file that follows `specVersion` 1. `registerKnowledge` (the engine's registry) now requires a
  `specVersion` for the type it registers: a type added outside this repository has to give one.
