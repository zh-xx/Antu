# `@zh-xx/antu-dsh`

Antu · Legal Diagrams inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): Host tools and an interactive chat card that turn case JSON into a self-contained offline HTML diagram (~2.3 MB, no server).

Same version number as [`@zh-xx/antu`](https://www.npmjs.com/package/@zh-xx/antu). Licence: [AGPL-3.0-or-later](https://github.com/zh-xx/Antu/blob/main/LICENSE).

Product overview (Chinese landing page for Discover / LexCab): https://github.com/zh-xx/Antu/tree/main/tools/dsh · Demo: https://zh-xx.github.io/Antu/

## Install

```bash
dsh plugin --profile <name> add @zh-xx/antu-dsh
```

Or install from [LexCab](https://lexcab.nervonly.cn/) in Discover (“案图 · 诉讼可视化”).

**Needs DeepSeek Harness ≥ 0.2.0-rc.2** for the chat card (package-local async chunks). On older 0.1.x hosts the Host tools still load; the card shows an upgrade message instead of crashing.

## What you get

| Piece | Role |
| --- | --- |
| Host tools | `antu_validate`, `antu_layout`, `antu_render` |
| Reference tools | `antu_schema`, `antu_guide`, `antu_examples` |
| Skill | `antu-diagram` |
| Chat card | Fitted diagram after `antu_render`; open the fullscreen view for kind/theme and export |

Ask the agent to draw a fact timeline, procedure flow, or relationship diagram. The card appears in the chat; open the full view when you need detail. UI language follows DSH (`zh` / `en`); diagram content is not translated.

## Status (0.x)

Fact and procedure diagrams are usable day to day. Relationship and justification schemas are still drafts; **justification is not under active development**.

## Source

- Repository: https://github.com/zh-xx/Antu  
- Plugin path: https://github.com/zh-xx/Antu/tree/main/tools/dsh  
- Design / conventions: https://github.com/zh-xx/Antu/blob/main/spec/dsh-plugin.md · https://github.com/zh-xx/Antu/blob/main/spec/dsh-conventions.md  
