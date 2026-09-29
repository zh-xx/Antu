// ============================================================
//  src/core/messages/en.js — the English messages (the fallback language)
//
//  These are **interface messages**, not data text. The parties and event descriptions come
//  from the JSON itself and are independent of the interface language (paired examples:
//  examples/fact/*.zh-CN.json and *.en.json).
//
//  Conventions:
//    - Purely static text is a string; {name} placeholders are filled in by translate in i18n.js;
//    - Anything needing concatenation, plurals or a different word order is a function.
//      English word order and plural forms differ from Chinese, so assembling a prefix and a
//      suffix does not work here: every message has to be one whole sentence.
//
//  When adding a message: **en.js and zh.js must be updated together, with strictly identical keys**.
//  A missing key shows up in the interface as the key itself (dock.exportImage, say), visible at a glance.
// ============================================================

export const en = {
  // ---------- common ----------
  'common.none': '(none)',
  'common.close': 'Close',
  'common.untitled': 'antu',

  // ---------- application-level fallback (App.jsx) ----------
  'fallback.invalidTitle': ({ n }) => `This data cannot be rendered (${n} problem${n === 1 ? '' : 's'})`,
  'fallback.noRendererTitle': ({ type }) => `No renderer registered for type = "${type}"`,
  'fallback.registered': ({ list }) => `Registered: ${list}`,
  'fallback.noInlineData':
    'No inline data found in this file. Something went wrong when it was generated; please regenerate the HTML.',
  'fallback.devNoData':
    'The dev server received no data. Specify one with ?example=0 or ?spec=examples/some-file.json.',

  // ---------- render error fallback (ErrorBoundary.jsx) ----------
  'error.renderTitle': 'Rendering failed',
  'error.renderHint':
    'The data itself may be fine (validation passed); this rendering kind threw an error. Send the text below to the developer, or try another rendering kind.',

  // ---------- label card (the size row in App.jsx, DiagramHeader) ----------
  // English and Chinese word order differ, so every message is one whole sentence, never a prefix plus a suffix
  'info.span': ({ from, to }) => `${from} to ${to}`,
  'info.slots': ({ n }) => `${n} time slot${n === 1 ? '' : 's'}`,
  'info.actors': ({ n }) => `${n} part${n === 1 ? 'y' : 'ies'}`,
  'info.sources': ({ n }) => `${n} source${n === 1 ? '' : 's'}`,
  'info.nodes': ({ n }) => `${n} node${n === 1 ? '' : 's'}`,
  'info.stages': ({ n }) => `${n} stage${n === 1 ? '' : 's'}`,

  // ---------- control dock (ControlDock.jsx) ----------
  'dock.actors': 'Parties',
  'dock.summary': 'Summary',
  'dock.sources': 'Sources',
  'dock.vertical': 'Vertical',
  'dock.horizontal': 'Horizontal',
  'dock.grid': 'Grid',
  'dock.exportImage': 'Export image',
  'dock.exporting': 'Exporting…',
  'dock.exportTitle': 'Export the whole diagram as a PNG (2× resolution)',
  'dock.lang': 'Language',
  'export.failed': ({ message }) => `Export failed: ${message}`,
  // Each language name is written in its own language (English / Chinese) and never translated: on the switcher you must recognise your own language at a glance.
  'dock.langEn': 'EN',
  'dock.langZh': '中文',

  // ---------- card and source overlay (EventNode.jsx) ----------
  'card.sources': ({ n }) => `${n} source${n === 1 ? '' : 's'}`,
  'card.sourcesUnlisted': 'No sources listed',
  'card.sourcesList': ({ n, names }) => `${n} source${n === 1 ? '' : 's'}: ${names}`,
  'card.duration': ({ duration }) => `Duration ${duration}`,
  'card.approxPrefix': 'approx. ',
  // Duration units. English needs plurals, so the whole phrase is assembled from these entries rather than hard-coded as one format string.
  'card.unitDay': ({ n }) => `${n} day${n === 1 ? '' : 's'}`,
  'card.unitHour': ({ n }) => `${n} hour${n === 1 ? '' : 's'}`,
  'card.unitMinute': ({ n }) => `${n} min`,
  'card.unitSecond': ({ n }) => `${n} sec`,
  'card.ariaLabel': ({ label, date }) =>
    date ? `${label}, ${date}` : label,
  'card.dateNote': ({ note }) => `Time note: ${note}`,
  'card.previewHint': 'Click a card to read the full text',

  // ---------- flowchart dock and node overlay (procedure/flow) ----------
  'flow.conditions': 'Conditions',
  'flow.detail': 'Detail',
  'flow.mainLine': 'Main line',
  'flow.stages': 'Stages',
  'flow.rules': 'Rules',
  'flow.linkStraight': 'Straight',
  'flow.linkCurved': 'Curved',
  'flow.linkStyle': 'Link style',
  'rule.tableTitle': 'Rules',
  'rule.tableNote': 'What may happen while the contract runs; not steps of the flow',
  'rule.colWhen': 'If',
  'rule.colThen': 'Then',
  'rule.colScope': 'Stages',
  'rule.groupEnd': ({ end }) => `May lead to “${end}”`,
  'rule.groupRest': 'Other rules',
  'rule.count': ({ n }) => `${n}`,
  'rule.anyOf': 'Any of:',
  'rule.tScopeAll': 'Throughout',
  'rule.tScopeRange': ({ from, to }) => `${from} → ${to}`,
  'flow.ruleBadge': ({ n }) => (n === 1 ? '1 rule' : `${n} rules`),
  'rule.if': 'If',
  'rule.or': ', or ',
  'flow.previewHint': 'Click a node to read the full text',

  // ---------- canvas accessibility text (Canvas.jsx) ----------
  // The key names come from defaultAriaLabelConfig in @xyflow/system and must correspond one to one for it to take effect
  'aria.nodeDefault': 'Press enter or space to select this node.',
  'aria.nodeKeyboardDisabled':
    'Press enter or space to select this node. Once selected, use the arrow keys to move it.',
  'aria.nodeMoved': ({ x, y }) => `Node moved. New position: x ${x}, y ${y}`,
  'aria.edgeDefault': 'Press enter or space to select this connection.',
  'aria.controls': 'Canvas controls',
  'aria.zoomIn': 'Zoom in',
  'aria.zoomOut': 'Zoom out',
  'aria.fitView': 'Fit view',
  'aria.interactive': 'Toggle interactivity',
  'aria.minimap': 'Minimap',
  'aria.handle': 'Connection point',

  // ---------- source types (the 7 kinds in spec/source-schema-draft.md) ----------
  'sourceType.statute': 'Statute',
  'sourceType.case': 'Case',
  'sourceType.contract': 'Contract',
  'sourceType.evidence': 'Evidence',
  'sourceType.document': 'Document',
  'sourceType.web': 'Web',
  'sourceType.other': 'Other',

  'graphKind.timeline': 'Timeline',
  'graphKind.flow': 'Flowchart',

  // ---------- graph types (the envelope-level type) ----------
  'graphType.fact': 'Fact',
  'graphType.relationship': 'Relationship',
  'graphType.procedure': 'Procedure',
  'graphType.justification': 'Justification',

  // ---------- validation errors: fixed English, they do not follow the interface language ----------
  // Errors mostly land in the agent's context: English costs fewer tokens and matches MCP ecosystem convention.
  // Locations always use a field path so the agent can go straight to it, e.g. actors[1] (a-2).
  'err.notObject': ({ at }) => `${at}: must be an object`,
  'err.notArray': ({ at }) => `${at} must be an array`,
  'err.required': ({ at, field }) => `${at}: missing required field \`${field}\``,
  'err.mustBeString': ({ at, field }) => `${at}: \`${field}\` must be a string`,
  'err.duplicateId': ({ at, id }) => `${at}: duplicate id "${id}"`,
  'err.missingRef': ({ at, field, kind, id }) => `${at}: ${field} refers to a non-existent ${kind} "${id}"`,
  'err.bothSides': ({ at, names }) =>
    `${at}: ${names} appear on both sides; a party may only be on one side`,
  'err.badSplitBy': ({ at, value }) =>
    `${at}: \`splitBy\` must be "actor" or "group", got "${value}"`,
  'err.tooManyGroups': ({ at, max, actual }) =>
    `${at}: at most ${max} groups (the axis has two sides plus the centre), got ${actual}`,
  'err.slotsEmpty': '`slots` must not be empty',
  'err.slotEventsEmpty': ({ at }) => `${at}.events must not be empty (an empty time slot carries no meaning)`,
  'err.slotEventEmptyShape': ({ at }) => `${at}: must be an object of the form { events: [ … ] }`,
  'err.oneEventPerCell': ({ at, a, b }) =>
    `${at}: two events share the same lane in one time slot ("${a}" and "${b}"); one cell holds one event`,
  'err.badDate': ({ at, field, value }) =>
    `${at}: \`${field}\` is not ISO 8601 (e.g. 2017-05-02T09:24:03), got "${value}"`,
  'err.dateEndBeforeDate': ({ at, end, start }) =>
    `${at}: \`dateEnd\` (${end}) is earlier than \`date\` (${start}); a span cannot run backwards`,
  // The report is by **display width**, not character count: width is what actually fails to fit (see textEm in cardGeometry.js).
  // max and actual are both converted to a "number of full-width characters" as an intuitive reference.
  'err.summaryTooLong': ({ at, max, actual }) =>
    `${at}: \`summary\` is too wide for one line (about ${actual} full-width characters, limit ${max}); shorten it or move the text to detail`,
  'err.groupNeedsOneActor': ({ at, groupId, n }) =>
    `${at}: a side group ("${groupId}") must name exactly one party (currently ${n}); events that involve no particular party belong in the centre group or should omit groupId`,
  'err.multiActorNeedsAxis': ({ at, n, groupId }) =>
    `${at}: an event with ${n} parties belongs on the centre axis, but groupId points at a side group ("${groupId}"); the two contradict each other`,
  'err.specNotObject': 'a spec must be a JSON object',
  'err.envelopeTypeRequired': 'missing required field `type` (the engine uses it to pick a renderer)',
  'err.envelopeTypeString': '`type` must be a string',
  'err.envelopeTitleString': '`title` must be a string',
  'err.viewsNotArray': '`views` must be an array',
  'err.splitByDoc': '`splitBy` must be "actor" (split by party) or "group" (split by group)',
  'err.slotNotArray': '`slots` must be an array (one slot = one time point)',
  'err.slotShape': ({ at }) => `${at}: must be an object of the form { events: [ … ] }`,
  'err.eventsNotArray': ({ at }) => `${at}.events must be an array`,

  // ---------- procedure: validation errors (perr.*) and hints (phint.*) ----------
  // Same rule as err.*: fixed English, they do not follow the interface language.
  // zh.js spreads these straight from here (see the prefix list at the end of zh.js).
  'perr.domainNotInEnum': ({ value, allowed }) =>
    `\`domain\` is "${value}", not in the enum (${allowed})`,
  'perr.nodesEmpty': '`nodes` must not be empty (a flow needs at least a start and an end)',
  'perr.edgesEmpty': '`edges` must not be empty (the nodes have to be connected)',
  'perr.notObject': ({ at }) => `${at}: must be an object`,
  'perr.required': ({ at, field }) => `${at}: missing required field \`${field}\``,
  'perr.duplicateNodeId': ({ at, id }) => `${at}: id "${id}" duplicates an earlier node`,
  'perr.badKind': ({ at, value, allowed }) =>
    `${at}: \`kind\` is "${value}", not in the vocabulary (${allowed})`,
  'perr.badOutcome': ({ at, value, allowed }) =>
    `${at}: \`outcome\` is "${value}", not in the enum (${allowed})`,
  'perr.mustBeString': ({ at, field }) => `${at}: \`${field}\` must be a string`,
  'perr.badRef': ({ at, field, kind, id }) =>
    `${at}: ${field} refers to a non-existent ${kind} "${id}"`,
  'perr.badFrom': ({ at, id }) => `${at}: \`from\` refers to a non-existent node "${id}"`,
  'perr.badTo': ({ at, id }) => `${at}: \`to\` refers to a non-existent node "${id}"`,
  'perr.selfLoop': ({ at, id }) => `${at}: self-loop (from and to are both "${id}")`,
  'perr.duplicateEdge': ({ at, from, to }) =>
    `${at}: duplicate edge ${from} -> ${to} (same condition); branches into one target each need their own condition`,
  'perr.noEntry': 'no node has zero incoming edges (a flow needs a start)',
  'perr.unreachable': ({ id }) =>
    `nodes (${id}): unreachable from the start (it would be dropped silently and never appear)`,
  'perr.orphan': ({ id, label }) =>
    `nodes (${id}): "${label}" has no incoming edge and is not a start, so nothing leads to it: it would float beside the flow. ` +
    'If it is a consequence (a breach, a resignation, a right to terminate), write it as a rule in `rules`; ' +
    'if it belongs to the flow, add the edge that leads to it',
  'note.viewBlocked': ({ label, reason }) =>
    `view "${label}" does not fit, so it will not appear in the view dropdown: ${reason}`,
  'perr.noEnd': 'no node has `kind: "end"` (a flow needs an end)',
  'perr.deadEnd': ({ id, label }) =>
    `nodes (${id}): "${label}" is a dead end: it is neither end nor note but has no outgoing edge. ` +
    'If it is the consequence of a breach, delay or right to terminate, write it as a rule in `rules` (it may fire at any time in its stages) instead of a node that has to lead somewhere',
  'perr.decisionTooFewOut': ({ id, n }) =>
    `nodes (${id}): kind is "decision" but only ${n} outgoing edge(s); a decision needs at least 2`,
  'perr.decisionNoCondition': ({ id, index, to }) =>
    `nodes (${id}): kind is "decision" but edge edges[${index}] -> "${to}" has no condition. ` +
    'If it really is a decision, give every outgoing edge a condition (e.g. "yes / no"); ' +
    'if it is a step, change kind to "step" (a step may have several outgoing edges, one of them the main line)',
  'perr.tooManyMain': ({ id, n }) =>
    `nodes (${id}): ${n} outgoing edges are marked main; a path has exactly one`,
  'perr.mainBroken': ({ id }) =>
    `the main line breaks at node "${id}": the edges marked main do not reach any end. ` +
    'Either add the missing main edge, or repair the chain',
  'perr.rulesNotArray': '`rules` must be an array',
  'perr.duplicateRuleId': ({ at, id }) => `${at}: id "${id}" is already used by another rule or node`,
  'perr.ruleWhen': ({ at }) =>
    `${at}: \`when\` is required: a non-empty string, or an array of them (any one of them triggers the rule)`,
  'perr.ruleEndNotEnd': ({ at, id }) =>
    `${at}: \`endId\` points at "${id}", which is not a node of kind "end"; a rule can only lead to an end`,
  'phint.stageBackwards': ({ from, fromStage, to, toStage }) =>
    `stage runs backwards: ${from} (${fromStage}) -> ${to} (${toStage}); back edges are normal, others need a second look`,
  'phint.decisionOnSpine': ({ id, label }) =>
    `decision "${id}" (${label}) is on the main line but no outgoing edge is marked main; the breach path may end up drawn as the main line`,
  'phint.multipleEntries': ({ n, ids }) =>
    `${n} entries (${ids}), they will all sit in the first layer; a contract flow usually has a single entry, so check whether an upstream link is missing`,
}

export default en
