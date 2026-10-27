// ============================================================
//  src/core/engineVersion.js — the release number of the engine on the page
//
//  The same number as package.json / `antu versions` / `<meta name="generator">`
//  (spec/versioning.md). Vite injects `__ANTU_VERSION__` into the engine and embed
//  builds; a source run without the define falls back to "dev".
// ============================================================

/** @returns {string} */
export function engineVersion() {
  // eslint-disable-next-line no-undef
  if (typeof __ANTU_VERSION__ !== 'undefined' && __ANTU_VERSION__) return String(__ANTU_VERSION__)
  return 'dev'
}
