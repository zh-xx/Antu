# Changelog

The rules for the numbers are in [spec/versioning.md](spec/versioning.md). Newest first. *Breaking* lists
what breaks a file or a tool call written for the version before, with how to bring it over.

## 0.6.0

antu has a licence: the GNU Affero General Public License, version 3 or any later version (#70).

### Added
- `LICENSE` (AGPL-3.0-or-later) and the licence section of the READMEs. `package.json` says `AGPL-3.0-or-later`.
- **The notices of the code of others that is inside what we ship**: React, `@xyflow`, `d3-*`, `zustand`,
  `html-to-image`, `elkjs` and the rest (19 packages: MIT, ISC, BSD-3-Clause, and elkjs under its
  GPL-3.0-or-later option). They are in `skills/antu/THIRD-PARTY-NOTICES.md` (so in the skill zip), inside every page,
  and at the top of the command line. They are generated from what `src/` imports (`tools/lib/notices.mjs`), so a
  dependency update cannot leave one out, and a test fails when `src/` imports a package that has no notice.
- **An additional permission (AGPL section 7)**: the data in a page, and the diagram drawn from it, are not covered by the
  licence; they stay with whoever made the page. It is in the READMEs and in the block every page and the command line
  carries.
- **The licence and the place of the source travel with the code**: every page carries a block
  `<script type="text/plain" id="antu-license">` with the licence of antu, the Corresponding Source of that version
  (this repository at its tag) and the notices; the command line starts with the same text; the skill folder holds
  `LICENSE`. A page is about 70 KB larger for it, the command line about 75 KB. `SKILL.md` says which licence applies.

### Changed
- Nothing in the format or the tools: no field, rule, tool parameter or command-line option changed.

### Notes
- Versions up to 0.5.0 were published without a licence file. The licence applies from 0.6.0.

### Breaking
- None.

## 0.5.0

The guard (#43): an agent that cannot look at the page is told whether the reader can read it.

### Added
- **Every kind's geometry report (`layout`, `antu_layout`) says how big the body text is on one screen**, in px:
  `Text on one screen (1600×900): 7.0 px as it opens (vertical), 4.7 px horizontal. Full size is 13 px.` It is the
  kind's body font times the fit zoom, and a browser check holds it to the page: the page draws it within 5%, never
  smaller than reported (the report is on the safe side).
- One pair of thresholds for every kind: under 11 px a note that the text is small and the reader can zoom in; under
  9 px a note that it is too small to read without zooming in, with how this kind is split (by issue, by stage, by
  group, into periods) and "do not drop facts to make it fit". A justification of several issues also says how big
  the text is with every issue folded, so the agent can leave it whole when folding is enough.

### Changed
- These notes replace the ones each kind had: a justification compared its fit zoom with 0.4 and a procedure and a
  relationship diagram with 0.45, which said nothing about the elevator case (5.6 px); **a fact diagram had no such
  note at all** (the Yu Huan loan timeline opens at 7.0 px).
- `render` in the skill's command line prints the same lines after it writes the page. `SKILL.md` says to run
  `layout` before making the page and what to do with each level.

### Breaking
- None. The words of `antu_layout` changed; they are not part of the contract (spec/versioning.md).

## 0.4.1

Two more fixes to what the skill tells an agent (#49). No engine change.

### Fixed
- `SKILL.md` did not say that the page has switches in its bar, or that some of them are **off until the reader turns
  them on**: in a fact diagram a card shows its title, summary and time, and its party names and source marks need
  **Parties** and **Sources**. An agent could not know, so it could not tell the user where to look. It now lists the
  switches of each kind with their defaults, says what that means for what to write, and says the detail and the
  sources are in the overlay.
- `layout` adds a note when the text would be small on one screen, and `SKILL.md` did not say what to do about it. It
  now says: split by issue (or fold issues), by stage, or by group as the note names, one JSON per piece with a title
  of its own, and do not drop facts to make it fit.

### Breaking
- None.

## 0.4.0

### Changed
- **Fact diagram: `date` is optional** (#50). An event the material gives no date for is left without one, and its card
  says the date is unknown ("日期不详" / "date unknown", in italics), instead of carrying a date made up to satisfy the
  format. Order was always the `slots` array and `date` only shown, so nothing in the layout moves. `dateEnd` needs a
  `date`; a `date` that is written must still be valid. A new agent example `7-undated`. `SKILL.md` and the fact
  guide drop the workaround of borrowing a neighbour's date with `approx`.
  `specVersion` stays 1: a file that has dates is still right.
- The agent reference material of the fact diagram is 5.4k tokens (it was 4.5k): the guide says whom to list on an
  event and what to do without a date, and the field table says so too.

### Breaking
- None.

## 0.3.1

Two fixes to what the skill tells an agent (#49). No engine change.

### Fixed
- A fact diagram of two parties written after `1-minimal` had no `groups`, so every card stood on the middle axis
  and the page did not show who did what. `SKILL.md` now says that a diagram of two or more parties needs
  `groups` (see `3-groups`) or `views` that split by party (see `4-views`).
- The commands in `SKILL.md` were written `node scripts/antu.mjs …`, which only works with the skill folder as the
  current directory, and an agent's current directory is usually the user's. They are now written with
  `<skill-dir>`, and `SKILL.md` says where the agent's own files go (where the user works, not in the skill folder).

### Breaking
- None.

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
- `SKILL.md` says what the guides' `antu_*` tools are in the skill folder (and that there is no way to look at the
  page), and what to do with something the user is unsure of, an event with no date, and a missing source. Found
  by giving three agents the skill and one sentence each (a fact timeline, a relationship diagram, a justification
  tree): all three used the command line, left nothing invented out of the JSON and made a page that opens; the
  gaps they named are what this fixes.
- The fact guide says whom to list on an event (who did it; both only when both acted).
- The note "nothing supports X" says it can be left as it is when X stands only because what argued against it
  was rejected.
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
