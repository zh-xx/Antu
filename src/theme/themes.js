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
const withInk = (table, ink) => Object.fromEntries(Object.entries(table).map(([k, v]) => [k, { ...v, stroke: ink }]))

export const THEMES = {
  document: {
    id: 'document',
    chrome: { radius: 2, capsule: 2, chip: 2, bg: '#ffffff', bgPop: '#ffffff', border: '1px solid #111111', shadow: 'none', blur: 'none' },
    labelKey: 'theme.document',
    // The style of Chinese legal and official documents: headings in a hei face, text in fangsong
    font: {
      body: '"FangSong", "STFangsong", "FangSong_GB2312", "Songti SC", "SimSun", "Noto Serif CJK SC", "Source Han Serif SC", serif',
      head: '"SimHei", "Heiti SC", "STHeiti", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
    },
    color: { ink: '#111111', ink2: '#2b2b2b', ink3: '#4d4d4d', ink4: '#767676', bg: '#ffffff', canvas: '#ffffff', frame: '#111111', line: '#c9c9c9', chip: '#f0f0f0', side1: '#111111', side2: '#555555', axis: '#767676' },
    radius: { person: 12, company: 0, organization: 0, government: 0, other: 0, pill: 2, group: 0 },
    entity: {
      person: { stroke: '#111111', fill: '#ffffff', width: 1 },
      company: { stroke: '#111111', fill: '#ffffff', width: 1.5 },
      organization: { stroke: '#111111', fill: '#ffffff', width: 1, dash: DASH.dashed },
      government: { stroke: '#111111', fill: '#ffffff', width: 1 },
      other: { stroke: '#555555', fill: '#ffffff', width: 0.9, dash: DASH.dotted },
    },
    relation: withInk(BW_RELATION, '#111111'),
    camp: [{ fill: '#ffffff', stroke: '#111111', text: '#111111' }, { fill: '#ececec', stroke: '#111111', text: '#111111' }, { fill: '#f7f7f7', stroke: '#8a8a8a', text: '#4d4d4d' }],
    group: { fill: '#f5f5f5', stroke: '#8a8a8a', title: '#111111' },
    pill: { colored: false, border: '#111111' },
  },
  modern: {
    id: 'modern',
    chrome: { radius: 14, capsule: 999, chip: 999, bg: 'rgba(255, 255, 255, 0.78)', bgPop: 'rgba(255, 255, 255, 0.94)', border: '1px solid rgba(15, 23, 42, 0.07)', shadow: '0 4px 18px rgba(15, 23, 42, 0.10), 0 1px 2px rgba(15, 23, 42, 0.06)', blur: 'blur(16px) saturate(1.8)' },
    labelKey: 'theme.modern',
    font: {
      body: 'system-ui, "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
      head: 'system-ui, "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
    },
    color: { ink: '#0f172a', ink2: '#475569', ink3: '#64748b', ink4: '#94a3b8', bg: '#fbfcfd', canvas: '#fbfcfd', frame: '#e2e8f0', line: '#e8ebef', chip: '#f1f4f8', side1: '#475569', side2: '#94a3b8', axis: '#94a3b8' },
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
    pill: { colored: false, border: '#cbd5e1' },
  },
  legal: {
    id: 'legal',
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
    pill: { colored: true, border: '#c7d2e4' },
  },
}

export const ENTITY_KIND_LIST = ENTITY_KINDS
export const RELATION_KIND_LIST = RELATION_KINDS

export const isTheme = (id) => Object.prototype.hasOwnProperty.call(THEMES, id)
export const themeOf = (id) => (isTheme(id) ? THEMES[id] : THEMES[DEFAULT_THEME])
