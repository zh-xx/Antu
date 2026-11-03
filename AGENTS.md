# Antu

## Goal
Turn structured JSON into self-contained offline HTML legal diagrams (fact / procedure / relation / justification) for AI agents (MCP, CLI, skill) and legal practitioners. Demo: https://antu.nervonly.cn/

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
- Prefer these documented unfinished surfaces over inventing work or reopening parked issues:
  - Embed view-state phase 2 for fact / relationship (#329)
  - `normalize(spec)` beyond procedure (#332)
  - Procedure layout cost caps / yield (#330), without the #190 redesign
  - Doc / verify hygiene (#331 status honesty leftovers, #333–#335)
- Parked for now (do not expand unless the maintainer says so): justification evidence layer and guide (#38, #51), fact quote-per-source model (#161), “layout like water” (#190).

## Do not
- Commit secrets to the repo
- Break the boundary: the engine does not write JSON; agents do not draw diagrams
- File public vulnerability issues—use the private process in SECURITY.md (or SECURITY.zh-CN.md if that is the repo's security doc)
