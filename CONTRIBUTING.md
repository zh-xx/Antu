# Notes for contributors

## Issues

Known problems and wanted changes are managed in [GitHub issues](https://github.com/zh-xx/Antu/issues).
An issue says four things: **what happens / what it costs / where / what to do about it**; reproduction steps and
measured numbers help.
After a pull request is merged, close the issue by hand and leave a comment with the pull request number. Do not rely
on `Closes #N` in the description: in this repository it has not closed the issue on merge (#71).

## Before you commit

```bash
npm run lint         # static checks
npm test             # unit tests
npm run verify:fast  # checks that need no browser
npm run verify       # with browser rendering and the whole MCP run
```

`verify` needs a Chromium-based browser; if it is not found, point the environment variable `ANTU_CHROME` at it
(details in `spec/mcp-server.md`, "where the browser comes from").

Make a branch, open a pull request and let CI run; do not commit to `main` directly.

## House rules

Each of these has cost the project two or three times.

1. **Before adding a style, check whether anyone uses the class name.** `.antu-card` and `.antu-source` have both
   collided, and a clean-up deleted the other side's styles with them. `grep` the class name before adding CSS; when
   cleaning up, ask "who else uses this class", and do not delete a whole family by name.
2. **Dead-code checks go both ways.** Checking only "a style is defined but no component uses it" misses "a component
   uses a class that has no style".
3. **Look at the picture after a change: right content is not the same as right look.** The fit-view button stopped
   working, a deleted style pushed an overlay into a corner, an arrow pointed the wrong way, and every validation
   and DOM-count assertion passed; only a screenshot showed it. The verifier must **assert positions** (what is in
   which corner, what is centred).
4. **A registration that happens through `import` needs an assertion that can fail.** Registering knowledge is a side
   effect; forget `import '…/renderers/index.js'` and `validateSpec` finds nothing and returns "passed", so bad data
   gets through.
5. **Do not edit code with string replacements that fail silently.** When nothing matches they skip without an error,
   so you think you changed it and did not. Use an editing method that errors, or assert the number of matches after
   the replacement.
6. **A build tool must not "build only if missing".** The engine output is judged stale by the modification time of
   the sources, and `--rebuild` forces a rebuild; otherwise after a source change the tool produces the old engine
   without an error and nobody sees it.
7. **Do not copy the same thing by hand in two places.** The field table for agents is generated from the field
   definitions in the code, and an assertion guards that "removing a field marked required must make the validator
   report an error"; written in two places, rules sooner or later disagree.
8. **Flip a new assertion to check that it really fails.** A checker that always passes is worse than none.

## Versions and releases

The rules are in [spec/versioning.md](spec/versioning.md), the record of changes in [CHANGELOG.md](CHANGELOG.md). In short:

- The release number is written in one place, `package.json` (the MCP server reads it from there), and follows
  semantic versioning; the project is in the 0.x stage.
- The JSON format of each diagram type has its own `specVersion` (a whole number, in that type's `schema.js`).
  **It goes up only for a breaking change**: a rename, a removed field, a changed meaning, a stricter rule. An
  optional field added does not count, and neither does a rule made looser.
- A pull request says whether it touches the "contract" (fields, the rules that report errors, the parameters of the
  MCP tools). One that breaks the contract also changes `specVersion` and the *Breaking* part of the CHANGELOG.
- A release is a small pull request of its own (`package.json`, `package-lock.json`, a new CHANGELOG section, and
  `skills/antu/` rebuilt with `npm run build:skill`). It says which number it takes and why, and the maintainer
  confirms the number. After it merges, run the Release workflow on the Actions page
  (`.github/workflows/release.yml`); it creates the tag `vX.Y.Z` and the release from the version in `package.json`,
  with the notes taken from the CHANGELOG section of that version. Do not tag by hand.

## Directories

- `spec/`: design documents for people (mostly English, with `.zh-CN.md` counterparts); `spec/agent/`: notes for
  agents, English only.
- `skills/antu/`: the skill for agents, **generated, do not edit by hand** (`npm run build:skill`; the only hand-written
  parts are the two files under `tools/skill/`); it is the state of the last release and is rebuilt only in a release
  pull request.
- `examples/`: `agent/<type>/` holds the smallest examples for agents, `<type>/` the full cases (all fictional); see
  `examples/README.md`.
- `src/renderers/<type>/schema.js`: the knowledge this type exposes (validation, field table, geometry report); the MCP
  server dispatches by `type` only.

## Licence of contributions

Antu is licensed under the GNU AGPL, version 3 or any later version (`LICENSE`). A contribution is accepted under the same licence, with the additional permission stated in the README (the diagram data in a page is not covered); there is no separate agreement to sign. Code you copy in from another project must have a licence that can be combined with the AGPL, and its notice must be added (the notices of what is bundled are generated by `tools/lib/notices.mjs`).
