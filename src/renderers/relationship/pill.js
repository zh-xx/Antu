// ============================================================
//  src/renderers/relationship/pill.js — how big a relation's label is on the page of a levelled view (shared)
//
//  The equity tree, the authority chart and the relation path put a label in a pill on its line. The page's pill
//  has 9 px of padding each side and wraps at 220; this is the same measure in pixels (a CJK character is wider than
//  a Latin one), so the layouts can keep a label clear of lines and of other labels. Pure JS.
// ============================================================

const rawPillW = (text) => 20 + [...text].reduce((n, ch) => n + (/[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 12.5 : 7.4), 0)

/** How wide a label's pill is */
export const pillW = (text) => Math.min(220, rawPillW(text))

/** How tall a label's pill is: one line is 22, and each further line (a label wider than 220 wraps) is 18 more */
export const pillH = (text) => 22 + 18 * (Math.max(1, Math.ceil(rawPillW(text) / 220 - 1e-9)) - 1)
