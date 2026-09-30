// ============================================================
//  tools/verify/ci-green.mjs — is every check on this commit green?
//
//  The release workflow runs this before it publishes: a commit may be on main and still have red checks (a merge
//  that bypassed the branch rule, a check that failed after the merge). It asks GitHub for the check runs of the
//  commit and stops unless `verify` is there and every run, except the release job itself, has finished and passed.
//
//    node tools/verify/ci-green.mjs <sha> [--ignore <job name>]
//
//  Reads GITHUB_REPOSITORY (owner/name), GITHUB_API_URL (GitHub Actions sets it) and, if set, GITHUB_TOKEN. The judging is a pure function (`judge`), so the
//  unit test holds it to cases without the network.
// ============================================================

import process from 'node:process'
import { fileURLToPath } from 'node:url'

const REQUIRED = 'verify'
const PASSING = new Set(['success', 'skipped', 'neutral'])

/**
 * @param {Array<{name: string, status: string, conclusion: string|null}>} runs the commit's check runs
 * @param {{ignore?: string}} [opts] a job to leave out (the release job itself is still running)
 * @returns {string[]} what stops the release, empty when everything is green
 */
export function judge(runs, { ignore = '' } = {}) {
  const seen = runs.filter((r) => r.name !== ignore)
  const problems = []
  if (!seen.some((r) => r.name === REQUIRED)) problems.push(`no "${REQUIRED}" check on this commit (did CI run? it may not have started yet)`)
  for (const r of seen) {
    if (r.status !== 'completed') problems.push(`${r.name}: still ${r.status}, wait for it to finish`)
    else if (!PASSING.has(r.conclusion)) problems.push(`${r.name}: ${r.conclusion}`)
  }
  return problems
}

async function fetchRuns(repo, sha, token) {
  const api = process.env.GITHUB_API_URL || 'https://api.github.com'
  const runs = []
  for (let page = 1; ; page++) {
    const res = await fetch(`${api}/repos/${repo}/commits/${sha}/check-runs?per_page=100&page=${page}`, {
      headers: { accept: 'application/vnd.github+json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    })
    if (!res.ok) throw new Error(`GitHub answered ${res.status} for the check runs of ${sha}`)
    const body = await res.json()
    runs.push(...body.check_runs)
    if (body.check_runs.length < 100) return runs
  }
}

async function main() {
  const args = process.argv.slice(2)
  const sha = args.find((a) => /^[0-9a-f]{7,40}$/.test(a))
  const ignore = args.includes('--ignore') ? args[args.indexOf('--ignore') + 1] : ''
  const repo = process.env.GITHUB_REPOSITORY
  if (!sha || !repo) {
    console.error('usage: GITHUB_REPOSITORY=owner/name node tools/verify/ci-green.mjs <sha> [--ignore <job name>]')
    process.exit(2)
  }
  const runs = await fetchRuns(repo, sha, process.env.GITHUB_TOKEN)
  const problems = judge(runs, { ignore })
  if (problems.length) {
    console.error(`${sha.slice(0, 7)} is not green (${runs.length} checks):`)
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }
  console.log(`${sha.slice(0, 7)} is green (${runs.filter((r) => r.name !== ignore).length} checks)`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message)
    process.exit(2)
  })
}
