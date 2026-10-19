# Antu connector for WorkBuddy

WorkBuddy's open platform ([docs](https://open.workbuddy.cn/docs/connector)) takes a **connector**: a folder with
`connector-meta.json`, `mcp.json`, `icon.svg` and a skill. Ours is the platform's recommended "MCP + Skill":

- the program is the published package `@zh-xx/antu`; `mcp.json` starts its `antu-mcp` over stdio with
  `npx -y -p @zh-xx/antu@<version> antu-mcp`, on the Node runtime WorkBuddy manages (needs WorkBuddy 5.0.0 or newer);
- the skill (`tools/workbuddy/src/skills/antu/SKILL.md`) is light and has no script: it says which type to choose, the order of the
  `antu_*` tools and the rules about not inventing; the MCP server sends the same rules in its own `instructions`, so the
  connector still works if the client does not load the skill.

```
node tools/workbuddy/build.mjs            # tools/workbuddy/package/antu/ and antu-workbuddy-<version>.zip (needs `zip`)
node tools/workbuddy/build.mjs --check    # build the folder and check it against the platform's rules
```

The version in `connector-meta.json`, `mcp.json` (the pin) and the skill is always the one in `package.json`, so a
release of the package must be on npm before the zip of the same number is submitted.

## Submitting

Sign in at open.workbuddy.cn (a developer subject is needed: personal or enterprise real-name certification), create a
connector, upload the zip, wait for review. An update is a new upload and review (the docs say it syncs in 10 to 15
minutes after approval).

## Not verified yet (needs a real WorkBuddy client)

- the zip layout: the docs show the files inside a folder named after the connector; the zip has one top folder `antu/`;
- whether the skill loads with the connector, whether `references/` would be allowed in it (the skill has none);
- where `antu_render` writes and how the HTML shows in the conversation (the skill tells the model to pass an absolute
  `outPath` and to tell the user the path);
- whether the second registry in `npmRegistries` is tried when the first (npmmirror) does not have the new version yet.
