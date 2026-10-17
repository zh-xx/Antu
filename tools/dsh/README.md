# DSH plugin (`@zh-xx/antu-dsh`)

Plan: [spec/dsh-plugin.md](../../spec/dsh-plugin.md) (中文 [spec/dsh-plugin.zh-CN.md](../../spec/dsh-plugin.zh-CN.md)).
DSH conventions (resource addresses, providers, seats): [spec/dsh-conventions.md](../../spec/dsh-conventions.md)
(中文 [spec/dsh-conventions.zh-CN.md](../../spec/dsh-conventions.zh-CN.md)).
Umbrella issue: [#79](https://github.com/zh-xx/Antu/issues/79).

**Not published yet.** Build with `npm run build:dsh`, then install the **tarball** (preferred) into DSH.
Needs a published (or otherwise resolvable) `@zh-xx/antu` at the same version for Host imports.

## Requirements

| Side | Needs |
| --- | --- |
| Host tools / skill | DSH that can resolve `@deepseek-ai/dsh-tools` / `@deepseek-ai/dsh-skill` (peer `^0.2.0-rc.2`) and `@zh-xx/antu` |
| Client chat card + full view | **DeepSeek Harness ≥ 0.2.0-rc.2** — the lazy embed chunk uses ModuleLoader `require.async('./client.embed.js')`. DSH **0.1.x** has no `require.async` and no Host route for package-local chunks; on those hosts the card shows a clear upgrade message instead of crashing the slot |

Peers are marked optional so a Host-only profile can still install; the Client half will not render a diagram until the host provides `require.async`.

## Layout

```
tools/dsh/
  README.md           this file
  build.mjs           assemble package/ + npm pack tarball
  src/                Host / Client / skill sources (committed)
  package/            package root — committed: package.json, cordis.patch.yml, locale/
  zh-xx-antu-dsh-*.tgz   produced by build:dsh (gitignored)
  .gitignore          generated Host/Client/embed + tgz stay out of git
```

`npm run build:dsh` always rebuilds the embed, writes `package/index.js`, `package/client.js`,
`package/lib/*`, `package/client.embed.js`, and packs `tools/dsh/zh-xx-antu-dsh-<version>.tgz`.
Generated files under `package/` and the tarball are not committed (`spec/dsh-plugin.md`).

## Install into DSH

**Prefer the tarball** (peers resolve inside the DSH profile):

```bash
npm run build:dsh
# then install tools/dsh/zh-xx-antu-dsh-0.14.0.tgz
# Desktop: plugin_manager → install_bundle → absolute path of the .tgz
# CLI:    dsh plugin --profile web add /abs/path/to/zh-xx-antu-dsh-0.14.0.tgz
```

Installing the bare `tools/dsh/package/` directory with a `link:` style add often fails with
`failed to import` because that folder has no `node_modules` for `@deepseek-ai/dsh-tools`.
Use the tgz (or a published npm package) instead.

### After you change the plugin

The tarball name only carries the version, so a rebuilt tgz with the same version looks unchanged to
pnpm: `add` prints `Already up to date` and keeps the old code. To test a new build:

```bash
npm run build:dsh                                  # a failed pack keeps the last good tgz and prints why
ls tools/dsh/zh-xx-antu-dsh-*.tgz                  # the file must exist before you install it
dsh plugin --profile <name> remove @zh-xx/antu-dsh
dsh plugin --profile <name> add /abs/path/to/zh-xx-antu-dsh-0.14.0.tgz
```

Then **restart DSH**: plugins load when it starts, so a running session keeps the old code.
If `add` fails with only an exit code (for example `254`), check first that the tgz path exists;
DSH's plugin log does not include pnpm's error text.

## What it registers

| Side | Capability |
| --- | --- |
| Host | Native tools `antu_validate`, `antu_layout`, `antu_render` (HTML under the session cwd) |
| Host | Reference tools `antu_schema` (field table), `antu_guide` (mechanism notes), `antu_examples` (list or fetch one) — read from the installed `@zh-xx/antu` package, so no filesystem search is needed |
| Host | Memory skill `antu-diagram` (teaches Host wire names, not the CLI) |
| Client | `tool.call.toolview` for `antu_render` and `mcp__antu__antu_render` (one compact line: title, status, **Open full view**) when the turn tail is there; the full card otherwise |
| Client | Words follow DSH's language: the `antuDsh` locale namespace ships English and 简体中文; a language switch updates open cards without a reload. The embedded page speaks the same language: the dictionary key `embed.lang` (`zh` / `en`) is read through `t`, passed as `mount({ lang })` and applied with `setLang` on a switch |
| Client | `conversation.chat.turnTail` data `antu-diagrams`: the fitted diagram after DSH's "Completed in Ns" fold; a `ResizeObserver` refits it whenever the fold opens |
| Client | Right-panel resource type `antu-diagram` (full embed, fullscreen); a click on the card opens its `dsh-resource://antu/…` address, and the tab restores itself from Session history after a reload |
| Client | The diagram follows DSH's light / dark mode through the theme service: a dark host draws it in the `dark` theme, a light host in the theme the call asked for (or the full view's last pick while light); a switch redraws open cards and the full view without a reload |

The diagram is drawn in the turn tail (`conversation.chat.turnTail`), after DSH collapses a finished turn's tool
steps into their fold, so it stays visible without opening that fold. The card reads `spec` from the tool-call
**arguments** (`argsRaw`) and shows only the picture: the whole diagram fitted (`cardUi`), nothing else. A
`ResizeObserver` calls the embed's `fitView()` when the host grows, so a card mounted while hidden is never blank.
A click opens the full view, fullscreen in the right panel, with kind and theme switches, detail cards, export and
**Open HTML** (the card's `openFile`). The tab is saved by its `dsh-resource://antu/…` address only; a resource
provider re-reads the `antu_render` call from Session history, so a reload needs no private cache. On a DSH without
the conversation service the full card stays in the tool row.

## Interim: MCP on a machine that already has Node

Until `@zh-xx/antu-dsh` is published to your profile, a DSH profile can still attach the
existing MCP server with a **configuration-only** bundle (official template:
`cordis-plugin-development` → `templates/mcp/`).

`package.json`:

```json
{
  "name": "@local/antu-mcp",
  "version": "0.14.0",
  "private": true,
  "type": "module",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`cordis.patch.yml`:

```yaml
- insert:
    - id: antu-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: antu
        transport: stdio
        command: npx
        args: ['-y', '-p', '@zh-xx/antu@0.14.0', 'antu-mcp']
        failOnStartupError: true
```

Install with DSH's `plugin_manager` → `install_bundle` and the **absolute** path of that folder.

### Limits of this stopgap (read before relying on it)

- Needs **system Node and network** for `npx` (Desktop's embedded Node is not enough by itself).
- Pin the package version (`@0.14.0` above); `@latest` drifts per machine.
- Tools appear as `mcp__antu__antu_validate`, … — not the final Host names.
- For `antu_render`, pass an **absolute `outPath` inside the session workspace**. The default relative path
  follows the MCP process cwd, which is not the session folder.
- `antu_preview` needs a Chromium-based browser on the machine; set `ANTU_CHROME` in the row's `env` if needed.
  A PNG in the chat reaches the **model** only when that model accepts images.
- The Client half of `@zh-xx/antu-dsh` also keys `mcp__antu__antu_render`, so a stopgap MCP row can still
  show the interactive card once this plugin's Client is installed.

## Maintainer check (P2 acceptance)

On Desktop without system Node, with **DSH ≥ 0.2.0-rc.2**: `npm run build:dsh` → `install_bundle` on the **tgz** →
`application: applied`; a turn that calls `antu_render` shows the whole diagram in the chat;
a click opens it fullscreen and readable, with kind and theme switches; light and dark host themes stay readable; uninstall leaves
no rows. Record DSH version and model used (#53-style).

On DSH 0.1.x the Host tools still run, but the card must show the ≥ 0.2 upgrade message (not a blank
`tool.call.toolview` crash).
