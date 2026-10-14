# DeepSeek Harness (DSH) plugin

> Status: **P2 in tree** (issue [#79](https://github.com/zh-xx/Antu/issues/79)). Sources under `tools/dsh/`;
> build with `npm run build:dsh` (output `tools/dsh/package/`, not published to npm yet).
> Decisions below were locked 2026-10-14. This document supersedes the outdated parts of #79's first body
> (iframe of a Host HTML route, unpublished MCP, `/antu/view/<id>` storage).

## Goal

A DSH user asks for a diagram in the conversation, **sees it in the chat** (an interactive card), and can
**open the self-contained HTML** in the sidebar or as a file: hover and click for detail, switch kind and
theme, export. The plugin carries Host tools (same jobs as the MCP tools) and, later, a short skill. Nothing
else has to be installed on the user's machine (no system Node, no `npx`).

## Decisions (locked)

| | Choice |
| --- | --- |
| Tool source | **Native Host tools** in the DSH process (`import` from `@zh-xx/antu/validate` and `/html`), not a configuration-only MCP bundle as the long-term path |
| Wire tool names | `antu_validate`, `antu_layout`, `antu_render`, … (not `mcp__antu__…`). A chat card may also register the MCP names while a stopgap MCP row is still in use |
| `antu_render` | **Writes** a self-contained HTML file under the **session workspace** (absolute path). The card draws from the tool-call **arguments** (`spec`); the file is for archive, forward, and `openFile` |
| Chat card | **Interactive** `mount()` with chrome reduced (`ui.header/capsule/minimap/zoom: false`); host-side buttons for kind/theme. Not a static thumbnail-only card (thumbnail only as a fallback) |
| Package | Separate **`@zh-xx/antu-dsh`**, version **same number** as `@zh-xx/antu`. Source under `tools/dsh/`; **build output is not committed** |
| Skill | Shipped with the plugin from the Host-tool phase onward; name **not** bare `antu` (avoid clashing with `skills/antu/`). Text teaches Host tool names, not the command line |
| Theme in a dark host | Diagram stays on Antu's themes (default `document`, light). Card chrome uses DSH `--dsw-alias-*`. A dark diagram theme is a later issue |
| Session truth | The session log is the only source of truth. No plugin-owned `/antu/view/<id>` store. Cards read `argsRaw` of the tool call; do not duplicate `spec` in the tool result |

## Why not iframe / MCP-only

- Official DSH practice: do not serve HTML from the Host and embed it in an iframe (no host theme tokens,
  light/dark, or `ctx.locale`). Antu's page is a *deliverable*; the chat card is *plugin UI* and must use
  `mount()` (`@zh-xx/antu/embed`) in a Client slot (`tool.call.toolview`).
- A configuration-only MCP bundle (`npx … antu-mcp`) is a useful stopgap for machines that already have
  Node (see [tools/dsh/README.md](../tools/dsh/README.md)). It is **not** the product for Desktop users:
  system `npx` is not guaranteed, the download is large, and `antu_render`'s default output path follows the
  MCP process cwd, not the session workspace.

## Phases

### P0 — this document and scaffolding (no npm publish)

- Lock the plan here; keep #79's body in step (maintainer can paste from this file).
- Scaffold `tools/dsh/` and the interim MCP recipe in the README.
- Embed option for cards: `ui.panOnScroll: false` so the conversation can scroll (see [embed.md](embed.md)).

### P1 — embed card mode (engine) — done in tree

- `cardUi` on `@zh-xx/antu/embed`: quiet chrome + `panOnScroll: false` ([embed.md](embed.md)).
- `ui.panOnDrag` can be turned off the same way.
- Covered by `test/embed.test.mjs` and `tools/verify/embed.mjs` (wheel does not pan; chrome off).

### P2 — `@zh-xx/antu-dsh` 0.x first publish — in tree

- Host: `antu_validate`, `antu_layout`, `antu_render` (in-process; HTML under session cwd).
- Client: small entry + lazy-loaded embed chunk; `tool.call.toolview` for `antu_render` (and MCP name if needed).
- Memory skill `antu-diagram`; "open in sidebar" via `openFile` on the written HTML.
- CI: `test/dsh-plugin.test.mjs` (helpers, manifest, `build.mjs`, Host `apply` smoke). Trusted publisher / npm publish still open.

### P3 — later, if wanted

- Full sidebar tab that rebuilds from the log (resource type or Host projection + `wire.view`).
- Dark diagram theme; in-host PNG export without leaving the card.

## Acceptance (P2)

On Desktop without system Node: `install_bundle` → `application: applied`; a turn that calls `antu_render`
shows an interactive card (kind switch works); light and dark host themes stay readable; uninstall leaves
no rows. Maintainer records DSH version and model used (#53-style).

## Related

- Issue [#79](https://github.com/zh-xx/Antu/issues/79) (umbrella). [#121](https://github.com/zh-xx/Antu/issues/121) /
  [#122](https://github.com/zh-xx/Antu/issues/122) closed as duplicates of #79 (not implemented).
- [embed.md](embed.md), [mcp-server.md](mcp-server.md), [versioning.md](versioning.md).
- Source scaffold: [tools/dsh/](../tools/dsh/).
