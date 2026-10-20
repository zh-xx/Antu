#!/usr/bin/env node
// ============================================================
//  tools/mcp/server.mjs —— the MCP server for Antu
//
//  The entry point for agents. Three design principles:
//
//  1. **The engine does not generate JSON.** There is no "write me a JSON" tool here.
//     Reading documents, extracting facts and writing JSON are the agent's job; the
//     server only provides the spec, examples, validation, geometry, rendering, preview.
//
//  2. **Let the agent "see".** Validation can all pass and the layout still be sound,
//     and the diagram may yet look bad. antu_preview returns the result as an image, so
//     the agent checks it with its own eyes. Without this step an agent writes blind.
//
//  3. **If it can run locally, do not go online.** Validation and geometry are pure JS
//     and need no browser; preview reuses the local Chrome. The whole server makes no
//     network access.
//
//  Start-up: stdio transport, launched by the MCP client. It can also be run by hand
//  with `node tools/mcp/server.mjs` (it then waits for JSON-RPC on stdin).
// ============================================================

import { tEn } from '../../src/core/i18n.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { engineVersion } from '../lib/make-html.mjs'
import {
  describeSchema,
  listKnowledgeTypes,
  renderHtml,
  listExamples,
  readExample,
  listAgentGuides,
  readAgentGuide,
} from './engine.mjs'
import { THEME_IDS } from '../../src/theme/themes.js'
import { PREVIEW_CHECK, kindProblem, validate, validationMessage, layoutMessage } from '../lib/report.mjs'
import { formatVersions, versionsReport } from '../lib/versions.mjs'
import { screenshot, findChrome } from './preview.mjs'

// The version is written once, in package.json (spec/versioning.md)
// What an agent needs when it has only this server and no skill: which diagram to choose, the order of the tools, and
// the rules about not inventing. The skill (skills/antu/SKILL.md) says the same in its own words.
const INSTRUCTIONS = `Antu draws legal diagrams as one offline HTML file from JSON that you write. The server draws; it never writes the JSON.

Choose the type from what the user wants to show (if it fits two, make two diagrams and say so; if it fits none, say Antu does not draw it):
- fact: what happened, in order, and who did it (a timeline of a case).
- procedure: the steps of a process, with branches (contract performance, litigation or arbitration).
- relationship: who the parties are and how they are tied (shareholding, loans, guarantees, control, regulators).
- justification: why a court decided as it did (conclusion, issues, norms, elements, facts).
Always pass this type to antu_schema, antu_guide and antu_examples: without it they answer for fact.

Order of work: antu_schema (fields) -> antu_guide (how the data becomes the picture) -> antu_examples (start with 1-minimal) -> write the JSON in the user's language -> antu_validate until it passes -> antu_layout (size and orientation; split the diagram if it says the text is too small) -> antu_render, and give the user the full path of the file it wrote. antu_preview needs Chrome on the machine; if it is missing, say that you could not look at the result.

What goes into the diagram comes from the user's material, not from you:
- Never invent a date, a time, an article number, a version of a statute, a case number or a name. If the material does not say, leave the field out or ask the user.
- Never give a party an identity, role or side the material does not state (lender or borrower, plaintiff or defendant, guarantor, seller or buyer), and do not infer one from a verb. Leave role out (it is optional) or ask; if you infer one at the user's request, say in your reply that it is an inference.
- Something you are not sure of, or the user is unsure of: leave it out, say so, and offer to add it once confirmed.
- An event with no date: leave date out. Do not borrow another event's date.
- Never drop facts to make a diagram fit; split it instead.`

const server = new McpServer({ name: 'antu', version: engineVersion() }, { instructions: INSTRUCTIONS })

/** The JSON in the spec is an arbitrarily nested structure; the schema is not redefined here: validation is the engine's job */
const specArg = z.looseObject({}).describe('the Antu JSON (envelope + content layer; see the spec resources)')

/** A way of drawing the type: the same JSON, drawn another way (the reader switches kind in the label card) */
const themeArg = z
  .enum(THEME_IDS)
  .optional()
  .describe('the look of the page: document (black and white, for print; the default), modern (rounded, light), legal (navy) or dark (the modern look on a dark ground, for a dark host; the whole page is dark). Omit it and the reader chooses in the page; give it and the page is fixed to it')

const kindArg = z
  .string()
  .optional()
  .describe('which way of drawing (fact: timeline, chronicle or scale; relationship: graph, focus, matrix, equity, authority, related or path; procedure: flow or route); omit it for the default, the first')



const OK = (text) => ({ content: [{ type: 'text', text }] })
const FAIL = (text) => ({ content: [{ type: 'text', text }], isError: true })

// ---------------------------------------------------------------
// Examples: let the agent first see "how others wrote it"
// ---------------------------------------------------------------
server.registerTool(
  'antu_examples',
  {
    title: 'See the examples',
    description:
      'List the examples, or fetch one in full. **With no arguments you get the small ones**' +
      '(as small as possible, one idea each). A good first pass is: ' +
      'antu_schema for the fields, antu_guide for the mechanism, then fetch 1-minimal.en.json here to see how one is written.\n' +
      'Three batches: agent (the default, 1 KB small examples, the ones to write data from), ' +
      'real (real cases, 4-8 KB, for reference), ' +
      'raw (raw judgments, **not examples**: the source material these examples came from, never use it as a template).',
    inputSchema: {
      file: z
        .string()
        .optional()
        .describe('the one to fetch: the path the list shows (examples/agent/relationship/3-guarantee.en.json) or just its name (3-guarantee.en.json, with type). Omit to list them'),
      group: z
        .enum(['agent', 'real', 'raw'])
        .optional()
        .describe('which batch to list: agent (default, small examples) / real (real cases) / raw (source material, not examples)'),
      type: z.string().optional().describe('fact, procedure, relationship or justification (fact if omitted)'),
    },
  },
  async ({ file, group = 'agent', type = 'fact' }) => {
    // When the type does not exist, say clearly that it is "not built yet" rather than
    // answering "0 items" — which would be read as "this type has examples, they are
    // just empty".
    if (!listKnowledgeTypes().some((t) => t.type === type)) {
      const known = listKnowledgeTypes().map((t) => `${t.type} (${tEn(t.labelKey)})`).join(', ')
      return FAIL(`no examples for type "${type}" yet. Available: ${known || '(none)'}.`)
    }
    if (file) {
      // A bare name ("3-guarantee.en.json") is the common slip: look for it among the small examples, the asked type first
      const bare = !String(file).includes('/')
      const types = [type, ...listKnowledgeTypes().map((t) => t.type).filter((t) => t !== type)]
      const one = readExample(file) ?? (bare ? types.map((t) => readExample(`agent/${t}/${file}`)).find(Boolean) : null)
      if (!one) return FAIL(`example not found: ${file}. Call antu_examples with no arguments to see the list.`)
      return OK(`# ${file}\n\n\`\`\`json\n${one.text}\n\`\`\``)
    }
    const rows = listExamples({ type, group })
    const lines = rows.map(
      (r) =>
        `- ${r.file}  (${(r.bytes / 1024).toFixed(1)} KB)\n    ${r.title}\n    ${r.line}`,
    )
    if (rows.length === 0 && group === 'agent') {
      return OK(`no small examples for type "${type}" yet. Try group="real".`)
    }
    const head =
      group === 'real'
        ? `Real cases: ${rows.length} (4-8 KB each, for reference, write your data from the default small examples first):`
        : group === 'raw'
          ? `Raw judgments: ${rows.length} (**not examples**, never use them as a template; the source material these examples came from):`
          : `Small examples: ${rows.length} (about 1 KB each, start with 1-minimal):`
    const tail =
      group === 'agent'
        ? '\n\nThere are also real cases (group="real") and source material (group="raw").'
        : '\n\nTo write data, use the default small examples (no arguments).'
    return OK(`${head}\n\n${lines.join('\n')}${tail}`)
  },
)

// ---------------------------------------------------------------
// Reference material for the agent: the field table and the mechanism notes
// ---------------------------------------------------------------
// These two are **for the agent**, and are not the same thing as the human documents
// under spec/: the human documents explain "why this was decided at the time", while an
// agent only needs "how to fill it in, how to change it".
// The field table is generated from FACT_FIELDS in the code (see
// renderers/fact/schema.js), so it cannot disagree with the validator.
server.registerTool(
  'antu_schema',
  {
    title: 'Field table',
    description:
      'The field list of one diagram type: what is required, of what type, one line of explanation. **Read this before writing JSON**; ' +
      'about 1.9k tokens. Then call antu_guide (where an event is drawn) and antu_examples (how one is written). ' +
      'Cross-field rules (dangling references, a span running backwards, and so on) are not in this table: ' +
      'call antu_validate after writing and it will report each one.\n' +
      'Pass type: fact, procedure, relationship or justification. Omit it and you get fact, which is wrong for the other three.',
    inputSchema: {
      type: z.string().optional().describe('fact, procedure, relationship or justification (fact if omitted)'),
    },
  },
  async ({ type = 'fact' }) => {
    const r = describeSchema(type)
    return r.ok ? OK(r.text) : FAIL(r.reason)
  },
)

server.registerTool(
  'antu_versions',
  {
    title: 'Versions of the types and the diagrams',
    description:
      'Which diagram types and which ways of drawing (`kind`) there are, with the version and status of each way and the generation of each type\'s JSON format. ' +
      'Read-only; no arguments needed. Use it to see what `kind` values exist and whether one is still experimental or deprecated.',
    inputSchema: {
      type: z.string().optional().describe('only this type (fact, procedure, relationship, justification); omit for all'),
    },
  },
  async ({ type }) => {
    const r = versionsReport(engineVersion(), type)
    return r.types.length ? OK(formatVersions(r)) : FAIL(`no type "${type}". Types: ${versionsReport(engineVersion()).types.map((t) => t.type).join(', ')}`)
  },
)

server.registerTool(
  'antu_guide',
  {
    title: 'Mechanism notes',
    description:
      'One page on how the data becomes the picture. fact: slots set the row; with two or more parties each party\'s groupId ' +
      'sets its side and an event\'s actorIds place it, with one party the event\'s groupId sets the side; and the ' +
      '"one event per cell" limit with its three ways out. procedure: nodes, edges and ' +
      'rules, what the main line is, and when a clause is a rule rather than a branch. relationship: the parties, ' +
      'the ties and the ways of drawing them. justification: conclusion, issues, norms, elements and facts. Read it once before writing JSON ' +
      'and it saves a few rounds of validation. The field list is antu_schema, real examples to copy from are antu_examples.\n' +
      'Pass type: fact, procedure, relationship or justification. Omit it and you get fact, which is wrong for the other three.',
    inputSchema: {
      type: z.string().optional().describe('fact, procedure, relationship or justification (fact if omitted)'),
    },
  },
  async ({ type = 'fact' }) => {
    const text = readAgentGuide(type)
    if (text) return OK(text)
    const known = listAgentGuides()
    return FAIL(`no mechanism notes for type "${type}" yet. Available: ${known.join(', ') || '(none)'}.`)
  },
)

// ---------------------------------------------------------------
// Validation: run this first once written
// ---------------------------------------------------------------
server.registerTool(
  'antu_validate',
  {
    title: 'Validate JSON',
    description:
      'Check whether an Antu JSON is valid. Returns each problem (with its field path and event id, e.g. slots[0].events[1] (ev-2)). ' +
      'When it passes it may still add notes (for a fact diagram: a slot whose date is wholly earlier than the one before). ' +
      '**Run this right after writing the JSON; do not render first.** It is pure computation, needs no browser, and is fast. ' +
      'A passing check says the JSON is well formed, not that it is true: every date, article number and name must come from the user\'s material.',
    inputSchema: { spec: specArg },
  },
  async ({ spec }) => {
    const m = validationMessage(spec)
    // the words are shared with the command line in the skill (tools/lib/report.mjs); the next step is this server's own
    return m.ok
      ? OK(m.text.replace(/^Validation passed\./, 'Validation passed. Next: antu_layout for the geometry, or antu_preview to look at it.'))
      : FAIL(m.text)
  },
)

// ---------------------------------------------------------------
// Geometry: judge "too wide / too empty" without rendering
// ---------------------------------------------------------------
server.registerTool(
  'antu_layout',
  {
    title: 'Work out the geometry',
    description:
      'Without rendering, work out the layout first: how large the content is, how far it is scaled down to fit, ' +
      'and whether vertical or horizontal suits it. For a fact diagram also how many events and ' +
      'columns per side; for a procedure the layers, the widest layer, the loops and the rules. ' +
      'Use it to answer "will this diagram be too wide", far faster than a screenshot.',
    inputSchema: {
      spec: specArg,
      orientation: z.enum(['vertical', 'horizontal']).optional().describe('omit it and the slot-count rule suggests one'),
      summary: z.boolean().optional().describe('fact only: whether the cards show the summary (affects card height, and through it the content size); true by default'),
      kind: kindArg,
    },
  },
  async ({ spec, orientation, summary = true, kind }) => {
    const m = layoutMessage(spec, { orientation, fields: { summary }, kind })
    return m.ok ? OK(m.text) : FAIL(m.text)
  },
)

// ---------------------------------------------------------------
// Render: produce one self-contained HTML
// ---------------------------------------------------------------
server.registerTool(
  'antu_render',
  {
    title: 'Build the self-contained HTML',
    description:
      'Turn the JSON into one self-contained HTML: the engine and the data both live in the file, with no network and no server. ' +
      'Double-click to open it, and send it to someone or archive it as it is (about 2.3 MB). ' +
      '**It validates first**, and produces no file if that fails. Pass outPath (an absolute path in the folder the user works in) ' +
      'and tell the user the full path it returns; keep the JSON next to the HTML, as the same name with .json.',
    inputSchema: {
      spec: specArg,
      outPath: z.string().optional().describe('output path; pass an absolute one. Omit it and the file goes to a default place (dist-html/<title>.html in a checkout, else the current folder)'),
      theme: themeArg,
      kind: kindArg.describe('which way of drawing the page opens in (fact: timeline, chronicle or scale; relationship: graph, focus, matrix, equity, authority, related or path; procedure: flow or route); the reader can still switch. Omit it for the default, the first'),
    },
  },
  async ({ spec, outPath, kind, theme }) => {
    const errors = validate(spec)
    if (errors.length > 0) {
      return FAIL(`Validation failed; fix these first:\n\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`)
    }
    const bad = kindProblem(spec, kind)
    if (bad) return FAIL(bad)
    const { path, bytes } = renderHtml(spec, { outPath, preset: kind || theme ? { ...(kind && { defaultKind: kind }), ...(theme && { theme }) } : undefined })
    return OK(`Written: ${path}\nSize: ${Math.round(bytes / 1024)} KB\nDouble-click to open it; no server needed, and it works offline.`)
  },
)

// ---------------------------------------------------------------
// Preview: let the agent take a look with its eyes
// ---------------------------------------------------------------
server.registerTool(
  'antu_preview',
  {
    title: 'Screenshot it and look',
    description:
      `Render this diagram as a PNG and return it. ${PREVIEW_CHECK} ` +
      'Needs Chrome on this machine (without it, use only antu_validate and antu_layout).',
    inputSchema: {
      spec: specArg,
      orientation: z.enum(['vertical', 'horizontal']).optional().describe('omit it and the slot-count rule picks one'),
      summary: z.boolean().optional().describe('whether to show the summary, true by default'),
      actors: z.boolean().optional().describe('whether to show the party labels, false by default'),
      sources: z.boolean().optional().describe('whether to show the source markers, false by default'),
      kind: kindArg,
      theme: themeArg,
      width: z.number().int().optional().describe('screenshot width, 1600 by default'),
      height: z.number().int().optional().describe('screenshot height, 900 by default'),
    },
  },
  async ({ spec, orientation, summary = true, actors = false, sources = false, width = 1600, height = 900, kind, theme }) => {
    const errors = validate(spec)
    if (errors.length > 0) {
      return FAIL(`Validation failed; fix these before previewing:\n\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`)
    }
    const bad = kindProblem(spec, kind)
    if (bad) return FAIL(bad)
    if (!findChrome()) {
      return FAIL('No Chrome/Chromium found on this machine, so no preview is possible. Use antu_layout to judge the geometry for now.')
    }

    // A preview must be able to specify the orientation and fields, so it uses a
    // temporary file plus a preset; this does not change the user's existing preferences
    // (a preset affects this render only).
    const dir = mkdtempSync(join(tmpdir(), 'antu-shot-'))
    const html = join(dir, 'preview.html')
    try {
      renderHtml(spec, { outPath: html, preset: { orientation, fields: { summary, actors, sources }, kind, theme } })
      const shot = await screenshot(html, { width, height })
      const kb = Math.round(shot.data.length * 0.75 / 1024)
      return {
        content: [
          { type: 'text', text: `Preview: ${shot.cards} cards, ${width}×${height}, took ${shot.ms} ms (about ${kb} KB)` },
          { type: 'image', data: shot.data, mimeType: shot.mimeType },
        ],
      }
    } catch (e) {
      return FAIL(`Preview failed: ${e.message}`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
)

// ---------------------------------------------------------------
// Resources: expose only the spec meant for an agent
// ---------------------------------------------------------------
// This used to expose every spec/*.md, with a separate antu://internal/ for "internal
// documents". That was wrong: **documents meant for humans must not appear among an
// agent's options**, even labelled "internal" — an agent reading down the list will read
// them, and they are tens of thousands of characters written for the designers.
// Now only those under spec/agent/ are exposed, and the prefix needs no second form:
// there is only one kind of reader here.
// One per type: antu://agent/<type>/guide
// The label is a message key (listKnowledgeTypes returns labelKey, not label), so it is
// resolved to the fixed-English word here: an undefined title would reach the agent as
// "Mechanism notes for undefined".
for (const { type, labelKey } of listKnowledgeTypes()) {
  if (!readAgentGuide(type)) continue
  const label = tEn(labelKey)
  server.registerResource(
    `${type}-guide`,
    `antu://agent/${type}/guide`,
    {
      title: `Mechanism notes for ${label}`,
      description: `The spec for an agent: how to draw ${label}`,
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: readAgentGuide(type) ?? '' }],
    }),
  )
}

const transport = new StdioServerTransport()
await server.connect(transport)
