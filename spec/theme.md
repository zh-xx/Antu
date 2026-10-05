# Themes and the design scale

Status: in use (issue #97). English only for now; the interface names of the themes are in `src/core/messages/`.

A diagram is drawn with a **theme**: one answer to the question "what does this role look like". The roles
(a party, a relation, an outcome, a node of a justification tree, ...) and the sizes are the same in every theme; a
theme only chooses paint. The same JSON gives the same picture in the three themes, apart from colour, corners and the
face of the text.

## The three themes

| Theme | For | Looks like |
| --- | --- | --- |
| `document` (default) | print, filing, a bundle | black on white, square corners, no colour at all; headings in a hei face, text in fangsong |
| `modern` | the screen | rounded, pale greys, one ink |
| `legal` | the screen, a presentation | navy as the main colour; red only where it is adverse |

Every meaning is also carried without colour (weight, dash, double line, outline, shape, a word), so a black-and-white
print reads the same. The `document` theme draws nothing but greys; `tools/verify` fails if any of the 15 ways of drawing a diagram
shows a colour in it, and `test/theme-lock.test.mjs` fails if a view or the stylesheet writes a colour of its own.

## Who chooses

1. `--theme` on `render` / `preview`, or `theme` on `antu_render` / `antu_preview`: the page is fixed to it (a preset).
2. Otherwise the reader, with the switch in the label card; the choice is remembered in the browser.
3. Otherwise `document`.

There is no field for it in the diagram JSON: the same file is shown to different readers, and the look is not part
of the case.

## What is themed

Only the diagram: the nodes, the lines, the labels, the bands and boxes behind them. The shell round it (the label
card, the zoom buttons, the bar below, the minimap) has one look in every theme. A theme's variables are set on the
canvas viewport (`.react-flow__viewport`), which is also the layer the picture export copies, so an exported picture
keeps the theme.

## The scale (`src/theme/scale.js`)

- An 8 px grid; node heights 40 / 48 / 64, widths in steps of 40 from 120.
- Five type sizes: 11, 12.5, 14, 16, 20; line height 1.4.
- Four line weights: 0.75 (hair), 1.1 (normal), 1.75 (strong), 2.5 (heavy).
- Four line styles: solid, dashed, dotted, double.

## One drawing per meaning

- A relation kind is a line: equity normal; control heavy; contract long dashes; debt dash-dot; guarantee dashed;
  kinship double; employment dotted; agency round dots; other hair and short dashes.
- A procedure outcome: positive a heavier line, negative a dashed line, neutral a plain line.
- A justification node: a conclusion heavy; a norm and a judgement grey-filled; a fact hair; an inference dotted;
  support a plain line, opposition dashed, a norm's basis dotted.
- Fact diagrams: side 1 a circle, side 2 a square (time scale), a circle, square or diamond per group (chronicle).

`test/theme.test.mjs` checks that every theme answers every role and that the roles of one family differ in
weight, dash or fill.

## Adding a theme

Add one entry to `THEMES` in `src/theme/themes.js` with the same keys as the others, add its name under `theme.*` in
`src/core/messages/en.js` and `zh.js`, and add its id to `THEME_IDS`. The tests say what is missing.

## Not yet

- Bundled fonts (the themes name system fonts and keep a place for bundled ones).
- Locking sizes the way colours are locked: node sizes come from the scale, but type sizes in the stylesheet are still written there.
