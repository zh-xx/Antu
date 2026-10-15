# DeepSeek Harness (DSH) plugin

> Status: **P2 in tree** (issue [#79](https://github.com/zh-xx/Antu/issues/79)). Sources under `tools/dsh/`;
> build with `npm run build:dsh` (output `tools/dsh/package/`, not published to npm yet).
> Decisions below were locked 2026-10-14. This document supersedes the outdated parts of #79's first body
> (iframe of a Host HTML route, unpublished MCP, `/antu/view/<id>` storage).

## Goal

A DSH user asks for a diagram in the conversation, **sees it in the chat** (the whole diagram as a picture), and can
**open the self-contained HTML** in the sidebar or as a file: hover and click for detail, switch kind and
theme, export. The plugin carries Host tools (same jobs as the MCP tools) and, later, a short skill. Nothing
else has to be installed on the user's machine (no system Node, no `npx`).

## Decisions (locked)

| | Choice |
| --- | --- |
| Tool source | **Native Host tools** in the DSH process (`import` from `@zh-xx/antu/validate` and `/html`), not a configuration-only MCP bundle as the long-term path |
| Wire tool names | `antu_validate`, `antu_layout`, `antu_render`, … (not `mcp__antu__…`). A chat card may also register the MCP names while a stopgap MCP row is still in use |
| `antu_render` | **Writes** a self-contained HTML file under the **session workspace** (absolute path). The card draws from the tool-call **arguments** (`spec`); the file is for archive, forward, and `openFile` |
| Chat card | **The picture only**: the whole diagram fitted into the card (`mount()` with `cardUi`), no title row, no buttons. A click anywhere on it opens the full view. The wheel goes on to the conversation. Decided 2026-10-15 after a mock-up: opening at a readable text size showed too little of a diagram to be worth it |
| Full view | A page `antu-diagram` in DSH's right panel, presented **fullscreen** (the panel's own fullscreen mode covers the window), with the full chrome: kind, theme, detail cards, export, and **Open HTML** |
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
- Client needs **DSH ≥ 0.2.0-rc.2** (`require.async` for package-local `client.embed.js`). On 0.1.x the card
  shows an upgrade message instead of crashing the slot.
- Memory skill `antu-diagram`; "open in sidebar" via `openFile` on the written HTML.
- **Full view**: a click on the card opens the page `antu-diagram` in the right panel and asks for fullscreen. It mounts the full
  embed (no `cardUi`) from the same `argsRaw` `spec`. DSH 0.2.0-rc.2's public `ctx.sidebarRight` has no fullscreen call; the plugin
  uses the controller's `commandTarget` / `toggleFullscreen` when present and otherwise leaves the panel to its own fullscreen button.
- Install: `npm run build:dsh` also packs `zh-xx-antu-dsh-*.tgz` (preferred over a bare `package/` link). pnpm treats a rebuilt tgz with the same version as unchanged: to update, `remove` then `add`, and restart DSH (see `tools/dsh/README.md`).
- CI: `test/dsh-plugin.test.mjs` (helpers, manifest, `build.mjs`, Host `apply` smoke). Trusted publisher / npm publish still open.

### P2.x — make it dependable, then publish (next, in this order)

1. **Stabilise (in tree).** The Client's pure logic lives in `tools/dsh/src/card-model.mjs` (arguments, status, which kinds, how a
   diagram opens) and is unit-tested; `client.js` only wires React and DSH slots and gets those helpers inlined by `build:dsh`.
   Symlink loops in `outPath` are refused.
2. **Card check without DSH.** A browser check under `tools/verify/` loads the built `client.js` and `client.embed.js` into a stub
   `__ModuleLoader__` with a real React, feeds it `antu_render` blocks (valid, truncated, wrong kind, 0.1.x-shaped `require`), and
   asserts: the card mounts, kind and theme buttons switch, a changed `argsRaw` remounts without "already mounted", a wheel over the
   card is not cancelled, the highlighted button follows the view. It covers the card and tab, not DSH itself.
3. **Real DSH, by version.** Run the P2 acceptance on `0.2.0-rc.2` and on the newest `0.2.x` alpha, from the tarball, and write the
   result (DSH version, model, what worked) in `tools/dsh/README.md`. `0.1.x` is Host-tools-only by design. A packaged file that reads
   the profile's DSH version and says "card unavailable" without a stack trace is the supported behaviour there.
4. **The words in Chinese.** The few words left ("Open HTML", "Preparing diagram…", "Open full view") are English only. The conversation passes the card a
   locale seat (`t`, namespace `conversation`); how a plugin adds its own dictionary is to be read from the DSH sources first. Until
   then the words stay English rather than guessed.
5. **Publish.** `@zh-xx/antu-dsh` is `private` today. Needs the maintainer: an npm account or trusted publisher and the package name;
   the Release workflow gains "build, test, pack, attach the tarball, publish" (same flow as `@zh-xx/antu`); a minor release number
   confirmed by the maintainer. Peer ranges for `@deepseek-ai/*` are reviewed against what step 3 found. Nothing is published before
   step 3 has passed on a real DSH.

Not planned here: a hosted service, a second package for another host, a chat-side editor for the JSON.

### P3 — later, if wanted

- Sidebar tab that rebuilds from the session log (resource type or Host projection + `wire.view`), not only from the params of the latest click.
- Dark diagram theme; in-host PNG export without leaving the card.

## Acceptance (P2)

On Desktop without system Node, **DSH ≥ 0.2.0-rc.2**: `install_bundle` → `application: applied`; a turn that
calls `antu_render` shows the whole diagram in the chat; a click opens it fullscreen with kind and theme switches; light and dark host themes stay readable;
uninstall leaves no rows. Maintainer records DSH version and model used (#53-style).

## Related

- Issue [#79](https://github.com/zh-xx/Antu/issues/79) (umbrella). [#121](https://github.com/zh-xx/Antu/issues/121) /
  [#122](https://github.com/zh-xx/Antu/issues/122) closed as duplicates of #79 (not implemented).
- [embed.md](embed.md), [mcp-server.md](mcp-server.md), [versioning.md](versioning.md).
- Source scaffold: [tools/dsh/](../tools/dsh/).
