# antu 案图

[![Verify](https://github.com/zh-xx/Antu/actions/workflows/verify.yml/badge.svg)](https://github.com/zh-xx/Antu/actions/workflows/verify.yml)

[中文](README.zh-CN.md) | **English**

A rendering core for legal work visualization. Input one JSON document, output one self-contained
HTML file that opens offline and can be archived or circulated.

Add `?lang=en` or `?lang=zh` to a generated HTML file to pin the interface language. The data
itself is never translated: case content travels with the JSON.

---

# What antu is

antu renders four kinds of legal content as diagrams. Its specification is defined specifically for these four kinds, and does not reuse the syntax of general-purpose charting tools.

## The four diagram types

| Diagram | Content rendered | Status |
|---|---|---|
| Relationship | Parties, roles, legal relationships | Graph sub-type available (schema provisional) |
| Fact | Timeline, participants, sequence of events | Timeline sub-type available |
| Procedure | Procedural path and possible branches | Flowchart sub-type available |
| Justification | Conclusion derived from norms and facts | Reasoning tree available (schema draft) |

## Why use antu

**1. The syntax of general-purpose visualization tools does not fit legal work.** That syntax is built on nodes, edges, temporal sequences, and state machines. The structure of legal work is parties, legal relationships, procedural paths, and argumentation. General-purpose tools can produce a diagram, but their syntax reserves no place for legal elements such as procedural standing or the provenance of evidence.

**2. Diagram quality should not depend on which large language model is used.** The common approach has the model generate the graphic directly, so quality varies with model capability. antu does not take that path. The model only extracts key information from case materials and outputs a JSON document; rendering is performed by a fixed engine. The result is therefore identical regardless of which model is used.

**3. The same input should produce the same diagram.** A diagram delivered to a judge or to opposing counsel cannot be reproduced if each generation differs. antu's rendering process does not pass through a model, so the same JSON document renders identically at any time and in any environment.

**4. Provenance is fixed at generation time.** The common approach is to ask, after the diagram exists, what a conclusion rests on, and then to verify through further dialogue. antu requires, at the moment of extraction, that each fact record which document it comes from, at which page, and under which provision of law. When the diagram is produced, the provenance is already on it.

Legal work requires that delivered materials be reproducible and traceable. The four points above address these two requirements.

---

# How antu works

## Division of labour

```
agent ──> extract key information ──> one JSON ──> engine ──> diagram
```

| Role | Responsibility | Determinism |
|---|---|---|
| Model | Reads documents, extracts facts, understands meaning | May be non-deterministic |
| Engine | Renders the diagram per the specification | Fully deterministic, model-independent |
| JSON specification | The boundary and only interface between the two | Fixed |

This division converts a task on which model capability varies widely, namely producing a diagram that conforms to legal conventions, into a task every model can perform, namely extracting information into JSON. The engine does not generate JSON; the agent does not render. The boundary between them is the JSON specification.

The diagrams meet the needs of legal work because the specification itself is designed for legal work, rather than adapting the syntax of general-purpose charting.

## Provenance

| Aspect | Approach |
|---|---|
| Attachment | Events attach evidence and documents; claims attach statutes and precedents; relationships attach contracts and registration records |
| Location | Structured location, verifiable and reverse-lookupable: case number, contract page, article number |
| Reference | The source table is stored once; multiple expressions reference the same id, with no duplication |
| Boundary | The diagram states only which material and page a point rests on. Source materials are neither bundled nor linked; the user consults them directly |

## Output

One JSON document produces one self-contained HTML file of about 1.9 MB (most of it the layout engine, ELK). Engine and data are both inside the file. It issues no network requests, requires no server, and opens offline. It is suitable for archiving, circulation, and sending as an email attachment.

## Usage

```bash
npm install
npm run diagram -- examples/fact/elevator-smoking-case.en.json
# → examples/fact/elevator-smoking-case.en.html
```

## Agent integration

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

An agent can read the specification, view examples, validate, compute geometry, produce output, and take a screenshot to check the result. Validation confirms only that the JSON is well formed; it cannot confirm that the diagram is satisfactory, so taking a screenshot is a necessary step. The reference material for an agent is 5.4k tokens (a 3.2k-character field table plus a 5.1k-character mechanism note).

### The skill (no MCP)

Without MCP, give the agent the **skill** [`skills/antu/`](skills/antu/): a `SKILL.md` (how to choose a diagram, how to write the JSON honestly, how to make the page), the guide and field table of each kind, examples, and a viewer page with a Python script that puts the data in. It needs no network; with Node 18 or newer there is also a one-file command line, `scripts/antu.mjs` (`validate`, `layout`, `render`), so the agent can check its diagram before it draws it, and without Node the Python script does the page.

- **Claude Code**: copy the whole `skills/antu/` folder to `~/.claude/skills/antu/` (or `.claude/skills/antu/` in a project).
- **Codex**: copy it to `~/.codex/skills/antu/` (or `.codex/skills/antu/` in a project) and restart Codex.
- **WorkBuddy and other clients that "import a local skill package"**: download `antu-skill-<version>.zip` from [Releases](https://github.com/zh-xx/Antu/releases) and import it. **We have not tried this in WorkBuddy yet.**

**These three ways come from each client's public material; we have not run each of them in a real client yet**, and this will be updated once we have. The skill is the state of the **last release** (rules in [spec/versioning.md](spec/versioning.md)); the pages it makes carry the version: `<meta name="generator" content="antu X.Y.Z">`.

Without MCP and without the skill, read the documents in this order.

- **Fact (timeline)**: [spec/fact/schema-draft.md](spec/fact/schema-draft.md) (field definitions), then [spec/fact/timeline-rules.md](spec/fact/timeline-rules.md) (event placement rules), and consult [examples/fact/elevator-smoking-case.en.json](examples/fact/elevator-smoking-case.en.json).
- **Justification (reasoning tree)**: [spec/agent/justification/guide.md](spec/agent/justification/guide.md) (a one-page note on the mechanism), then [spec/justification/schema-draft.md](spec/justification/schema-draft.md) (field definitions, rules, layout and look; a draft), and consult [examples/agent/justification/2-against-and-rejected.en.json](examples/agent/justification/2-against-and-rejected.en.json) or a real case such as [examples/justification/elevator-smoking-liability.en.json](examples/justification/elevator-smoking-liability.en.json).
- **Procedure (flowchart)**: [spec/agent/procedure/guide.md](spec/agent/procedure/guide.md) (a one-page note on the mechanism), then [spec/procedure/schema-draft.md](spec/procedure/schema-draft.md) (field definitions and layout rules), and consult [examples/agent/procedure/7-rules.en.json](examples/agent/procedure/7-rules.en.json) or a real contract such as [examples/procedure/05-premises-lease.en.json](examples/procedure/05-premises-lease.en.json).
- **Relationship (graph)**: [spec/agent/relationship/guide.md](spec/agent/relationship/guide.md) (a one-page note on the mechanism), then [spec/relationship/schema-draft.md](spec/relationship/schema-draft.md) (field definitions and layout rules, provisional), and consult [examples/agent/relationship/3-guarantee.en.json](examples/agent/relationship/3-guarantee.en.json) or a real case such as [examples/relationship/yuhuan-parties.en.json](examples/relationship/yuhuan-parties.en.json).

## Design documents

Under `spec/`, written for human readers: architecture [v0-architecture.md](spec/v0-architecture.md), the seven source types [source-schema-draft.md](spec/source-schema-draft.md), the fact diagram ([spec/fact/](spec/fact/)), the procedure diagram [spec/procedure/schema-draft.md](spec/procedure/schema-draft.md), MCP server [mcp-server.md](spec/mcp-server.md). The notes written for agents are under [spec/agent/](spec/agent/).

Known problems and requests are tracked as [GitHub issues](https://github.com/zh-xx/Antu/issues). Working rules for contributors are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Copyright (C) 2026 Ji Cheng.

antu is free software, licensed under the **GNU Affero General Public License, version 3 or any later version** ([`LICENSE`](LICENSE), SPDX `AGPL-3.0-or-later`). In short: you may use, study, change and share it, including for commercial purposes. If you distribute a changed version, or let others use it over a network (for example as a hosted service), you must release your changes under the same licence, keep the copyright and licence notices, and make the source available. There is no warranty. This summary is not the licence; the licence text is.

- **Additional permission (AGPL section 7).** A page made with antu contains antu's code together with the diagram data you gave it. The diagram data, and the content of the diagram you drew from your material, are not part of antu and are not covered by this licence: you may keep them private, publish them, or sell them on any terms you like. The licence covers antu's code in the page, and the notices in the page must stay with it. The same text is in every page and at the top of the command line.
- Everything in the repository (the code, the examples, the specifications and the guides) is under the same licence, except what is named below.
- Code of other projects inside the pages and the command line keeps its own licence. Its notices are in [`skills/antu/THIRD-PARTY-NOTICES.md`](skills/antu/THIRD-PARTY-NOTICES.md), and also inside every page and at the top of the command line, together with the licence of antu and the place of the source of that version.
- The judgment texts in `examples/raw/` are public court documents kept as source material for the examples. They are not antu's own work and are not licensed under the AGPL.
- Versions up to 0.5.0 were published without a licence file. The licence applies from 0.6.0.
