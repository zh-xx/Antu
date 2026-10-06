# Antu 案图

[![Verify](https://github.com/zh-xx/Antu/actions/workflows/verify.yml/badge.svg)](https://github.com/zh-xx/Antu/actions/workflows/verify.yml)

[中文](README.zh-CN.md) | **English**

Antu turns one JSON document into one self-contained HTML legal diagram. The page opens offline, and can be archived,
printed or sent as an attachment. An AI agent can read the case materials and write the JSON; the engine then draws the
diagram from it, and the same JSON gives the same diagram. Antu is at version 0.x, and the formats of the relationship
and justification diagrams are still drafts.

## What you get

Four kinds of legal content, each drawn in several ways. A picker in the page switches between the ways, and nothing in
the JSON chooses one. These are the sketches the page itself shows in its picker, one for each way; click a name to open a case
you can draw in that way (`npm run diagram -- <file>`, then pick the way in the page).

<table>
<tr><th rowspan="2" align="left" valign="middle">Relationship</th><td align="center"><a href="examples/relationship/marketplace-parties.en.json"><img src="assets/kinds/graph.svg" width="88" alt="graph"><br>graph</a></td><td align="center"><a href="examples/relationship/marketplace-parties.en.json"><img src="assets/kinds/focus.svg" width="88" alt="focus view"><br>focus view</a></td><td align="center"><a href="examples/relationship/marketplace-parties.en.json"><img src="assets/kinds/chain.svg" width="88" alt="guarantee chain"><br>guarantee chain</a></td><td align="center"><a href="examples/relationship/marketplace-parties.en.json"><img src="assets/kinds/matrix.svg" width="88" alt="relation matrix"><br>relation matrix</a></td><td align="center"><a href="examples/relationship/marketplace-parties.en.json"><img src="assets/kinds/equity.svg" width="88" alt="equity tree"><br>equity tree</a></td></tr>
<tr><td align="center"><a href="examples/relationship/marketplace-parties.en.json"><img src="assets/kinds/authority.svg" width="88" alt="authority chart"><br>authority chart</a></td><td align="center"><a href="examples/relationship/marketplace-parties.en.json"><img src="assets/kinds/related.svg" width="88" alt="related-party list"><br>related-party list</a></td><td align="center"><a href="examples/relationship/marketplace-parties.en.json"><img src="assets/kinds/path.svg" width="88" alt="relation path"><br>relation path</a></td><td align="center"><a href="examples/relationship/marketplace-parties.en.json"><img src="assets/kinds/summary.svg" width="88" alt="camp summary"><br>camp summary</a></td></tr>
<tr><th rowspan="1" align="left" valign="middle">Fact</th><td align="center"><a href="examples/fact/neighbour-corridor-charging.en.json"><img src="assets/kinds/timeline.svg" width="88" alt="timeline"><br>timeline</a></td><td align="center"><a href="examples/fact/neighbour-corridor-charging.en.json"><img src="assets/kinds/chronicle.svg" width="88" alt="chronicle"><br>chronicle</a></td><td align="center"><a href="examples/fact/neighbour-corridor-charging.en.json"><img src="assets/kinds/scale.svg" width="88" alt="time scale"><br>time scale</a></td></tr>
<tr><th rowspan="1" align="left" valign="middle">Procedure</th><td align="center"><a href="examples/procedure/05-premises-lease.en.json"><img src="assets/kinds/flow.svg" width="88" alt="flowchart"><br>flowchart</a></td><td align="center"><a href="examples/procedure/05-premises-lease.en.json"><img src="assets/kinds/route.svg" width="88" alt="route map"><br>route map</a></td></tr>
<tr><th rowspan="1" align="left" valign="middle">Justification</th><td align="center"><a href="examples/justification/fang-yuan-defense-excess.en.json"><img src="assets/kinds/tree.svg" width="88" alt="reasoning tree"><br>reasoning tree</a></td></tr>
</table>

Relationship diagrams show parties, roles and legal relationships; fact diagrams the time, the participants and how events went;
procedure diagrams a procedural path and its branches; justification diagrams a conclusion drawn from norms and facts. The
relationship and justification schemas are still drafts.

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
| Model | reads documents, extracts facts, understands meaning | the result may differ from run to run |
| Engine | draws the diagram according to the specification | the same JSON gives the same diagram, whichever model wrote it |
| JSON specification | the only interface between the two | versioned (see [spec/versioning.md](spec/versioning.md)) |

The engine does not write JSON, and the agent does not draw. The model is asked only to put information into JSON; drawing
is left to the engine.

**Why a specification of its own?**

1. General-purpose charting syntax is built on nodes, edges and state machines, and has no place for things such as procedural standing or the source of a piece of evidence. Antu's specification is written for these four kinds of content.
2. The picture does not depend on which model extracted the information, because the engine draws it.
3. The same JSON gives the same picture at any time and in any environment, so a diagram handed to the court or to the other side can be reproduced.
4. Provenance is recorded when the facts are extracted: each fact states which document it comes from, which page and under which provision, so the source is already on the diagram once it is drawn.

### Provenance

| Aspect | Approach |
|---|---|
| Attachment | events attach evidence and documents; claims attach statutes and precedents; relationships attach contracts and registration records |
| Location | structured and checkable: case number, contract page, article number |
| Reference | the source table is stored once; several expressions refer to the same id |
| Boundary | the diagram says only which material and page a point rests on. The materials are neither bundled nor linked; the user looks them up directly |

### The page you get

One self-contained HTML file of about 2.3 MB (most of it the layout engine, ELK). Engine and data are both inside it. It makes
no network request, needs no server and opens offline. It can be archived, circulated or sent by email.

## Use it with an agent

There are two ways, for two kinds of user.

### The skill (most people)

The easiest way: tell your agent (Claude Code, Codex and others that read skills) one sentence, and it installs the latest skill itself:

> Please install the Antu skill for yourself: run `npx skills add zh-xx/Antu -g -y`.

Or run the command yourself in a terminal: `npx skills add zh-xx/Antu -g`. It needs [Node.js](https://nodejs.org) 18 or newer. Later, `npx skills update -g` is meant to bring the skill to the newest release (we have seen it report "up to date"; we have not yet seen it pick up a new release). The agent may ask you to confirm the command, and a skill runs with the agent's permissions, so read what you install; the installer also sends anonymous usage data unless `DISABLE_TELEMETRY=1` is set. If the installer finds no agent it knows, or you want it for one agent only, add `-a <the agent's name>` (for example `-a claude-code`). **We have tried the command itself in a sandbox (it finds the skill, installs it and reports it up to date); we have not tried the one sentence in a real client yet** (#53).

The skill is [`skills/antu/`](skills/antu/): a `SKILL.md` (how to choose a diagram, how to write the JSON honestly, how to make the page), the guide and field table of each kind, examples, and a viewer page with a Python script that puts the data in. It needs no network; with Node 18 or newer there is also a one-file command line, `scripts/antu.mjs` (`validate`, `layout`, `render`, `preview`), so the agent can check its diagram before it draws it and, with Chrome, Edge or Chromium on the machine, look at a screenshot of the result; without Node the Python script does the page. It is the state of the **last release** (rules in [spec/versioning.md](spec/versioning.md)), so a new version appears after a release; the pages it makes carry the version: `<meta name="generator" content="antu X.Y.Z">`.

Other ways to put the skill in place: copy the folder `skills/antu/` to `~/.claude/skills/antu/` (Claude Code) or `~/.codex/skills/antu/` (Codex, then restart it); or, for a client that "imports a local skill package" (such as WorkBuddy), download `antu-skill-<version>.zip` from [Releases](https://github.com/zh-xx/Antu/releases) and import it. **We have not tried these in a real client yet.**

### The MCP server (for those who set up MCP themselves)

Antu is also an MCP server, published on npm as [`@zh-xx/antu`](https://www.npmjs.com/package/@zh-xx/antu) and listed in the [MCP registry](https://registry.modelcontextprotocol.io) as `io.github.zh-xx/antu`. Where an MCP client keeps its server list differs from client to client, so we give the block once; put it where your client asks for it (see its documentation):

```json
{
  "mcpServers": {
    "antu": {
      "command": "npx",
      "args": ["-y", "-p", "@zh-xx/antu", "antu-mcp"]
    }
  }
}
```

It needs [Node.js](https://nodejs.org) 18 or newer; `npx` downloads the package (about 2 MB) on the first start and checks again later. **We have tried the package itself (installed from npm into an empty folder, it starts and lists its seven tools); we have not tried this block in a real client** (#53).

An agent can read the specification, look at examples, validate, work out the geometry, make the page and take a screenshot
to check the result. Validation confirms only that the JSON is well formed, not that the diagram is satisfactory, so it is
worth taking a screenshot and looking at it. `antu_render` writes the page into the folder the server was started in unless you give it a path; `antu_preview` needs Chrome, Edge or Chromium on the machine (without one it says so, and the other tools still work). The reference material for an agent is 5.4k tokens (a 3.2k-character field table plus a
5.1k-character mechanism note).

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
