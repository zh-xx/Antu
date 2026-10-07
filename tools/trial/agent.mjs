// ============================================================
//  tools/trial/agent.mjs — a small agent: a model, three tools and a loop
//
//  The model is given the skill (SKILL.md) and a request, and may read files, write files in its own working folder
//  and run the skill's command line. It sees what the command says (the checker's problems, the layout notes) and may
//  correct itself, until it stops asking for tools or the turns run out. Any model with an OpenAI-compatible
//  chat/completions interface with tool calls can be used (tools/trial/models.json).
//
//  What it is for: to see what level of drawing the engine lets a model reach (spec/trial.md). It is not a real agent
//  product: those have their own prompts, tools and ways of loading a skill.
//
//  Safety: the model reaches only the three tools. It reads the case material, the skill folder and its working
//  folder, and writes only in its working folder; the command line runs with a clean environment (no variable of this
//  process is passed on). The key of a model, when one is needed, never leaves `callModel`.
// ============================================================

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

export const TOOLS = [
  { type: 'function', function: { name: 'read_file', description: 'Read a text file. Paths: skill/... (the skill folder), material/... (the case material), or a file in your working folder.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'write_file', description: 'Write a text file in your working folder (a relative path, no ..).', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'antu', description: 'Run the skill\'s command line: node <skill-dir>/scripts/antu.mjs <args>. Give the arguments after antu.mjs, e.g. ["validate","spec.json"], ["layout","spec.json"], ["render","spec.json","-o","diagram.html"], ["preview","spec.json","-o","shot.png"]. File names are in your working folder.', parameters: { type: 'object', properties: { args: { type: 'array', items: { type: 'string' } } }, required: ['args'] } } },
]

const SUBCOMMANDS = ['validate', 'layout', 'render', 'preview']
const CAP = 60_000

/** The three tools, bound to one working folder, one skill folder and one case-material folder */
export function makeTools({ work, skillDir, materialDir }) {
  const inside = (root, p) => {
    const full = resolve(root, p)
    if (full !== root && !full.startsWith(root + sep)) throw new Error(`path outside the allowed folder: ${p}`)
    return full
  }
  const readable = (p) => {
    if (p.startsWith('skill/')) return inside(skillDir, p.slice(6))
    if (p.startsWith('material/')) return inside(materialDir, p.slice(9))
    return inside(work, p)
  }
  return {
    read_file({ path }) {
      const full = readable(String(path))
      if (!existsSync(full) || !statSync(full).isFile()) return `error: no such file: ${path}`
      return readFileSync(full, 'utf8').slice(0, CAP)
    },
    write_file({ path, content }) {
      const full = inside(work, String(path))
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, String(content))
      return `wrote ${path} (${String(content).length} characters)`
    },
    antu({ args }) {
      if (!Array.isArray(args) || !SUBCOMMANDS.includes(args[0])) return `error: the first argument must be one of ${SUBCOMMANDS.join(', ')}`
      const clean = args.map(String)
      for (const a of clean) if (a.startsWith('/') || a.split('/').includes('..')) return `error: file names must be relative to your working folder: ${a}`
      const r = spawnSync(process.execPath, [join(skillDir, 'scripts/antu.mjs'), ...clean], {
        cwd: work,
        encoding: 'utf8',
        timeout: 120_000,
        env: { PATH: process.env.PATH, HOME: work, ANTU_NO_UPDATE_NOTIFIER: '1', ...(process.env.ANTU_CHROME ? { ANTU_CHROME: process.env.ANTU_CHROME } : {}) },
      })
      return `exit code ${r.status}\n${(r.stdout || '') + (r.stderr || '')}`.slice(0, 8000)
    },
  }
}

/** One call of an OpenAI-compatible chat/completions endpoint. A model with `keyEnv: null` is reached without a key header (a proxy adds it). */
export async function callModel(cfg, messages, { signal } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (cfg.keyEnv) {
    if (!process.env[cfg.keyEnv]) throw new Error(`the variable ${cfg.keyEnv} is not set`)
    headers.Authorization = `Bearer ${process.env[cfg.keyEnv]}`
  }
  const body = (msgs) => JSON.stringify({ model: cfg.model, messages: msgs, tools: TOOLS, tool_choice: 'auto', max_tokens: cfg.maxTokens ?? 16000 })
  const post = (msgs) => fetch(`${cfg.baseUrl}/chat/completions`, { method: 'POST', headers, body: body(msgs), signal })
  let res = await post(messages)
  if (res.status === 400) {
    // some models refuse their own reasoning text sent back: try once without it
    const stripped = messages.map((m) => { const { reasoning_content: _dropped, ...rest } = m; return rest })
    const again = await post(stripped)
    if (again.ok) res = again
  }
  if (!res.ok) throw new Error(`the model answered ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

/**
 * The loop. `provider(messages)` returns a chat/completions answer (the real one, or the fake of fake.mjs).
 * @returns {{messages: object[], turns: number, usage: {prompt: number, completion: number}, stopped: string}}
 */
export async function runAgent({ provider, system, user, tools, maxTurns = 14, onTurn = () => {} }) {
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }]
  const usage = { prompt: 0, completion: 0 }
  let stopped = 'turns'
  let turns = 0
  for (; turns < maxTurns; turns += 1) {
    const answer = await provider(messages)
    const msg = answer.choices?.[0]?.message
    if (!msg) throw new Error(`no message in the answer: ${JSON.stringify(answer).slice(0, 200)}`)
    usage.prompt += answer.usage?.prompt_tokens ?? 0
    usage.completion += answer.usage?.completion_tokens ?? 0
    messages.push(msg)
    onTurn(turns, msg)
    const calls = msg.tool_calls ?? []
    if (!calls.length) { stopped = 'done'; turns += 1; break }
    for (const c of calls) {
      let out
      try {
        const args = JSON.parse(c.function.arguments || '{}')
        const tool = tools[c.function.name]
        out = tool ? String(tool(args)) : `error: no such tool: ${c.function.name}`
      } catch (e) {
        out = `error: ${e.message}`
      }
      messages.push({ role: 'tool', tool_call_id: c.id, content: out })
    }
  }
  return { messages, turns, usage, stopped }
}
