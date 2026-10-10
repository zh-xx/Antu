// ============================================================
//  src/theme/themes.js — the three themes (issue #97)
//
//  A theme answers a *role* (what a thing means) with paint (how it looks). Sizes are in scale.js and are
//  the same for every theme. Paint is plain data, so it can be written as SVG attributes: the exported
//  picture keeps it (paint that is only in CSS is lost in the export, see shell/exportPng.js).
//
//    document   black and white, square, pure ink: for print and for filing. Meaning is carried by line
//               style, weight and outline, never by colour.
//    modern     screen first: rounded, pale greys, one ink.
//    legal      navy as the main colour; red only where it is adverse.
//
//  Every theme answers every role (test/theme.test.mjs).
// ============================================================

import { DASH, LINE } from './scale.js'

export const THEME_IDS = ['document', 'modern', 'legal']
export const DEFAULT_THEME = 'document'

/** The kinds of party and of relation the relationship diagrams draw (the roles that have more than one answer) */
const ENTITY_KINDS = ['person', 'company', 'organization', 'government', 'other']
const RELATION_KINDS = ['equity', 'control', 'contract', 'debt', 'guarantee', 'kinship', 'employment', 'agency', 'other']

/**
 * The nine kinds of relation as lines in black and white: weight, dash, or a double line. Not all nine can be
 * told apart by the line alone, so the label of every line says the kind in words as well.
 */
const BW_RELATION = {
  equity: { width: LINE.normal },
  control: { width: LINE.heavy },
  contract: { width: LINE.normal, dash: DASH.longDash },
  debt: { width: LINE.strong, dash: DASH.dashDot },
  guarantee: { width: LINE.normal, dash: DASH.dashed },
  kinship: { width: 3.6, double: true },
  employment: { width: LINE.normal, dash: DASH.dotted },
  agency: { width: LINE.strong, dash: '1 4', round: true },
  other: { width: LINE.hair, dash: '3 3' },
}
/**
 * The document theme's lines: thinner and grey, so a box (black, heavier) reads before the line that joins it.
 * Each kind keeps its own width ratio and dash, so the nine still differ; the kinds are told apart as before.
 */
const DOC_RELATION = {
  equity: { width: 0.85 },
  control: { width: 1.9 },
  contract: { width: 0.85, dash: '5 3' },
  debt: { width: 1.3, dash: '5 2 1.5 2' },
  guarantee: { width: 0.85, dash: '4 3' },
  kinship: { width: 3.2, double: true },
  employment: { width: 0.85, dash: DASH.dotted },
  agency: { width: 1.3, dash: '1 4', round: true },
  other: { width: 0.6, dash: '3 3' },
}
const withInk = (table, ink) => Object.fromEntries(Object.entries(table).map(([k, v]) => [k, { ...v, stroke: ink }]))


/**
 * The lines of the procedure flow and the justification tree. Like the relation lines, the drawing of a role
 * is the same in every theme (weight, dash); a theme only chooses the colour, so each reads in black and white.
 */
const OUTCOME_LINE = { neutral: { width: LINE.normal }, positive: { width: LINE.strong }, negative: { width: LINE.normal, dash: DASH.dashed } }
const FLOW_LINK_LINE = { main: { width: LINE.strong }, plain: { width: LINE.normal }, back: { width: LINE.normal, dash: DASH.dashed } }
const NODE_LINE = {
  conclusion: { width: LINE.heavy },
  norm: { width: LINE.normal },
  element: { width: LINE.normal },
  fact: { width: LINE.hair },
  inference: { width: LINE.normal, dash: DASH.dotted },
  judgement: { width: LINE.strong },
}
const STANCE_LINE = { for: { width: LINE.normal }, against: { width: LINE.strong, dash: DASH.dashed }, basis: { width: LINE.normal, dash: DASH.dotted } }
/** Put the drawing of each role under its colours: byRole is { role: colours }, line is { role: drawing } */
const draw = (line, byRole) => Object.fromEntries(Object.entries(line).map(([k, l]) => [k, { ...l, ...byRole[k] }]))

export const THEMES = {
  document: {
    id: 'document',
    shadowRgb: '17, 17, 17',
    chrome: { radius: 2, capsule: 2, chip: 2, bg: '#ffffff', bgPop: '#ffffff', border: '1px solid #111111', shadow: 'none', blur: 'none' },
    labelKey: 'theme.document',
    // The style of Chinese legal and official documents: headings in a hei face, text in fangsong
    font: {
      body: '"FangSong", "STFangsong", "FangSong_GB2312", "Songti SC", "SimSun", "Noto Serif CJK SC", "Source Han Serif SC", serif',
      head: '"SimHei", "Heiti SC", "STHeiti", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
    },
    color: { ink: '#111111', ink2: '#2b2b2b', ink3: '#4d4d4d', ink4: '#767676', bg: '#ffffff', canvas: '#ffffff', frame: '#111111', line: '#c9c9c9', chip: '#f0f0f0', side1: '#111111', side2: '#555555', axis: '#767676' },
    radius: { person: 18, company: 3, organization: 3, government: 3, other: 3, pill: 2, group: 0 },
    entity: {
      person: { stroke: '#111111', fill: '#ffffff', width: 1.3 },
      company: { stroke: '#111111', fill: '#ffffff', width: 1.6 },
      organization: { stroke: '#111111', fill: '#ffffff', width: 1.3, dash: DASH.dashed },
      government: { stroke: '#111111', fill: '#ffffff', width: 1.3 },
      other: { stroke: '#555555', fill: '#ffffff', width: 1.1, dash: DASH.dotted },
    },
    relation: withInk(DOC_RELATION, '#767676'),
    camp: [{ fill: '#ffffff', stroke: '#111111', text: '#111111' }, { fill: '#ececec', stroke: '#111111', text: '#111111' }, { fill: '#f7f7f7', stroke: '#8a8a8a', text: '#4d4d4d' }],
    group: { fill: '#f5f5f5', stroke: '#8a8a8a', title: '#111111' },
    // A camp of the relationship diagram: a dotted outline and no wash, so it frames without competing with the boxes
    campBox: { fill: 'none', stroke: '#111111', width: 0.75, dash: '2 3' },
    flow: {
      outcome: draw(OUTCOME_LINE, { neutral: { stroke: '#111111', fill: '#ffffff' }, positive: { stroke: '#111111', fill: '#ffffff' }, negative: { stroke: '#111111', fill: '#ececec' } }),
      start: { stroke: '#111111', fill: '#e2e2e2' },
      note: { stroke: 'none', fill: '#f5f5f5', fold: '#767676' },
      stage: { fill: '#f5f5f5', stroke: '#8a8a8a', title: '#111111' },
      stageLit: { fill: '#e2e2e2', stroke: '#111111', title: '#111111' },
      link: draw(FLOW_LINK_LINE, { main: { stroke: '#111111' }, plain: { stroke: '#2b2b2b' }, back: { stroke: '#4d4d4d' } }),
    },
    justify: {
      node: draw(NODE_LINE, {
        conclusion: { stroke: '#111111', fill: '#ffffff' }, norm: { stroke: '#111111', fill: '#ececec' }, element: { stroke: '#111111', fill: '#ffffff' },
        fact: { stroke: '#111111', fill: '#ffffff' }, inference: { stroke: '#111111', fill: '#ffffff' }, judgement: { stroke: '#111111', fill: '#ececec' },
      }),
      stance: draw(STANCE_LINE, { for: { stroke: '#2b2b2b' }, against: { stroke: '#111111' }, basis: { stroke: '#4d4d4d' } }),
    },
    pill: { colored: false, border: '#111111' },
  },
  modern: {
    id: 'modern',
    shadowRgb: '15, 23, 42',
    chrome: { radius: 14, capsule: 999, chip: 999, bg: 'rgba(255, 255, 255, 0.78)', bgPop: 'rgba(255, 255, 255, 0.94)', border: '1px solid rgba(15, 23, 42, 0.07)', shadow: '0 4px 18px rgba(15, 23, 42, 0.10), 0 1px 2px rgba(15, 23, 42, 0.06)', blur: 'blur(16px) saturate(1.8)' },
    labelKey: 'theme.modern',
    font: {
      body: 'system-ui, "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
      head: 'system-ui, "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
    },
    color: { ink: '#0f172a', ink2: '#475569', ink3: '#64748b', ink4: '#94a3b8', bg: '#fbfcfd', canvas: '#fbfcfd', frame: '#e2e8f0', line: '#e8ebef', chip: '#f1f4f8', side1: '#475569', side2: '#64748b', axis: '#94a3b8' },
    radius: { person: 14, company: 8, organization: 8, government: 6, other: 8, pill: 12, group: 12 },
    entity: {
      person: { stroke: '#94a3b8', fill: '#f1f5f9', width: 1 },
      company: { stroke: '#334155', fill: '#ffffff', width: 1.25 },
      organization: { stroke: '#94a3b8', fill: '#ffffff', width: 1, dash: DASH.dashed },
      government: { stroke: '#64748b', fill: '#f8fafc', width: 1 },
      other: { stroke: '#94a3b8', fill: '#f8fafc', width: 0.9, dash: DASH.dotted },
    },
    relation: withInk(BW_RELATION, '#475569'),
    camp: [{ fill: '#f1f5f9', stroke: '#94a3b8', text: '#334155' }, { fill: '#ffffff', stroke: '#94a3b8', text: '#334155' }, { fill: '#f8fafc', stroke: '#e2e8f0', text: '#64748b' }],
    group: { fill: '#f8fafc', stroke: '#e2e8f0', title: '#475569' },
    campBox: { fill: '#f8fafc', stroke: '#e2e8f0', width: 1 },
    flow: {
      outcome: draw(OUTCOME_LINE, { neutral: { stroke: '#64748b', fill: '#f8fafc' }, positive: { stroke: '#334155', fill: '#f1f5f9' }, negative: { stroke: '#64748b', fill: '#f1f5f9' } }),
      start: { stroke: '#334155', fill: '#e2e8f0' },
      note: { stroke: 'none', fill: '#f1f5f9', fold: '#94a3b8' },
      stage: { fill: '#f8fafc', stroke: '#e2e8f0', title: '#475569' },
      stageLit: { fill: '#f1f5f9', stroke: '#64748b', title: '#334155' },
      link: draw(FLOW_LINK_LINE, { main: { stroke: '#0f172a' }, plain: { stroke: '#475569' }, back: { stroke: '#64748b' } }),
    },
    justify: {
      node: draw(NODE_LINE, {
        conclusion: { stroke: '#0f172a', fill: '#f1f5f9' }, norm: { stroke: '#475569', fill: '#e2e8f0' }, element: { stroke: '#64748b', fill: '#f8fafc' },
        fact: { stroke: '#94a3b8', fill: '#ffffff' }, inference: { stroke: '#64748b', fill: '#f8fafc' }, judgement: { stroke: '#334155', fill: '#e2e8f0' },
      }),
      stance: draw(STANCE_LINE, { for: { stroke: '#475569' }, against: { stroke: '#334155' }, basis: { stroke: '#94a3b8' } }),
    },
    pill: { colored: false, border: '#cbd5e1' },
  },
  legal: {
    id: 'legal',
    shadowRgb: '19, 35, 63',
    chrome: { radius: 6, capsule: 6, chip: 4, bg: '#ffffff', bgPop: '#ffffff', border: '1px solid #c7d2e4', shadow: '0 2px 10px rgba(19, 35, 63, 0.10)', blur: 'none' },
    labelKey: 'theme.legal',
    font: {
      body: 'system-ui, "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
      head: 'system-ui, "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
    },
    color: { ink: '#13233f', ink2: '#2d4366', ink3: '#5b6f8f', ink4: '#8aa0c4', bg: '#ffffff', canvas: '#ffffff', frame: '#c7d2e4', line: '#dbe3f0', chip: '#eef3fb', side1: '#1f3f7f', side2: '#9a1b1b', axis: '#8aa0c4' },
    radius: { person: 14, company: 3, organization: 4, government: 3, other: 4, pill: 4, group: 6 },
    entity: {
      person: { stroke: '#2f5aa8', fill: '#eef3fb', width: 1 },
      company: { stroke: '#1f3f7f', fill: '#e3ecfa', width: 1.5 },
      organization: { stroke: '#2f5aa8', fill: '#f4f7fc', width: 1, dash: DASH.dashed },
      government: { stroke: '#13233f', fill: '#eef3fb', width: 1.1 },
      other: { stroke: '#8aa0c4', fill: '#f8fafd', width: 0.9, dash: DASH.dotted },
    },
    relation: {
      equity: { ...BW_RELATION.equity, stroke: '#1f3f7f' },
      control: { ...BW_RELATION.control, stroke: '#13233f' },
      contract: { ...BW_RELATION.contract, stroke: '#5b6f8f' },
      debt: { ...BW_RELATION.debt, stroke: '#9a1b1b' },
      guarantee: { ...BW_RELATION.guarantee, stroke: '#2f5aa8' },
      kinship: { ...BW_RELATION.kinship, stroke: '#4b3a8c' },
      employment: { ...BW_RELATION.employment, stroke: '#1d6b6b' },
      agency: { ...BW_RELATION.agency, stroke: '#1d6b6b' },
      other: { ...BW_RELATION.other, stroke: '#8aa0c4' },
    },
    camp: [{ fill: '#eaf0fb', stroke: '#9fb6e0', text: '#1f3f7f' }, { fill: '#fbecec', stroke: '#e3b4b4', text: '#9a1b1b' }, { fill: '#f4f7fc', stroke: '#c7d2e4', text: '#5b6f8f' }],
    group: { fill: '#f4f7fc', stroke: '#c7d2e4', title: '#2d4366' },
    campBox: { fill: '#f4f7fc', stroke: '#c7d2e4', width: 1 },
    flow: {
      outcome: draw(OUTCOME_LINE, { neutral: { stroke: '#2f5aa8', fill: '#eef3fb' }, positive: { stroke: '#1f3f7f', fill: '#e3ecfa' }, negative: { stroke: '#9a1b1b', fill: '#fbecec' } }),
      start: { stroke: '#13233f', fill: '#dbe5f5' },
      note: { stroke: 'none', fill: '#f4f7fc', fold: '#8aa0c4' },
      stage: { fill: '#f4f7fc', stroke: '#c7d2e4', title: '#2d4366' },
      stageLit: { fill: '#eaf0fb', stroke: '#1f3f7f', title: '#1f3f7f' },
      link: draw(FLOW_LINK_LINE, { main: { stroke: '#13233f' }, plain: { stroke: '#2d4366' }, back: { stroke: '#5b6f8f' } }),
    },
    justify: {
      node: draw(NODE_LINE, {
        conclusion: { stroke: '#1f3f7f', fill: '#e3ecfa' }, norm: { stroke: '#4b3a8c', fill: '#efecf8' }, element: { stroke: '#2f5aa8', fill: '#eef3fb' },
        fact: { stroke: '#8aa0c4', fill: '#f8fafd' }, inference: { stroke: '#1d6b6b', fill: '#e8f4f4' }, judgement: { stroke: '#13233f', fill: '#dbe5f5' },
      }),
      stance: draw(STANCE_LINE, { for: { stroke: '#2d4366' }, against: { stroke: '#9a1b1b' }, basis: { stroke: '#4b3a8c' } }),
    },
    pill: { colored: true, border: '#c7d2e4' },
  },
}

export const ENTITY_KIND_LIST = ENTITY_KINDS
export const RELATION_KIND_LIST = RELATION_KINDS

export const isTheme = (id) => Object.prototype.hasOwnProperty.call(THEMES, id)
export const themeOf = (id) => (isTheme(id) ? THEMES[id] : THEMES[DEFAULT_THEME])
