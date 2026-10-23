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
- Ground in README / CHANGELOG / open issues: 0.x draft; relation and justification diagram schemas are still drafts. Next steps: pick one or two real open issues or documented directions—do not invent progress.

## Do not
- Commit secrets to the repo
- Break the boundary: the engine does not write JSON; agents do not draw diagrams
- File public vulnerability issues—use the private process in SECURITY.md (or SECURITY.zh-CN.md if that is the repo's security doc)
