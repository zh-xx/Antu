// ============================================================
//  src/renderers/index.js — which types exist, in this one place only
//
//  A plain-JS list: it registers "knowledge" only (the field table, how to
//  validate, which kinds exist) and touches no component.
//  Two entry points import it, each on its own:
//    browser  src/main.jsx
//    Node     tools/mcp/engine.mjs
//
//  Components are another branch, registered by each renderers/<type>/register.js
//  (those files contain .jsx).
//  This is where the split between "knowledge" and "components" lands: adding a
//  new type is adding one line here.
// ============================================================

import { registerKnowledge } from '../core/registry.js'
import { factKnowledge } from './fact/schema.js'
import { procedureKnowledge } from './procedure/schema.js'
import { relationshipKnowledge } from './relationship/schema.js'
import { justificationKnowledge } from './justification/schema.js'

registerKnowledge('fact', factKnowledge)
registerKnowledge('procedure', procedureKnowledge)
registerKnowledge('relationship', relationshipKnowledge)
registerKnowledge('justification', justificationKnowledge)
