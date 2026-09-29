// ============================================================
//  src/renderers/procedure/flow/ruleTable.js — the rule table under the flowchart
//
//  A rule is "if <when>, then <then>", in force throughout some stages (breach, delay liability,
//  a right to terminate). It is not a step of the flow, and it is read as a list: what happens
//  if … . So the rules are a table under the diagram, one row each, three columns:
//
//      situation (when)  |  consequence (then)  |  stages it applies in
//
//  grouped: first one group per end the rules lead to ("may lead to «contract terminated»"),
//  then the other rules; inside a group, by the first stage a rule applies in, then as written.
//  Scope and outcome are written out, not implied by position, width or lines: the earlier
//  tries (cards beside the flow with trunks into the end; cards under the stage columns, as wide
//  as the stages) made the reader decode geometry and turned the picture into a tangle.
//
//  This file lays the table out (sizes and row heights); RuleTableNode.jsx draws it with the
//  same numbers. Row heights are estimated from the text with the fact cards' text measure, a
//  little generously: a row a line too tall costs a little air, a row a line too short cuts
//  text off in the exported image. Pure computation, unit-tested.
// ============================================================

import { textEm } from '../../fact/cardGeometry.js'
import {
  TABLE_FONT,
  TABLE_LINE,
  TABLE_PAD_X,
  TABLE_PAD_Y,
  TABLE_LIST_INDENT,
  TABLE_MIN_W,
  TABLE_MAX_W,
  TABLE_TITLE_H,
  TABLE_HEAD_H,
  TABLE_GROUP_H,
  TABLE_COLS,
  TABLE_SLACK,
} from './metrics.js'

/** The whens of a rule, always as a list */
export const whensOf = (rule) => (Array.isArray(rule.when) ? rule.when : [rule.when])

/**
 * @param {object[]} rules      the spec's rules
 * @param {object[]} stages     the spec's stages, in order
 * @param {Map<string,object>} byId  nodes by id (for the labels of the ends)
 * @param {number} x, y         top left of the table
 * @param {number} available    the width the diagram above takes (the table follows it, within limits)
 * @returns the table: position, size, column widths, and groups of rows with their heights
 */
export function layoutRuleTable({ rules, stages, byId, x, y, available }) {
  const w = Math.round(Math.min(TABLE_MAX_W, Math.max(TABLE_MIN_W, available)))
  const cols = TABLE_COLS.map((f) => Math.round(w * f))
  const order = new Map(stages.map((st, i) => [st.id, i]))

  // How many lines a text takes in a cell of the given width
  const lines = (em, width, weight = 1) =>
    Math.max(1, Math.ceil((em * TABLE_FONT * weight * TABLE_SLACK) / (width - TABLE_PAD_X * 2)))

  const rows = rules.map((rule, index) => {
    const stageIdx = (rule.stageIds ?? []).filter((id) => order.has(id)).map((id) => order.get(id)).sort((a, b) => a - b)
    const whens = whensOf(rule)
    // A list opens with its own line ("any of:"), and its items are indented
    const whenLines =
      whens.length > 1
        ? 1 + whens.reduce((n, t) => n + lines(textEm(t), cols[0] - TABLE_LIST_INDENT), 0)
        : lines(textEm(whens[0]), cols[0])
    // The consequence is set bold, a little wider
    const thenLines = lines(textEm(rule.then), cols[1], 1.08)
    const first = stageIdx.length ? stages[stageIdx[0]].label : ''
    const last = stageIdx.length ? stages[stageIdx[stageIdx.length - 1]].label : ''
    const scopeEm = stageIdx.length > 1 ? textEm(first) + textEm(last) + 3 : textEm(first || '全程')
    const scopeLines = lines(scopeEm, cols[2])
    const h = Math.max(whenLines, thenLines, scopeLines) * TABLE_LINE + TABLE_PAD_Y * 2 + 1
    return {
      rule,
      index,
      h,
      stageIds: stageIdx.map((i) => stages[i].id),
      // 'all' when the rule names no stage: it applies throughout
      scope: stageIdx.length === 0 ? { kind: 'all' } : stageIdx.length === 1 ? { kind: 'one', stage: first } : { kind: 'range', from: first, to: last, n: stageIdx.length },
      first: stageIdx.length ? stageIdx[0] : -1,
    }
  })

  // Groups: one per end the rules lead to, in the order the ends are first named; then the rest
  const byStage = (a, b) => a.first - b.first || a.index - b.index
  const ends = [...new Set(rules.map((r) => r.endId).filter((id) => id && byId.has(id)))]
  const groups = [
    ...ends.map((endId) => ({ endId, endLabel: byId.get(endId).label, rows: rows.filter((r) => r.rule.endId === endId).sort(byStage) })),
    { endId: null, endLabel: null, rows: rows.filter((r) => !r.rule.endId || !byId.has(r.rule.endId)).sort(byStage) },
  ].filter((g) => g.rows.length)
  // With no end at all there is one group and it needs no heading
  const headed = ends.length > 0

  // Vertical positions, relative to the table's top
  let cursor = TABLE_TITLE_H + TABLE_HEAD_H
  for (const g of groups) {
    g.headed = headed
    g.y = cursor
    if (headed) cursor += TABLE_GROUP_H
    for (const r of g.rows) {
      r.y = cursor
      cursor += r.h
    }
    g.h = cursor - g.y
  }
  return { x, y, w, h: cursor, cols, groups, count: rules.length }
}
