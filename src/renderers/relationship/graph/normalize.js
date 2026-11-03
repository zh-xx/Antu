// @ts-check
// ============================================================
//  src/renderers/relationship/graph/normalize.js — repair kind-field marks on a relationship (issue 332)
//
//  A model that writes a relationship gets the parties and ends right far more often than the
//  kind-specific marks: `share` on a debt, `amount` on equity, `secures` on kinship, or an equity
//  `share` written as the string "60". Those are marks, not content, so they can be put right by
//  code. Content (kind, ends, label, detail, directed, a real secures target) is left alone.
//
//  Allow-lists match graph/rules.js. Plain JS; it works on the copy it is given.
// ============================================================

import { tEn } from '../../../core/i18n.js'

/** Same allow-lists as graph/rules.js (rules 9–10) */
const SHARE_KINDS = ['equity']
const AMOUNT_KINDS = ['debt', 'contract']
const SECURES_KINDS = ['guarantee']

/** Optional whitespace, a number in [0, 100], optional %, optional whitespace */
const SHARE_STRING_RE = /^\s*(\d+(?:\.\d+)?)\s*%?\s*$/

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * @param {Record<string, unknown>} r
 * @param {number} i
 */
function atOf(r, i) {
  const id = typeof r.id === 'string' ? r.id : ''
  return id ? `relations[${i}] (${id})` : `relations[${i}]`
}

/**
 * Repair kind-field marks of `spec` in place (the caller hands in a copy).
 * @returns {string[]} what was changed, in words an agent can read; empty when nothing was
 */
export function normalizeRelationship(spec) {
  if (!isObj(spec) || !Array.isArray(spec.relations)) return []
  /** @type {string[]} */
  const changes = []

  spec.relations.forEach((raw, i) => {
    if (!isObj(raw)) return
    /** @type {Record<string, unknown>} */
    const r = raw
    const at = atOf(r, i)
    const kind = typeof r.kind === 'string' ? r.kind : ''

    if (r.share !== undefined && !SHARE_KINDS.includes(kind)) {
      delete r.share
      changes.push(tEn('norm.fieldCleared', { at, field: 'share', kinds: SHARE_KINDS.join(' / ') }))
    } else if (kind === 'equity' && typeof r.share === 'string') {
      const m = SHARE_STRING_RE.exec(r.share)
      if (m) {
        const n = Number(m[1])
        if (n >= 0 && n <= 100) {
          const from = JSON.stringify(r.share)
          r.share = n
          changes.push(tEn('norm.shareCoerced', { at, from, to: String(n) }))
        }
      }
    }

    if (r.amount !== undefined && !AMOUNT_KINDS.includes(kind)) {
      delete r.amount
      changes.push(tEn('norm.fieldCleared', { at, field: 'amount', kinds: AMOUNT_KINDS.join(' / ') }))
    }

    if (r.secures !== undefined && !SECURES_KINDS.includes(kind)) {
      delete r.secures
      changes.push(tEn('norm.fieldCleared', { at, field: 'secures', kinds: SECURES_KINDS.join(' / ') }))
    }
  })

  return changes
}
