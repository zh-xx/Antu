# DSH plugin scaffold (`@zh-xx/antu-dsh`)

Plan: [spec/dsh-plugin.md](../../spec/dsh-plugin.md) (中文 [spec/dsh-plugin.zh-CN.md](../../spec/dsh-plugin.zh-CN.md)).
Umbrella issue: [#79](https://github.com/zh-xx/Antu/issues/79).

**Not published yet.** The folder `package/` is a placeholder for the future npm package. Do not
`dsh plugin add` it expecting a finished product.

## Layout

```
tools/dsh/
  README.md           this file
  package/            future @zh-xx/antu-dsh (manifest + Host/Client stubs)
  .gitignore          build output stays out of git
```

The built Client chunk (repackaged `@zh-xx/antu/embed` for DSH's ModuleLoader) will be written under
`package/dist/` by a build script added in P2 — never committed.

## Interim: MCP on a machine that already has Node

Until `@zh-xx/antu-dsh` ships, a DSH profile can attach the existing MCP server with a
**configuration-only** bundle (official template: `cordis-plugin-development` → `templates/mcp/`).

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

## Next code (P2)

1. Host `apply`: register `antu_validate` / `antu_layout` / `antu_render` using `@zh-xx/antu/validate` and `/html`.
2. Client: `tool.call.toolview` keyed by `antu_render`, calling `mount(el, spec, { ui: { …cardUi }, … })` (`cardUi` from `@zh-xx/antu/embed`).
3. `tools/build-dsh-plugin.mjs`: pack ModuleLoader client + copy version from root `package.json`.
4. Release: attach tarball / publish `@zh-xx/antu-dsh` beside `@zh-xx/antu`.
