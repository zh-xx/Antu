// What a host asks of a mounted diagram by the ids of its spec (issue 164: select, focus, highlight) and how it
// opens (issue 165: initial), the parts that need no browser: the item -> canvas node mapping on every example and
// every kind, and the environment the commands go through. The browser side is in tools/verify/embed.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import '../src/renderers/index.js'
import { layoutOf, layoutKindsOf, listKnowledgeTypes } from '../src/core/registry.js'
import { itemOf, nodesOfItem, pinTargetOf, PINNABLE_TYPES } from '../src/core/items.js'
import { embeddedEnv, standaloneEnv } from '../src/shell/env.js'

const json = (p) => JSON.parse(readFileSync(p, 'utf8'))
const examples = (type) =>
  ['examples', 'examples/agent'].flatMap((base) => {
    const dir = join(base, type)
    return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [join(dir, f), json(join(dir, f))])
  })

test('every card a reader can pin is found again by the id of its item, and select pins a card of that item', () => {
  let checked = 0
  for (const { type } of listKnowledgeTypes()) {
    for (const [file, spec] of examples(type)) {
      for (const kind of layoutKindsOf(type)) {
        const nodes = layoutOf(type, kind)(spec, {}).nodes ?? []
        for (const n of nodes) {
          if (!PINNABLE_TYPES.has(n.type)) continue
          const found = itemOf(spec, n.id)
          if (!found) continue
          const id = found.item.id
          const at = `${file} ${kind} ${n.id}`
          assert.ok(nodesOfItem(spec, nodes, id).includes(n.id), `${at}: not found by "${id}"`)
          const target = pinTargetOf(spec, nodes, id)
          assert.ok(target, `${at}: select would pin nothing`)
          assert.equal(itemOf(spec, target)?.item, found.item, `${at}: select would pin ${target}, another item`)
          checked++
        }
      }
    }
  }
  assert.ok(checked > 500, `only ${checked} cards`)
})

test('a copy drawn more than once is found by every copy; the first is the one pinned', () => {
  const nodes = [
    { id: 'e-1@r0', type: 'rnode' },
    { id: 'x', type: 'rnode' },
    { id: 'e-1@r1', type: 'rnode' },
  ]
  const spec = { type: 'relationship', entities: [{ id: 'e-1' }, { id: 'x' }] }
  assert.deepEqual(nodesOfItem(spec, nodes, 'e-1'), ['e-1@r0', 'e-1@r1'])
  assert.equal(pinTargetOf(spec, nodes, 'e-1'), 'e-1@r0')
})

test('a rule is its row of the table, and the row comes before a node of the same item', () => {
  const spec = json('examples/agent/procedure/7-rules.en.json')
  const rule = spec.rules[0]
  const nodes = layoutOf('procedure', 'flow')(spec, {}).nodes
  assert.deepEqual(nodesOfItem(spec, nodes, rule.id), [`rule:${rule.id}`])
  assert.equal(pinTargetOf(spec, nodes, rule.id), `rule:${rule.id}`)
})

test('ids that name no item, ids with a mark of a view, and nodes no reader can pin find nothing to pin', () => {
  const spec = json('examples/agent/procedure/4-stages.en.json')
  const nodes = layoutOf('procedure', 'flow')(spec, {}).nodes
  for (const id of ['no such item', null, undefined, `${spec.nodes[0].id}@r0`]) {
    assert.deepEqual(nodesOfItem(spec, nodes, id), [], String(id))
    assert.equal(pinTargetOf(spec, nodes, id), null, String(id))
  }
  // a node that stands for an item but is no card (none of the examples draws one yet): highlight and focus
  // find it, select has nothing to pin
  const band = [{ id: spec.stages[0].id, type: 'stageBand' }, ...nodes]
  assert.deepEqual(nodesOfItem(spec, band, spec.stages[0].id), [spec.stages[0].id])
  assert.equal(pinTargetOf(spec, band, spec.stages[0].id), null)
})

test('the environment: commands say who answers, marks stay until changed, initial reaches the diagram', () => {
  const env = embeddedEnv({ initial: { headerFolded: true } })
  assert.deepEqual(env.initial, { headerFolded: true })
  assert.deepEqual(standaloneEnv().initial, {}, 'the viewer page is asked nothing')

  assert.equal(env.commands.has('pin'), false)
  const off = env.commands.on('pin', () => 'pinned')
  assert.equal(env.commands.has('pin'), true)
  assert.equal(env.commands.run('pin', 'n-1'), 'pinned')
  off()
  assert.equal(env.commands.has('pin'), false)

  let heard = 0
  const stop = env.highlight.subscribe(() => heard++)
  assert.deepEqual(env.highlight.get(), [])
  env.highlight.set(['a', 'b'])
  assert.deepEqual(env.highlight.get(), ['a', 'b'])
  assert.equal(heard, 1)
  stop()
  env.highlight.set([])
  assert.equal(heard, 1, 'nobody listens once unsubscribed')
  assert.notEqual(embeddedEnv().highlight, env.highlight, 'two diagrams have their own marks')
})
