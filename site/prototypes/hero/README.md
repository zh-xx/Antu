# Home-page animation: three drafts (issue #107)

Open the `.html` files directly in a browser. Each one plays once when opened; the button at the bottom right plays it again.

| File | Idea |
|---|---|
| `morph.html` | Each marked sentence turns itself into its node. The rest of the page gives way. |
| `lines.html` | Every line of the page becomes a thin stroke and slides to one line. Marked ones open into nodes, the others are taken into the line. |
| `chars.html` | The marked sentence breaks into characters, which put themselves together as the node's time and label. Characters that are not in the node fall away. |

| `lenses.html` | A typeset judgment (the 方远 case) turns into three of Antu's diagrams in turn: its account into the timeline, the names in it into the relationship graph, the court's view into the reasoning tree. Then a typeset contract turns into its flowchart. Each scene lands on what Antu itself draws for the example (`capture.mjs` renders it with the real engine at build time), so the last frame of each scene is Antu's own output. Add `#from=2`, `#from=3` or `#from=4` to the address to start at a later scene. |

The first three are made from the fictional case in `examples/` (the structured data and the judgment text beside it). Nothing is typed by hand: the nodes are the first six timed events, each matched to its sentence. The build stops if a sentence or label cannot be found in the judgment. `lenses.html` checks the same way: each timeline sentence must match its event, each party must be named in the judgment, each flowchart step must be named word for word in a sentence of the contract, and Antu must have drawn a card for every piece that moves.

Rebuild after changing a file here: `node site/prototypes/hero/build.mjs` (it needs Chrome or Chromium for the lenses draft; set `ANTU_CHROME` if it is not found).

These are drafts for choosing a direction. They are not part of the published site yet.
