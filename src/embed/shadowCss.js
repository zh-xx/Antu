// ============================================================
//  src/embed/shadowCss.js — the page's stylesheet, made to work inside a shadow root (issue 152)
//
//  The stylesheet is written for the viewer page, where the diagram is the whole document. In a shadow root
//  three things differ, and only these are changed:
//    - `:root` matches nothing there; the defaults of the theme variables go on `:host` instead;
//    - `.antu-app` is as tall as the window (100vh); a mounted one is as tall as the host's element;
//    - the shadow tree inherits the host's font, colour and line height. `all: initial` on `:host` is not
//      enough: a host rule on the element itself wins over `:host` (and `!important` ones always do), so the
//      reset is on the diagram's own root inside the shadow tree, which no rule of the host can match, with
//      the viewer page's font (PAGE_FONT, the one place it is written).
//  The stylesheet is the same file, bundled as text (Vite's `?inline`, in mount.js), so it cannot drift from
//  the page's. Plain JS, so a test checks the change on the real stylesheet.
// ============================================================

/** The font of the page around the diagram: the viewer page's `body` (tools/lib/make-html.mjs) and a mounted diagram's root */
export const PAGE_FONT = 'system-ui, "Microsoft YaHei", sans-serif'

/** What the shadow root needs beyond the stylesheet. Last, so it wins over `.antu-app { height: 100vh }`. */
export const HOST_RULES = `
:host { all: initial; display: block; position: relative; overflow: hidden; }
.antu-embed-root { all: initial; display: block; height: 100%; font-family: ${PAGE_FONT}; }
.antu-embed-root .antu-app { height: 100%; }
`

/** The stylesheet with its `:root` rules moved to `:host`. Throws if there is no `:root` to move. */
export function toShadowCss(text) {
  const parts = String(text).split(':root')
  if (parts.length < 2) throw new Error('antu: the stylesheet has no :root rule to move to :host')
  return parts.join(':host') + HOST_RULES
}
