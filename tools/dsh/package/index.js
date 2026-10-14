// ============================================================
//  tools/dsh/src/host.mjs — Host apply for @zh-xx/antu-dsh
//
//  Registers native tools (antu_validate / antu_layout / antu_render) and an
//  in-memory skill (antu-diagram). Built into package/index.js by build.mjs.
// ============================================================

import { defineTool } from '@deepseek-ai/dsh-tools'
import { validate, layout } from '@zh-xx/antu/validate'
import { renderHtml } from '@zh-xx/antu/html'

import { sessionCwd, runValidate, runLayout, runRender } from './lib/tools.mjs'
import { SKILL } from './lib/skill.mjs'

/** Cordis service ids required to activate (skills are optional). */
export const inject = ['tools']

const SPEC_PARAM = {
  type: 'json',
  required: true,
  description:
    'The Antu JSON (envelope + content). See the antu-diagram skill and antu_validate before rendering.',
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
            const lines = value.errors.map((e, i) => `${i + 1}. ${e}`)
            return textBlocks(`Validation failed:\n\n${lines.join('\n')}`)
          }
          const notes = value.notes.length
            ? `\n\nNotes:\n${value.notes.map((n, i) => `${i + 1}. ${n}`).join('\n')}`
            : ''
          return textBlocks(
            `Validation passed. Next: antu_layout for the geometry, or antu_render for the HTML.${notes}`,
          )
        },
      },
      async execute(args) {
        return runValidate(args.spec, { validate })
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
            const errs = Array.isArray(value.errors) && value.errors.length
              ? `\n\n${value.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
              : ''
            return textBlocks(`${value.reason || 'Layout failed.'}${errs}`)
          }
          return textBlocks(value.text)
        },
      },
      async execute(args) {
        return runLayout(args.spec, {
          layout,
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
              return textBlocks(
                `Validation failed; fix these first:\n\n${value.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`,
              )
            }
            return textBlocks(value.reason || 'Render failed.')
          }
          return textBlocks(
            `Written: ${value.path}\nSize: ${Math.round(value.bytes / 1024)} KB\nOpen the file in the sidebar, or double-click it offline.`,
          )
        },
        presentationMeta(_args, value) {
          if (!value.ok || typeof value.path !== 'string') return undefined
          return { path: value.path, title: value.title ?? '', bytes: value.bytes }
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
