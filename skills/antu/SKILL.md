---
name: antu
description: >-
  Draw legal diagrams as one offline HTML file from structured JSON you write. Four kinds: a fact timeline
  (who did what and when; 事实时间线、案情时间图), a procedure flowchart (contract performance, litigation or
  arbitration steps; 程序流程图、合同履行流程), a relationship diagram (parties, equity, guarantees, regulators;
  主体关系图、股权结构、担保关系), and a justification tree (how a court reasoned from facts and norms to a
  conclusion; 证成图、说理树、裁判说理). Use when the user asks to draw, chart, map or visualise a case, a
  contract flow, the parties, or a judgment's reasoning.
metadata:
  version: "0.2.0"
---

# antu: legal diagrams from JSON

You write the JSON; the engine draws it. The result is **one HTML file** that opens in any browser with no
install and no network, prints, and can be forwarded. Nothing is uploaded anywhere.

This skill is antu **0.2.0**. The pages it makes say so: `<meta name="generator" content="antu 0.2.0">`.

## 1. Choose the kind of diagram

| The user wants to show | Use | Read |
| --- | --- | --- |
| what happened, in order, who did it (a timeline of a case) | `fact` | `references/guide-fact.md` |
| the steps of a process: contract performance, a litigation or arbitration procedure, with branches | `procedure` | `references/guide-procedure.md` |
| who the parties are and how they are tied: shareholding, loans, guarantees, control, regulators | `relationship` | `references/guide-relationship.md` |
| why a court decided as it did: conclusion, issues, norms, elements, facts | `justification` | `references/guide-justification.md` |

If the request fits two, make two diagrams rather than one overloaded one, and say so. If it fits none (a
chart of numbers, an org chart of a firm), say that antu does not draw it.

## 2. Write the JSON

1. Read the guide for the kind, then its field table: `references/fields-<kind>.md`. Every field, whether it
   is required, and what it means is there.
2. Open one example of that kind in `examples/<kind>/` and follow its shape. `1-minimal` is the smallest;
   the others each add one idea.
3. Write the file in the **user's language** (the examples come in `.zh-CN.json` and `.en.json`).
4. Put `"specVersion": 1` in the envelope, next to `"type"`.

**What goes in the diagram comes from the user's material, not from you.**
- Do not invent a date, a time, an article number, a version of a statute, a case number or a name. If the
  material does not say, leave the field out, or put the question to the user.
- A sentence that is your inference, not something the material says, must be marked as such where the
  format has a place for it (see the guide), or left out.
- Keep each node's text to what the material says, in its own words as far as you can. Put the full text
  that does not fit on the node in `detail`, and where it came from in `sources`.
- When you are not sure a legal point is right, do not dress it as certain: say so to the user in your
  reply, and do not put it in the diagram.

## 3. Check the data

- **If the tools `antu_validate` and `antu_layout` are available** (the antu MCP server is installed): call
  `antu_validate` until it passes, then `antu_layout` to see how big the picture is and which orientation fits.
- **Otherwise** there is no checker you can run. Go through the field table once more against your JSON:
  required fields present, ids unique, every reference (`actorIds`, `sourceIds`, `from`, `to`, `groupId` …)
  points at an id that exists. The page checks the data again when it opens and **lists every problem it
  finds instead of the diagram**: tell the user to send you that list if they see one, then fix the JSON and
  make the file again.
- The "cross-field rules" that the end of a field table says `antu_validate` reports (a dangling reference, a
  span running backwards, two events in one lane of one time slot …) are real rules: check each by hand. For
  the fact diagram, the guide's section "one event per cell" says how to see and fix the last one.

The guides mention tools named `antu_*`. They exist only with the MCP server; without it, use the field
tables and examples in this skill.

## 4. Make the HTML

**With Python 3** (standard library only):

```
python3 scripts/make_html.py spec.json -o diagram.html
```

The script checks that the JSON parses and names a known `type`, then writes the page.

**Without Python**: copy `assets/viewer.html` to the new file and replace the **one** piece of text
`/*ANTU_SPEC*/null` with the JSON of the diagram, written on one line, with every `<` written as `<`.
Change nothing else in the file.

Keep the JSON next to the HTML (same name, `.json`): the JSON is the source and can be edited and made
again; the HTML is the product.

## 5. Tell the user

Give the path of the HTML file. Say what it shows and what you had to leave out or could not tell from their
material, in a few lines. In the page the reader can hover and click the items for detail, switch
orientation, and export an image from the bar at the bottom. The page's own labels start in English; the
EN / 中文 switch in that bar changes them, so tell a Chinese-speaking user where it is.

## Updating this skill

The version is at the top. The newest one is at https://github.com/zh-xx/Antu/releases. If the user asks
whether this is up to date, tell them the version above and that address; do not claim to know what the
newest version is.
