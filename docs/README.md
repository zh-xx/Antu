# Docs (for people)

Human-facing notes that are **not** the JSON / API contract. English is authoritative;
Chinese counterparts use the `.zh-CN.md` suffix where present.

**Contracts and schemas stay in [`spec/`](../spec/).** If changing a document would change
whether a given JSON file or API call is valid, it belongs there—not here.

| Area | What it holds |
|---|---|
| [`architecture/`](architecture/) | Why the product is shaped this way (`v0-architecture`), maintainer trial notes |
| [`reference/`](reference/) | Look-up manuals: React Flow usage, layout engines and rules |
| [`fact/`](fact/) | How the fact diagram is drawn and interacted with (`rendering`) — companion to `spec/fact/` |
| [`dsh/`](dsh/) | DSH plugin plan and the conventions the plugin must follow |

Quick links: [architecture](architecture/v0-architecture.md) ·
[layout engines](reference/layout-engines.md) ·
[React Flow](reference/react-flow-features.md) ·
[fact rendering](fact/rendering.md) ·
[DSH plugin](dsh/dsh-plugin.md)

Chinese index: [README.zh-CN.md](README.zh-CN.md).
