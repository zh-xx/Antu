// ============================================================
//  tools/lib/fill.mjs — putting the data into a viewer page
//
//  The viewer template (tools/lib/make-html.mjs: buildViewerHtml) has one marker where the data goes. This is the
//  one place that knows how the data is written there, so the page the Node side makes, the one the command
//  line in the skill makes, and the Python filler agree. Plain JS, no file access: the command line bundles it.
// ============================================================

/**
 * The marker a viewer template carries where the data goes. It is valid JavaScript (`null`), so an unfilled
 * template still loads and says that no data was found; a filler replaces the whole marker,
 * `/*ANTU_SPEC*\/null`, with the JSON of the diagram.
 */
export const SPEC_MARKER = '/*ANTU_SPEC*/null'

/**
 * Escaping when inlining.
 *
 * Two pitfalls:
 *   a `</script` in the data closes the script block early → escape `<` in the JSON as < too
 *   a `</script` can equally appear in the engine code (inside string constants) → handled the same way
 */
export function escapeForScript(text) {
  return String(text).replace(/</g, '\\u003c')
}

/**
 * The viewer page with the diagram's data in it. Throws when the template has not exactly one marker.
 *
 * `preset` (optional) sets how this one page opens: orientation, which fields show, which view; the same object
 * `renderHtml(spec, { preset })` writes for the MCP preview, read by the renderers as `window.__ANTU_PRESET__`. The
 * marker sits in `window.__ANTU_SPEC__ = <marker>;` before the engine's script, so the preset is written right
 * after the data in the same statement list and is there when the renderers load.
 */
export function fillViewer(template, spec, { preset } = {}) {
  if (template.split(SPEC_MARKER).length !== 2) throw new Error(`the viewer template does not hold exactly one ${SPEC_MARKER}`)
  const data = escapeForScript(JSON.stringify(spec))
  const extra = preset ? `;window.__ANTU_PRESET__ = ${escapeForScript(JSON.stringify(preset))}` : ''
  return template.replace(SPEC_MARKER, () => data + extra)
}
