# Mechanism notes for an agent

> This is an **operating note**, not the specification. The field list is a separate
> document, the examples are separate files, and the design rationale lives in the
> human-facing documents under `spec/` (you do not need them to write JSON).
>
> **This file is English on purpose.** It goes into a model's context, the same as
> the field table and the validation errors. See the header of `src/core/i18n.js`.

## In one sentence

A fact JSON describes: **when, who, did what, resting on which material**.
The engine draws it as a timeline: time runs downwards, parties and sides are laid
out left and right.

The reader can also switch to a **chronicle** (one column in slot order, the time passed
written between events) or a **time scale** (distance is real time, the axis breaks where the
scale changes). `date`, `dateEnd` and their precision matter more there: a day-only date is
drawn as the whole day. The same JSON draws in all three; `kind: "chronicle"` or
`kind: "scale"` on `layout`, `preview` and `render` shows it.

## Where an event is drawn is decided by three things

```
Row (time)   the order of the slots array. Earlier in the array = earlier in time.
             date is display-only: it never orders or reorders anything.

Column (side) groupId decides which side:
              the 1st group  -> side 1 (left when vertical)
              the 2nd group  -> side 2 (right when vertical)
              the 3rd group or none -> the axis (the middle column)

Column (lane) actorIds decides the lane:
              exactly 1 party -> that party's lane
              2 or more, or none -> the axis
```

**An event with several parties lands on the axis.** That is a hard rule: it means
"both sides did this" or "this happened objectively", and belongs to neither side.

So list in `actorIds` **the party who did it**: "A pays B" is A's act (one party, A's lane); "A and B sign a
contract" is both's (two parties, the axis). Name the other party in the label or the summary, not in `actorIds`,
unless both acted.

## What a view is

The same data can be looked at in several ways. A view only changes how the two
rules above are applied. It **never changes the data**:

```json
{ "label": "parties side by side", "splitBy": "actor",
  "side1": { "label": "Huayuan Trading", "actors": ["a-1"] },
  "side2": { "label": "Xincheng Building Materials", "actors": ["a-2"] } }
```

- `splitBy: "actor"`: split by party; `side1` / `side2` say who is on which side;
- `splitBy: "group"`: split by group; no need to name parties;
- `views` may be omitted; the engine then provides a single "all" view.

## One limit: one event per cell

**A time point holds at most one event per lane.** Two events in the same lane of the
same slot means that view cannot be drawn, and it disappears from the interface options
(an option that cannot be clicked is noise). `validate` checks the data once and does not call
this an error, since a data set may keep a view that does not fit on purpose; it does list each such
view as a note after "Validation passed", so it never goes unseen. `layout` reports the same views.

Three ways to fix it, most common first:

1. **Split the time point.** If two things happened at 9:24, one at 9:24:03 and one at
   9:24:16, make two slots and give each its exact time.
2. **Add actorIds.** If the two events belong to different parties, add `actorIds` and
   they fall into different lanes.
3. **Add groupId.** If they are of different kinds, add `groupId` and they fall on
   different sides.

After splitting, check again that each slot holds exactly one event.

## After writing

```
validate    reports each problem, with the field path and the event id
            (e.g. slots[0].events[1] (ev-2)); when it passes, notes any view that
            does not fit (not an error, but that view will not be offered)
layout      no rendering: how large, which orientation, which views do not fit
preview     take a screenshot and look: are cards cramped, is the text small,
            is there too much empty space
render      produce the self-contained HTML
```

**Passing validation is only the pass mark.** Validation cannot tell whether the
diagram looks good. Always run `preview` and look before delivering.

## Things that are easy to get wrong

- **date does not decide order.** The order is the `slots` array. To reorder, reorder
  the array.
- **Referenced ids must exist.** `actorIds` / `groupId` / `sourceIds` pointing at an id
  that does not exist is an error.
- **List only the sources this diagram uses.** `sources` travels inside the diagram;
  there is no need to list the whole case file.
- **approx is not "roughly written".** It is the formal marker that the time is not
  exact, and the diagram then shows "approx."; explain why in `dateNote`.
- **No date in the material: leave `date` out.** It is optional, and the card then says the date
  is unknown. Do not borrow a neighbour's date, and do not use `approx` for it: `approx` is for a
  date that was estimated or worked out, not for one that is missing. The place in the array still
  puts the event in order ("and afterwards they never replied" goes after the event it follows).
  `dateEnd` needs a `date`.
- **`quote` is verbatim.** It is shown on the card as the material's own words, so it must be an exact passage of
  the source: copy it, do not shorten or reword it. Join several passages with `……`. A condensed version of what
  the source says belongs in `detail`, not in `quote`. If you do not have the text, leave `quote` out.
- **Keep the summary short.** `summary` fits one line of the card (about 22 full-width
  characters); a longer one is **rejected**, not truncated, because it would overflow
  the card. Put the long text in `detail`.

## The examples

Each adds one idea (`<name>.zh-CN.json`, `<name>.en.json`):

- `1-minimal`: two parties, no `groups` (every card on the axis)
- `2-single-actor`: one party
- `3-groups`: `groupId` picks the side
- `4-views`: the same data, two views
- `5-duration`: spans and approximate times
- `6-sources`: facts traced to sources
- `7-undated`: no `date`
