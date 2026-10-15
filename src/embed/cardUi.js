// ============================================================
//  src/embed/cardUi.js — recommended `mount` ui for a chat card (DSH and the like)
//
//  Quieter chrome, and the wheel leaves the host page able to scroll (spec/embed.md,
//  spec/dsh-plugin.md P1). Hosts copy or spread this into `mount(…, { ui: { …cardUi } })`.
// ============================================================

/** Pieces of chrome and canvas behaviour a chat card should turn off */
export const cardUi = Object.freeze({
  header: false,
  capsule: false,
  minimap: false,
  zoom: false,
  panOnScroll: false,
})
