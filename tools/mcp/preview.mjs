// ============================================================
//  tools/mcp/preview.mjs — render the generated HTML to a PNG
//
//  Why this matters: **an agent cannot see what it has drawn.**
//  Validation may pass and the layout may be sound, and the diagram can still look
//  bad (cards jammed together, text too small, too much empty space).
//  This tool lets an agent take a look before deciding whether to change anything.
//
//  The real implementation is in tools/lib/chrome.mjs (the verification script uses
//  the same one); this is only a thin wrapper.
// ============================================================

export { findChrome, screenshotPage as screenshot } from '../lib/chrome.mjs'
