# Versioning

Three things carry a version, and they are kept apart on purpose.

| | What it is | Where it lives | Form |
| --- | --- | --- | --- |
| **The release** | the engine and its tools (renderers, MCP server, command line) as a whole | `package.json` (written once; the MCP server reads it from there) | `major.minor.patch`, [SemVer](https://semver.org) |
| **The format generation** | the JSON format of one diagram type (`fact`, `procedure`, `relationship`, `justification`) | the type's knowledge (`specVersion` in `src/renderers/<type>/schema.js`); a data file may state it as `"specVersion"` in its envelope | one whole number per type, starting at 1 |
| **The diagram** | one way of drawing a type's JSON (`relationship/equity`, `fact/chronicle` …) | `diagrams` in the knowledge of the type (`src/renderers/<type>/schema.js`), beside `layouts` | a whole number from 1, with a status and the release it came in |

## The release number

Now in the 0.x stage: **0.2.0** is the first release with a changelog, and the first with all four diagram
types.

- **`0.x.y` → patch (`y`)**: fixes only. No new field, no new diagram type, no new tool. A layout that
  crossed lines and no longer does, a style fix, a corrected example. So are the licence and the notices that
  go with the code (`LICENSE`, the third-party notices, the block in a page): they are not part of the
  contract below, and a change to them does not touch it.
- **`0.x.0` → minor (`x`)**: anything added, and anything broken. While the major number is 0, a minor
  release may break the contract, but a break is always written in the changelog under *Breaking*, with
  how to migrate.
- **`1.0.0`**: from here on the contract below is not broken without raising the major number.

**What 1.0.0 needs first**: the four formats are settled and no longer called drafts (`spec/*/schema-draft.md`
become the specification); every type has real cases and agent examples; the open points that change a
format (the evidence layer of the justification diagram, #38; the way a norm stands in a diagram) are
decided. This is the maintainer's call, not a date.

## The status of a design document

The design documents under `spec/<type>/` open with a status line. Its words mean:

| Word | Meaning |
| --- | --- |
| **draft** | designed, not implemented yet, or a question that would change the format is still open |
| **implemented** | the code follows it and it has been released; questions still open are listed in the document and do not change the format that exists |
| **confirmed** | implemented, and the maintainer has said the format is settled. Only the maintainer writes this word (1.0.0 needs it, see above) |

The status line also says **"status line checked against X.Y.Z"**: the release number at which someone last read
that line against the code (what is implemented, what is open). It does **not** say the whole document was checked;
a full check of prose against code is not realistic. A test (`test/spec-status.test.mjs`) fails when a registered type
has no design document, no such line in either language, a version newer than `package.json`, or is missing from the
leak check of `tools/verify/run.mjs`.

## What is the contract

| Part of the contract (breaking it needs a new version) | Not part of it (may change in any release) |
| --- | --- |
| the field names, meanings and required-ness of each type's JSON | how a diagram is laid out: where nodes stand, how lines run, sizes |
| which data is an error, and which rule reports it | look: colours, fonts, the interface |
| the names and parameters of the MCP tools (`antu_validate` …) | the wording of hints and messages |
| the subcommands and options of the command line (once there is one) | the internal structure of the code |
| the entries for a host's code (`@zh-xx/antu/embed`, `/validate`, `/html`): their functions, options, events and what they return ([embed.md](embed.md)) | the elements and classes inside a mounted diagram's shadow root |

**A rule made stricter is a break; a rule made looser is not.** A file that passed must not fail because
the engine was updated. (A new *hint* is not a break: a hint never stops a diagram.)

**The entries for a host's code** follow the release number, as the MCP tools do; they have no number of their
own. A new option, a new event or a new field in an event is an addition (a host must ignore event types and
fields it does not know); a renamed or removed function, option or field, or a changed meaning, is a break and
goes under *Breaking* with how to migrate. The kinds and the themes a host may name are those of `versions()`
and of `spec/theme.md`: a kind that is retired is a break of the diagram (see "The diagrams" below), not of
the entry.

## The format generation (`specVersion`)

- It is a whole number, one per type. Every example and every spec draft carries `"specVersion": 1` (a test keeps the examples honest).
- **It goes up only when the type's JSON breaks a file written for the old one**: a field renamed or
  removed, a meaning changed, a rule made stricter. It does **not** go up for an optional field added:
  every old file is still right.
- A file **without** `specVersion` is read as the current generation. Writing it is advised: it is how
  the engine can recognise an old file after a break.
- The engine reports (`antu_validate` and the render step both go through `validateSpec`):
  - `specVersion` not a whole number ≥ 1: an error;
  - **newer** than the engine knows for that type: an error (the engine cannot know what the fields mean);
  - older than the engine knows: today there is no older generation. The day there is one, the changelog
    entry says how to bring a file over, and the engine points at it.
- A break to a type's format is always a **minor** release while the engine is at 0.x, and a **major**
  one from 1.0.

## Managing a type (the JSON spec)

A type owns the JSON format; a change to it reaches every diagram of the type. What is said above about the
format generation holds; this adds how a change is recorded and how a field comes and goes.

- **The record of changes.** Each type has `spec/<type>/changes.md`. A change to the format is an entry in it: the
  generation, the field, what changed (added, deprecated, changed in meaning, removed) and, if a file has to
  change, how. The changelog of the release names the change in one line and points to the record. A test requires a
  section for the generation the type is at.
- **The life of a field.** A new field is added without raising the generation. A field that is to go is first
  *deprecated*: it is still read for at least one release, the checker answers with a hint (never an error) that names
  what takes its place, and the record says so. Removing a field, or changing what it means, raises the generation.
- **An older file.** A file of an earlier generation is read as it is when the engine still can, with a hint; when it
  cannot, the error says what to change. The record has a note on how to bring a file over from each generation.
  There is no tool for it yet.
- **A whole type.** A new type enters as a draft (the status words of a design document). A type is retired only
  after it has been marked deprecated for at least one release, and with the maintainer's approval.

## The diagrams

A diagram is one way of drawing the JSON of a type: its name is the pair of the type and the way (`fact/scale`,
`relationship/equity`), and the way is the value of `kind` on the command line and in the MCP tools. A diagram owns
how the picture is drawn; it does not touch the format. The list of diagrams is `diagrams` in the knowledge of each
type, with the same names as its `layouts`; a type cannot be registered when the two differ. Each entry has:

- **`version`**, a whole number from 1. It goes up when the picture changes in a way a reader would notice: the
  layout, the order of reading, what is shown by default. A small fix (a spacing, a label that was misplaced) does not
  raise it and is only a line of the changelog. The changelog names the diagram a line is about.
- **`status`**: `experimental` (new, or not yet settled), `stable` or `deprecated`. A new diagram starts as
  `experimental`; only the maintainer writes `stable`, as with `confirmed` for a design document.
- **`since`**, the release it came in.

**Removing a diagram.** It is first marked `deprecated` and stays for at least one release. After that, `--kind` and the
MCP `kind` answer a removed name with an error that names the diagram to use instead, and do not fall back to the
default (this error is written when the first diagram is removed). A page already made is one file and is not touched.

**Polishing.** Each diagram is worked on through an issue of its own, with a list to go through: the quality of the
layout, the size of the text, the three themes, printing, the examples and the guide for agents, the tests. Adding a
diagram is an addition, so a minor release while the engine is at 0.x.

The list of all types and diagrams with their versions is `spec/versions.md`. It is written from the registry by
`node tools/gen/versions.mjs` and a test fails when it is out of date, so it is not edited by hand. The command line
(`antu versions`, with `--json`) and the MCP server (`antu_versions`) tell the same list.

The page does not yet say which version of a diagram drew it; that is open in #131.

## How a release is made

1. Changes land on `main` through pull requests; each says whether it touches the contract. The release
   pull request says **which number it takes and why**, and the maintainer confirms the number before the
   release is run (the first release with a licence was numbered 0.6.0 without that, and renumbered 0.5.1).
2. Anything that breaks the contract also raises the type's `specVersion` (in `schema.js`, with a line in
   the changelog on how to migrate).
3. A small pull request of its own for the release: `version` in `package.json` (and `package-lock.json`),
   the new section of `CHANGELOG.md`, and the agent skill rebuilt with `npm run build:skill` (see below).
   The same pull request reads the status line of each design document against the code and writes the new
   release number in "checked against" (see "The status of a design document").
4. After it merges, run the **Release** workflow (Actions tab → Run workflow; the default is the latest commit of
   `main`). It reads `version` from that commit's `package.json`, refuses if the commit is not on `main`, if the tag
   already exists, or if `CHANGELOG.md` has no section for the version, and then creates the tag `vX.Y.Z` and a
   GitHub release whose notes are that section, with the skill attached as `antu-skill-X.Y.Z.zip`. It also refuses if
   a check on the commit is red or has not finished (so wait for CI after the merge), if `skills/antu/` is not what
   a build of that version writes, or if the packed zip, unpacked into an empty folder, fails the skill's own checks
   (`tools/verify/skill-cli.mjs --skill`). Nothing is released from a branch, and nothing is tagged by hand.

5. The npm package `@zh-xx/antu` and its entry in the MCP registry are published for a version that is already
   released, by the **Publish npm** workflow (Actions tab → Run workflow), which is separate from the Release one. It
   refuses if the commit is not on `main`, if the tag `vX.Y.Z` is not on that very commit, or if a check is red; it
   builds the package and tests it packed (`tools/verify/npm-pack.mjs`) and shows what would be published. **A dry
   run is the default**: publishing to npm cannot be taken back, so a real publish is a choice made on purpose, and
   it waits for the maintainer's approval of the `npm` environment. The package, `server.json` and the skill carry
   the one version of `package.json` (`test/npm-package.test.mjs`). The first version of the package cannot use
   the workflow's identity, because npm cannot name this workflow as a trusted publisher of a package that does not
   exist yet: it is published by hand by the maintainer, or by the same workflow with `use_token` on and a short-lived
   token kept as a secret of the `npm` environment (deleted afterwards). Every later version is published without a
   token. The setup is written at the top of `.github/workflows/publish-npm.yml`.

## The agent skill (`skills/antu/`)

The skill is what an agent is given to draw with Antu when it has no MCP server: a `SKILL.md` (how to choose a
diagram, how to write the JSON honestly, how to make the page), the guide and field table of each kind,
examples, a viewer page (the engine with a place for the data), a Python script that fills it, and a command
line (`scripts/antu.mjs`: validate, layout, render, preview; one bundled file, Node 18+). It is the
folder the skill installers of Claude Code, Codex and others read, and it is also attached to each release as
a zip for clients that import a local package (WorkBuddy).

- **It is generated, never edited**: `npm run build:skill` writes it from `spec/agent/`, each kind's field
  table, `examples/agent/`, `package.json`'s version, and the two authored files in `tools/skill/`.
  A file that a change adds to the skill's sources is listed in `ADDED_SINCE_RELEASE` (`tools/build-skill.mjs`), and one it drops in `REMOVED_SINCE_RELEASE`: the unit test lets the folder lack the one and keep the other until the release, the release workflow's check does not, and the release pull request empties both lists.
- **It is the state of the last release.** It is rebuilt in the release pull request, not in every change, so
  someone who installs it from the repository never gets guides that are newer than the viewer beside them.
  Between releases it lags `main` on purpose. A test keeps it complete and stamped with the version in
  `package.json`; the release workflow checks that it equals a build.
- **Its version is the engine's version.** The viewer and every page made from it carry
  `<meta name="generator" content="antu X.Y.Z">`, so anyone can tell which engine drew a forwarded page.
- The viewer (2 MB, 0.6 MB in git) and the command line (1.5 MB, 0.5 MB in git) are committed once per release.
  Neither is compared byte for byte: the viewer must carry the marker and the version, the command line must run
  and say `antu X.Y.Z`. The command line promises Node 18 or newer and nothing installed beside it; CI holds it to
  that (`tools/verify/skill-cli.mjs`, run on Node 18, 20, 22 and 24 with no `npm ci`). It runs on two copies: the
  committed folder (the last release) and a build of the pull request's own commit (`node tools/build-skill.mjs --out
  DIR`), so a change to the command line is tested before it is released, `preview` with a real browser included.
