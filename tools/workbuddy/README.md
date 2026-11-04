# Antu skill for WorkBuddy

WorkBuddy's open platform takes a **skill** package with the header fields it asks of a skill. Ours is built
from the general skill (`skills/antu/`, via `npm run build:skill`) so guides, field tables, examples and
scripts stay in one place.

The **MCP connector** package is retired; this directory only builds skill zips for upload to the platform's
skill path (or for hosts that import a WorkBuddy-shaped skill).

```
node tools/workbuddy/build.mjs            # skill packages as folders and zips (needs `zip`)
node tools/workbuddy/build.mjs --check    # build the folders and check them against the platform's rules
```

## Packages

1. **The skill** (`antu-workbuddy-skill-<version>.zip`, market name **案图 · 诉讼可视化** / **Antu · Legal Diagrams**):
   the general skill with the header fields the platform asks (`display_name`, `description_zh`, `description_en`,
   `version`, `author`), a market avatar `icon.png` (512×512, ≤ 500 KB; SVG is rejected), and a short section
   "In WorkBuddy". Content is not copied by hand. It needs **Node 18 or newer** on the user's machine; with only
   Python 3 it falls back to `scripts/make_html.py` (it makes the page and checks nothing); with neither it says so.
   If `antu_*` tools are already available in the session, the skill tells the model to use those instead.

**Size.** WorkBuddy refuses a skill over **3 MB unzipped**. So this package ships `assets/viewer.html` compressed
(`viewer.html.gz`); the command line and `make_html.py` read either form. The build stops if the package passes
2.9 MB. The command line itself is most of the rest; if it grows too much, the slim skill below is the next step.

2. **The slim skill** (`antu-workbuddy-skill-slim-<version>.zip`, **案图 · 诉讼可视化（精简）**), **kept in reserve**:
   the same skill without the bundled command line. Its commands run the pinned npm package instead,
   `npx -y -p @zh-xx/antu@<version> antu validate|layout|render|preview`. It is built by
   `node tools/workbuddy/build.mjs`, but the release does **not** attach it.

The version in the skill header is always the one in `package.json`.

## Submitting

Sign in at open.workbuddy.cn, upload the skill zip for review. An update is a new upload and review.

## Not verified yet (needs a real WorkBuddy client)

- whether WorkBuddy has Node or Python for a skill's scripts;
- whether a skill package of this size is accepted on the current platform rules;
- where rendered HTML shows in the conversation.
