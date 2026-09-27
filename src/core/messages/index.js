// ============================================================
//  src/core/messages/index.js — the message dictionary entry point
//
//  Aggregation only; no message text lives here. Two dictionaries:
//    en.js   English (the fallback language)
//    zh.js   Chinese
//
//  This file **imports no React and touches no window**, so the Node side (MCP, CLI,
//  validation) can import it directly and share one copy of the messages with the
//  browser side.
// ============================================================

import { en } from './en.js'
import { zh } from './zh.js'

export const MESSAGES = { en, zh }

// The consistency check in tools/verify/run.mjs builds its own key list from the two
// dictionaries; it does not import one from here, so there is no MESSAGE_KEYS export.

export { en, zh }
