# Antu · Legal Diagrams

## Goal
Turn structured JSON into self-contained offline HTML legal diagrams (fact / procedure / relation / justification) for AI agents (MCP, CLI, skill) and legal practitioners. Demo: https://antu.nervonly.cn/

Display names: full **Antu · Legal Diagrams** / **案图 · 诉讼可视化**; short **Antu** / **案图**. Machine ids (`antu`, `@zh-xx/antu`, `antu_*`) stay as they are — see CONTRIBUTING.md.

## Authority
- Code: https://github.com/zh-xx/Antu (default branch: main)
- npm: @zh-xx/antu ; DSH plugin: @zh-xx/antu-dsh
- Secrets: never commit to the repo
- Deeper docs: README.md, CLAUDE.md, spec/

## How to run
- Node ≥ 18; npm install
- Draw: npm run diagram -- examples/fact/neighbour-corridor-charging.zh-CN.json
- MCP: npx -y -p @zh-xx/antu@latest antu-mcp
- Skill: npx skills add zh-xx/Antu -g
- License: AGPL-3.0-or-later (diagram data in generated pages has additional terms; see README)

## Current status
- **0.x.** Fact and procedure formats are the most settled (procedure schema is confirmed v1.1); relationship is provisional; justification is **experimental and on hold**. Ways of drawing are still marked `experimental` in the registry until the maintainer promotes them (About panel / `antu versions`).
- Gradual TypeScript / `npm run typecheck` for write-time checks is in place (closed #227); source stays JS/JSX.
- Prefer these documented unfinished surfaces over inventing work or reopening parked issues only when the maintainer names one; parked for now: justification evidence layer and guide (#38, #51), fact quote-per-source model (#161), “layout like water” (#190).

## Do not
- Commit secrets to the repo
- Break the boundary: the engine does not write JSON; agents do not draw diagrams
- File public vulnerability issues—use the private process in SECURITY.md (or SECURITY.zh-CN.md if that is the repo's security doc)
