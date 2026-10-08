# Changelog

The rules for the numbers are in [spec/versioning.md](spec/versioning.md). Newest first. *Breaking* lists
what breaks a file or a tool call written for the version before, with how to bring it over.

## 0.11.0

Antu in an application's own window: three entries for a host's code (#152, #153). The fact timeline reads
better (#151, #154), and a fact diagram whose order contradicts its dates says so (#150). One rule is stricter:
a `type` that is not a diagram type is now an error (see *Breaking*).

### Added
- **`@zh-xx/antu/embed`**: `mount(element, spec, options)` draws a diagram inside a host's page, in a shadow root,
  with its own React inside (the host's framework and React version do not matter). It reads and writes nothing of
  the host's (window, document title and language; localStorage only with `prefs: 'local'`), and the host's CSS
  does not reach it. Options `kind`, `kinds`, `theme`, `lang`, `ui` (`header`, `capsule`, `minimap`, `zoom`),
  `prefs`, `onEvent`. Events: `select` (the item a reader pinned, the array it is in, its sources as written with
  their `loc`, so a host can open the clause it rests on), `kindchange`, `invalid`. The handle: `ready`, `update`,
  `setKind`, `setTheme`, `setLang`, `fitView`, `exportPng` (a Blob, the picture the page's export makes) and
  `destroy`. The contract is in `spec/embed.md`.
- **`@zh-xx/antu/validate`**: `validate(spec)` → `{ ok, errors, notes }`, `layout`, `kinds`, `versions`: the
  checks, notes and geometry report of the command line and the MCP server, as data.
- **`@zh-xx/antu/html`**: `renderHtml(spec, { kind, theme })`, the page `antu render` writes, as a string (Node).
- The npm package lists these three in `exports`, each one bundled file with its declarations (`.d.ts`).
- **A note when the order of the slots clearly contradicts the dates** of a fact diagram (#150): a slot whose date
  lies wholly before the nearest dated slot before it. A note, never an error; nothing is reordered. It found a
  real swap in the `gym-membership-face-scan` example, fixed with its fictional judgment.
- **A way of drawing written as the type is named**: `"type": "flow"` says it is a way of drawing a procedure
  diagram and to write `"type": "procedure"`.

### Changed
- **`fact/timeline` is version 2** (#155):
  - Vertical rows are **staggered by default** (#151). A row starts half a row after the one before it unless they
    share a column, so a long timeline is shorter and its text larger: the Fang Yuan example opens at 10.8 px
    instead of 7.0 px. A **Stagger** chip turns it off; what a reader sets is remembered per diagram.
  - A side of several parties is **named once**, and each of its columns is headed by its party (#154).
- **The modern theme's side 2** is readable as text: `#64748b`, about 4.6:1 against the canvas (#154). A test
  holds every theme's side colours to at least 4.5:1.
- The viewer page and a mounted diagram are drawn by the same code (`src/embed/core.jsx`). What a page reads from
  the window (the preset, the reader's preferences, the language) now comes through one environment; the page
  behaves as before.
- The Release gate counts a check that ran again by its latest run (#149).

### Breaking
- **An unknown `type` is an error**, on every surface (MCP `antu_validate`, the command line, the page, the
  entries). Before, a `type` that is not one of `fact`, `procedure`, `relationship`, `justification` passed
  validation with no error and nothing could draw it. *To bring a file over*: write one of the four types; the
  error names the right one when a way of drawing was written instead. A file that drew before still draws.
- The npm package now has an `exports` map: only the three entries and `package.json` can be imported. The
  commands (`antu`, `antu-mcp`, `npx -p @zh-xx/antu …`) are unchanged.

## 0.10.0

Version management of the types and the diagrams (#131), a trial that measures how weaker models use the skill (#135, #136), and the details it found (#137 to #144). The contract is not touched.

### Added
- **A list of the types and the diagrams with their versions**: `spec/versions.md`, written from the registry (the list is kept in step by a test); `antu versions [--json]` on the command line and the MCP tool `antu_versions` (the server now has eight tools). Each of the four types has a format generation (all 1); each of the 15 diagrams has a version, a status (`experimental`, `stable`, `deprecated`) and the release it came in. A diagram that is in `layouts` without being in `diagrams` is refused at registration. The rules are in `spec/versioning.md` ("Managing a type", "The diagrams"); each type has `spec/<type>/changes.md` for changes to its JSON.
- **The fact layout report says how many events a view draws** ("N of M events drawn") and names the ones it leaves out, so a view that names parties and so leaves out an event is no surprise (#137).
- **The agent guides name the examples an agent can open**, and a test keeps the names to the files (#138). The size of a guide is held at 6.5k tokens.
- **The trial** (`tools/trial/`, `spec/trial.md`): a small agent that has a weaker model (by default `deepseek-flash`) draw with the released skill, and a scoring list for judging the result by reading it. It is a tool for the maintainers; it is not part of the package.
- **The label card at the top left of every page folds** to one line with an arrow and unfolds again; it opens unfolded, the choice is remembered, and it is not in an exported image (#144).

### Changed
- **`justification/tree` is version 2.** A diagram with more than one issue whose text, at the reference canvas of 1600 × 900, would be under 9 px, and that gets larger when folded, opens with all its issues folded; `layout` says so ("Opens with the issues folded: unfolded, its text would be …"), and the dock shows the state (#139). A reader's own fold, once made, wins.
- A connector that steps sideways by a few pixels between two boxes is drawn as one straight line, in the justification tree and the relationship graph (#142).

### Breaking
- None. The JSON of every type, the names and parameters of the MCP tools that were there, and the subcommands of the command line are as in 0.9.1.

## 0.9.1

How people get Antu and hear of a newer one (#113, #127), and the home page's way in (#128). The contract is not touched.

### Added
- **A notice of a newer version.** After `validate`, `layout`, `render` or `preview` has finished, the command line asks the npm registry, at most once a day, for the newest version number; if it is newer than the running one, the output ends with a `Notice:` line that names the command to update (`npx skills update antu -g` for the skill, `npm update -g @zh-xx/antu` for the package) and tells the agent to pass it on and not to run it without the user's agreement. The request carries nothing of any diagram; the answer is kept in the temporary folder for a day; no network, a slow registry (1.5 s) or a bad answer gives no notice and never fails the command. `ANTU_NO_UPDATE_NOTIFIER=1` turns it off; `--version` and a clone of the repository do not ask. **This is the first network request the command line makes.**
- **`LICENSE-NOTES.md` in the skill**, made from the same text as the pages and the notices; `SKILL.md` keeps a short licence section and refers to it.
- **The home page of the site** has a *Get started* section (the sentence that installs the skill, the MCP configuration, each with a copy button) and the points on why Antu suits legal work, in place of the under-construction notice. The page's own text (motto, kinds, labels, footer, title) follows the language switch; the specimen documents stay in Chinese.

### Changed
- `SKILL.md` is shorter (about 12 KB, down from about 16.5 KB; four sections instead of nine). The agent guides name four actions, `validate`, `layout`, `preview` and `render`, which are also the subcommands of the command line, instead of the MCP tools.
- The MCP configuration in the READMEs asks for `@zh-xx/antu@latest`, so that a client with an older copy in the `npx` cache takes the newest version. The README states the daily version check.

### Breaking
- None. The JSON of every type, the names and parameters of the MCP tools and the subcommands of the command line are as in 0.9.0.

## 0.9.0

The package that carries Antu to people: `@zh-xx/antu` for npm, with the command line and the MCP server in it, and the way to publish it (#80, #113, #114, #116). The lawyer-facing home page of the site (#107, #108). The contract is not touched.

### Added
- **The npm package `@zh-xx/antu`**, built by `node tools/build-npm.mjs` into `dist-npm/`: two commands, `antu` (the command line of the skill: `validate`, `layout`, `render`, `preview`) and `antu-mcp` (the MCP server, over stdio), each one bundled file with its dependencies inside, so `npx` downloads about 2 MB and nothing is built on the user's machine. With them: the viewer page, the agent guides and examples the server serves, the licence and the third-party notices.
- **The package is tested as users get it**: `tools/verify/npm-pack.mjs` packs it, installs the tarball into an empty folder and runs the command line and the MCP server over stdio (the seven tools, a guide, validate, layout, render); a CI job `npm-package` does it on every pull request.
- **The way to publish**: a manual workflow, *Publish npm* (`.github/workflows/publish-npm.yml`), separate from *Release*. It refuses a commit that is not on `main`, a version without its tag on that commit and red checks; it builds and tests the package and shows what would go out (`npm publish --dry-run`). A dry run is the default; a real publish waits for the maintainer to approve the `npm` environment and uses the identity of the workflow, not a stored token. Nothing has been published by it yet (see `spec/versioning.md`).
- **The MCP registry entry**: the package carries `mcpName` and a generated `server.json` (`io.github.zh-xx/antu`); `test/npm-package.test.mjs` keeps the package, `server.json` and the skill on the one version of `package.json`.
- **The home page of the site** (`site/prototypes/hero/`, generated into `index.html` of the Pages site): a top bar, the four kinds drawn in front of the reader from one document each, light and dark. It is a page for the site, not part of the engine's contract.

### Changed
- `antu_render` without `outPath`, when the server was installed from npm, writes `<title>.html` in the folder the server runs in; from a repository it still writes `dist-html/<title>.html`.
- The example gallery of the Pages site moved to `gallery.html`; `index.html` is the home page.
- The procedure example `02-purchase-contract` has three stages, and a fictional contract text (`examples/raw/`) it is drawn from, so the home page can show a flowchart made sentence by sentence.
- The judgment text of the Fang Yuan case in `examples/raw/` has its reasoning written out.
- Tool versions: the MCP SDK 1.31.0, vite 8.3.2, `setup-node` 7, `download-artifact` 8, `upload-pages-artifact` 5, `source-map-js` 1.2.2.

### Breaking
- None. The JSON of every type, the names and parameters of the MCP tools and the subcommands of the command line are as in 0.8.0.

## 0.8.0

The look of a diagram is now a theme: three themes, the document theme black and white and the default (#97, #99, #100, #101, #102). The READMEs and several documents are brought up to date (#103, #104, #105).

### Added
- **Three themes**: `document` (black and white, square, for print and filing; the default), `modern` (rounded, pale greys) and `legal` (navy, red only for the adverse). Every meaning is also carried without colour, so a black-and-white print reads the same. The reader switches in the label card and the choice is remembered. See [spec/theme.md](spec/theme.md).
- **A shared scale**: an 8 px grid for node sizes, five type sizes, four line weights and four line styles.
- **`--theme document|modern|legal`** for `render` and `preview` in the command line, and an optional `theme` on `antu_render` and `antu_preview`. It fixes the page to that theme; an unknown name is refused. Nothing in the JSON chooses a theme.

### Changed
- Only the picture is themed; the label card, the zoom buttons, the bar below and the minimap look the same in every theme.
- Without a choice, a page opens in the `document` theme: black and white instead of the former blue-grey and colours. The same JSON draws the same picture, apart from colour, corners and fonts.
- The label card has a fixed width, so the arrows do not move when the way of drawing changes.
- The minimap shows the extent of a picture that is drawn only by decoration layers (the route map, the relation path), where it used to be empty.
- Fact diagrams, time scale: side 2 is drawn as a square and side 1 as a circle, so the sides differ without colour.
- Pill radius comes from the theme: square in the document theme, rounded in the others.
- The READMEs (English and Chinese) are restructured and show the sketch of every way of drawing, written out from the page's own sketches (`assets/kinds/`, `node tools/gen/kind-icons.mjs`); a test keeps them complete and current.
- The architecture, fact rendering, procedure, justification and relationship documents no longer describe the former colours; a page of this release is about 2.3 MB.
- A site on GitHub Pages is built from the cases in `examples/` (a page for every way of drawing, `tools/gen/pages.mjs`); it is built on every pull request and published from `main`.
- A test (`test/theme-lock.test.mjs`) fails when a view or the stylesheet writes a colour of its own; the verifier fails when the document theme draws a colour.

### Breaking
- None. No field, rule or tool parameter changed; `theme` is new and optional. A page that was fixed to the old colours now opens in the `document` theme unless the reader or the call chooses another.

## 0.7.0

The same JSON can now be drawn in more than one way, and the page has a picker for it: three ways for a fact diagram, two for a procedure, nine for a relationship diagram (#85, #87, #89, #91, #93, #95).

### Added
- **A picker in the label card**: `‹ current way 3 / 9 ▾ ›`. The arrows and the left and right keys step to the neighbour in one click; the name opens a panel with a sketch of every way. It is the same for every type, and the choice is remembered per diagram. With one way there is no picker.
- **Fact: two more ways to draw the same fact JSON.**
  - The **chronicle** (`chronicle`): one column, the time on the left, the gap between two time points written on the spine ("+24 min", "12 days later"). A group is a mark on the spine (circle, square, diamond) with a legend that lights one group up; nothing about the group is written in the cards.
  - The **time scale** (`scale`): distance on the axis is real time, so where events crowd together shows; one lane per group, the axis breaks where the scale changes, and cards that cannot be kept apart are gathered into one and written out under the diagram.
- **Procedure: the route map** (`route`): the main line as one thick line with its stations, stage bands behind them, the branches hanging below, loops and jumps as arcs; what is not on the picture is listed under it.
- **Relationship: eight more ways to draw the same relationship JSON**:
  - the **focus view** (`focus`): one party in the middle and the parties around it;
  - the **guarantee chain** (`chain`): one claim, its guarantors, what stands behind them. A guarantee that names no claim is tied to one only when that is plain (the creditor has exactly one claim), and then it says "inferred";
  - the **relation matrix** (`matrix`): parties across and down, the relations in the cells;
  - the **equity tree** (`equity`): holders above what they hold, the share on each line, and what a holder holds through others when every share on the way is stated;
  - the **authority chart** (`authority`): control, employment and agency as an organisation chart;
  - the **related-party list** (`related`): a table centred on one party, a line for each relation, with its category, content and direction;
  - the **relation path** (`path`): the shortest chains between two parties, one chain to a row;
  - the **camp summary** (`summary`): each camp as a block, one line between two blocks with the number of relations.
  Every relation is on the page once, in the picture or in a list under it; a case a way cannot draw says so.
- **`kind` on the command line and the MCP tools**: `--kind timeline|chronicle|scale`, `--kind flow|route` and `--kind graph|focus|chain|matrix|equity|authority|related|path|summary` for `layout`, `render` and `preview`; an optional `kind` on `antu_layout`, `antu_render` and `antu_preview`. `render` with a kind opens the page in that way; the reader can still switch. `layout` reports each way in its own terms. A kind that does not belong to the diagram's type is refused with the list of its kinds.

### Changed
- The fact guide, the relationship guide and the procedure guide for agents say that the ways exist, that nothing in the JSON chooses them, and when to ask for which.
- The text of the interface in Chinese is more formal (a few words in the errors, the guarantee chain and the related-party list), and counters are consistent ("个" for things, "条" for rules).
- Nothing in the format: no field, rule or tool parameter was removed or changed; the optional `kind` is new.

### Breaking
- None.

## 0.6.0

The skill can look at what it drew without the MCP server (#82), and the examples are fictional (#74).

### Added
- **`preview` in the skill's command line**: `node scripts/antu.mjs preview spec.json [-o shot.png]
  [--orientation vertical|horizontal] [--width 1600] [--height 900]`. It validates (and refuses a diagram with
  problems, like `render`), takes a screenshot of the page in a headless Chromium-based browser (Chrome, Edge,
  Chromium; `ANTU_CHROME` points at one), and says what to look for. The agent reads the PNG with its own tool. On Node
  22 and newer it waits until the diagram has drawn; below 22 it uses the browser's own screenshot (a strip at the
  foot may stay blank, and it says so). Exit code 3 when no picture can be taken.
- **`SKILL.md` section 4b, "Look at it"**: how to look, what to look for (crowded cards, text too small, a line through
  a card, an empty diagram, cut headings), and when the agent must say it did not see the page (no browser, no way to
  read images, no Node). It replaces "there is no equivalent, you cannot look at the page".
- Windows: the browser is found where Windows keeps Edge (shipped with the system) and Chrome.

### Changed
- **Every example is fictional** (#74): the cases drawn from real judgments are replaced by invented ones of the same
  shape (names, companies, courts, case numbers and dates made up and marked so; statutes written as "model
  provisions"). In the skill: the agent examples `fact/5-duration` and `fact/6-sources`. `examples/raw/` holds invented
  judgment texts instead of real ones.
- **A quote is verbatim** (#68): the `quote` field note and the fact guide say a quote is copied, not shortened or
  reworded, and a condensed version goes in `detail`. A test holds every quote of the fact examples to its text.
- `antu_preview` and `preview` say what to look for in the same words.
- CI tests the skill as each pull request would build it, `preview` with a real browser on Linux, macOS and Windows
  and Node 18 to 24; before, the command line of main was first tested at release.
- Nothing in the format: no field, rule or tool parameter changed.

### Notes
- This 0.6.0 is a new release. A different 0.6.0 (what became 0.5.1) was published on 2026-10-01 and withdrawn the same
  day; its tag was deleted.

### Breaking
- None.

## 0.5.1

Antu has a licence: the GNU Affero General Public License, version 3 or any later version (#70).

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
  `<script type="text/plain" id="antu-license">` with the licence of Antu, the Corresponding Source of that version
  (this repository at its tag) and the notices; the command line starts with the same text; the skill folder holds
  `LICENSE`. A page is about 70 KB larger for it, the command line about 75 KB. `SKILL.md` says which licence applies.

### Changed
- Nothing in the format or the tools: no field, rule, tool parameter or command-line option changed.

### Notes
- Versions up to 0.5.0 were published without a licence file. The licence applies from 0.5.1.
- This content was first published as 0.6.0 and withdrawn a few hours later, before anyone had downloaded it: it adds nothing
  to the contract (spec/versioning.md), so it is a patch release. That 0.6.0 stays withdrawn; the number was later
  used for the release after this one (see 0.6.0).

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
