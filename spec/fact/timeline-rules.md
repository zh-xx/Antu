# fact timeline · placement rules v0

> Status: **confirmed** (2026-09, settled point by point by the originator).
> Scope: the **placement** rules of a fact diagram, that is "where on the diagram an event goes".
> Relationship: this document supersedes the old rules on groups, parties and order in section 3 of `spec/fact/schema-draft.md`. The definitions of the fields themselves still follow that document (except the slot structure, see §4).

> **On directional words.** This document uses **direction-neutral** terms throughout: **side 1 / side 2 / axis**.
> When vertical, side 1 is on the **left** and side 2 on the **right**; when horizontal, side 1 is at the **top** and side 2 at the **bottom**.
> The ASCII diagrams below are drawn **vertical**, so the "top / bottom" that appear in them are the actual positions of side 1 / side 2 when vertical,
> not specification terminology.

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
| `groups` | **Side**. Decides whether an event leaves the axis and goes to side 1 or side 2 | Ordered, the order is the side |
| `actors` | **Lane**. Each party takes one column, deciding the distance within one side | Ordered, the order is inside out |
| `events` | **Content**. Held in slots, positioned by `groupId` / `actorIds` | Unordered, position decided by the two above |

> A **view** (the same case looked at in several ways) only changes how the two fields above are used; it introduces no new field that decides position.
> Which column an event falls in is always `groupId` for the side and `actorIds` for the column.
> The mechanism and how to write it are in the "view mechanism" section of `spec/fact/schema-draft.md`; this document only covers placement under one fixed set of rules.

## 2. Side: is the event on the axis or on one of the sides

| The event's situation | Where it goes |
|---|---|
| `groupId` not written | On the axis |
| The 1st group written | Side 1 |
| The 2nd group written | Side 2 |
| The 3rd group written | On the axis (same place as "not written", it only gives this lane a name) |
| **2 or more** parties involved | On the axis. If `groupId` also points to the 1st/2nd group (a side group), **an error** |

Key points:

- **The order of the groups is the order of the sides**: 1st group side 1, 2nd group side 2, 3rd group the axis.
- **The group limit is 3.** The axis has only two sides plus the middle, three positions, so a 4th group is a data error.
- **The 3rd group may be written or not.** Its value is giving "on the axis" a name, so that it can be displayed in the column heading; if it is not written, the default rule puts the event in the same place.
- A group with no events = an empty lane, which does not affect the layout, and the column heading still appears (the vacancy is itself information).
- **A contradiction is an error**: when an event involves 2 or more parties, `groupId` may only point to the 3rd group (the axis group) or be omitted. If it points to the 1st/2nd group, the validation layer reports an error and points out where the conflict is, and the agent corrects it itself.

## 3. Distance: how parties within one side are laid out outwards

- **Each side starts counting from cell 1 next to the axis**, the sides do not affect each other.
- When one side has several parties, they are offset one cell further out than the previous one, in the order they appear in the `actors` list.
- Therefore, if two parties sit on opposite sides (one on each side), **their distance from the axis is the same** and the diagram is symmetric.

```
One party on each side (elevator smoking case)   Three parties on one side
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
      { "id": "ev-2", "date": "2017-05-02T09:24:07", "label": "Yang Fan enters the elevator",
        "groupId": "g-1", "actorIds": ["a-1"] },
      { "id": "ev-1", "date": "2017-05-02T09:24:03", "label": "Duan Xiaoli smokes inside the elevator",
        "groupId": "g-2", "actorIds": ["a-2"] }
    ]
  }
]
```

## 5. Two supporting conventions

- **`actorIds` means "whom this event involves", not "who did this".** Optional. An event such as receiving a text message involves the recipient and should be written; one that involves no party at all, such as a gate being shut down or an ambulance arriving, is either left out or put in the 3rd group.
- **The order of judgement does not depend on `date`.** Sorting and slotting rest entirely on the position in the `slots` array, and `date` is shown on the card only.

## 6. Complete example: the elevator smoking case (extract)

```
                    side 1 (Yang Fan)   axis                side 2 (Duan Xiaoli)
09:24               [Yang Fan enters the elevator] [the two exchange words] [Duan Xiaoli smokes]
                                          ↑ three lanes side by side in the same slot
09:28                                   [walks to the entrance of the building]
09:31                                   [calls an ambulance]
(day precision)                                             [Duan Xiaoli dies]
```

> The times on the left come from the cards themselves; no time scale is drawn on the axis.

```jsonc
"actors": [
  { "id": "a-1", "name": "Yang Fan",   "role": "defendant · dissuader" },
  { "id": "a-2", "name": "Duan Xiaoli", "role": "victim · the one dissuaded" }
],
"groups": [
  { "id": "g-1", "label": "Yang Fan's conduct" },        // 1st group → side 1
  { "id": "g-2", "label": "Duan Xiaoli's conduct" },     // 2nd group → side 2
  { "id": "g-3", "label": "joint or objective course" }  // 3rd group → the axis
],
"slots": [
  { "events": [ /* 09:24: three things at once, one on each of the three lanes */ ] },
  { "events": [ /* 09:28 */ ] },
  { "events": [ /* 09:31 */ ] },
  { "events": [ /* Duan Xiaoli dies, date goes only to the day */ ] }
]
```

## 7. Not done this round

| Item | Note |
|---|---|
| Drawing `dateEnd` | The text version is done (the card writes "start - end", the overlay gives the duration). No vertical bar across slots: **not done**, slots are equally spaced and real time is not (in the elevator case 4 seconds and 264 seconds take up the same distance on the diagram), drawing length by real duration would deceive |
| Vertical/horizontal switching | **Done.** Direction is a rendering parameter and the logic does not change with direction; the default is taken from the slot count (5 or more slots vertical, 4 or fewer horizontal) |
| Dedicated verification for more than three parties | **Verified**: the example with 4 parties and 5 columns has been run through several views |
| Drag editing | The structure has left the road open for it (order via the array, same slot via nesting); the feature is not done |
| A time scale on the axis | Not drawn. Time is shown on the cards only, avoiding a misleading scale under mixed precision |

## 8. Settled

| Point of dispute | Conclusion |
|---|---|
| An event involves 2 or more parties and a side group is also written | **An error.** A contradiction mostly means the data is wrong; the validation layer points out the conflicting field and the agent corrects it itself |
| A slot scale misleads under mixed precision | **No time scale on the axis**, time is shown on the cards only, avoiding the misleading from the root |
| `groups[].label` and `events[].label` share a name | **Keep as is.** `name` is "what it is called", `label` is "what text is shown here": parties and sources use `name`, groups and events use `label`. Renaming groups to `name` for surface tidiness would sacrifice semantics instead |
