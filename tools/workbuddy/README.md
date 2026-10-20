# Antu connector for WorkBuddy

WorkBuddy's open platform ([docs](https://open.workbuddy.cn/docs/connector)) takes a **connector**: a folder with
`connector-meta.json`, `mcp.json`, `icon.svg` and a skill. Ours is the platform's recommended "MCP + Skill":

- the program is the published package `@zh-xx/antu`; `mcp.json` starts its `antu-mcp` over stdio with
  `npx -y -p @zh-xx/antu@<version> antu-mcp`, on the Node runtime WorkBuddy manages (needs WorkBuddy 5.0.0 or newer);
- the skill (`tools/workbuddy/src/skills/antu/SKILL.md`) is light and has no script: it says which type to choose, the order of the
  `antu_*` tools and the rules about not inventing; the MCP server sends the same rules in its own `instructions`, so the
  connector still works if the client does not load the skill.

```
node tools/workbuddy/build.mjs            # both packages below, as folders and zips (needs `zip`)
node tools/workbuddy/build.mjs --check    # build the folders and check them against the platform's rules
```

## Two packages, in case the connector is not accepted

1. **The connector** (`antu-workbuddy-<version>.zip`, above).
2. **The skill alone** (`antu-workbuddy-skill-<version>.zip`, "案图 Antu（技能版）"): the general skill (`skills/antu/`,
   built by `npm run build:skill`) with the header fields the platform asks of a skill (`description_zh`,
   `description_en`, `version`, `author`) and a short section "In WorkBuddy". Its content is not copied by hand: the
   guides, field tables, examples and scripts are the ones of every other client, so there is one place to keep them.
   It needs **Node 18 or newer** on the user's machine (a skill has no way to ask WorkBuddy for a managed runtime; only a
   connector has); with only Python 3 it falls back to `scripts/make_html.py` (it makes the page and checks nothing);
   with neither it says so. If the connector is installed too, the skill tells the model to use the `antu_*` tools.

**Size.** WorkBuddy refuses a skill over **3 MB unzipped** (the first upload, 4.3 MB unzipped and 1.3 MB zipped, was refused).
So this package ships `assets/viewer.html` compressed (`viewer.html.gz`, 0.7 MB instead of 2.3 MB); the command line and
`make_html.py` read either form. The build stops if the package passes 2.9 MB, and the size is asserted in the tests,
so the next growth of the engine is caught here and not by the platform. The command line itself (1.8 MB) is the rest;
if it grows too much, the next step is to build it smaller or to fetch it with `npx` instead of carrying it.

Both are listed under different names so a user can tell them apart.

The version in `connector-meta.json`, `mcp.json` (the pin) and the skill is always the one in `package.json`, so a
release of the package must be on npm before the zip of the same number is submitted.

## Submitting

Sign in at open.workbuddy.cn (a developer subject is needed: personal or enterprise real-name certification), create a
connector, upload the zip, wait for review. An update is a new upload and review (the docs say it syncs in 10 to 15
minutes after approval).

## Not verified yet (needs a real WorkBuddy client)

- **whether WorkBuddy has Node or Python for a skill's scripts** (the documents say nothing, and tutorials advise installing
  Node yourself): in a chat, ask it to run `node --version` and `python3 --version`;
- whether a skill package of this size (about 4.3 MB, 1.3 MB zipped) is accepted;
- the zip layout: the docs show the files inside a folder named after the connector; the zip has one top folder `antu/`;
- whether the skill loads with the connector, whether `references/` would be allowed in it (the skill has none);
- where `antu_render` writes and how the HTML shows in the conversation (the skill tells the model to pass an absolute
  `outPath` and to tell the user the path);
- whether the second registry in `npmRegistries` is tried when the first (npmmirror) does not have the new version yet.
