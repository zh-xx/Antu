# fact timeline · placement rules v1

> Status: **confirmed** (2026-10). The rules of v0 (2026-09) stand, except the points listed under "What v1 changed".
> Scope: the **placement** rules of a fact diagram, that is "where on the diagram an event goes".
> Relationship: this document supersedes the old rules on groups, parties and order in section 3 of `spec/fact/schema-draft.md`. The definitions of the fields themselves still follow that document (except the slot structure, see §4).

> **On directional words.** This document uses **direction-neutral** terms throughout: **side 1 / side 2 / axis**.
> When vertical, side 1 is on the **left** and side 2 on the **right**; when horizontal, side 1 is at the **top** and side 2 at the **bottom**.
> The ASCII diagrams below are drawn **vertical**, so the "top / bottom" that appear in them are the actual positions of side 1 / side 2 when vertical,
> not specification terminology.

> **What v1 changed.**
> 1. What the groups split depends on how many parties the diagram has: with 0 or 1 party, the groups split the **acts** and are written on the events; with 2 or more, they split the **parties** (the two camps), are written on the parties, and an event's place follows from its parties (§2).
> 2. **Views (`views`) are gone.** A diagram has one placement, and the timeline, the time scale and the chronicle all follow it.
> 3. **Old data is not carried over.** A page made earlier holds its own data and program and still opens as it was; an old JSON given to the new version is refused, with what to change (format generation 2, `spec/fact/changes.md`).
>
> Why: in v0 a group said both "what kind of act" and "which side", and an event of two or more parties had to go in the 3rd group. An author who grouped by subject had to put a loan (an act of both sides) in the 3rd group, so it was missing from the "lending and repayment" lane (the Fang Yuan case). Views laid a second placement over the same data, and a view written slightly wrong made the diagram say the wrong thing.

---

> **This one is for the designer.** What an agent uses to write JSON is a different document:
> fields in the MCP's `antu_schema`, mechanism in `spec/agent/fact/guide.md`.
> The two do not copy from each other; the division of labour is written in `spec/agent/README.md`.


## 0. In one sentence

A fact timeline is a grid on an axis:

- **Down the page is time**: one slot = one time point, top to bottom.
- **Across the page are lanes**: side 1, the axis, side 2, three kinds of side in total.

```
                    side 1 lane        axis           side 2 lane
slot 1 (1st time point)  [event]        [event]        [event]      ← side by side on the same row
slot 2                                  [event]
slot 3                                  [event]
                    ↓ time runs down along the axis
```

## 1. What each of the four things controls

| Object | Controls | Ordered? |
|---|---|---|
| `slots` | **Time**. One slot = one time point | Ordered, the order is the sequence |
| `groups` | **Side**. The 1st group side 1, the 2nd side 2, the 3rd the axis | Ordered, the order is the side |
| `actors` | **Lane**. Each party takes one column, deciding the distance within one side; with 2 or more parties each party also says whether it is in the 1st or the 2nd group | Ordered, the order is inside out |
| `events` | **Content**. Held in slots; with 0 or 1 party placed by their own `groupId`, with 2 or more by their `actorIds` | Unordered, position decided by the two above |

> A diagram has one placement; there are no views.

## 2. Side: what the groups split depends on how many parties there are

### 2.1 0 or 1 party: the groups split the **acts**

With a single party, "who is on which side" means nothing; the two sides sort its acts by kind (as agreed / departing from the agreement, act / consequence...; the agent chooses from the case).

The group is written on the **event** (`events[].groupId`):

| The event's situation | Where it goes |
|---|---|
| `groupId` not written | On the axis |
| The 1st group written | Side 1 |
| The 2nd group written | Side 2 |
| The 3rd group written | On the axis (same place as "not written", it only gives this lane a name) |

A party carries no `groupId`; written, it is an error.

Example: the gym case has one party, Han Lei; the groups are "normal (performed as agreed) / abnormal (departs from the agreement) / objective course (no party involved)".

### 2.2 2 or more parties: the groups split the **parties**

With two or more parties, the two sides are two camps. The group is written on the **party** (`actors[].groupId`):

- **Every party must write `groupId`, and only the 1st or the 2nd group.** The 3rd group is the axis, not a camp.
- **An event writes no `groupId`**; written, it is an error. Where an event goes follows from its `actorIds`:

| The event's parties | Where it goes |
|---|---|
| 1 | That party's side, in that party's own column |
| 2 or more, across both sides | On the axis; the card names them |
| 2 or more, all on one side | On the axis (no long card across several columns); the card names them |
| none written | On the axis |

- **A third party on neither side** (the police who came, the ambulance crew, the court that served a paper...) is not listed as a party: the name goes in the event's label, the event writes no `actorIds`, and it goes on the axis.
- With exactly two parties, each group is one party.
- **A card on the axis that names two or more parties says who** (issue #172), whatever the parties switch says: the names stand on the time's line, right of the time, in small grey text, cut short with an ellipsis when long (the overlay lists them all). No card grows. A party who only ever acts with others has an empty column; this is how the reader still sees what it took part in. A party that no event names at all is a validation note.

Example: the Fang Yuan case. Fang Yuan and Liang → the 1st group, "Fang Yuan and his mother"; the debt collectors → the 2nd group; the 3rd group "negotiations and objective course". Liang and her husband borrow from the collectors → across both sides, on the axis; Liang repays → side 1, in Liang's column.

### 2.3 For both

- **The order of the groups is the order of the sides**: 1st group side 1, 2nd group side 2, 3rd group the axis.
- **The group limit is 3.** The axis has only two sides plus the middle, three positions, so a 4th group is a data error.
- **The 3rd group may be written or not.** Its value is giving "on the axis" a name, so that it can be displayed in the column heading; if it is not written, the default rule puts the event in the same place.
- A group with no events = an empty lane, which does not affect the layout, and the column heading still appears (the vacancy is itself information).
- **The time scale and the chronicle use the same sides**: one lane per group (side 1, side 2, the axis), matching the timeline.

## 3. Distance: how parties within one side are laid out outwards

- **Each side starts counting from cell 1 next to the axis**, the sides do not affect each other.
- When one side has several parties, they are offset one cell further out than the previous one, in the order they appear in the `actors` list.
- Therefore, if two parties sit on opposite sides (one on each side), **their distance from the axis is the same** and the diagram is symmetric.

```
One party on each side (corridor-charging case)   Three parties on one side
        side 1   axis    side 2                    side 1        axis
cell 1  [A]             [B]                    cell 1 [A]
cell 2                                         cell 2       [B]
cell 3                                         cell 3             [C]
equal distance from the axis                   progressively outwards within one side
```

## 4. Time slots

- **One slot = one time point.** Events in the same slot are **displayed side by side**.
- **The order of slots = the order of the `slots` array.** No number and no index is written; the position in the array is the order. That way drag-reordering needs no renumbering.
- **`date` is for display only and does not decide the order.** With mixed precision (some to the second, some only to the day) a machine cannot compare reliably, so the order always follows the array.
- **Within one slot, one lane holds at most one event.** A collision is a data error; the validation layer reports it and points out which two events collided.
- **No time scale is drawn on the axis.** Time is shown only on each card, and the slot itself carries no heading either.
- **An empty slot is meaningless** and is not allowed.

```
Allowed within one slot (one each on three lanes)     Not allowed within one slot (both fall on the same lane)
cell 1 [side 1 event][axis event][side 2 event]          [side 1 event A][side 1 event B]  ← collision
```

Event structure (replacing the former flat `events` array):

```jsonc
"slots": [
  {
    "events": [
      { "id": "ev-2", "date": "2030-06-02T20:14:07", "label": "Sun Hao enters the corridor",
        "actorIds": ["a-1"] },
      { "id": "ev-1", "date": "2030-06-02T20:14:03", "label": "Qian Min charges a battery in the corridor",
        "actorIds": ["a-2"] }
    ]
  }
]
```

## 5. Two supporting conventions

- **`actorIds` means "whom this event involves", not "who did this".** Optional. An event such as receiving a text message involves the recipient and should be written; one that involves no party at all, such as a gate being shut down or an ambulance arriving, leaves it out and goes on the axis (a diagram of 0 or 1 party may also put it in the 3rd group).
- **The order of judgement does not depend on `date`.** Sorting and slotting rest entirely on the position in the `slots` array, and `date` is shown on the card only.

## 6. Complete example: the corridor-charging case (extract)

```
                    side 1 (Sun Hao)   axis                side 2 (Qian Min)
20:14               [Sun Hao enters the corridor] [the two exchange words] [Qian Min charges]
                                          ↑ three lanes side by side in the same slot
09:28                                   [walks to the entrance of the building]
09:31                                   [calls an ambulance]
(day precision)                                             [Qian Min taken ill]
```

> The times on the left come from the cards themselves; no time scale is drawn on the axis.

```jsonc
"actors": [
  { "id": "a-1", "name": "Sun Hao",  "role": "defendant · dissuader",       "groupId": "g-1" },
  { "id": "a-2", "name": "Qian Min", "role": "plaintiff · the one dissuaded", "groupId": "g-2" }
],
"groups": [
  { "id": "g-1", "label": "Sun Hao's side" },        // 1st group → side 1
  { "id": "g-2", "label": "Qian Min's side" },       // 2nd group → side 2
  { "id": "g-3", "label": "joint or objective course" }  // 3rd group → the axis
],
"slots": [
  { "events": [ /* 20:14: three things at once, one on each of the three lanes */ ] },
  { "events": [ /* 09:28 */ ] },
  { "events": [ /* 09:31 */ ] },
  { "events": [ /* Qian Min taken ill, date goes only to the day */ ] }
]
```

## 7. Not done this round

| Item | Note |
|---|---|
| Drawing `dateEnd` | The text version is done (the card writes "start - end", the overlay gives the duration). No vertical bar across slots: **not done**, slots are equally spaced and real time is not (in the corridor case 4 seconds and 264 seconds take up the same distance on the diagram), drawing length by real duration would deceive |
| Vertical/horizontal switching | **Done.** Direction is a rendering parameter and the logic does not change with direction; the default is taken from the slot count (5 or more slots vertical, 4 or fewer horizontal) |
| Dedicated verification for more than three parties | **Verified**: the example with 4 parties and 5 columns |
| Drag editing | The structure has left the road open for it (order via the array, same slot via nesting); the feature is not done |
| A time scale on the axis | Not drawn. Time is shown on the cards only, avoiding a misleading scale under mixed precision |

## 8. Settled

| Point of dispute | Conclusion |
|---|---|
| An event involves 2 or more parties and a side group is also written | v0: **an error**. v1: with 2 or more parties an event writes no group, so the contradiction cannot arise |
| Views (`views`) | **Removed in v1.** One diagram, one placement; a view written slightly wrong made the diagram say the wrong thing, and was hard for a weaker agent |
| Several parties of one side acting together | **On the axis.** No long card across several columns; the card names them (issue #172) |
| A diagram of several parties split by kind of act | **Not supported.** With several parties the sides are the camps; the kind of act goes in the event's label or summary |
| Old data | **Not carried over.** A page holds its own data and program and is unaffected; an old JSON given to the new version is refused point by point, with what to change (delete `views`, move the groups from the events to the parties) |
| A slot scale misleads under mixed precision | **No time scale on the axis**, time is shown on the cards only, avoiding the misleading from the root |
| `groups[].label` and `events[].label` share a name | **Keep as is.** `name` is "what it is called", `label` is "what text is shown here": parties and sources use `name`, groups and events use `label`. Renaming groups to `name` for surface tidiness would sacrifice semantics instead |
