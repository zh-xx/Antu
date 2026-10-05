# Home-page animation: three drafts (issue #107)

Open the `.html` files directly in a browser. Each one plays once when opened; the button at the bottom right plays it again.

| File | Idea |
|---|---|
| `morph.html` | Each marked sentence turns itself into its node. The rest of the page gives way. |
| `lines.html` | Every line of the page becomes a thin stroke and slides to one line. Marked ones open into nodes, the others are taken into the line. |
| `chars.html` | The marked sentence breaks into characters, which put themselves together as the node's time and label. Characters that are not in the node fall away. |

All three are made from the fictional case in `examples/` (the structured data and the judgment text beside it). Nothing is typed by hand: the nodes are the first six timed events, each matched to its sentence. The build stops if a sentence or label cannot be found in the judgment.

Rebuild after changing a file here: `node site/prototypes/hero/build.mjs`

These are drafts for choosing a direction. They are not part of the published site yet.
