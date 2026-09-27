// ============================================================
//  src/core/registry.js — the renderer registry
//
//  The engine's core mechanism: **type × kind -> renderer component**.
//
//  Why two levels:
//    The type (the envelope layer) decides what the JSON looks like, and the
//    schema only governs that layer. There is no "sub-type" field under the
//    type; kind is **a division of the rendering layer**: several drawing
//    methods for one type, each with its own rendering rules, all eating the
//    same schema.
//
//  That yields one hard constraint:
//    **Any valid JSON of a type must render under any kind of that type.**
//    "Only one kind can draw this data" must never happen. When a new kind is
//    added, every existing JSON can be viewed with it at once, the data
//    unchanged to the character.
//
//  Which kind is used is chosen while looking at the diagram, not in the data.
// ============================================================

/** type -> Map(kind -> { kind, label, Component }); Map insertion order is the display order of kinds */
const registry = new Map()

/**
 * Knowledge registry: type -> { validate, layouts }.
 *
 * How it differs from the table above: that one registers **components**
 * (.jsx, which only a browser can load); this one registers **plain-JS rules**
 * (how to validate, how to lay out). The split exists because the Node-side MCP
 * needs "how fact is validated, which kinds exist", yet cannot load .jsx. It
 * used to keep a hand-written dispatch table of its own, so the same fact lived
 * in two places (see known-issues item 2). Now both sides read this one table.
 */
const knowledge = new Map()

/**
 * Register the knowledge of one type.
 * @param type the type
 * @param k    { validate(spec) => string[], layouts: { kind: buildGraph } }
 */
export function registerKnowledge(type, k) {
  if (!type) throw new Error('registerKnowledge: type must not be empty')
  if (!k?.validate) throw new Error('registerKnowledge: validate is required')
  if (!k?.describe) throw new Error('registerKnowledge: describe is required (the agent-facing field table)')
  knowledge.set(type, k)
}

/**
 * Get all the knowledge of one type.
 * Every reference an agent receives comes from here: the field table
 * (fields/describe), validation, and which kinds exist. So adding a type takes
 * no change at all on the tool side.
 */
export function knowledgeOf(type) {
  return knowledge.get(type)
}

/**
 * Types with registered knowledge. Used to tell an agent "which types exist".
 * labelKey is a message key, not the message; the consumer looks the word up by
 * language (see core/labels.js).
 */
export function listKnowledgeTypes() {
  return [...knowledge.entries()].map(([type, k]) => ({ type, labelKey: k.label ?? `graphType.${type}` }))
}

/** The validator of a type. undefined when nothing is registered (meaning: no validation). */
export function validatorOf(type) {
  return knowledge.get(type)?.validate
}

/** The layout function of a type. With no kind (or an unknown one) it gives the first, i.e. the default kind. */
export function layoutOf(type, kind) {
  const layouts = knowledge.get(type)?.layouts
  if (!layouts) return undefined
  if (kind && layouts[kind]) return layouts[kind]
  return Object.values(layouts)[0]
}

/** Which kinds a type has (in registration order). Used on the Node side to report "which kinds this type has". */
export function layoutKindsOf(type) {
  return Object.keys(knowledge.get(type)?.layouts ?? {})
}

/**
 * Register one kind renderer.
 * @param type      the type (the envelope-layer type), e.g. 'fact'
 * @param kind      the kind, e.g. 'timeline'
 * @param Component the renderer component
 * @param label     the message key of the kind, e.g. 'graphKind.timeline'. Defaults to kind itself
 */
export function registerRenderer(type, kind, Component, label) {
  if (!type) throw new Error('registerRenderer: type must not be empty')
  if (!kind) throw new Error('registerRenderer: kind must not be empty')
  if (!Component) throw new Error('registerRenderer: Component must not be empty')
  if (!registry.has(type)) registry.set(type, new Map())
  registry.get(type).set(kind, { kind, label: label || kind, Component })
}

/**
 * Get a renderer.
 * With no kind (or an unregistered one) it gives the first kind of that type,
 * i.e. the default kind.
 */
export function getRenderer(type, kind) {
  const kinds = registry.get(type)
  if (!kinds || kinds.size === 0) return undefined
  if (kind && kinds.has(kind)) return kinds.get(kind).Component
  return kinds.values().next().value.Component
}

/**
 * Which kinds a type has, in registration order. Returns [{ kind, labelKey }].
 *
 * What is given here is a **message key**, not the message itself. Reason: the
 * registry is also used on the Node side (MCP), which has no interface
 * language. Translation happens on the consumer side for the current language;
 * see core/labels.js.
 */
export function listKinds(type) {
  const kinds = registry.get(type)
  if (!kinds) return []
  return [...kinds.values()].map(({ kind, label }) => ({ kind, labelKey: label }))
}

/** Registered types (for debugging) */
export function listTypes() {
  return [...registry.keys()]
}
