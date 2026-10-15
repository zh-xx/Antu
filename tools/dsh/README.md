# DSH plugin (`@zh-xx/antu-dsh`)

Plan: [spec/dsh-plugin.md](../../spec/dsh-plugin.md) (中文 [spec/dsh-plugin.zh-CN.md](../../spec/dsh-plugin.zh-CN.md)).
Umbrella issue: [#79](https://github.com/zh-xx/Antu/issues/79).

**Not published yet.** Build with `npm run build:dsh`, then install the **tarball** (preferred) into DSH.
Needs a published (or otherwise resolvable) `@zh-xx/antu` at the same version for Host imports.

## Requirements

| Side | Needs |
| --- | --- |
| Host tools / skill | DSH that can resolve `@deepseek-ai/dsh-tools` / `@deepseek-ai/dsh-skill` (peer `^0.2.0-rc.2`) and `@zh-xx/antu` |
| Client chat card + Enlarge | **DeepSeek Harness ≥ 0.2.0-rc.2** — the lazy embed chunk uses ModuleLoader `require.async('./client.embed.js')`. DSH **0.1.x** has no `require.async` and no Host route for package-local chunks; on those hosts the card shows a clear upgrade message instead of crashing the slot |

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

## What it registers

| Side | Capability |
| --- | --- |
| Host | Native tools `antu_validate`, `antu_layout`, `antu_render` (HTML under the session cwd) |
| Host | Memory skill `antu-diagram` (teaches Host wire names, not the CLI) |
| Client | `tool.call.toolview` for `antu_render` and `mcp__antu__antu_render` |
| Client | Right-sidebar page tab `antu-diagram` (full embed); card **Enlarge** opens it |

The chat card reads `spec` from the tool-call **arguments** (`argsRaw`), mounts with
`cardUi`, and offers kind / theme controls, **Enlarge** (sidebar, full chrome), and **Open HTML**
via the Host `openFile` callback.

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
`application: applied`; a turn that calls `antu_render` shows an interactive card (kind switch works);
**Enlarge** opens a readable sidebar diagram; light and dark host themes stay readable; uninstall leaves
no rows. Record DSH version and model used (#53-style).

On DSH 0.1.x the Host tools still run, but the card must show the ≥ 0.2 upgrade message (not a blank
`tool.call.toolview` crash).
