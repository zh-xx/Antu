# Notes for contributors

## Issues

Known problems and wanted changes are managed in [GitHub issues](https://github.com/zh-xx/Antu/issues).
An issue says four things: **what happens / what it costs / where / what to do about it**; reproduction steps and
measured numbers help.
Write `Closes #N` in the pull request description (one line per issue): when the pull request is merged the issue is
closed with it (#77 closed #69 and #71 this way). Earlier pull requests did not always close their issues and the
reason was not found, so after a merge look at the issue, and if it is still open close it by hand with a comment
naming the pull request.

## Before you commit

```bash
npm run lint         # static checks
npm run typecheck    # public .d.ts + generated Specs + embed/shell/theme/App checkJs (issues 294, 227)
npm test             # unit tests
npm run verify:fast  # checks that need no browser
npm run verify       # with browser rendering and the whole MCP run
```

`src/types/antu-specs.d.ts` is generated (`node tools/gen/spec-types.mjs`); do not edit it by hand. A stale
file fails `npm test`; a syntactically broken one fails `npm run typecheck`.

`tools/api/validate.d.ts`, `tools/api/html.d.ts` and `src/embed/antu-embed.d.ts` are generated from
implementation JSDoc (`node tools/gen/api-dts.mjs`); do not edit them by hand. A stale file fails `npm test`.
For embed, edit `src/embed/hostTypes.js` (the host types) or the entry's JSDoc, then run the generator.

## TypeScript (gradual, issue #227)

**Goal:** catch wrong field names and closed enums while editing, without a rewrite.

**Coexistence (current rule):** keep source as `.js` / `.mjs` / `.jsx`. Prefer **JSDoc types** (+ later `checkJs`)
over renaming files to `.ts`. Reasons: `node --test` must stay runnable on Node 18/20, and the DSH plugin
build inlines `.mjs` as text. New host-facing options on **embed** belong in `src/embed/hostTypes.js`
or the entry's JSDoc; run `node tools/gen/api-dts.mjs` to refresh `src/embed/antu-embed.d.ts` (or let the
test remind you). For **validate** / **html**, update the JSDoc on `tools/api/validate.mjs` / `html.mjs`
and run the same generator.

**What `npm run typecheck` covers today:**

- Generated diagram Specs (`@zh-xx/antu/types`) and their smoke negatives
- Public API declarations for embed / validate / html (`tools/typecheck/api-smoke.ts` — a bad `mount`
  theme or unknown option must fail)
- `// @ts-check` on `src/embed` plain JS (`cardUi`, `kinds`, `index`, `mount`, `shadowCss`) via
  `tsconfig.embed.json` — edits there are checked without renaming to `.ts`
- `// @ts-check` on the embed entry (`src/embed/core.jsx`), the shell modules it imports directly
  (`src/shell/env.js`, `src/shell/viewState.js`), and the providers it wraps (`src/shell/LangContext.jsx`,
  `src/theme/ThemeContext.jsx`), also via `tsconfig.embed.json`; `ThemeProvider` props are JSDoc-typed
  optional, so a `core.jsx` call with only `initialTheme` checks
- `// @ts-check` on the app shell `src/App.jsx` (Refs #227, does not close): App props are JSDoc-typed
  (`spec`, `kind`, `kinds`) and so are `DiagramHeader`'s; `import.meta.env.DEV` is declared in
  `tools/typecheck/embed-shims.d.ts` rather than pulling `vite/client`, and the two components that take a
  JSX `key` are cast once (this project has no `@types/react`)
- `// @ts-check` on the remaining small shell/theme deps (Refs #227, does not close): `src/shell/prefs.js`,
  `src/shell/printHost.js`, `src/shell/printPaper.js`, `src/shell/ErrorBoundary.jsx`, `src/theme/themes.js`
  and `src/theme/themeTokens.js` join `tsconfig.embed.json`; the two empty-record accumulators are JSDoc-typed,
  the print promises resolve explicitly, and `ErrorBoundary` reads `this.props` / `this.state` through one
  `any` cast rather than adding `@types/react`
- `// @ts-check` on the remaining small shell helpers (Refs #227, does not close): `src/shell/hostAttrs.js`,
  `DockParts.jsx`, `useSelectEvent.js`, `chromeInsets.js`, `dockPlace.js`, `useExport.js`, `startupError.js`
  and `exportPng.js` join `tsconfig.embed.json`; the shadow-root host is read through one `any` cast, the
  dock's minimap width is narrowed to a local, the unknown catch is formatted with `instanceof Error`, and
  the PNG export's async return and null 2D context are explicit (still no `@types/react`)
- `// @ts-check` on the last shell panels `src/shell/Canvas.jsx` and `src/shell/TracePanel.jsx`
  (Refs #227, does not close): both join `tsconfig.embed.json`; the two `exportPng` callbacks
  take JSDoc option objects, `placeDock`'s options are typed (`minimapWidth` is intentionally
  `number | null`), and the one JSX `key` is cast once rather than adding `@types/react`
- `// @ts-check` on the first renderer slice (Refs #227, does not close): the registry entry
  `src/renderers/index.js`, `components.js`, the four `*/schema.js` files and the fact plain helpers
  `fact/cardGeometry.js`, `fact/partyNotes.js`, `fact/dateOrder.js`, `fact/dateText.js` join
  `tsconfig.embed.json`; `dateSpan` guards its missing year, `formatEnd`'s missing clock text is
  defaulted, and the four `translate` calls pass `undefined` for `vars`. Kind-specific renderer trees
  and the relationship helpers stay out of this slice
- `// @ts-check` on the relationship shared helpers (Refs #227, does not close): `relationship/pill.js`,
  `scope.js`, `useSpecPref.js`, `layered.js`, `partyData.js` and `sections.js` join
  `tsconfig.embed.json`; `layered`'s informal JSDoc return shapes become object types, its depth-first
  top is guarded, and the label-placement rectangle takes a coordinate array. The kind-specific
  relationship trees stay out of this slice
- `// @ts-check` on the fact kind tree (Refs #227, does not close): every remaining file under
  `src/renderers/fact/` joins `tsconfig.embed.json` — the shared `ControlDock.jsx`, `EventNode.jsx`,
  `EventPreview.jsx` and the `timeline/`, `chronicle/` and `scale/` trees. `DockSegmented`'s `title`
  and `Canvas`'s `fitKey` / `style` are optional, the chronicle / scale layout options take `measure`,
  and the scale's segment, mark and node accumulators are typed loosely instead of forcing one payload
  shape. The procedure, relationship and justification kind trees stay out of this slice
- `// @ts-check` on the procedure kind tree (Refs #227, does not close): every file under
  `src/renderers/procedure/flow/` and `route/` joins `tsconfig.embed.json` — the flowchart, the route
  map, and their shared layout, router and polish helpers. Informal JSDoc return and box shapes become
  object types, nullable layout results and `Map.get` lookups are guarded, the layout accumulators and
  rule-table groups are typed loosely, and `Canvas`'s node handlers are optional so the route map need
  not pass no-ops. The relationship and justification kind trees stay out of this slice
- `// @ts-check` on the relationship kind tree (Refs #227, does not close): every remaining file under
  `src/renderers/relationship/` joins `tsconfig.embed.json` — the shared `CompanyView.jsx`,
  `LevelledView.jsx`, `LineLayerNode.jsx`, and the `graph/`, `focus/`, `matrix/`, `equity/`,
  `authority/`, `related/` and `path/` trees. Informal JSDoc return shapes become object types,
  nullable `Map.get` lookups and layout results are guarded, the layout accumulators are typed
  loosely, `FocusDock`'s kind/centre handlers are optional, and `LevelledView`'s props are JSDoc-typed
  so a caller can pass only a dock addition. The justification kind tree stays out of this slice
- `// @ts-check` on the justification kind tree (Refs #227, does not close): every remaining file under
  `src/renderers/justification/tree/` joins `tsconfig.embed.json`; `metrics`'s `codePointAt` read is
  guarded the same way as the relationship graph metrics. Renderer kind trees under `src/renderers/`
  are now covered

**Public `.d.ts`:** `tools/api/validate.d.ts`, `html.d.ts` and `src/embed/antu-embed.d.ts` are generated
from implementation JSDoc (`node tools/gen/api-dts.mjs`, `--check` in tests). Spec shapes are generated
(`src/types/antu-specs.d.ts`). Embed's host types live in `src/embed/hostTypes.js`; its entry JSDoc fills
in the function signatures. All three stay checked by `tools/typecheck/api-smoke.ts` and by the
export-name parity test in `test/embed.test.mjs`.

**`@types/react` (deferred):** not installed. JSX `key` is cast once where needed (`App.jsx`,
`TracePanel.jsx`). A probe that adds `@types/react@19` on top of the current `tsconfig.embed.json`
set fails with on the order of **270** errors (mostly React Flow refs typed as `never`, context
defaults, and call-signature mismatches). Next slice is that probe. Do not weaken
runtime `validate()` or existing tests for the sake of types.

`verify` needs a Chromium-based browser; if it is not found, point the environment variable `ANTU_CHROME` at it
(details in `spec/mcp-server.md`, "where the browser comes from").

Make a branch, open a pull request and let CI run; do not commit to `main` directly.

## House rules

Each of these has cost the project two or three times.

0. **A diagram's colours come from `src/theme/`, not from the view that draws it.** A colour written in a view or in the stylesheet does not follow the theme, so the document theme would not be black and white. `test/theme-lock.test.mjs` fails when one is written (the shell's dot grid and the export's white paper are the only exceptions); `tools/verify` fails when the document theme draws a colour. A new meaning gets a role in every theme, drawn in black and white too (see `spec/theme.md`).

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
