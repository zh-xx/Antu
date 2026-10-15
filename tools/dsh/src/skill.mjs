// ============================================================
//  tools/dsh/src/skill.mjs — in-memory DSH skill for Host tools
//
//  Name is antu-diagram (not bare "antu") so it does not clash with skills/antu/.
// ============================================================

/** Body taught to the model: Host wire names, not the CLI. */
export const SKILL_CONTENT = `# Antu diagrams (DeepSeek Harness)

Use the **Host tools** registered by \`@zh-xx/antu-dsh\` — not shell commands and not \`npx\`.

## Tools

| Tool | When |
| --- | --- |
| \`antu_schema\` | Before writing JSON: the field table of the type (what is required, of what type). |
| \`antu_guide\` | Before writing JSON: how the data becomes the picture. |
| \`antu_examples\` | Before writing JSON: list the small examples, then fetch \`1-minimal\` first. |
| \`antu_validate\` | Right after writing JSON. Fix every error before layout or render. |
| \`antu_layout\` | Judge size / orientation without rendering. |
| \`antu_render\` | Write one self-contained HTML under the **session workspace**. |

Wire names are exactly \`antu_schema\`, \`antu_guide\`, \`antu_examples\`, \`antu_validate\`, \`antu_layout\`, \`antu_render\` (not \`mcp__antu__…\`).

## Workflow

1. Call \`antu_schema\`, then \`antu_guide\`, then \`antu_examples\` (fetch \`1-minimal\` first) for the diagram type (\`fact\`, \`procedure\`, \`relationship\`, \`justification\`).
2. Write the Antu JSON.
3. Call \`antu_validate\` → repair until \`ok\`.
4. Optionally \`antu_layout\` if width or orientation is in doubt.
5. Call \`antu_render\`. Prefer a **relative** \`outPath\` (or omit it); the file lands in the session cwd. Do not invent a system temp path.
6. The chat shows an interactive card from the **call arguments**; the HTML file is for archive and "open in sidebar".

## \`antu_render\` arguments

- \`spec\` (required): the Antu JSON.
- \`outPath\` (optional): relative path under the session workspace, or omit for \`<title>.html\`.
- \`kind\` (optional): opening draw mode; the reader can still switch in the card / page.
- \`theme\` (optional): \`document\` | \`modern\` | \`legal\`. Omit to let the reader choose.

## Do not

- Search the filesystem (\`find\`, \`grep\`, \`ls\`, \`cat\`) for Antu documentation: \`antu_schema\`, \`antu_guide\` and \`antu_examples\` read the field table, the mechanism notes and the examples from the installed package.
- Start \`antu-mcp\` / \`npx\` from this skill — that is a separate stopgap for machines that already have Node.
- Put a second copy of \`spec\` in the tool result; the session log's \`argsRaw\` is the source of truth for the card.
`

/** Registration payload for \`ctx.skills.register\`. */
export const SKILL = {
  name: 'antu-diagram',
  description:
    'Draw legal diagrams (fact, procedure, relationship, justification) with Host tools antu_schema, antu_guide, antu_examples, antu_validate, antu_layout, antu_render inside DeepSeek Harness.',
  whenToUse:
    'The user wants a timeline, flowchart, relationship map, or justification tree as an Antu diagram in this chat.',
  source: 'runtime',
  content: SKILL_CONTENT,
}
