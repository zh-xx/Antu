# Home-page animation: three drafts (issue #107)

Open the `.html` files directly in a browser. Each one plays once when opened; the button at the bottom right plays it again.

| File | Idea |
|---|---|
| `morph.html` | Each marked sentence turns itself into its node. The rest of the page gives way. |
| `lines.html` | Every line of the page becomes a thin stroke and slides to one line. Marked ones open into nodes, the others are taken into the line. |
| `chars.html` | The marked sentence breaks into characters, which put themselves together as the node's time and label. Characters that are not in the node fall away. |

| `lenses.html` | One judgment (the 方远 case), seen two ways: its twelve sentences turn into the timeline, the timeline rewinds into the page, then every name in the page lights up and the mentions gather into the seven parties of the relationship graph, and the relations draw themselves. Then the court's view becomes the root of the reasoning tree, with the five issues and their reasons under it. Last, a contract (the purchase-contract flow; only its file name is shown, as the repository has no contract text) opens into its flowchart and a token runs the main line. Add `#from=3` to the address to start at a later scene. |

The first three are made from the fictional case in `examples/` (the structured data and the judgment text beside it). Nothing is typed by hand: the nodes are the first six timed events, each matched to its sentence. The build stops if a sentence or label cannot be found in the judgment. `lenses.html` uses the 方远 fact and relationship files the same way: each timeline node must match its sentence, and each party must be named in the judgment; the counts on the parties are the real number of mentions. The reasoning and flowchart scenes show the reasoning file and the purchase-contract file as they are; the flowchart's grid is set in `build.mjs`, which stops if a node has no place.

Rebuild after changing a file here: `node site/prototypes/hero/build.mjs`

These are drafts for choosing a direction. They are not part of the published site yet.
