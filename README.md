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
| Relationship | Parties, roles, legal relationships | Not started |
| Fact | Timeline, participants, sequence of events | Timeline sub-type available |
| Procedure | Procedural path and possible branches | Not started |
| Justification | Conclusion derived from norms and facts | Deferred |

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

One JSON document produces one self-contained HTML file of about 420 KB. Engine and data are both inside the file. It issues no network requests, requires no server, and opens offline. It is suitable for archiving, circulation, and sending as an email attachment.

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

An agent can read the specification, view examples, validate, compute geometry, produce output, and take a screenshot to check the result. Validation confirms only that the JSON is well formed; it cannot confirm that the diagram is satisfactory, so taking a screenshot is a necessary step. The reference material for an agent is 4.5k tokens (a 2.9k-character field table plus a 4.0k-character mechanism note).

Without MCP, read the documents in this order: [spec/fact/schema-draft.md](spec/fact/schema-draft.md) (field definitions), then [spec/fact/timeline-rules.md](spec/fact/timeline-rules.md) (event placement rules), and consult [examples/fact/elevator-smoking-case.en.json](examples/fact/elevator-smoking-case.en.json).

## Design documents

Under `spec/`, written for human readers: architecture [v0-architecture.md](spec/v0-architecture.md), the seven source types [source-schema-draft.md](spec/source-schema-draft.md), MCP server [mcp-server.md](spec/mcp-server.md).

## License

Undetermined. The repository is currently private and has no LICENSE file.
