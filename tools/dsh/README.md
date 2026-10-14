# DSH plugin (`@zh-xx/antu-dsh`)

Plan: [spec/dsh-plugin.md](../../spec/dsh-plugin.md) (中文 [spec/dsh-plugin.zh-CN.md](../../spec/dsh-plugin.zh-CN.md)).
Umbrella issue: [#79](https://github.com/zh-xx/Antu/issues/79).

**Not published yet.** Build the installable folder with `npm run build:dsh`, then point DSH
`plugin_manager` → `install_bundle` at the absolute path of `tools/dsh/package/`.
Needs a published (or otherwise resolvable) `@zh-xx/antu` at the same version for Host imports.

## Layout

```
tools/dsh/
  README.md           this file
  build.mjs           assemble package/ (Host copy + ModuleLoader embed chunk)
  src/                Host / Client / skill sources
  package/            install_bundle root (@zh-xx/antu-dsh)
  .gitignore          client.embed.js stays out of git
```

`npm run build:dsh` writes `package/index.js`, `package/client.js`, `package/lib/*`, and
`package/client.embed.js` (repackaged `@zh-xx/antu/embed` for DSH's ModuleLoader). The embed
chunk is never committed.

## What it registers

| Side | Capability |
| --- | --- |
| Host | Native tools `antu_validate`, `antu_layout`, `antu_render` (HTML under the session cwd) |
| Host | Memory skill `antu-diagram` (teaches Host wire names, not the CLI) |
| Client | `tool.call.toolview` for `antu_render` and `mcp__antu__antu_render` |

The chat card reads `spec` from the tool-call **arguments** (`argsRaw`), mounts with
`cardUi`, and offers kind / theme controls plus **Open HTML** via the Host `openFile` callback.

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

On Desktop without system Node: `npm run build:dsh` → `install_bundle` on `tools/dsh/package` →
`application: applied`; a turn that calls `antu_render` shows an interactive card (kind switch works);
light and dark host themes stay readable; uninstall leaves no rows. Record DSH version and model used
(#53-style).
