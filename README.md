# Antu 案图

[![Verify](https://github.com/zh-xx/Antu/actions/workflows/verify.yml/badge.svg)](https://github.com/zh-xx/Antu/actions/workflows/verify.yml)
[![CodeQL](https://github.com/zh-xx/Antu/actions/workflows/codeql.yml/badge.svg)](https://github.com/zh-xx/Antu/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/zh-xx/Antu/badge)](https://scorecard.dev/viewer/?uri=github.com/zh-xx/Antu)
[![Release](https://img.shields.io/github/v/release/zh-xx/Antu)](https://github.com/zh-xx/Antu/releases)
[![npm](https://img.shields.io/npm/v/@zh-xx/antu?label=npm)](https://www.npmjs.com/package/@zh-xx/antu)
[![License: AGPL-3.0-or-later](https://img.shields.io/github/license/zh-xx/Antu)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933)](package.json)
[![Status: 0.x](https://img.shields.io/badge/status-0.x%20draft-orange)](CHANGELOG.md)
[![Demo](https://img.shields.io/badge/demo-online-blue)](https://zh-xx.github.io/Antu/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)

[中文](README.zh-CN.md) | **English**

Antu turns one JSON document into one self-contained HTML legal diagram. The page is one file of about 2.3 MB that makes no network request and needs no server; it opens offline and can be archived,
printed or sent as an attachment. An AI Agent can read the case materials and write the JSON; the engine then draws the
diagram from it, and the same JSON gives the same diagram. Antu is at version 0.x, and the formats of the relationship
and justification diagrams are still drafts.

## Diagram Types

Four types of legal content, each drawn in several ways. A selector in the page switches between the ways; nothing in the JSON chooses one.

<table>
<tr><th rowspan="2" align="left" valign="middle">Relationship</th><td align="center"><a href="examples/relationship/marketplace-parties.en.json"><img src="assets/kinds/graph.svg" width="88" alt="graph"><br>graph</a></td><td align="center"><a href="examples/relationship/marketplace-parties.en.json"><img src="assets/kinds/focus.svg" width="88" alt="focus view"><br>focus view</a></td><td align="center"><a href="examples/relationship/marketplace-parties.en.json"><img src="assets/kinds/matrix.svg" width="88" alt="relation matrix"><br>relation matrix</a></td><td align="center"><a href="examples/relationship/marketplace-parties.en.json"><img src="assets/kinds/equity.svg" width="88" alt="equity tree"><br>equity tree</a></td></tr>
<tr><td align="center"><a href="examples/relationship/marketplace-parties.en.json"><img src="assets/kinds/authority.svg" width="88" alt="authority chart"><br>authority chart</a></td><td align="center"><a href="examples/relationship/marketplace-parties.en.json"><img src="assets/kinds/related.svg" width="88" alt="related-party list"><br>related-party list</a></td><td align="center"><a href="examples/relationship/marketplace-parties.en.json"><img src="assets/kinds/path.svg" width="88" alt="relation path"><br>relation path</a></td></tr>
<tr><th rowspan="1" align="left" valign="middle">Fact</th><td align="center"><a href="examples/fact/neighbour-corridor-charging.en.json"><img src="assets/kinds/timeline.svg" width="88" alt="timeline"><br>timeline</a></td><td align="center"><a href="examples/fact/neighbour-corridor-charging.en.json"><img src="assets/kinds/chronicle.svg" width="88" alt="chronicle"><br>chronicle</a></td><td align="center"><a href="examples/fact/neighbour-corridor-charging.en.json"><img src="assets/kinds/scale.svg" width="88" alt="time scale"><br>time scale</a></td></tr>
<tr><th rowspan="1" align="left" valign="middle">Procedure</th><td align="center"><a href="examples/procedure/05-premises-lease.en.json"><img src="assets/kinds/flow.svg" width="88" alt="flowchart"><br>flowchart</a></td><td align="center"><a href="examples/procedure/05-premises-lease.en.json"><img src="assets/kinds/route.svg" width="88" alt="route map"><br>route map</a></td></tr>
<tr><th rowspan="1" align="left" valign="middle">Justification</th><td align="center"><a href="examples/justification/fang-yuan-defense-excess.en.json"><img src="assets/kinds/tree.svg" width="88" alt="reasoning tree"><br>reasoning tree</a></td></tr>
</table>

Relationship diagrams (seven ways of drawing the same JSON) show parties, roles and legal relationships; fact diagrams the time, the participants and how events went;
procedure diagrams a procedural path and its branches; justification diagrams a conclusion drawn from norms and facts. The
relationship and justification schemas are still drafts.

Four looks, called **themes**: `document` (black and white and square, for print and filing; the default), `modern`
(rounded, pale), `legal` (navy) and `dark` (the modern look on a dark ground, for a dark host). The reader switches in
the page, or a call fixes a page to one. Only the diagram is themed; `dark` also darkens the shell round it. See
[spec/theme.md](spec/theme.md).

## Usage

```bash
npm install
npm run diagram -- examples/fact/neighbour-corridor-charging.en.json
```

The page is written beside the JSON file. The interface language of a page is set with `?lang=en` or `?lang=zh`; the case content is never translated.

## Principle

```
Agent ──> key information ──> one JSON ──> engine ──> diagram
```

| Role | Does | Determinism |
|---|---|---|
| Model | reads documents, extracts facts, understands meaning | the result may differ from run to run |
| Engine | draws the diagram according to the specification | the same JSON gives the same diagram, whichever model wrote it |
| JSON specification | the only interface between the two | versioned (see [spec/versioning.md](spec/versioning.md)) |


The engine does not write JSON, and the Agent does not draw. The model puts information into JSON; the engine draws. The JSON specification is a specification of its own, for four reasons:

1. General-purpose charting syntax is built on nodes, edges and state machines, and has no place for procedural standing or the source of a piece of evidence.
2. The diagram does not depend on which model extracted the information.
3. The same JSON gives the same diagram at any time and in any environment, so a diagram handed to a court or to the other side can be reproduced.
4. The source is recorded when the facts are extracted: each fact states the document, the page and the provision it rests on, and the diagram shows them. The materials themselves are neither bundled nor linked.

## Agent Integration

The reference material for an Agent, for the fact diagram, is a field table of about 3.4k characters and a mechanism note of about 6.3k characters.

### Skill

```
npx skills add zh-xx/Antu -g
```

The Skill is in [`skills/antu/`](skills/antu/); each [release](https://github.com/zh-xx/Antu/releases) also carries it as `antu-skill-<version>.zip`.

The command line asks the npm registry once a day whether a newer Antu is out (one GET request, nothing of any diagram) and, if so, ends its output with a notice. `ANTU_NO_UPDATE_NOTIFIER=1` turns it off.

### MCP

The MCP server is the npm package [`@zh-xx/antu`](https://www.npmjs.com/package/@zh-xx/antu), registered as `io.github.zh-xx/antu` in the [MCP registry](https://registry.modelcontextprotocol.io).

```json
{
  "mcpServers": {
    "antu": {
      "command": "npx",
      "args": ["-y", "-p", "@zh-xx/antu@latest", "antu-mcp"]
    }
  }
}
```

Tools: `antu_schema`, `antu_guide`, `antu_examples`, `antu_validate`, `antu_layout`, `antu_render`, `antu_preview`, `antu_versions`.

### DeepSeek Harness (DSH)

A native DSH plugin, [`@zh-xx/antu-dsh`](https://www.npmjs.com/package/@zh-xx/antu-dsh) (Host tools + a chat card with a picker of the way of drawing), is on npm: `dsh plugin --profile <name> add @zh-xx/antu-dsh`, then restart DSH. It needs DSH 0.2.0-rc.2 or newer. How it works and how it is tested: [spec/dsh-plugin.md](spec/dsh-plugin.md) and [tools/dsh/README.md](tools/dsh/README.md). A profile that cannot use the plugin can still attach `antu-mcp` with a configuration-only bundle; the recipe and its limits are in [tools/dsh/README.md](tools/dsh/README.md).

## In an Application

The same package has three entries for an application's own code ([spec/embed.md](spec/embed.md)):

```js
import { mount } from '@zh-xx/antu/embed'          // draw a diagram inside your page, in a shadow root
import { validate } from '@zh-xx/antu/validate'    // check the JSON your model wrote; each error names its field
import { renderHtml } from '@zh-xx/antu/html'      // the self-contained page as a string (Node)

const diagram = mount(element, spec, { lang: 'en', onEvent: (e) => console.log(e) })
```

## Documentation

- Design documents for people, under [`spec/`](spec/): [architecture](spec/v0-architecture.md), [the source types](spec/source-schema-draft.md), [themes](spec/theme.md), [the MCP server](spec/mcp-server.md), [embedding in an application](spec/embed.md), [the DSH plugin plan](spec/dsh-plugin.md), and the diagrams ([fact](spec/fact/), [procedure](spec/procedure/schema-draft.md), [relationship](spec/relationship/schema-draft.md), [justification](spec/justification/schema-draft.md)). The notes for Agents are under [`spec/agent/`](spec/agent/).
- [CHANGELOG.md](CHANGELOG.md) and the versioning rules in [spec/versioning.md](spec/versioning.md).
- Known problems and requests are tracked as [GitHub issues](https://github.com/zh-xx/Antu/issues). Working rules for contributors are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

- To report a vulnerability, use the private report described in [SECURITY.md](SECURITY.md); please do not open a public issue for it.
- Every version of `@zh-xx/antu` and `@zh-xx/antu-dsh` on npm is published by GitHub Actions through npm's trusted publisher, with provenance: the page of the version on npm links back to the commit and the workflow run that made it. [deps.dev](https://deps.dev/npm/%40zh-xx%2Fantu) shows the same record, with the known advisories (none at the time of writing) and the licence.
- A page made with Antu works offline and sends nothing anywhere; the command line asks once a day whether a newer version exists and sends nothing of a diagram (`ANTU_NO_UPDATE_NOTIFIER=1` turns that off).

## License

Copyright (C) 2026 Ji Cheng.

Antu is free software, licensed under the **GNU Affero General Public License, version 3 or any later version** ([`LICENSE`](LICENSE), SPDX `AGPL-3.0-or-later`). In short: you may use, study, change and share it, including for commercial purposes. If you distribute a changed version, or let others use it over a network (for example as a hosted service), you must release your changes under the same licence, keep the copyright and licence notices, and make the source available. There is no warranty. This summary is not the licence; the licence text is.

- **Additional permission (AGPL section 7).** A page made with Antu contains Antu's code together with the diagram data you gave it. The diagram data, and the content of the diagram you drew from your material, are not part of Antu and are not covered by this licence: you may keep them private, publish them, or sell them on any terms you like. The licence covers Antu's code in the page, and the notices in the page must stay with it. The same text is in every page and at the top of the command line.
- **If your company or an app store does not take AGPL software**, or asks for an extra statement before it will list or install something under it, that is a policy of theirs and not something this project can change by itself. Tell us in an issue what you need; the page and the data you make with Antu are yours (see the additional permission above).
- Everything in the repository (the code, the examples, the specifications and the guides) is under the same licence, except what is named below.
- Code of other projects inside the pages and the command line keeps its own licence. Its notices are in [`skills/antu/THIRD-PARTY-NOTICES.md`](skills/antu/THIRD-PARTY-NOTICES.md), and also inside every page and at the top of the command line, together with the licence of Antu and the place of the source of that version.
- The cases in `examples/` and the judgment texts in `examples/raw/` are fictional: the people, companies, dates, amounts and provisions are made up for Antu and match no real case. They are under the same licence.
- Versions up to 0.5.0 were published without a licence file. The licence applies from 0.5.1.
