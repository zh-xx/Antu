# Home-page animation: three drafts (issue #107)

Open the `.html` files directly in a browser. Each one plays once when opened; the button at the bottom right plays it again.

| File | Idea |
|---|---|
| `morph.html` | Each marked sentence turns itself into its node. The rest of the page gives way. |
| `lines.html` | Every line of the page becomes a thin stroke and slides to one line. Marked ones open into nodes, the others are taken into the line. |
| `chars.html` | The marked sentence breaks into characters, which put themselves together as the node's time and label. Characters that are not in the node fall away. |

| `lenses.html` | The home-page draft. Four kinds on the left (事实, 关系, 程序, 证成); picking one plays that kind on its own, from its document: the 方远 judgment's account turns into the timeline, the names in it gather into the relationship graph, the court's view becomes the root of the reasoning tree; a fictional purchase contract (`examples/raw/采购合同-PO-2026-088.md`) turns into the flowchart. Add `#kind=relationship` (or `procedure`, `justification`) to the address to open on another kind. Under the first screen there is only an "under construction" notice with a small robot at work; the top bar's Examples and Get started go to it. (The earlier sections there — how to use, the AI tools table, safety — are in the history of this branch.) |

The first three are made from the fictional case in `examples/` (the structured data and the judgment text beside it). Nothing is typed by hand: the nodes are the first six timed events, each matched to its sentence. The build stops if a sentence or label cannot be found in the judgment. `lenses.html` uses the 方远 fact and relationship files the same way: each timeline node must match its sentence, and each party must be named in the judgment; the counts on the parties are the real number of mentions. The reasoning scene shows the reasoning file as it is. In the flowchart scene each step must be named word for word in a sentence of the contract; the flowchart's grid is set in `build.mjs`, which stops if a node has no place.

Rebuild after changing a file here: `node site/prototypes/hero/build.mjs`

These are drafts for choosing a direction. They are not part of the published site yet.
