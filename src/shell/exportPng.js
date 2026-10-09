// ============================================================
//  src/shell/exportPng.js —— export the current diagram as one PNG
//
//  Why it lives in the shell rather than a renderer: exporting has to reach into
//  React Flow's node tree, which a renderer should not know about. The decision and
//  its rationale are in spec/fact/rendering.md §10.
//
//  It is done in two steps:
//    1. Let html-to-image clone .react-flow__viewport and replace the **clone's**
//       transform with "the whole diagram fills the frame" — the live canvas does not
//       move at all, so the user's current pan and zoom are unaffected, and there is no
//       need to "change it and restore it".
//    2. Draw that content onto a larger white canvas: EXPORT_PAD on all four sides.
//       The margin is something "outside the diagram", so it is not achieved by moving
//       the clone around (§10.5).
//  Then it is written out as a download (`exportPng`), or handed to a host that mounted the diagram
//  (`renderPng`, the image only: what it does with it is the host's business; issue 152).
//
//  **Only the diagram itself is exported, without the heading.** The label card at the
//  top left is an on-screen overlay and does not go into the image; there used to be a
//  switch letting the user choose, later removed (spec/fact/rendering.md §10.2).
//
//  Two trade-offs that must not be forgotten (spec §10.3):
//    - **Do not use getNodesBounds**: the two 1×1 decorative nodes in a diagram get
//      counted into the bounding box, adding a ring of margin out of nowhere.
//      graph.size is the accurate one.
//    - **Do not capture the whole .antu-app**: the exported image would then have the
//      window's aspect ratio, and a narrow diagram would drag out large blank areas
//      above and below.
// ============================================================

import { toCanvas } from 'html-to-image'

/** Export scale. 2× is sharp enough at A4 width (spec §10.1) */
const PIXEL_RATIO = 2

/**
 * The blank space left around the diagram (design pixels, multiplied by PIXEL_RATIO on export).
 *
 * Why not 0: the content box of a diagram sits exactly on the last line and the last
 * character, so exporting flush against it looks cropped; and pasted into a document it
 * touches the border.
 *
 * Why a fixed value rather than proportional: proportionally, the margin on a small
 * diagram is invisible while a large diagram gets a big ring of it. 24 is the amount
 * that gives neighbouring elements room to breathe; it does not serve as a page margin.
 */
export const EXPORT_PAD = 24

/** The class added to the shell during export; the styles use it to hide the overlays that would enter the image */
export const EXPORT_CLASS = 'is-exporting'

/**
 * Content size + margin = output size, and where in the output the content should be drawn.
 *
 * Split into a pure function so it can be tested directly: whether the margin really got
 * added, and how many times, is hard to judge from the code alone and can only be sampled
 * from an image.
 */
export function exportFrame(contentW, contentH, pad = EXPORT_PAD) {
  return {
    width: contentW + pad * 2,
    height: contentH + pad * 2,
    offsetX: pad,
    offsetY: pad,
  }
}

/**
 * File name: replace the characters in the title that cannot go into a file name.
 *
 * The fallback is 'antu' (the project codename) rather than the Chinese project name:
 *   1. this function is pure and called directly by Node-side tests, which have no
 *      interface language, and "do not hard-code Chinese wording in the code" is a hard
 *      i18n rule;
 *   2. what is exported is a **file name**, passed across systems, where ASCII is safest;
 *   3. English is already the project's default language (see README).
 * The title itself is still used as-is, so a Chinese title still exports a Chinese file name.
 */
export function fileNameOf(title) {
  const base = String(title || 'antu')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .slice(0, 60)
  return `${base || 'antu'}.png`
}

function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Release it only after handing off to the browser; releasing earlier cuts the download short
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Encode a canvas as PNG bytes. Pulled out on its own so that "cannot encode" has a clear error. */
function toPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('the rendered image could not be encoded as PNG'))
    }, 'image/png')
  })
}

/**
 * Export the current diagram as a download.
 * @param rootEl  the canvas shell element (.antu-canvas)
 * @param graph   the current graph; its size frames the content
 * @param title   used for the file name
 * @returns {{width:number, height:number}} the size of the written PNG, in device pixels
 *
 * **No heading.** The label card at the top left is an on-screen overlay and does not
 * enter the image; the old "heading" switch for the user to choose is gone.
 */
export async function exportPng({ rootEl, graph, title }) {
  const { blob, width, height } = await renderPng({ rootEl, graph })
  download(blob, fileNameOf(title))
  return { width, height }
}

/**
 * The PNG of the current diagram, without saving it: the same picture the download holds.
 * @param pixelRatio  device pixels per design pixel (2 by default, spec §10.1)
 * @returns {Promise<{blob: Blob, width: number, height: number}>} the size in device pixels
 */
export async function renderPng({ rootEl, graph, pixelRatio = PIXEL_RATIO }) {
  const viewportEl = rootEl?.querySelector('.react-flow__viewport')
  if (!viewportEl) throw new Error('canvas content layer not found; cannot export')

  const { width: contentW, height: contentH } = graph.size
  const frame = exportFrame(contentW, contentH)
  const appEl = rootEl.closest('.antu-app') || document.body

  // Hide the overlays that would get mixed into the image during export. Note that
  // **only the card detail overlay has to be hidden** — the zoom controls, the minimap,
  // the dock and the dot grid are all outside .react-flow__viewport and were never in
  // the capture area; hiding one more thing means one more pointless flicker
  // (see spec/fact/rendering.md §10.4).
  appEl.classList.add(EXPORT_CLASS)
  try {
    // style applies only to the **clone**: with the transform replaced by the identity,
    // the clone renders as "the whole diagram fills contentW × contentH". The size at
    // this step is still the content size; the margin is added in the next step, each
    // step minding its own business.
    const content = await toCanvas(viewportEl, {
      width: contentW,
      height: contentH,
      pixelRatio,
      backgroundColor: '#ffffff',
      style: {
        width: `${contentW}px`,
        height: `${contentH}px`,
        transform: 'translate(0px, 0px) scale(1)',
      },
    })

    // The output: a white canvas with the content drawn at an offset. The white
    // background matches the content's own, so the margin is "the edge of the white
    // paper", not a border stroke.
    const out = document.createElement('canvas')
    // rounded: a host may ask for a ratio such as 1.5, and a canvas has whole pixels
    out.width = Math.round(frame.width * pixelRatio)
    out.height = Math.round(frame.height * pixelRatio)
    const ctx = out.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)
    // Round the offset: a non-integer offset resamples the whole image and blurs the text
    ctx.drawImage(content, Math.round(frame.offsetX * pixelRatio), Math.round(frame.offsetY * pixelRatio))

    const blob = await toPngBlob(out)
    return { blob, width: out.width, height: out.height }
  } finally {
    appEl.classList.remove(EXPORT_CLASS)
  }
}
