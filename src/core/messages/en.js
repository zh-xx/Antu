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
  'common.untitled': 'Antu',

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
  'dock.stagger': 'Stagger',
  'dock.byParty': 'Lane per party',
  'dock.staggerHint': 'Let cards in different columns overlap by half a row, so the diagram is shorter and its text larger',
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
  'card.dateUnknown': 'date unknown',
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
  'header.theme': 'Theme',
  'theme.document': 'Document',
  'theme.modern': 'Modern',
  'theme.legal': 'Legal blue',
  'header.kindOpen': ({ n }) => `All ${n} ways of drawing`,
  'header.kindPrev': 'Previous way of drawing',
  'header.kindNext': 'Next way of drawing',
  'header.kindGroup': 'Way of drawing',
  'header.fold': 'Fold the card',
  'header.unfold': 'Show the card',
  'graphKind.chronicle': 'Chronicle',
  'graphKind.scale': 'Time scale',

  // ---------- fact time scale ----------
  'scale.segment': ({ n, unit, count }) => `Segment ${n} · ${unit} · ${count} event${count === 1 ? '' : 's'}`,
  'scale.unit.year': 'by year',
  'scale.unit.month': 'by month',
  'scale.unit.day': 'by day',
  'scale.unit.hour': 'by hour',
  'scale.unit.minute': 'by minute',
  'scale.other': 'Other',
  'scale.events': 'Events',
  'scale.undated': 'date unknown · placed by order',
  'scale.coarse.day': 'that day (time unknown)',
  'scale.coarse.month': 'that month (day unknown)',
  'scale.coarse.year': 'that year (month unknown)',
  'scale.run': ({ n }) => `${n} events`,
  'scale.runListed': ({ n }) => `${n} events too close to show one by one:`,

  // ---------- fact chronicle: the time passed between two time points ----------
  'chronicle.gapSeconds': ({ n }) => `+${n} s`,
  'chronicle.gapMinutes': ({ n }) => `+${n} min`,
  'chronicle.gapHours': ({ n }) => `+${n} h`,
  'chronicle.gapHoursMinutes': ({ h, m }) => `+${h} h ${m} min`,
  'chronicle.gapDays': ({ n }) => `${n} day${n === 1 ? '' : 's'} later`,
  'chronicle.gapMonths': ({ n }) => `${n} month${n === 1 ? '' : 's'} later`,
  'chronicle.gapYears': ({ n }) => `${n} year${n === 1 ? '' : 's'} later`,
  'chronicle.gapYearsMonths': ({ y, m }) => `${y} yr ${m} mo later`,
  'chronicle.dateUnknown': 'Date unknown',

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
  'err.tooManyGroups': ({ at, max, actual }) =>
    `${at}: at most ${max} groups (the axis has two sides plus the centre), got ${actual}`,
  'err.slotsEmpty': '`slots` must not be empty',
  'err.slotEventsEmpty': ({ at }) => `${at}.events must not be empty (an empty time slot carries no meaning)`,
  'err.slotEventEmptyShape': ({ at }) => `${at}: must be an object of the form { events: [ … ] }`,
  'err.oneEventPerCell': ({ at, a, b }) =>
    `${at}: two events share the same lane in one time slot ("${a}" and "${b}"); one cell holds one event`,
  'err.badDate': ({ at, field, value }) =>
    `${at}: \`${field}\` is not ISO 8601 (e.g. 2017-05-02T09:24:03), got "${value}"`,
  'err.dateEndNeedsDate': ({ at }) => `${at}: \`dateEnd\` is written but \`date\` is not; a span needs its start`,
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
  'err.viewsRemoved':
    '`views` is no longer part of the format (placement rules v1): delete it. A diagram has one placement: with 2 or more parties, write `groupId` on each party (its side); with 1 party, on the events',
  'err.actorNeedsGroup': ({ at, n }) =>
    `${at}: the diagram has ${n} parties, so each party says which side it is on: write \`groupId\` with the 1st or the 2nd of \`groups\` (add \`groups\` if there are none)`,
  'err.actorGroupNotSide': ({ at, groupId }) =>
    `${at}: \`groupId\` "${groupId}" is the 3rd group, the axis; a party belongs to the 1st or the 2nd group (a side)`,
  'err.actorGroupOneParty': ({ at }) =>
    `${at}: a party carries \`groupId\` only when the diagram has 2 or more parties; with one party the groups split the events, so write \`groupId\` on the events`,
  'err.eventGroupWithParties': ({ at }) =>
    `${at}: the diagram has 2 or more parties, so the groups belong to the parties and an event is placed by its \`actorIds\`: delete the event's \`groupId\` (one party → that party's side; several or none → the axis)`,
  'err.specNotObject': 'a spec must be a JSON object',
  'err.envelopeTypeRequired': 'missing required field `type` (the engine uses it to pick a renderer)',
  'err.envelopeTypeString': '`type` must be a string',
  'err.envelopeTypeUnknown': '`type` is "{type}", which is not a diagram type; expected one of {list}',
  'err.envelopeTypeIsKind': '`type` is "{type}", which is a way of drawing a {owner} diagram, not a type: write `"type": "{owner}"` (the way it is drawn is chosen on the page, not in the JSON)',
  'err.envelopeTitleString': '`title` must be a string',
  'err.specVersionForm': '`specVersion` must be a whole number from 1 up, got {value}',
  'err.specVersionNewer': '`specVersion` is {value}, newer than this engine knows for "{type}" ({known}): update the engine, or write the file for the older format',
  'err.slotNotArray': '`slots` must be an array (one slot = one time point)',
  'err.slotShape': ({ at }) => `${at}: must be an object of the form { events: [ … ] }`,
  'err.eventsNotArray': ({ at }) => `${at}.events must be an array`,

  // ---------- relationship: validation errors (rerr.*) and hints (rhint.*) ----------
  // Fixed English, like the other agent-facing messages; zh.js takes these keys from here.
  'rerr.entitiesEmpty': '`entities` must not be empty (a diagram needs at least two parties)',
  'rerr.relationsEmpty': '`relations` must not be empty (the parties have to be related)',
  'rerr.notArray': ({ field }) => `\`${field}\` must be an array`,
  'rerr.notObject': ({ at }) => `${at}: must be an object`,
  'rerr.required': ({ at, field }) => `${at}: missing required field \`${field}\``,
  'rerr.duplicateId': ({ at, id, what }) => `${at}: id "${id}" duplicates an earlier ${what}`,
  'rerr.badEntityKind': ({ at, value, allowed }) => `${at}: kind is "${value}", which is not one of: ${allowed}`,
  'rerr.badRelationKind': ({ at, value, allowed }) => `${at}: kind is "${value}", which is not one of: ${allowed}`,
  'rerr.mustBeString': ({ at, field }) => `${at}: \`${field}\` must be a non-empty string`,
  'rerr.mustBeBoolean': ({ at, field }) => `${at}: \`${field}\` must be true or false`,
  'rerr.badRef': ({ at, field, kind, id }) => `${at}: \`${field}\` refers to a non-existent ${kind} "${id}"`,
  'rerr.badEnd': ({ at, end, id }) => `${at}: \`${end}\` refers to a non-existent entity "${id}"`,
  'rerr.selfRelation': ({ at, id }) => `${at}: an entity cannot be related to itself ("${id}" on both ends)`,
  'rerr.duplicateRelation': ({ at, from, to, kind }) =>
    `${at}: duplicate relation ${from} -> ${to} (${kind}, same label); give the second one its own label, or drop it`,
  'rerr.fieldNotHere': ({ at, field, kinds }) => `${at}: \`${field}\` only belongs on a relation of kind ${kinds}`,
  'rerr.badShare': ({ at, value }) => `${at}: \`share\` must be a number from 0 to 100, got ${value}`,
  'rerr.badSecures': ({ at, id }) => `${at}: \`secures\` refers to a non-existent relation "${id}"`,
  'rerr.securesNotClaim': ({ at, id, kind, claims }) =>
    `${at}: \`secures\` points at relation "${id}", which is a ${kind}; a guarantee secures a claim (${claims})`,
  'rerr.badAsOf': ({ value }) => `asOf: "${value}" is not an ISO date (YYYY, YYYY-MM or YYYY-MM-DD)`,
  'rhint.shareOver100': ({ id, label, total }) =>
    `entities (${id}): the shares held in "${label}" add up to ${total}%, more than the whole; check the figures or the source`,
  'rhint.isolated': ({ id, label }) =>
    `entities (${id}): "${label}" has no relation to anyone, so it will float beside the diagram; relate it or drop it`,
  'rhint.noSecures': ({ id }) => `relations (${id}): a guarantee that does not say which claim it secures; add \`secures\` with that relation's id`,
  'rhint.tooLarge': ({ n, limit }) =>
    `${n} entities: past about ${limit} the diagram gets hard to read on one screen; consider splitting it by group`,
  'rhint.equityCycle': ({ path }) => `shareholdings loop back (${path}); allowed, but check it is what the registry says`,

  'rel.kind.equity': 'Equity',
  'rel.kind.control': 'Control',
  'rel.kind.contract': 'Contracts',
  'rel.kind.debt': 'Debts',
  'rel.kind.guarantee': 'Guarantees',
  'rel.kind.kinship': 'Family',
  'rel.kind.employment': 'Employment',
  'rel.kind.agency': 'Agency',
  'rel.kind.other': 'Other',
  'rel.kindChipTitle': ({ n }) => (n === 1 ? 'Show or hide this kind (1 relation)' : `Show or hide this kind (${n} relations)`),
  'rel.labels': 'Labels',
  'rel.groups': 'Groups',
  'rel.previewHint': 'Click a party to read the full text',

  // The default text on a relation that has no label of its own (interface text: it follows the interface language)
  'rel.auto.equity': ({ share }) => (share === undefined ? 'Holds shares' : `Holds ${share}%`),
  'rel.auto.control': 'Controls',
  'rel.auto.contract': ({ amount }) => (amount ? `Contract, ${amount}` : 'Contract'),
  'rel.auto.debt': ({ amount }) => (amount ? `Claim, ${amount}` : 'Claim'),
  'rel.auto.guarantee': 'Guarantee',
  'rel.auto.kinship': 'Family',
  'rel.auto.employment': 'Employment',
  'rel.auto.agency': 'Agency',
  'rel.auto.other': 'Related',
  'info.entities': ({ n }) => `${n} part${n === 1 ? 'y' : 'ies'}`,
  'info.relations': ({ n }) => `${n} relation${n === 1 ? '' : 's'}`,
  'info.links': ({ n }) => `${n} link${n === 1 ? '' : 's'}`,

  // ---------- justification: validation errors (jerr.*) and hints (jhint.*) ----------
  // Fixed English, like the other agent-facing messages; zh.js takes these keys from here.
  'jerr.nodesEmpty': '`nodes` must not be empty (a justification needs at least a conclusion and what supports it)',
  'jerr.linksEmpty': '`links` must not be empty (the nodes have to support one another)',
  'jerr.notArray': ({ field }) => `\`${field}\` must be an array`,
  'jerr.notObject': ({ at }) => `${at}: must be an object`,
  'jerr.required': ({ at, field }) => `${at}: missing required field \`${field}\``,
  'jerr.duplicateId': ({ at, id, what }) => `${at}: id "${id}" duplicates an earlier ${what}`,
  'jerr.mustBeString': ({ at, field }) => `${at}: \`${field}\` must be a non-empty string`,
  'jerr.badNodeKind': ({ at, value, allowed }) => `${at}: kind is "${value}", which is not one of: ${allowed}`,
  'jerr.badRef': ({ at, field, kind, id }) => `${at}: \`${field}\` refers to a non-existent ${kind} "${id}"`,
  'jerr.badHolds': ({ at, value }) => `${at}: \`holds\` must be "yes" or "no", got "${value}"`,
  'jerr.holdsNotHere': ({ at, kind, kinds }) => `${at}: a ${kind} does not hold or fail; \`holds\` only belongs on ${kinds}`,
  'jerr.badCombine': ({ at, value, allowed }) => `${at}: \`combine\` is "${value}", which is not one of: ${allowed}`,
  'jerr.combineNotHere': ({ at, kind, kinds }) => `${at}: a ${kind} is not supported by other nodes; \`combine\` only belongs on ${kinds}`,
  'jerr.dateNotHere': ({ at, kind }) => `${at}: \`date\` only belongs on a fact, not on a ${kind}`,
  'jerr.badDate': ({ at, value }) => `${at}: \`date\` "${value}" is not an ISO date (YYYY-MM-DD or YYYY-MM-DDTHH:MM)`,
  'jerr.badEnd': ({ at, end, id }) => `${at}: \`${end}\` refers to a non-existent node "${id}"`,
  'jerr.selfLink': ({ at, id }) => `${at}: a node cannot support itself ("${id}" on both ends)`,
  'jerr.badStance': ({ at, value, allowed }) => `${at}: stance is "${value}", which is not one of: ${allowed}`,
  'jerr.basisNotNorm': ({ at, kind }) => `${at}: stance "basis" can only start from a norm, not from a ${kind}`,
  'jerr.duplicateLink': ({ at, stance }) => `${at}: duplicate link (same from, to and stance "${stance}"); drop the second one`,
  'jerr.cycle': ({ path }) => `links form a cycle (${path}); a reasoning must not lead back to itself`,
  'jerr.leafHasInput': ({ at, kind }) => `${at}: a ${kind} is a leaf; nothing may support it (an evidence layer is not part of v0)`,
  'jerr.noEnd': 'no end conclusion: at least one `conclusion` must have no outgoing link (the conclusion the whole reasoning leads to)',
  'jhint.severalEnds': ({ n, ids }) => `${n} conclusions end the diagram (${ids}); is this one reasoning, or should it be split?`,
  'jhint.supportsNothing': ({ id, label }) => `nodes (${id}): "${label}" supports nothing; link it to what it supports, or drop it`,
  'jhint.factNoSource': ({ id, label }) => `nodes (${id}): the fact "${label}" has no source; where was it found?`,
  'jhint.normNoSource': ({ id, label }) => `nodes (${id}): the norm "${label}" has no source; which provision is it?`,
  'jhint.unsupported': ({ id, label }) => `nodes (${id}): nothing supports "${label}"; add a fact, an element or a norm that does (if it stands only because what argued against it was rejected, this note can be left as it is)`,
  'jhint.holdsOnRejected': ({ id, label }) =>
    `nodes (${id}): "${label}" holds although everything that supports it is rejected; check the \`holds\` values`,
  'jhint.combineAlone': ({ id, label, combine }) =>
    `nodes (${id}): "${label}" says \`combine: "${combine}"\` but fewer than two links support it; there is nothing to combine`,
  'jhint.allNeedsAll': ({ id, label, other }) =>
    `nodes (${id}): "${label}" needs all it rests on, but "${other}" is rejected; check the \`holds\` values`,
  'jhint.anyOneHolds': ({ id, label, other }) =>
    `nodes (${id}): "${label}" is rejected although any one it rests on would do, and "${other}" holds; check the \`holds\` values`,
  'jhint.tooLarge': ({ n, limit }) => `${n} nodes: past about ${limit} the tree gets hard to read on one screen; consider one diagram per issue`,
  'graphKind.graph': 'Relationship graph',
  'graphKind.focus': 'Focus view',
  'graphKind.matrix': 'Relation matrix',
  'graphKind.equity': 'Equity tree',
  'rel.matrix.corner': 'Row → column',
  'rel.matrix.ungrouped': 'No camp',
  'rel.equity.noShare': 'not stated',
  'rel.equity.cross': 'cross-holding',
  'rel.equity.noEquity': 'No equity relations in this data',
  'rel.equity.noEquityHint': 'This view is built around shareholdings. For this case, switch to the relationship graph.',
  'rel.equity.indirect': ({ n }) => `Held through others (${n})`,
  'rel.equity.notComputable': 'cannot be worked out: a share on the way is not stated',
  'rel.equity.moreRows': ({ n }) => `${n} more not listed`,
  'rel.equity.apart': ({ n }) => `Not in the equity tree (${n})`,
  'rel.equity.sep': ', ',
  'rel.equity.colon': ': ',
  'rel.equity.other': ({ n }) => `Relations that are not shareholdings (${n})`,
  'graphKind.authority': 'Control and employment',
  'rel.authority.cycle': 'cycle',
  'rel.authority.none': 'No control, employment or agency relations in this data',
  'rel.authority.noneHint': 'This view is built around who commands whom. For this case, switch to the relationship graph.',
  'rel.authority.apart': ({ n }) => `Not in the chart (${n})`,
  'rel.authority.other': ({ n }) => `Relations of another kind (${n})`,
  'graphKind.related': 'Related parties',
  'rel.related.title': ({ name }) => `Related parties of ${name} (the centre)`,
  'rel.related.count': ({ n, m }) => `${n} related part${n === 1 ? 'y' : 'ies'}, ${m} relation${m === 1 ? '' : 's'}`,
  'rel.related.colParty': 'Related party',
  'rel.related.colKind': 'Category',
  'rel.related.colText': 'Relation',
  'rel.related.colDirection': 'Direction',
  'rel.related.colSource': 'Source',
  'rel.related.dirIn': 'Party → centre',
  'rel.related.dirOut': 'Centre → party',
  'rel.related.dirNone': 'No direction',
  'rel.related.none': ({ name }) => `${name} has no relation in this data`,
  'rel.related.noneHint': 'Pick another party in the box at the bottom, or switch to the relationship graph.',
  'rel.related.apart': ({ n }) => `No relation to the centre (${n})`,
  'rel.related.rest': ({ n }) => `Relations that do not involve the centre (${n})`,
  'rel.related.centre': 'Centre',
  'graphKind.path': 'Relation path',
  'rel.path.from': 'From',
  'rel.path.to': 'To',
  'rel.path.swap': 'Swap the two ends',
  'rel.path.noChain': ({ a, b }) => `No chain of relations ties ${a} and ${b}`,
  'rel.path.noChainHint': 'Pick two parties that are connected, or switch to the relationship graph.',
  'rel.path.steps': ({ n }) => `${n} step${n === 1 ? '' : 's'}`,
  'rel.path.chains': ({ n }) => `Chains drawn (${n})`,
  'rel.path.more': ({ n, atLeast }) => `${atLeast ? 'At least ' : ''}${n} more chain${n === 1 ? '' : 's'} not drawn; only the shortest are.`,
  'rel.path.off': ({ n }) => `Not on a drawn chain (${n})`,
  'rel.path.offRels': ({ n }) => `Relations not on a drawn chain (${n})`,
  'graphKind.route': 'Route map',
  'proc.route.labels': 'Conditions',
  'proc.route.more': ({ n }) => `… and ${n} more`,
  'proc.route.off': ({ n }) => `Not on the route (${n})`,
  'proc.route.viaRule': ' (reached only through a rule)',
  'proc.route.notFollowed': ({ n }) => `Branches not followed (${n})`,
  'proc.route.notFollowedHint': 'A hanging branch follows the first way on; the other ways out of its boxes are not drawn. The flowchart shows them all.',
  'proc.route.rules': ({ n }) => `Rules not shown here (${n})`,
  'proc.route.rulesHint': 'The route map draws the steps; the rules (what happens if …) are in the flowchart, in the table under it.',
  'rel.focus.hint': 'Click to put this party in the middle',
  'rel.focus.apart': 'Not connected to the centre',
  'rel.focus.reset': 'Default centre',
  'rel.focus.resetTitle': 'Put the party with the most relations back in the middle',
  'graphKind.tree': 'Reasoning tree',

  // ---------- justification: interface text (jus.*) ----------
  'jus.kind.conclusion': 'Conclusion',
  'jus.kind.norm': 'Norm',
  'jus.kind.element': 'Element',
  'jus.kind.fact': 'Fact',
  'jus.kind.inference': 'Inference',
  'jus.kind.judgement': 'Judgement',
  'jus.holds.yes': '✓ upheld',
  'jus.holds.no': '✗ rejected',
  'jus.copy': 'shown again',
  'jus.copies': ({ n }) => `The same node is drawn in ${n} issues`,
  'jus.grounds': 'Rests on',
  'jus.fold': 'Fold this issue up',
  'jus.unfold': 'Open this issue',
  'jus.folded': ({ n }) => `${n} folded`,
  'jus.foldAll': 'Fold issues',
  'jus.merge': 'Merge repeats',
  'jus.mergeTitle': 'A fact (or a norm with many elements) used several times in one issue is drawn beside each use; merge draws each once, with longer lines',
  'jus.foldAllTitle': 'Fold every issue up to its conclusion, or open them all again',
  'jus.combine.all': 'all of',
  'jus.combine.any': 'any of',
  'jus.combine.allLong': 'All of what it rests on is needed',
  'jus.combine.anyLong': 'Any one of what it rests on is enough',
  'jus.supports': 'Leads to',
  'jus.stance.for': 'supports',
  'jus.stance.against': 'opposes',
  'jus.stance.basis': 'basis',
  'jus.previewHint': 'Click a node to read the full text and see what it rests on',

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
  'note.partyNoEvent': ({ at, id, name }) =>
    `${at} (${id}): no event names "${name}" in its actorIds, so it is on no card and has no column. ` +
    'Name it in the actorIds of the events it took part in, or leave it out of actors if it did nothing in this diagram',
  'note.dateOrder': ({ at, id, date, beforeAt, beforeId, beforeDate }) =>
    `${at} ("${id}", ${date}) comes after ${beforeAt} ("${beforeId}", ${beforeDate}) in the slots but its date is wholly earlier. ` +
    'The order of the slots is kept and nothing is reordered; check which of the two dates is wrong, or whether the slots are in the wrong order',
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
  'norm.mainRemarked': ({ problem, from, to }) =>
    `the main line was marked again, starting at "${from}" and ending at "${to}", keeping to the edges already marked where it could. It was: ${problem}`,
  'norm.mainSet': ({ at }) => `${at}: marked main`,
  'norm.mainCleared': ({ at }) => `${at}: no longer marked main`,
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
