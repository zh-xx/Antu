# Antu 案图

[![Verify](https://github.com/zh-xx/Antu/actions/workflows/verify.yml/badge.svg)](https://github.com/zh-xx/Antu/actions/workflows/verify.yml)

[中文](README.zh-CN.md) | **English**

Turn one JSON document into one self-contained HTML legal diagram: it opens offline and can be archived, printed or
sent as an attachment. An AI agent reads the case materials and writes the JSON; a fixed engine draws the picture, so the same
JSON gives the same diagram every time, with the source of every point on it.

## What you get

Four kinds of legal content, each drawn in several ways. A picker in the page switches between the ways, and nothing in
the JSON chooses one.

| Diagram | What it shows | Ways of drawing it |
|---|---|---|
| Relationship | parties, roles, legal relationships | graph, focus, guarantee chain, matrix, equity tree, authority chart, related-party list, relation path, camp summary (schema provisional) |
| Fact | time, participants, how events went | timeline, chronicle, time scale |
| Procedure | the procedural path and its branches | flowchart, route map |
| Justification | a conclusion drawn from norms and facts | reasoning tree (schema draft) |

Three looks, called **themes**: `document` (black and white and square, for print and filing; the default), `modern`
(rounded, pale) and `legal` (navy). The reader switches in the page, or a call fixes a page to one. Only the diagram is
themed. See [spec/theme.md](spec/theme.md).

## Try it

```bash
npm install
npm run diagram -- examples/fact/neighbour-corridor-charging.en.json
# → examples/fact/neighbour-corridor-charging.en.html   (open it in a browser)
```

To let an agent do it, see [Use it with an agent](#use-it-with-an-agent) below.

Add `?lang=en` or `?lang=zh` to a generated page to pin the interface language. The data itself is never translated: case
content travels with the JSON.

## How it works

```
agent ──> extract key information ──> one JSON ──> engine ──> diagram
```

| Role | Does | Determinism |
|---|---|---|
| Model | reads documents, extracts facts, understands meaning | may vary |
| Engine | draws the diagram per the specification | fully deterministic, independent of the model |
| JSON specification | the only interface between the two | fixed |

The engine does not write JSON; the agent does not draw. This turns a task on which models differ widely, drawing a
diagram that follows legal conventions, into one every model can do: putting information into JSON.

**Why not a general-purpose charting tool, or a model that draws the picture itself?**

1. General charting syntax is nodes, edges and state machines. It has no place for procedural standing or where a piece of evidence comes from. Antu's specification is made for these four kinds of content.
2. The quality of the picture does not depend on the model: the model only extracts; a fixed engine draws.
3. The same input gives the same picture, at any time and in any environment, so a diagram given to a judge or to the other side can be reproduced.
4. Provenance is fixed when the facts are extracted: each fact records which document it comes from, which page and under which provision. When the diagram exists, the provenance is already on it.

### Provenance

| Aspect | Approach |
|---|---|
| Attachment | events attach evidence and documents; claims attach statutes and precedents; relationships attach contracts and registration records |
| Location | structured and checkable: case number, contract page, article number |
| Reference | the source table is stored once; several expressions refer to the same id |
| Boundary | the diagram says only which material and page a point rests on. The materials are neither bundled nor linked; the user looks them up directly |

### The page you get

One self-contained HTML file of about 2.3 MB (most of it the layout engine, ELK). Engine and data are both inside it. It makes
no network request, needs no server and opens offline: suitable for archiving, circulating and sending by email.

## Use it with an agent

```json
{
  "mcpServers": {
    "antu": {
      "command": "node",
      "args": ["/absolute/path/to/antu/tools/mcp/server.mjs"]
    }
  }
}
```

An agent can read the specification, look at examples, validate, work out the geometry, make the page and take a screenshot
to check the result. Validation confirms only that the JSON is well formed, not that the diagram is satisfactory, so the
screenshot is a necessary step. The reference material for an agent is 5.4k tokens (a 3.2k-character field table plus a
5.1k-character mechanism note).

### The skill (no MCP)

Without MCP, give the agent the **skill** [`skills/antu/`](skills/antu/): a `SKILL.md` (how to choose a diagram, how to write the JSON honestly, how to make the page), the guide and field table of each kind, examples, and a viewer page with a Python script that puts the data in. It needs no network; with Node 18 or newer there is also a one-file command line, `scripts/antu.mjs` (`validate`, `layout`, `render`, `preview`), so the agent can check its diagram before it draws it and, with Chrome, Edge or Chromium on the machine, look at a screenshot of the result; without Node the Python script does the page.

- **Claude Code**: copy the whole `skills/antu/` folder to `~/.claude/skills/antu/` (or `.claude/skills/antu/` in a project).
- **Codex**: copy it to `~/.codex/skills/antu/` (or `.codex/skills/antu/` in a project) and restart Codex.
- **WorkBuddy and other clients that "import a local skill package"**: download `antu-skill-<version>.zip` from [Releases](https://github.com/zh-xx/Antu/releases) and import it. **We have not tried this in WorkBuddy yet.**

**These three ways come from each client's public material; we have not run each of them in a real client yet**, and this will be updated once we have. The skill is the state of the **last release** (rules in [spec/versioning.md](spec/versioning.md)); the pages it makes carry the version: `<meta name="generator" content="antu X.Y.Z">`.

Without MCP and without the skill, read the documents in this order.

- **Fact (timeline)**: [spec/fact/schema-draft.md](spec/fact/schema-draft.md) (field definitions), then [spec/fact/timeline-rules.md](spec/fact/timeline-rules.md) (event placement rules), and consult [examples/fact/neighbour-corridor-charging.en.json](examples/fact/neighbour-corridor-charging.en.json).
- **Justification (reasoning tree)**: [spec/agent/justification/guide.md](spec/agent/justification/guide.md) (a one-page note on the mechanism), then [spec/justification/schema-draft.md](spec/justification/schema-draft.md) (field definitions, rules, layout and look; a draft), and consult [examples/agent/justification/2-against-and-rejected.en.json](examples/agent/justification/2-against-and-rejected.en.json) or a worked case such as [examples/justification/neighbour-corridor-liability.en.json](examples/justification/neighbour-corridor-liability.en.json).
- **Procedure (flowchart)**: [spec/agent/procedure/guide.md](spec/agent/procedure/guide.md) (a one-page note on the mechanism), then [spec/procedure/schema-draft.md](spec/procedure/schema-draft.md) (field definitions and layout rules), and consult [examples/agent/procedure/7-rules.en.json](examples/agent/procedure/7-rules.en.json) or a real contract such as [examples/procedure/05-premises-lease.en.json](examples/procedure/05-premises-lease.en.json).
- **Relationship (graph)**: [spec/agent/relationship/guide.md](spec/agent/relationship/guide.md) (a one-page note on the mechanism), then [spec/relationship/schema-draft.md](spec/relationship/schema-draft.md) (field definitions and layout rules, provisional), and consult [examples/agent/relationship/3-guarantee.en.json](examples/agent/relationship/3-guarantee.en.json) or a worked case such as [examples/relationship/fang-yuan-parties.en.json](examples/relationship/fang-yuan-parties.en.json).

## More

- Design documents for people, under [`spec/`](spec/): [architecture](spec/v0-architecture.md), [the source types](spec/source-schema-draft.md), [themes](spec/theme.md), [the MCP server](spec/mcp-server.md), and the diagrams ([fact](spec/fact/), [procedure](spec/procedure/schema-draft.md), [relationship](spec/relationship/schema-draft.md), [justification](spec/justification/schema-draft.md)). The notes for agents are under [`spec/agent/`](spec/agent/).
- [CHANGELOG.md](CHANGELOG.md) and the versioning rules in [spec/versioning.md](spec/versioning.md).
- Known problems and requests are tracked as [GitHub issues](https://github.com/zh-xx/Antu/issues). Working rules for contributors are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Copyright (C) 2026 Ji Cheng.

Antu is free software, licensed under the **GNU Affero General Public License, version 3 or any later version** ([`LICENSE`](LICENSE), SPDX `AGPL-3.0-or-later`). In short: you may use, study, change and share it, including for commercial purposes. If you distribute a changed version, or let others use it over a network (for example as a hosted service), you must release your changes under the same licence, keep the copyright and licence notices, and make the source available. There is no warranty. This summary is not the licence; the licence text is.

- **Additional permission (AGPL section 7).** A page made with Antu contains Antu's code together with the diagram data you gave it. The diagram data, and the content of the diagram you drew from your material, are not part of Antu and are not covered by this licence: you may keep them private, publish them, or sell them on any terms you like. The licence covers Antu's code in the page, and the notices in the page must stay with it. The same text is in every page and at the top of the command line.
- Everything in the repository (the code, the examples, the specifications and the guides) is under the same licence, except what is named below.
- Code of other projects inside the pages and the command line keeps its own licence. Its notices are in [`skills/antu/THIRD-PARTY-NOTICES.md`](skills/antu/THIRD-PARTY-NOTICES.md), and also inside every page and at the top of the command line, together with the licence of Antu and the place of the source of that version.
- The cases in `examples/` and the judgment texts in `examples/raw/` are fictional: the people, companies, dates, amounts and provisions are made up for Antu and match no real case. They are under the same licence.
- Versions up to 0.5.0 were published without a licence file. The licence applies from 0.5.1.
