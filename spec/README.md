# Spec (contracts)

Documents that define **what is valid**: diagram JSON, versioning, embed / MCP behaviour,
themes and paper quantities, and the short notes agents load.

If a change would make an old file or tool call wrong, it belongs here. Architecture
rationale, library look-ups, and rendering essays live under [`docs/`](../docs/) instead.

| Area | What it holds |
|---|---|
| Root (`versioning`, `theme`, `paper`, `embed`, `mcp-server`, `source-schema-draft`, `versions`) | Cross-cutting product / API contracts |
| `fact/`, `procedure/`, `relationship/`, `justification/` | Per-type schema drafts, changelog slices, placement rules (`timeline-rules`) |
| [`agent/`](agent/) | Mechanism guides for agents (English only) |

Designer essays and reference manuals: [`docs/README.md`](../docs/README.md).
Chinese counterpart of this note: [README.zh-CN.md](README.zh-CN.md).
