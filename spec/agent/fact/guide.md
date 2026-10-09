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

## Where an event is drawn

Down the page is time: the order of the `slots` array (earlier in the array = earlier in time;
`date` is display-only and never reorders anything). Across the page are three places: **side 1,
the axis, side 2** (left, middle, right when vertical). The `groups` list names them: the 1st group
is side 1, the 2nd is side 2, the 3rd (optional) is the axis.

**What the groups split depends on how many parties the diagram has.** Count `actors` first.

### Two or more parties: the groups split the parties

Each party says which side it is on, with `groupId` on the **party**: the 1st or the 2nd group,
never the 3rd. Events carry **no** `groupId`; an event goes where its `actorIds` put it:

```
actorIds            where
one party           that party's side, in that party's column
several, or none    the axis (both sides together, several of one side together,
                    or an objective fact)
```

See `3-sides` and `4-one-side-several`.

So list in `actorIds` **the party who did it**: "A pays B" is A's act (one party, A's side); "A and B sign a
contract" is both's (two parties, the axis). Name the other party in the label or the summary, not in `actorIds`,
unless both acted.

**Someone on neither side** (the police who came, the ambulance, the court that served a paper) is not a party:
write the name in the label and leave `actorIds` out. The event goes on the axis.

Several parties on one side each get their own column, the earlier in `actors` the closer to the axis. A party
with no card of its own (it only acts with others) has no column.

### One party (or none): the groups split the events

With a single party there is no "who is on which side", so the two sides sort its acts by kind
(performed as agreed / departed from it, act / consequence...; choose from the case). The group goes on
the **event**: the 1st group side 1, the 2nd side 2, the 3rd or none the axis. The party carries no
`groupId`.

There are no views: a `views` field is an error. The chronicle and the time scale use the same three
places, one lane (or colour) per group.

## One limit: one event per cell

**A time point holds at most one event per lane.** Two events in the same lane of the
same slot is an error: `validate` reports it with the slot and the two event ids.

Three ways to fix it, most common first:

1. **Split the time point.** If two things happened at 9:24, one at 9:24:03 and one at
   9:24:16, make two slots and give each its exact time.
2. **Check actorIds.** If the two events belong to different parties, name the party who did each, and
   they fall into different lanes.
3. **Add groupId** (one party only). If they are of different kinds, add `groupId` and they fall on
   different sides.

After splitting, check again that each slot holds exactly one event.

## After writing

```
validate    reports each problem, with the field path and the event id
            (e.g. slots[0].events[1] (ev-2))
layout      no rendering: how large, which orientation, how many columns per side
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

- `1-minimal`: two parties, each on its side
- `2-single-actor`: one party, its acts split by kind (`groupId` on the events)
- `3-sides`: two parties: `groupId` on the parties, none on the events
- `4-one-side-several`: two parties on one side, and an act of both on the axis
- `5-duration`: spans and approximate times
- `6-sources`: facts traced to sources
- `7-undated`: no `date`
