// A source's `quote` is a verbatim excerpt (src/renderers/fact/schema.js, spec/agent/fact/guide.md).
// Where the repository holds the text it comes from (examples/raw/), every piece of the quote must be in it.
//
// The link between an example and its text is the case number: a source of type "case" carries
// loc.caseNo, and the file in examples/raw/ starts with that number. Punctuation and spaces are ignored,
// since a quote is often typed with other punctuation than the page it was taken from.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

const plain = (s) => s.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '')
const pieces = (quote) => quote.split(/…+|\.{3,}/).map(plain).filter(Boolean)

const rawFiles = readdirSync('examples/raw').filter((f) => f.endsWith('.md'))
const rawOf = (caseNo) => rawFiles.find((f) => f.startsWith(caseNo))

const zhExamples = readdirSync('examples/fact').filter((f) => f.endsWith('.zh-CN.json') && !f.startsWith('sample-'))

test('every quote in a fact example is found in its judgment text', () => {
  let checked = 0
  for (const f of zhExamples) {
    const spec = JSON.parse(readFileSync(`examples/fact/${f}`, 'utf8'))
    const caseNo = (spec.sources ?? []).find((s) => s.type === 'case' && s.loc?.caseNo)?.loc.caseNo
    const raw = caseNo && rawOf(caseNo)
    assert.ok(raw, `${f}: no text in examples/raw/ starts with its case number (${caseNo})`)
    const text = plain(readFileSync(`examples/raw/${raw}`, 'utf8'))
    for (const s of spec.sources ?? []) {
      for (const p of s.quote ? pieces(s.quote) : []) {
        assert.ok(text.includes(p), `${f}: quote of ${s.id} is not in ${raw}: "${p.slice(0, 40)}…"`)
        checked += 1
      }
    }
  }
  assert.ok(checked >= 20, `only ${checked} quote pieces checked`)
})

test('the check can fail: a reworded quote is not found', () => {
  const text = plain('孙浩在整个过程中语气平缓；二人只有言语交流')
  assert.ok(text.includes(pieces('孙浩在整个过程中语气平缓……二人只有言语交流')[0]))
  assert.ok(!text.includes(pieces('孙浩全程保持冷静')[0]))
})

test('every text in examples/raw/ is used by an example (none is left over)', () => {
  const used = new Set()
  for (const f of zhExamples) {
    const spec = JSON.parse(readFileSync(`examples/fact/${f}`, 'utf8'))
    const caseNo = (spec.sources ?? []).find((s) => s.type === 'case' && s.loc?.caseNo)?.loc.caseNo
    if (caseNo) used.add(rawOf(caseNo))
  }
  // a contract text belongs to the flowchart example whose contract source names its file
  // (采购合同.docx → 采购合同-….md)
  for (const f of readdirSync('examples/procedure').filter((x) => x.endsWith('.zh-CN.json'))) {
    const spec = JSON.parse(readFileSync(`examples/procedure/${f}`, 'utf8'))
    for (const s of spec.sources ?? []) {
      const stem = s.type === 'contract' && s.loc?.file?.replace(/\.[^.]+$/, '')
      const raw = stem && rawFiles.find((r) => r.startsWith(`${stem}-`))
      if (raw) used.add(raw)
    }
  }
  for (const r of rawFiles) assert.ok(used.has(r), `${r} belongs to no fact example`)
})

// A reasoning example whose judgment has its 本院认为 written out is the court's reasoning drawn out: the
// holding, and the point the court ruled on for each issue, are in that 本院认为 word for word. So far only
// the 方远 judgment has it written out (the corridor case's 本院认为 is still one line).
const REASONING_WRITTEN_OUT = ['fang-yuan-defense-excess.zh-CN.json']
test('the holding and each issue of a reasoning example are in its judgment\'s reasoning', () => {
  let checked = 0
  for (const f of REASONING_WRITTEN_OUT) {
    const spec = JSON.parse(readFileSync(`examples/justification/${f}`, 'utf8'))
    const caseNo = (spec.sources ?? []).find((s) => s.type === 'case' && s.loc?.caseNo)?.loc.caseNo
    const raw = caseNo && rawOf(caseNo)
    assert.ok(raw, `${f}: no text in examples/raw/ for its case number (${caseNo})`)
    const text = readFileSync(`examples/raw/${raw}`, 'utf8')
    const at = text.indexOf('## 本院认为')
    assert.ok(at >= 0, `${raw} has no 本院认为`)
    const reasoning = plain(text.slice(at))
    const byId = Object.fromEntries(spec.nodes.map((n) => [n.id, n]))
    const root = spec.nodes.find((n) => n.kind === 'conclusion' && !n.groupId)
    const heads = spec.links.filter((l) => l.to === root.id).map((l) => byId[l.from])
    for (const n of [root, ...heads]) {
      assert.ok(reasoning.includes(plain(n.label)), `${f}: "${n.label}" (${n.id}) is not in the 本院认为 of ${raw}`)
      checked += 1
    }
  }
  assert.ok(checked >= 6, `only ${checked} points checked`)
})
