# fact rendering approach v0

> Status: **core approach confirmed** (2026-09).
> Companion: where the data goes is in `spec/fact/timeline-rules.md`; this document is about **how it is drawn, how it is interacted with, how the code is split**.
> Usage: §1 to §4 are the core approach, changing them means reopening the discussion; every number in §5 comes from `src/renderers/fact/cardGeometry.js`, change it there and do not write a second copy in the styles.

---

## 0. In one sentence

Draw one fact specification as a **fixed grid**: rows are time, columns are lanes, one cell holds one event.

## 1. Division of labour between the engine and a renderer (general, not limited to fact)

- **A renderer does exactly one thing**: translate the specification into `{ nodes, edges }`.
- **The engine provides the canvas for all of them**: zoom, pan, minimap, node click. These shared capabilities are written once and no renderer reimplements them.
- **Each renderer owns its layout algorithm**: the fact timeline uses the grid algorithm in this document; future sub-types, plus the relationship, procedure and justification diagrams, each use their own (the latter two may use dagre or elkjs).
- Payoff: adding a new way of drawing means registering one sub-type renderer, and not one word of the canvas changes.

## 2. Validation and rendering share one placement computation

- There is **only one implementation** of the placement rules: `src/renderers/fact/timeline/grid.js`.
- The validation layer calls it to report errors, the rendering layer calls it to compute coordinates, and the two can never drift apart.
- This is a hard constraint: the validation layer and the rendering layer are not allowed to each carry their own set of rules.

## 3. The grid model

| | Decided by |
|---|---|
| **Row** | Time slot (`slots` array index; top to bottom is chronological order) |
| **Column** | Side × party: each party on side 1, then the axis, then each party on side 2 |
| **Cell** | At most one event |

- **An empty cell keeps its place** and nothing is drawn in it. The vacancy is itself information (this party did nothing in this kind of matter).
- **Card = cell minus the margin on all four sides**, so every card is the same size and alignment is automatic.
- The full rules for side and distance are in `spec/fact/timeline-rules.md`.

## 4. Screen elements and interaction

- **Axis**: the vertical line in the middle column, with a downward arrow at the bottom end showing the direction of time; each slot gets an axis dot on the axis.
- **Link**: a thin line drawn from the side of the card facing the axis, connecting to the axis dot of its slot. When the card is already in the axis column, no link is drawn.
  The whole link layer sits **below the axis dots and above the cards**: the dots cover the end of the line (so the line never pokes into the circle and punches through its white centre),
  and the cards cover the body of the line (so a line crossing the middle column is cut by the card instead of lying on top of it).
- **No time is written on the axis**, time is printed on every card.
- **Direction switch**: vertical time runs downwards, horizontal time runs to the right, switched in the control dock at the bottom of the canvas. **Direction only changes the pixel mapping, not one line of data**:
  which column an event falls in is always "slot index × lane index", horizontal and vertical merely hang those two on different axes.
  When horizontal, the header moves from above the grid to its left; links turn from horizontal lines into vertical lines; the detail overlay pops out sideways; the direction of the time arrow turns with it.
- **View switch**: the same data can be looked at in several ways (who is on which side, split by party or by kind). The switcher is in the control dock at the bottom of the canvas; switching re-lays out the whole diagram and re-fits the viewport. **A view that does not fit does not appear among the options** (an option that cannot be clicked is noise); a warning is printed to the console instead, so that whoever wrote the data can find it. The mechanism is in the "view mechanism" section of `spec/fact/schema-draft.md`.
- **Column heading**: only the group name of this column (for example "performance as agreed"), **never a positional description such as "side N / axis"**,
  the position is obvious from the picture and writing it out only takes up room. Font size 14px. Only when that side has several columns (several parties) is a second row with the party names added below.
- **By default a card holds two things**: title on top, time below. Three further switches can be turned on as needed: whether sources are shown, party tags, and one summary line.
  Card height is computed from "which fields are on" and "how many lines the title and the party tags each take", so turning a field off does not leave an empty block in the card.
- **Detail**: right beside the card, in two levels. Hovering reveals the `detail` summary (3 lines) and the **source names**;
  clicking **pins it in place**, expanding the full text, the time note (`dateNote`), the duration and all provenance (name, type, verbatim excerpt), scrollable. See §4.1.
- **Provenance has three layers**: a glance at the card shows **whether there is any** (the dot at the bottom right when the switch is on; filled = present, hollow = none listed)
  → hovering shows **which items it rests on** (names only) → opening shows **the verbatim excerpt**.
  Provenance is what this diagram stands on; even the lightest action must show roughly what is there, it must not be hidden behind "open it".
- **Duration**: for a lasting event with `dateEnd`, the time is written as "start - end" (on the same day only the ending time is written, without repeating the date),
  and opening the card adds a "duration X" line. **This is expressed in text only, length is never drawn on the axis**: slots are equally spaced and real time is not
  (in the elevator case 4 seconds and 264 seconds take up the same distance on the diagram), drawing length by real duration would deceive.
- **Cell layer**: draws the underlying rectangles as dashed lines, so that at a glance you can see "the whole diagram is pieced together from rectangles". There is a switch in the control dock, **off by default**.
  One empty column is drawn on each side, to show the margin of the coordinate system.
- **Colour**: cards are neutral throughout (white background, dark grey border), **no colour by side, and no coloured bar on the left**.
  The side colours (blue / red) **appear only on the column headings** (there used to be a legend in the left column as well; it duplicated the column headings, so it was deleted).
  The canvas palette is four greys, lighter at each step: card border `#8291a6` > link `#94a3b8` > axis `#b2c0d0` > grid line `#cbd5e1`.
- **There is no side column, the canvas fills the whole window**, everything else is an overlay on the canvas, four of them in total:
  - **Top left: the label card**. What this diagram is (the JSON `title`), its type, its rendering kind, its size and its time span.
    It is only a sign, not clickable; the **rendering kind switcher** is on that same row (see §9).
  - **Bottom centre: the control dock**. The switches for "how to look at it": view, card fields, direction, underlying grid lines;
    separated off at the far right by a divider is the only **action** in the dock, export image (see §10).
    Why the four kinds of control take four different shapes is in §4.2.
  - **Bottom left: zoom controls**, **bottom right: minimap** (both from React Flow).
  Why no side column: the only things in a side column that are genuinely "not on the diagram" are case navigation and the size of this diagram, and occupying 268px of width (17% of the window width) all year round for those two
  is not worth it; the parties are the column headings, the sources are in the card overlay, both would be duplicated. With it removed the canvas is 13% wider and the diagram 13% larger.
  An overlay covers a small part of the canvas edge, and one drag of the canvas moves it aside; that is the inherent cost of an overlay, and it is accepted.

### 4.1 Why detail uses an overlay beside the card, not a side drawer

**Any panel that changes the size of the canvas makes the content shift.** A side drawer squeezes the canvas narrower, and the card you clicked moves away with it, dodging your mouse. So detail always uses an **overlay that covers**:

- the canvas size never changes from start to finish, the cards do not move at all;
- the overlay is the same width as the card (`width: 100%`, as wide as the card is), left-aligned, so it **never overflows horizontally**; the overlay of a card in the first row pops downwards, the others pop upwards, to avoid the top edge;
- touch devices have no hover, so **a click must be able to open it on its own** (the pinned state), it cannot rely on hover alone;
- there are three ways to close it: click empty space, click the × at the overlay's top right, or click another card directly.

### 4.2 The shapes of the controls in the control dock

One dock is packed with four kinds of control (menu, switch, segmented, action), divided into five blocks
(view / card fields / direction / grid lines / export). Making them distinguishable at a glance rests on four things, and the order cannot be swapped:

1. **The shape follows "how many options, do they exclude each other", not importance.** Long option names and at most five of them → collect them into a menu
   (one button showing the current value); few and independent → put them all out as separate switches; two that exclude each other → a segmented control.
2. **State is carried by three levels of background darkness**, about 6% of grey between level and level:
   dock background (transparent) < segmented track (6%) < switch that is on (12%).
   "On" and "this segment is selected" must be two different darknesses, otherwise you cannot tell "this is a switch" from "these are group options".
3. **The solid level is reserved for the one action in the dock** (export image), with a download symbol beside it.
   Every other control is a light background or transparent, so this one block is the only dark thing in the whole dock and you know where to click without reading the text.
4. **Grouping is carried by distance, the divider only adds a stroke.** Within a group (between the switches of one module) 2px,
   between groups (across a divider) 21px, a ratio of ten. Previously within and between groups were **both 2px** (measured: the gaps between 11 elements were
   exactly the same), so "are these one block" rested entirely on that 1px, 10%-opacity, 14px-high line,
   which in a 28px-high dock is so thin it looks like a rendering defect, and users could not tell the five blocks apart. Now distance carries the main load,
   and the line is made taller and more solid (16px, 12%) as a marker when scanning. **Do not merge these two things**:
   when the distance is right the line can be faint; when the distance is wrong, no matter how loudly the line shouts it does not help.

**Why the action does not use the accent colour (blue).** In this palette colour is **meaningful**: blue = side 1, red = side 2
(see the colour item in §4). Painting a button blue adds an element to the diagram that "looks like side 1".
So the action uses a **neutral dark colour** (`--antu-text`), and is distinguished by "solid vs semi-transparent" rather than by hue.

**Every control needs a pressed state and a focus ring**, not just that one action:
pressed must be one level darker than "on" (otherwise clicking a switch that is already on makes the background lighter, as if the click was not caught);
the focus ring is the same for all four controls (the browser default ring is a different style, and it leans blue, which clashes with the side colours).

**While exporting, do not show disabled with "solid black pressed down to semi-transparent"**: that smears into a mid-tone grey that still looks clickable.
Use the same light background as the switches with secondary-colour text instead, which reads as disabled at a glance.

**All four of these have assertions pinned to them** (the rendering section of `tools/verify/run.mjs`): the grouping-distance item is written as a **ratio**
(between groups at least 5 times within groups) rather than a specific pixel count, so adjusting the numbers does not produce a false alarm, while falling back to "within and between groups the same width"
always fails. It also checks whether the two sides of every divider are equally wide (guarding against one wide side and one narrow side),
and whether the line is tall enough and opaque enough (a 1px line you cannot see is the same as no line).

## 5. Parameters (adjustable)

| Item | Value |
|---|---|
| Cell width | 316 (28 margin horizontal) |
| Cell height | card height + 28 |
| Card width | 288 |
| Card height | computed from the fields and the number of lines, 87 by default |
| Card padding | 11 (vertical) / 13 (horizontal) |
| Title | 13px, about 20 characters per line, at most two lines |
| Summary | 11.5px, at most 22 characters per line |
| Header (vertical) | 96 height reserved at the top |
| Header (horizontal) | 150 width reserved at the left (wider than 96, because the heading text has to fit within one column) |
| Axis dot diameter | 10 |
| Side 1 colour | `#2f6fed` |
| Side 2 colour | `#e5484d` |
| Card border | `#8291a6` |
| Link | `#94a3b8` |
| Axis | `#b2c0d0` |
| Grid line | `#cbd5e1` |

**The single source for these numbers is `src/renderers/fact/cardGeometry.js`** (`CARD_W`, `CARD_PAD_X`, `CARD_PAD_Y`, `LABEL_FONT`, `SNIPPET_FONT`, `TITLE_LINES`, `cardHeightOf`):
inner width, font sizes, character limits and card height are all derived there,
and the styles take them through CSS variables (vertical padding, title font size, summary font size). Change it there and **the summary character limit and the card height follow automatically**,
with no need to keep the two ends in step. The styles no longer write a second copy, avoiding the same number disagreeing in two places.
(The colours and the dot diameter live in `src/styles.css` as `--antu-side1` / `--antu-side2` and the card border, link, axis and grid-line rules; `CELL_W`, `CELL_GAP`, `HEADER_H`, `HEADER_W` and `DOT_SIZE` live in `src/renderers/fact/timeline/metrics.js`.)

## 6. Technology choice

**React Flow (`@xyflow/react` 12) as the canvas shared by all four diagram types.**

- This fact version **uses only canvas-level capabilities**: zoom, pan, fit view, minimap, node click.
- **It does not use graph-structure-level capabilities**: `edges` is an empty array, connection points `Handle` are not used, node dragging is off for this round.
- **Why keep it**: three of the four diagram types (relationship, procedure, justification) are standard node-edge graphs, which is exactly its home ground; sharing one canvas across the four avoids building a separate zoom-and-pan for each type; two places will use more of its capabilities later, see §7.
- **What it costs**: about 120 KB (gzip). This diagram on its own could have hand-written zoom and pan, but that would break the unified canvas.

## 7. Not done this round

| Item | Note |
|---|---|
| Drawing `dateEnd` | The text version is done (the card writes start and end, the overlay gives the duration). **No vertical bar across slots**: slots are equally spaced and real time is not, drawing length by real duration would deceive |
| Drag editing | The structure has already left the road open for it (order via the array, same slot via nesting); React Flow has snap-to-grid built in, which matches these cells naturally |
| Several events in one cell | Two events at the same time point in the same lane is an error. This is the basic assumption of the grid model (one cell, one event), the data author has to split the time point themselves. **The cost is that the "no side split" kind of view is unusable on most data** (see below) |

## 7.1 Two items already settled (previously listed under "not done")

| Item | Conclusion |
|---|---|
| The default for direction | **Settled: by slot count. 5 or more slots vertical, 4 or fewer horizontal** (rationale in §8). Diagrams where it was set by hand remember that; where it was not set, this rule applies |
| Verifying more than three parties | **Verified**: the construction document has 4 parties and 5 columns and has been run through several views; all 46 view × direction combinations lay out |

## 8. How direction is chosen (measured data, for fixing the default)

Content size in the two directions (same data, same view):

```
Vertical:   width = column count × 316            height = 96 + time point count × row height
Horizontal: width = 150 + time point count × 316  height = column count × row height
```

The fit zoom is the smaller of "viewport ÷ (content × 1.12)" for width and height. Measured (canvas 1360 × 857):

| Columns / time points | Vertical | Horizontal | Which is better |
|---|---|---|---|
| 5 / 5 | 0.769 | 0.702 | Vertical |
| **5 / 4** | 0.769 | **0.859** | **Horizontal** |
| 7 / 3 | 0.549 | 1.000 | Horizontal |
| 5 / 8 | 0.929 | 0.453 | Vertical |
| 7 / 7 | 0.961 | 0.514 | Vertical |

**The default rule as settled: decide by slot count (the number of `slots`). 5 or more slots vertical, 4 or fewer horizontal.**
Where 5 comes from: a horizontal cell is 316 wide, and one screen minus the left heading column fits only about 3.8 slots; at 5 slots horizontal is visibly crowded.
**Direction is remembered per diagram**: what was set by hand is remembered, what was not uses this rule as the default. Switching to another data set does not carry it over.

(The finer comparison below is for looking at the exceptions. The crossover: when column count > time point count horizontal is better, otherwise vertical is better.) The reason is plain: horizontal turns the "time point" dimension into a cell 316 wide,
so the more time points the wider horizontal becomes; the more columns the wider vertical becomes. Whichever brings the content closer to the screen aspect ratio is better.

The five existing examples have 15 views in total, and **all of them are "many time points, few columns", so vertical is better for all of them (horizontal is 27% to 39% worse)**.
To see a case where horizontal wins you need data with "many parties, few time points" (for example three parties each doing one thing on the same day).

## 9. The rendering kind (sub-type) switcher

**The same fact JSON can be drawn in several ways**; they are parallel renderers, each with its own rendering rules,
but they all consume the same schema. The timeline is the first; swimlane and other ways of drawing will be added later.
(Why a sub-type is not a data type, and that hard constraint, are in `spec/v0-architecture.md` §3.)

In the interface it sits on **the same row as the label card at the top left**, not in the bottom control dock:

| Where it sits | Reason |
|---|---|
| The label card at the top left | It answers "in which way is this data looked at", the topmost question on this page |
| The bottom control dock | That is where the presentation parameters **internal to a sub-type** live (view, direction, fields, grid lines), the two are not the same kind.<br>The only **action** in the dock is "export image", see §10 |

Two conventions:

- **With only one way of drawing it is plain text, not made into a button.** Opening a menu with a single option wastes a step;
- **With more than one it automatically becomes a clickable dropdown**, and what was chosen is remembered per diagram (`kinds` in `localStorage`).

On switching, the whole diagram is laid out again in the new way and the viewport re-fits to the new content; not one word of the data changes.

## 10. Exporting an image

**In one sentence**: export the current diagram as one PNG, to paste into a complaint, a written argument or a note on evidence.

The button is at the far right of the bottom dock; one click downloads directly, with no dialog.

### 10.1 Six settled points

| Item | Conclusion | Reason |
|---|---|---|
| Export range | **The whole diagram**, not cropped to the current viewport; it follows the current view, direction and field switches | Whatever the user can see they can screenshot themselves. The value of the export is "the **complete version** of this diagram that is on screen" |
| Heading | **Not included**, the diagram itself is always all that is exported | See 10.2 |
| Resolution | **Fixed at 2×** | 2× is clear enough at A4 width; this project does not add a switch to an option that is only used once in a while |
| Background | **White, opaque** | When an image is pasted into a legal document, a transparent background goes wrong on a dark background |
| Format | **PNG only**, no SVG or PDF | For PDF there is already the "browser prints the HTML" route; SVG export needs a wrapper around `foreignObject`, with poor compatibility |
| Button position | **Far right** of the bottom dock, separated by a divider | Right next to "adjust the parameters", adjust and export, one line of operation |

`2×` lands on `html-to-image`'s `pixelRatio`.

### 10.2 The heading: no switch, not exported

"Heading" = the label card at the top left (case name / type · rendering kind / size and time span).
**It is an overlay on screen and does not go into the exported image.**

**There used to be a switch for it, and it was withdrawn.** The idea at the time was "whatever is on screen is what is exported",
with the switch controlling two things at once: whether the card shows on screen and whether the export carries it. The reason was that
"you can see the final image before exporting".

There were two reasons for withdrawing it:

1. **Nine times out of ten the exported image is pasted into a document and sent to someone.** What that occasion wants is the diagram itself,
   and the case name and the size are written in the body text instead. Not carrying the heading by default is the right call;
2. The occasions that do want "with heading" are far fewer, yet everyone faced that switch every time,
   and it also took the label card off the screen, which amounts to changing the interface for the many on account of a minority occasion.

Write the cost down: **"export with heading" cannot be done now.** If that effect is really wanted,
a heading line has to be added to each page separately, and that was always the document's own business.

### 10.3 How it is captured

Two trade-offs that **must not be changed back**:

1. **Not `getNodesBounds`.** There are two 1×1 decorative nodes in the diagram (the cell layer and the link layer),
   and they would be counted into the bounding box, adding a ring of blank space out of nowhere. `graph.size` is the accurate one;
2. **Not capturing the whole `.antu-app`.** That way the exported image has the aspect ratio of the window, and a narrow diagram drags out large blank areas above and below.

The method: grab `.react-flow__viewport`, replace the **copy's** `transform` with the identity transform,
so the copy renders as "the whole diagram filling `graph.size`"; the live canvas does not move at all.

**`graph.size` includes the extra 6px taken by the arrow at the end of the axis** (`ARROW_EXTENT` in
`timeline/metrics.js`). Under-counting those 6px crops the arrow out of the frame on export, and this is a defect that really happened.

### 10.4 Pitfalls to remember

| Pitfall | Note |
|---|---|
| Only overlays **inside the capture range** need hiding | Measured: the zoom controls, the minimap, the bottom dock and the dot-grid background are all **outside** `.react-flow__viewport`, so capturing the viewport leaves them out naturally. What really needs hiding is the **card detail overlay** (it is part of the card node and goes into the image with it). Method: add an `is-exporting` class to the shell, hide it in the styles, remove it once the export is done |
| **The live canvas does not need changing, and does not need restoring** | It was first thought that one had to "record the viewport → change to the whole diagram → capture → restore". Measured: not needed. `html-to-image`'s `style` applies only to **the clone**, so replacing the clone's `transform` with the identity transform is enough, and the user's pan and zoom do not move from start to finish |
| **Fonts are an inherent cost** | `foreignObject` capture uses **the system fonts on the machine that opens this HTML**. Open the same file on someone else's machine and the exported image differs slightly from what the author saw. It cannot be solved, it can only be known |
| CSS variables are fine (measured) | The card's padding and title font size are CSS variables injected from `cardGeometry.js`. `html-to-image` inlines the computed styles into the clone, so font sizes in the exported image match the screen |
| **The browser blocks "a second automatic download from the same page"** | Nothing to do with the implementation, but **it is hit during verification**: a script-triggered click does not count as a user gesture, the first download goes through and the second is blocked, with the symptom "clicked and nothing happened, and no error in the console". Method: mark the click as a user gesture during verification (`userGesture: true` of `Runtime.evaluate`), see `eval` in `tools/lib/chrome.mjs` |
| Two exports under the same name **overwrite** | When exporting twice in a row during verification, the second overwrites the first and the file count is always 1. To judge "whether the second export happened at all" you must **move the file away after every export** |
| **Zero-size elements are dropped entirely** | The arrow at the end of the axis was originally drawn with a CSS border triangle (`width:0;height:0` plus three `transparent` sides). **It disappeared from the exported image** and the axis ended bare. The fix: draw it with an inline `<svg>`, which has a real size. **Rule: never build a shape that has to go into the exported image out of zero-size elements** |

### 10.5 Margin on all four sides (export only, not on screen)

The exported image keeps **24px** on each of its four sides (design pixels, 48px after 2×), the same on all four, and it does not change with the shape of the diagram.

Why not 0: the content frame sits exactly on the edge of the last line and the last character. Exported flush to the edge,
pasted into a document it touches the border; it also looks like it was cropped once.

Why a fixed value and not proportional: proportionally, a small diagram shows nothing and a large one leaves a huge ring.
The 24px carries one thing only, "do not touch the edge", and does not serve as a typographical margin.

**Method: the content is still rendered per `graph.size`, then drawn onto a larger white canvas.**
The margin is something "outside the diagram" and should not be approximated by shifting the clone: whether the margin appears would then
depend on how `foreignObject` handles `transform`, and could only be judged indirectly by sampling pixels.
Canvas compositing makes both the size and the margin guaranteed by construction, and directly assertable (see 10.7).

The verification script's line "size = content × 2" changes accordingly to "size = (content + margin on all four sides) × 2".

### 10.6 Size

`html-to-image` is about +15 to 20 KB; built into the engine: `engine.js` 389 KB → about 405 KB,
the produced HTML 420 KB → **about 440 KB**. A self-contained HTML is transferred uncompressed, so this is a real increase;
trading it for an offline-capable export button is worth it.

### 10.7 How it is verified (automatable)

`tools/verify/run.mjs` already has a CDP infrastructure, and export belongs to the "can be judged automatically" class:

```
Click the export button → point CDP at a download directory → check the PNG that landed on disk:
  ✅ clicking export lands a PNG on disk (correct magic number)
  ✅ size = (content + margin on all four sides) × 2 (exactly equal)
  ✅ it is not a blank sheet (drop the PNG back into the page and sample pixels with canvas, count non-white points)
  ✅ non-white pixels in the four margin bands = 0 (count one ring along each of the four edges)
  ✅ the content area must have ink in the same sampling
  ✅ the arrow sampling point is inside the exported image
  ✅ the end of the time axis in the exported image has an arrow (what is sampled must be the colour of the axis line)
```

**The size line is aimed at the pitfall in 10.3**: fall back to `getNodesBounds` and horizontal gains an extra 150px / vertical an extra 96px, and the assertion fails at once.

**The two margin lines have to be read together**: looking only at "all four edges white" would pass a completely white image;
looking only at "the content area has ink" would pass a margin added on one side, or content painted at (0,0) filling the top edge.

**The two arrow lines are aimed at two real defects**: the arrow was originally drawn with a CSS border triangle and was entirely lost on export;
after switching to an inline SVG, the extra 6px it takes was forgotten in the content size and it was cropped out of the frame.
Both assertions **have been verified to be able to fail** (set `ARROW_EXTENT` to 0 and they report an error with exit code 1).

`spec/known-issues.md` repeatedly stresses "what can be judged automatically must not be left to a human", and export is exactly that kind of thing.
