// ============================================================
//  tools/dsh/src/host.mjs — Host apply for @zh-xx/antu-dsh
//
//  Registers native tools (antu_validate / antu_layout / antu_render), the three
//  read-only reference tools (antu_schema / antu_guide / antu_examples) and an
//  in-memory skill (antu-diagram). Built into package/index.js by build.mjs.
// ============================================================

import { createRequire } from 'node:module'
import { dirname } from 'node:path'

import { defineTool } from '@deepseek-ai/dsh-tools'
// A namespace import, not named imports: the installed `@zh-xx/antu` may be older than this plugin, and
// `import { describe } …` against a package without that export fails at link time, taking all six tools
// down with it. With a namespace, an old package still loads and only the field table reports itself.
import * as antuValidate from '@zh-xx/antu/validate'
import { renderHtml } from '@zh-xx/antu/html'

import { sessionCwd, runValidate, runLayout, runRender, renderPresentation, readGuide, listExamples, readExample } from './tools.mjs'
import { SKILL } from './skill.mjs'

/** Cordis service ids required to activate (skills are optional). */
export const inject = ['tools']

/**
 * The root of the installed `@zh-xx/antu` package: the guides it ships under `spec/agent` and the
 * examples it lists under `examples/agent`. Resolved when a lookup runs, so importing the plugin never
 * depends on it being installed; a failure is reported as a tool result, not a crash.
 */
function antuPackageRoot() {
  return dirname(createRequire(import.meta.url).resolve('@zh-xx/antu/package.json'))
}

/** Run a package-root lookup, turning "the package is missing" into the same `{ ok: false, reason }` shape. */
function withPackageRoot(lookup) {
  try {
    return lookup(antuPackageRoot())
  } catch (e) {
    return { ok: false, reason: `could not find the \`@zh-xx/antu\` package: ${e.message}` }
  }
}

/**
 * The field table of one type, from whichever `@zh-xx/antu` is installed. `describe` was added after
 * 0.14.0, so an older package (still fine for guides, examples, validation and layout) reports only
 * this one lookup as unavailable instead of failing the whole plugin at import.
 */
export function describeFieldTable(antu, type = 'fact') {
  if (typeof antu?.describe !== 'function') {
    return {
      ok: false,
      reason:
        'the installed `@zh-xx/antu` is too old for the field table (no `describe` export). Update `@zh-xx/antu`; antu_guide and antu_examples still work.',
    }
  }
  return antu.describe(type)
}

const SPEC_PARAM = {
  type: 'json',
  required: true,
  description:
    'The Antu JSON (envelope + content). See antu_schema, antu_guide and the antu-diagram skill before writing.',
}

const TYPE_PARAM = {
  type: 'string',
  description:
    'Which diagram type: fact (timeline), procedure (flowchart), relationship (map) or justification (tree). Omit for fact.',
}

const KIND_PARAM = {
  type: 'string',
  description:
    'Which way of drawing (fact: timeline, chronicle, scale; relationship: graph, focus, matrix, equity, authority, related, path; procedure: flow, route). Omit for the default.',
}

const THEME_PARAM = {
  type: 'string',
  enum: ['document', 'modern', 'legal'],
  description:
    'Page look: document (print B&W, default), modern, or legal (navy). Omit to let the reader choose.',
}

function textBlocks(text) {
  return [{ type: 'text', text }]
}

/** "1. first\n2. second" */
function numbered(list) {
  return list.map((item, i) => `${i + 1}. ${item}`).join('\n')
}

function registerTools(ctx) {
  ctx.tools.register(
    defineTool({
      name: 'antu_validate',
      description:
        'Check whether an Antu JSON is valid. Returns each problem (field path and event id). When it passes it may still add notes. Run this right after writing JSON; do not render first.',
      parameters: { spec: SPEC_PARAM },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', required: true },
            errors: { type: 'array', required: true, items: { type: 'string' } },
            notes: { type: 'array', required: true, items: { type: 'string' } },
          },
        },
        render(_args, value) {
          if (!value.ok) {
            return textBlocks(`Validation failed:\n\n${numbered(value.errors)}`)
          }
          const notes = value.notes.length ? `\n\nNotes:\n${numbered(value.notes)}` : ''
          return textBlocks(
            `Validation passed. Next: antu_layout for the geometry, or antu_render for the HTML.${notes}`,
          )
        },
      },
      async execute(args) {
        return runValidate(args.spec, { validate: antuValidate.validate })
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'antu_layout',
      description:
        'Without rendering, work out the layout: content size, fit zoom, suggested orientation, whether it fits. Faster than a screenshot for "will this be too wide?".',
      parameters: {
        spec: SPEC_PARAM,
        kind: KIND_PARAM,
        orientation: {
          type: 'string',
          enum: ['vertical', 'horizontal'],
          description: 'Omit and the engine suggests one from the content.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            ok: { type: 'boolean', required: true },
          },
        },
        render(_args, value) {
          if (!value.ok) {
            const errs = Array.isArray(value.errors) && value.errors.length ? `\n\n${numbered(value.errors)}` : ''
            return textBlocks(`${value.reason || 'Layout failed.'}${errs}`)
          }
          return textBlocks(value.text)
        },
      },
      async execute(args) {
        return runLayout(args.spec, {
          layout: antuValidate.layout,
          kind: args.kind,
          orientation: args.orientation,
        })
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'antu_render',
      description:
        'Turn the JSON into one self-contained HTML under the session workspace. Validates first; produces no file if that fails. The chat card draws from the call arguments; the file is for archive and open-in-sidebar.',
      parameters: {
        spec: SPEC_PARAM,
        outPath: {
          type: 'string',
          description:
            'Output path. Relative paths and the default (`<title>.html`) are under the session workspace. Prefer relative paths.',
        },
        kind: KIND_PARAM,
        theme: THEME_PARAM,
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            ok: { type: 'boolean', required: true },
          },
        },
        render(_args, value) {
          if (!value.ok) {
            if (Array.isArray(value.errors) && value.errors.length) {
              return textBlocks(`Validation failed; fix these first:\n\n${numbered(value.errors)}`)
            }
            return textBlocks(value.reason || 'Render failed.')
          }
          return textBlocks(
            `Written: ${value.path}\nSize: ${Math.round(value.bytes / 1024)} KB\nOpen the file in the sidebar, or double-click it offline.`,
          )
        },
        // Lossless JSON on every path, failures included (see renderPresentation)
        presentationMeta(_args, value) {
          return renderPresentation(value)
        },
      },
      async execute(args, exec) {
        return runRender(args.spec, {
          renderHtml,
          outPath: args.outPath,
          kind: args.kind,
          theme: args.theme,
          cwd: sessionCwd(exec),
        })
      },
    }),
  )

  // ---------------------------------------------------------------
  // Reference material: the field table, the mechanism notes, the examples
  // ---------------------------------------------------------------
  // The same three read-only lookups as the MCP server, so a model never has to search the filesystem
  // for documentation. The package root is resolved from `@zh-xx/antu`, the dependency that ships both
  // `spec/agent/<type>/guide.md` and `examples/agent/<type>/*.json`.
  const TEXT_OUTPUT = {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean', required: true },
        text: { type: 'string' },
        reason: { type: 'string' },
      },
    },
    render(_args, value) {
      return textBlocks(value.ok ? value.text : value.reason)
    },
  }

  ctx.tools.register(
    defineTool({
      name: 'antu_schema',
      description:
        'The field list of one diagram type: what is required, of what type, one line of explanation. Read this before writing JSON. Then call antu_guide (how the data becomes the picture) and antu_examples (how one is written). Cross-field rules are not in this table: call antu_validate after writing and it reports each one.',
      parameters: { type: TYPE_PARAM },
      output: TEXT_OUTPUT,
      async execute(args) {
        return describeFieldTable(antuValidate, args.type ?? 'fact')
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'antu_guide',
      description:
        'One page on how the data becomes the picture for one type. Read it once before writing JSON; it saves a few rounds of validation. The field list is antu_schema, real examples to copy from are antu_examples.',
      parameters: { type: TYPE_PARAM },
      output: TEXT_OUTPUT,
      async execute(args) {
        return withPackageRoot((root) => readGuide(root, args.type ?? 'fact'))
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'antu_examples',
      description:
        'List the small examples of one type, or fetch one in full. With no arguments you get the English examples (about 1 KB each, one idea each). A good first pass is: antu_schema for the fields, antu_guide for the mechanism, then fetch 1-minimal.en.json here to see how one is written. Pass file to fetch one; pass lang "zh-CN" to list the Chinese copies of the same examples.',
      parameters: {
        type: TYPE_PARAM,
        file: {
          type: 'string',
          description:
            'One example to fetch in full, e.g. `1-minimal.en.json` (a name antu_examples listed). Omit to list them.',
        },
        lang: {
          type: 'string',
          enum: ['en', 'zh-CN'],
          description: 'Which language to list: `en` (default) or `zh-CN` (the paired Chinese copies).',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', required: true },
            file: { type: 'string' },
            text: { type: 'string' },
            reason: { type: 'string' },
            examples: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  file: { type: 'string', required: true },
                  title: { type: 'string', required: true },
                },
              },
            },
          },
        },
        render(_args, value) {
          if (!value.ok) return textBlocks(value.reason)
          if (typeof value.text === 'string') {
            return textBlocks(`# ${value.file}\n\n\`\`\`json\n${value.text}\n\`\`\``)
          }
          const rows = value.examples.map((e) => `- ${e.file}\n    ${e.title}`)
          return textBlocks(`Small examples (about 1 KB each, start with 1-minimal):\n\n${rows.join('\n')}`)
        },
      },
      async execute(args) {
        const type = args.type ?? 'fact'
        if (args.file) {
          return withPackageRoot((root) => {
            const r = readExample(root, type, args.file)
            return r.ok ? { ...r, file: args.file } : r
          })
        }
        return withPackageRoot((root) => listExamples(root, type, args.lang ?? 'en'))
      },
    }),
  )
}

/**
 * @param {import('cordis').Context} ctx
 */
export function apply(ctx) {
  registerTools(ctx)
  // Skills service is optional: profiles without it still get the Host tools.
  ctx.inject(['skills'], (skillCtx) => {
    skillCtx.skills.register(SKILL)
  })
}
