// ============================================================
//  tools/trial/run.mjs — one run of the trial: one model, one case
//
//    node tools/trial/run.mjs --case fact-corridor                 (the default model of models.json: deepseek-flash)
//    node tools/trial/run.mjs --model fake --case fact-corridor
//    node tools/trial/run.mjs --model deepseek-flash --case fact-corridor [--max-turns 14] [--out runs] [--skill skills/antu]
//
//  The model gets the skill and the request of the case (tools/trial/cases.json), works in its own folder, and
//  everything is kept in runs/<time>-<model>-<case>/ (not committed): transcript.json, work/ (spec.json,
//  diagram.html), final-*.txt (the command line run once more by this script), preview.png, report.json.
//  The rules of the trial are in spec/trial.md.
// ============================================================

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { callModel, makeTools, runAgent } from './agent.mjs'
import { makeFake } from './fake.mjs'
import { scoreRun } from './score.mjs'

// Node's own fetch does not read HTTPS_PROXY; where a proxy is set (the cloud environment's), this script starts itself
// again with NODE_USE_ENV_PROXY=1 (Node 22.21 or newer), which is read when Node starts.
if (!process.env.NODE_USE_ENV_PROXY && (process.env.HTTPS_PROXY || process.env.https_proxy)) {
  const again = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } })
  process.exit(again.status ?? 1)
}

const REPO = fileURLToPath(new URL('../../', import.meta.url))
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : dflt
}

const HARNESS_NOTE = `

---
Harness note (not part of the skill). You work in a sandbox. \`<skill-dir>\` is the folder \`skill/\`: read its files with read_file (for example \`skill/references/guide-fact.md\`). Run the command line with the \`antu\` tool, giving the arguments after \`antu.mjs\`. Your working folder is the current directory: write \`spec.json\` there and make \`diagram.html\` there. The case material is in \`material/\`.`

/** Take a key's value, and anything that looks like one, out of what is saved */
const redact = (text, cfg) => {
  let t = text
  const key = cfg.keyEnv && process.env[cfg.keyEnv]
  if (key) t = t.split(key).join('***')
  return t.replace(/\bsk-[A-Za-z0-9_-]{16,}/g, '***')
}

/** A Chromium for the picture: ANTU_CHROME if set, else the one of the cloud environment (Playwright's) when there is one */
function findChromium() {
  if (process.env.ANTU_CHROME) return
  for (const p of ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']) if (existsSync(p)) { process.env.ANTU_CHROME = p; return }
}

async function main() {
  findChromium()
  const models = JSON.parse(readFileSync(join(REPO, 'tools/trial/models.json'), 'utf8'))
  const cases = JSON.parse(readFileSync(join(REPO, 'tools/trial/cases.json'), 'utf8'))
  const modelName = arg('model', models.default)
  const caseId = arg('case')
  const cfg = models[modelName]
  const kase = cases.find((c) => c.id === caseId)
  if (!cfg || !kase) {
    console.error(`usage: node tools/trial/run.mjs --model <${Object.keys(models).filter((k) => k !== 'default').join('|')}> (default ${models.default}) --case <${cases.map((c) => c.id).join('|')}>`)
    process.exit(2)
  }
  const skillDir = resolve(REPO, arg('skill', 'skills/antu'))
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dir = resolve(REPO, arg('out', 'runs'), `${stamp}-${modelName}-${caseId}`)
  const work = join(dir, 'work')
  const materialDir = join(dir, 'material')
  mkdirSync(work, { recursive: true })
  mkdirSync(materialDir, { recursive: true })
  const materialName = 'case.md'
  copyFileSync(join(REPO, kase.material), join(materialDir, materialName))
  const material = readFileSync(join(materialDir, materialName), 'utf8')
  const referenceText = readFileSync(join(REPO, kase.reference), 'utf8')

  const provider = cfg.fake ? makeFake({ referenceText }) : (messages) => callModel(cfg, messages)
  const tools = makeTools({ work, skillDir, materialDir })
  const system = readFileSync(join(skillDir, 'SKILL.md'), 'utf8') + HARNESS_NOTE
  const user = `${kase.ask}\n\n案件材料在 material/${materialName}。请把 JSON 写成 spec.json，把页面做成 diagram.html（都在当前工作目录）。做完后，按 skill 的要求告诉我结果。`

  console.log(`run: ${modelName} / ${caseId} -> ${dir}`)
  const t0 = Date.now()
  let result
  try {
    result = await runAgent({ provider, system, user, tools, maxTurns: Number(arg('max-turns', 14)), onTurn: (i, m) => console.log(`  turn ${i + 1}: ${m.tool_calls?.length ? m.tool_calls.map((c) => c.function.name).join(', ') : 'answer'}`) })
  } catch (e) {
    result = { messages: [], turns: 0, usage: { prompt: 0, completion: 0 }, stopped: `error: ${redact(e.message, cfg)}` }
    console.error(result.stopped)
  }
  writeFileSync(join(dir, 'transcript.json'), redact(JSON.stringify(result.messages, null, 2), cfg))

  // the command line once more, by this script, so that every run ends the same way
  const specPath = join(work, 'spec.json')
  const hasSpec = existsSync(specPath)
  let validateExit = 1
  if (hasSpec) {
    for (const [name, args] of [['validate', ['validate', 'spec.json']], ['layout', ['layout', 'spec.json']], ['render', ['render', 'spec.json', '-o', 'final.html']], ['preview', ['preview', 'spec.json', '-o', 'final.png']]]) {
      const out = tools.antu({ args })
      writeFileSync(join(dir, `final-${name}.txt`), out)
      if (name === 'validate') validateExit = Number(out.match(/^exit code (\d+)/)?.[1] ?? 1)
    }
    if (existsSync(join(work, 'final.png'))) copyFileSync(join(work, 'final.png'), join(dir, 'preview.png'))
  }
  let spec = null
  try { spec = hasSpec ? JSON.parse(readFileSync(specPath, 'utf8')) : null } catch { /* not JSON: valid stays false */ }
  const last = [...result.messages].reverse().find((m) => m.role === 'assistant' && m.content)
  writeFileSync(join(dir, 'summary.txt'), redact(last?.content ?? '(the model said nothing at the end)', cfg))
  const report = { model: modelName, case: caseId, type: kase.type, seconds: Math.round((Date.now() - t0) / 1000), hasSpec, ...scoreRun({ spec, material, reference: JSON.parse(referenceText), validateExit, turns: result.turns, usage: result.usage, stopped: result.stopped }) }
  writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

await main()
