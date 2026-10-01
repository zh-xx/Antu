# Versioning

Two things carry a version, and they are kept apart on purpose.

| | What it is | Where it lives | Form |
| --- | --- | --- | --- |
| **The release** | the engine and its tools (renderers, MCP server, command line) as a whole | `package.json` (written once; the MCP server reads it from there) | `major.minor.patch`, [SemVer](https://semver.org) |
| **The format generation** | the JSON format of one diagram type (`fact`, `procedure`, `relationship`, `justification`) | the type's knowledge (`specVersion` in `src/renderers/<type>/schema.js`); a data file may state it as `"specVersion"` in its envelope | one whole number per type, starting at 1 |

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

## What is the contract

| Part of the contract (breaking it needs a new version) | Not part of it (may change in any release) |
| --- | --- |
| the field names, meanings and required-ness of each type's JSON | how a diagram is laid out: where nodes stand, how lines run, sizes |
| which data is an error, and which rule reports it | look: colours, fonts, the interface |
| the names and parameters of the MCP tools (`antu_validate` …) | the wording of hints and messages |
| the subcommands and options of the command line (once there is one) | the internal structure of the code |

**A rule made stricter is a break; a rule made looser is not.** A file that passed must not fail because
the engine was updated. (A new *hint* is not a break: a hint never stops a diagram.)

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

## How a release is made

1. Changes land on `main` through pull requests; each says whether it touches the contract. The release
   pull request says **which number it takes and why**, and the maintainer confirms the number before the
   release is run (the first release with a licence was numbered 0.6.0 without that, and renumbered 0.5.1).
2. Anything that breaks the contract also raises the type's `specVersion` (in `schema.js`, with a line in
   the changelog on how to migrate).
3. A small pull request of its own for the release: `version` in `package.json` (and `package-lock.json`),
   the new section of `CHANGELOG.md`, and the agent skill rebuilt with `npm run build:skill` (see below).
4. After it merges, run the **Release** workflow (Actions tab → Run workflow; the default is the latest commit of
   `main`). It reads `version` from that commit's `package.json`, refuses if the commit is not on `main`, if the tag
   already exists, or if `CHANGELOG.md` has no section for the version, and then creates the tag `vX.Y.Z` and a
   GitHub release whose notes are that section, with the skill attached as `antu-skill-X.Y.Z.zip`. It also refuses if
   a check on the commit is red or has not finished (so wait for CI after the merge), if `skills/antu/` is not what
   a build of that version writes, or if the packed zip, unpacked into an empty folder, fails the skill's own checks
   (`tools/verify/skill-cli.mjs --skill`). Nothing is released from a branch, and nothing is tagged by hand.

## The agent skill (`skills/antu/`)

The skill is what an agent is given to draw with antu when it has no MCP server: a `SKILL.md` (how to choose a
diagram, how to write the JSON honestly, how to make the page), the guide and field table of each kind,
examples, a viewer page (the engine with a place for the data), a Python script that fills it, and a command
line (`scripts/antu.mjs`: validate, layout, render; one bundled file, Node 18+). It is the
folder the skill installers of Claude Code, Codex and others read, and it is also attached to each release as
a zip for clients that import a local package (WorkBuddy).

- **It is generated, never edited**: `npm run build:skill` writes it from `spec/agent/`, each kind's field
  table, `examples/agent/`, `package.json`'s version, and the two authored files in `tools/skill/`.
- **It is the state of the last release.** It is rebuilt in the release pull request, not in every change, so
  someone who installs it from the repository never gets guides that are newer than the viewer beside them.
  Between releases it lags `main` on purpose. A test keeps it complete and stamped with the version in
  `package.json`; the release workflow checks that it equals a build.
- **Its version is the engine's version.** The viewer and every page made from it carry
  `<meta name="generator" content="antu X.Y.Z">`, so anyone can tell which engine drew a forwarded page.
- The viewer (2 MB, 0.6 MB in git) and the command line (1.5 MB, 0.5 MB in git) are committed once per release.
  Neither is compared byte for byte: the viewer must carry the marker and the version, the command line must run
  and say `antu X.Y.Z`. The command line promises Node 18 or newer and nothing installed beside it; CI holds it to
  that (`tools/verify/skill-cli.mjs`, run on Node 18, 20, 22 and 24 with no `npm ci`).
