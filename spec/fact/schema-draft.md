# fact · Schema draft v0

> Status: **implemented** (status line checked against 0.11.0). The field set has been trimmed per the sponsor's decisions. Field names and constraints may still change in a 0.x release, with a changelog entry (`spec/versioning.md`). Besides the timeline, two more ways of drawing the same JSON are implemented, as first attempts: the chronicle and the time scale (`spec/fact/rendering.md` §9.1 and §9.2).

> **Format generation 2 (placement rules v1, 2026-10).** Views are gone, and with 2 or more parties the groups are written on the parties, not on the events. The placement rules are `spec/fact/timeline-rules.md`; how to bring a generation-1 file over is `spec/fact/changes.md`.

> **This document is for designers.** An agent writing JSON uses a different one:
> fields come from the MCP tool `antu_schema`, mechanism from `spec/agent/fact/guide.md`.
> The two do not copy each other; the division of labour is set out in `spec/agent/README.md`.

> Basis: the shared conventions layer in `spec/v0-architecture.md` (references by id / everything carries a label / permissive optionality).
> Scope: fact = a timeline narrative of **substantive facts that have already happened**. Procedural events (filing, hearing, judgment) are not this type; they are procedure.

## 0. Decisions already taken (sponsor's rulings, 2025-09)

1. **No `kind` classification field.** Event categories are not enumerated, consistent with evidence having no "evidence type": a category enum brings no real benefit and only adds maintenance;
2. **sources follow option B**: the diagram carries its own copy of the sources, and events reference the in-diagram sources with `sourceIds`;
3. The old prototype code is not carried over (the new engine is written from scratch).

## 1. Envelope (shared by all types)

```jsonc
{
  "specVersion": 2,
  "type": "fact",
  "title": "Huayuan Trading v. Xincheng Building Materials · Facts"
}
```

## 2. Content layer, draft

```jsonc
{
  "type": "fact",
  "title": "Huayuan Trading v. Xincheng Building Materials · Facts",

  // diagram-level party list (ordered; sets the lane order on the timeline). See "Actor mechanism" in §3
  // with 2 or more parties, each says its side with groupId (the 1st or the 2nd group)
  "actors": [
    { "id": "a-1", "name": "Huayuan Trading", "role": "plaintiff", "groupId": "g-1" },
    { "id": "a-2", "name": "Xincheng Building Materials", "role": "defendant", "groupId": "g-2" }
  ],

  // diagram-level group list (ordered; sets the side order). See "Group mechanism" in §3
  // the 1st -> side 1, the 2nd -> side 2, the 3rd -> the axis
  "groups": [
    { "id": "g-1", "label": "Lender's side" },
    { "id": "g-2", "label": "Borrower's side" },
    { "id": "g-3", "label": "Joint acts or objective course" }
  ],

  // the diagram's own source table (option B: only the sources this diagram references)
  "sources": [
    { "id": "s-1", "type": "contract", "name": "Loan contract", "loc": { "file": "loan-contract.pdf", "page": 3 } },
    { "id": "s-2", "type": "evidence", "name": "Bank transfer record", "loc": { "file": "bank-transfer-record.pdf", "page": 1 } }
  ],

  // time slots: array order is chronological order. **The array position is authoritative; date never decides the order**
  "slots": [
    {
      "events": [
        { "id": "ev-1", "date": "2023-03-10", "label": "The two parties sign the loan contract",
          "summary": "principal CNY 5m; term 12 months",
          "actorIds": ["a-1", "a-2"],   // two parties -> the axis
          "detail": "The loan was 5,000,000 yuan for a term of 12 months; principal and interest were payable in one sum at maturity.",
          "sourceIds": ["s-1"] }
      ]
    },
    {
      "events": [
        { "id": "ev-2", "date": "2023-03-12T10:30", "label": "Huayuan Trading disburses the loan",
          "summary": "CNY 5m transferred to the defendant",
          "actorIds": ["a-1"],          // one party -> that party's side
          "detail": "Huayuan Trading transferred 5,000,000 yuan to Xincheng Building Materials' account by bank transfer; the remark stated that it was a loan.",
          "sourceIds": ["s-1", "s-2"] }
      ]
    },
    {
      "events": [
        { "id": "ev-3", "date": "2023-06-01", "dateEnd": "2023-12-31",
          "label": "Xincheng Building Materials repays in instalments",
          "summary": "6 instalments agreed; the first 3 on time",
          "actorIds": ["a-2"],
          "detail": "The parties separately agreed on repayment in 6 instalments; the first 3, from June to November 2023, were all paid on time.",
          "sourceIds": ["s-2"] }
      ]
    },
    {
      "events": [
        { "id": "ev-4", "date": "2024-01-15", "label": "Xincheng Building Materials stops repaying",
          "summary": "nothing paid from the 4th instalment on",
          "actorIds": ["a-2"],
          "detail": "From the 4th instalment on no further payment was made, and it remained unpaid after demand.",
          "sourceIds": ["s-2"] }
      ]
    }
  ]
}
```

Points to note:

- **Events live inside time slots** (`slots[].events[]`), not in a flat `events` array. Things that happened at the same instant go into the same slot, and inside the slot they are separated by lane.
- **The array order is the authoritative order.** `date` serves display and as a reference for sorting. With mixed precision (one event to the second, another only to the day) sorting by date gets it wrong.
- **Placement follows the parties**: with 2 or more parties in the diagram, one party puts the event on that party's side, two or more (or none) put it on the axis. With 0 or 1 party the event's own `groupId` picks the side. The full rules are in `spec/fact/timeline-rules.md`.
- One source can be referenced by several events (`s-1` and `s-2` are each referenced twice); this is the zero-redundancy of "reference, not copy".

> **On many-to-many:** a source is stored once in the **diagram's own `sources` table** and events reference it with `sourceIds`. One event may rest on several sources, and one source may be referenced by several events. Zero redundancy comes from "reference, not copy"; see section 4 of the main design document.

## 3. Field rules (draft)

### Envelope fields

| Field | Required | Type | Notes |
|---|---|---|---|
| `type` | yes | string | always "fact" |
| `title` | yes | string | diagram title, shown at the top left |

### Diagram-level fields

| Field | Required | Type | Notes |
|---|---|---|---|
| `actors` | no | object[] | **party list** (ordered; sets the lane order on the timeline): `{ id, name, role?, groupId? }`; see "Actor mechanism" below |
| `groups` | no | object[] | **group list** (ordered; sets the side order): `{ id, label }`; see "Group mechanism" below |
| `sources` | no | object[] | the diagram's own source table (option B); see below |
| `slots` | yes | object[] | the sequence of time slots; array order is chronological order; `date` is display-only and never reorders. Each slot is `{ events: [...] }` |

Each slot is `{ events: [ ... ] }`: events at this time point; must not be empty (an empty time slot carries no meaning).

### Views (removed in generation 2)

From 2026-09 to generation 1 a diagram could carry several views (`views`), each a way of splitting the same events into sides. They are gone: a diagram has one placement (`spec/fact/timeline-rules.md` v1), and a `views` field is an error. Why: views laid a second placement over the same data, a view written slightly wrong made the diagram say the wrong thing, and the groups of a view by subject fought with the rule that an act of both parties belongs on the axis.

### events[] entries

| Field | Required | Type | Notes |
|---|---|---|---|
| `id` | yes | string | unique within the diagram |
| `date` | no | string (ISO 8601, **precision may be truncated**) | ISO 8601. Go to seconds when known, otherwise stop at the day; **the array order is the authoritative order** (see below). **Optional since 0.4.0 (#50):** an event the material gives no date for is left without one, and its card says the date is unknown; never make one up. `dateEnd` needs a `date` |
| `label` | yes | string | card title; about 20 characters per line, at most two lines |
| `actorIds` | no | string[] | parties involved. Two or more puts this event on the centre axis; references the diagram-level `actors` ids (see "Actor mechanism" below) |
| `groupId` | no | string | **only in a diagram of 0 or 1 party**: which side this event falls on; references a diagram-level `groups` id (one only, mutually exclusive groups). With 2 or more parties it is an error: the event is placed by its `actorIds`. See "Group mechanism" below |
| `detail` | no | string | full text revealed when the card is opened |
| `summary` | no | string | the line under the card title; about 22 characters; see "label / summary / detail" below |
| `dateEnd` | no | string (ISO 8601) | for a span, the end instant; must not be earlier than date. The card then shows "start - end" and the overlay gives the duration (**no span bar is drawn**, why see §4) |
| `approx` | no | boolean | time is not exact (estimated or inferred); the diagram shows "approx."; calculations treat it with care |
| `dateNote` | no | string | why the time is not exact, and how it was derived (human-readable) |
| `sourceIds` | no | string[] | which materials it rests on; references ids in this diagram's `sources` (many-to-many, see above) |

> **No `kind` field** (settled): event categories are not enumerated.

### Division of labour: label / summary / detail (settled 2026-09)

All three fields are text, but they serve **two different reading situations**: a glance across the card, and close reading in the overlay.
The original plan was for one `detail` to serve both, and that does not work. The arithmetic: the diagram grows vertically, so every extra line on a card adds 126px to the total height (7 lines x 18px), which drops the fit-to-view zoom by one step and makes **every character in the whole diagram 15 to 19% smaller**.
So "short enough to sit on the card" and "worth calling detail" are mutually exclusive, and the field has to be split in two.

| Field | Length | Where it appears | Job | Floor |
|---|---|---|---|---|
| `label` | 10 to 20 characters | the card | recognise which event this is | **must name the party and the act**: read out, it says "who did what" |
| `summary` | **about 22 full-width characters, one card line** | the card | add the key information `label` does not carry | **must not restate `label`**; if it does not fit one line, leave it out |
| `detail` | 40 to 120 characters | the overlay only | the full account for a close read | **must not restate `label`**; either leave it out or give new information |

(The one-line limit is computed from the card geometry; changing the card width or the summary font size changes it automatically, see `src/renderers/fact/cardGeometry.js`. It is a width budget, not a character count: a full-width character costs one em, a Latin character about 0.55, so one line holds about 22 Chinese characters or about 40 Latin characters. A `summary` wider than one line is rejected, not truncated.)

`summary` is a field born for the card: **fitting one line is its design goal**, so it is meant to be written to fit rather than trimmed afterwards.
What it should carry is what a lawyer scanning the diagram most wants to see first: amounts, durations, key acts, third-party involvement.

```
label   Han Lei takes a one-year membership and registers a fingerprint
summary card fee RMB 1,360, paid by WeChat

label   The two talk continuously in the corridor (dissuasion)
summary in contact under five minutes; no altercation

label   Receives the "no face scan, no entry" SMS
summary fingerprint recognition cancelled
```

Note that `summary` and `detail` are **both optional**, and writing only one of them is allowed:
if an event has no key information beyond `label`, `summary` stays empty, and that is normal.

A counter-example (the corridor-charging case, showing why `detail` needs a rule of its own):

```
label  Paramedics arrive
detail Paramedics reach patient                                        <- pure restatement, zero new information

label  The two reach the building entrance; Qian Min is agitated
detail Qian Min was relatively agitated, Sun Hao relatively calm   <- the only new information is "Sun Hao relatively calm"
```

Compare the two well-written entries in the same case; they carry information that **only `detail` can convey**, such as "pulled back by the property manager" and "in contact for under five minutes".

### The three common timeline shapes (examples, not all of them)

All three come from the same placement rules; the data layer has no shape field.

| Shape | How it is written | Notes |
|---|---|---|
| **single-party timeline** | one party; the groups split its acts by kind, written on the events | reconstruct the facts from one party's standpoint |
| **two-party timeline** | two parties, one in each side group | one party per side, the two opposed |
| **multi-party timeline** | several parties, each in the 1st or the 2nd group | several lanes; the two sides may be asymmetric |

**The two sides are called "side 1 / side 2", not "top side / bottom side".** With a vertical axis the two sides are in fact left and right. The top/bottom wording comes from a horizontal layout and stops being right once it is moved onto a vertical axis.

**Direction is decided by the renderer** (`orientation: "horizontal" | "vertical"`); the data layer does not care about direction. Both directions are implemented and are switched by hand in the control dock at the foot of the canvas.

### Group mechanism (settled 2026-09, changed in generation 2)

**Purpose:** to name the two sides and the axis. **What a group splits depends on how many parties the diagram has**:

- **0 or 1 party**: the groups split the **acts** of that party (act/consequence, normal/abnormal, and so on; the agent decides from the case). An event references one with `groupId`; an event with none goes on the axis;
- **2 or more parties**: the groups split the **parties**. Each party references the 1st or the 2nd group with its own `groupId` (required); the events carry none and are placed by their `actorIds`.

Common to both:

- **`groups` is an ordered diagram-level list**: order is the side order (the 1st on the left/top, the 2nd on the right/bottom);
- **at most 3**: the 1st on the left (top) side, the 2nd on the right (bottom) side, the 3rd on the axis. A 4th is a data error, because the axis has only two sides plus the centre;
- **the classification is free**: the data layer presets no category enum;
- **why groups sit at diagram level** (rather than writing the group name): the order is controllable, the name is written once and cannot be misspelt, the column heading comes straight from it, an empty group can still be represented, and it can be validated (`groupId` must exist in `groups`);
- symmetric with the `actors` mechanism (a diagram-level list plus references).

| Field | Required | Type | Notes |
|---|---|---|---|
| `id` | yes | string | parties (2 or more) or events (one party) reference it via groupId |
| `label` | yes | string | column heading, e.g. "lender's side" (parties) or "performance as agreed" (one party's acts) |

### Actor rules for a single-party timeline (settled 2026-09)

- **one party in `actors`**; the groups split its acts (see "Group mechanism");
- other people appear in the `label` / `detail` text and are **not referenceable entities**;
- `actorIds` marks whether the event is an act of that party (yes -> reference it; no -> omit it).

### Actor mechanism (settled 2026-09)

**Purpose:** to support **two-party and multi-party timelines**: **parties decide how events are split into lanes on either side of the axis** (or into more lanes).

- **`actors` is an ordered diagram-level list**: order is the lane order (the 1st on the left, the 2nd on the right, the 3rd onwards in turn);
- **an event references parties with `actorIds`** (names are not repeated);
- **rendering rule** (computed by the presentation layer; **the data contains no "left/right/centre"**):

  | `actorIds` | Where it is drawn |
  |---|---|
  | 1 | that party's lane |
  | 2 or more | **the centre** (on the axis) |
  | empty / omitted | the centre |

- **whether an event is an interaction is implied by the number in `actorIds`**: no `type: "interaction"` field is needed;
- **suggested granularity:** list only the **main parties that need their own lane** (4 or fewer is suggested); secondary participants (property staff, paramedics and so on) go into `label`/`detail` and not into the list, so that lanes do not multiply;
- **the same party must be named consistently** (the agent's responsibility);
- **directed acts (who did what to whom) are not expressed for now**: `actorIds` is an unordered set, and direction such as "Sun Hao dissuaded Qian Min" is written in `label`/`detail`. If arrows are needed later, an optional `from`/`to` can be added; it is not designed in advance;
- **no identity system beyond referencing the actor table's ids**: a fact diagram is a timeline narrative, and `actors` is only a layout basis and a display label;
- **with 2 or more parties, each party writes `groupId`** (the 1st or the 2nd group): the side it is on. A third party on neither side is not listed as a party.

| Field | Required | Type | Notes |
|---|---|---|---|
| `id` | yes | string | unique within the diagram; events reference it via actorIds |
| `name` | yes | string | display name, e.g. "Huayuan Trading" |
| `role` | no | string | procedural standing, e.g. "plaintiff" |
| `groupId` | with 2 or more parties | string | the party's side: the 1st or the 2nd group. Not written in a diagram of one party |

### Order mechanism (settled 2026-09, closing issue 1)

- **The carrier of order is array position**: the order of the `events` array is the order of the events. The basis is the JSON standard (RFC 8259): an array is an ordered collection, and parsing, serialising and transport all preserve the order.
- **`date` is decoupled from order**: `date` is the **objective time** and is **not changed when the order is adjusted**; it is used for display, grouping and consistency checking, and **does not decide the order**.
- **no `order` / `after` field is introduced**:
  - `order` is redundant (the array is already ordered), and drag editing would force a block of values to be renumbered;
  - `after` needs topological sorting plus cycle detection, whereas a fact diagram is a **linear narrative** and needs no graph structure;
  - and both of them add to the agent's burden (an LLM is most error-prone on reference correctness).
- **Drag editing** (a future feature): dragging means reordering the array and **does not change `date`**; to change the time, `date` has to be edited explicitly.
- **Consistency checking** (the validation layer's job): when the array order **clearly contradicts** the time order parsed from `date`, raise a warning and ask the agent to check; **never reorder automatically** (with insufficient precision the machine may get it wrong).

### date / dateEnd format: ISO 8601 with truncated precision (settled 2026-09)

```jsonc
"date": "2030-06-02T20:14:03"   // to the second
"date": "2030-06-02T20:14"      // to the minute
"date": "2030-06-02"            // to the day
"date": "2017-05"               // to the month (a document states only year and month)
"date": "2017"                  // to the year
```

- why it was chosen: it is an international standard, unambiguous to a machine, **at equal precision string order is time order**, and a single field covers every precision;
- simpler than a `date` + `time` pair, and closer to "the schema reads like business language" than a structured `{ year, month, day }`;
- the agent converts a Chinese date ("二〇一七年五月二日") into ISO; the validation layer checks the format;
- when precision is lacking, truncate to the precision known and **never pad with zeros to fake it** (if only year and month are known, stop at the month);
- **the authoritative order is the array order** (the agent judges the sequence from the case and lays it out); `date` is for display and grouping, and **the engine never reorders on its own**;
  - why (driven by a worked case): with mixed precision string order does not hold (`"2030-06-02"` sorts before `"2030-06-02T20:14:03"`); and an event with insufficient precision cannot be placed mechanically. In the corridor-charging case "Qian Min dies" has day precision only, but it in fact happened after the 20:27 rescue, so a machine reading "day precision = 00:00 that day" would put it first. Only the case makes the right order visible;
- driven by a worked case: the core facts of the corridor-charging case fall between 20:14 and 20:27, and "in contact for under 5 minutes" is a key fact that day precision cannot express. See `examples/fact/neighbour-corridor-charging.en.json`.

### On sources (option B: carried inside the diagram)

- every diagram JSON carries its own `sources` array, containing only the sources **this diagram references** (self-contained, renderable on its own, easy to share);
- events reference the in-diagram sources with `sourceIds`;
- the validation layer checks that every id in `sourceIds` exists in this diagram's `sources` (a dangling reference is an error);
- the future path (option C, a global table) is not designed in advance; see `spec/source-schema-draft.md` §0.

| Field | Required | Type | Notes |
|---|---|---|---|
| `id` | yes | string | events reference it via sourceIds |
| `type` | yes | string | contract / evidence / judgment / transcript, etc. |
| `name` | yes | string | material name, e.g. "corridor surveillance video" |
| `loc` | no | object | location, e.g. { file, page } or { file, timestamp } |
| `quote` | no | string | verbatim excerpt (several passages joined with ……), shown when the card is opened; a shortened or reworded version goes in `detail` |

## 4. Presentation (the renderer's job)

**The data layer does not care about direction, and it has no "what shape am I" field.** The shape is decided at render time by two things:

1. **the parties and the groups**: with 2 or more parties, who is on which side; with one, how its acts are split;
2. **the direction** (`orientation`): which decides whether time runs downwards (vertical) or to the right (horizontal).

The four common shapes are just different values of those two, and **there is no `layout` field** (the early draft's `layout: "single-actor" | "dual-actor" | "multi-actor"` is abandoned):

| Shape | How it arises |
|---|---|
| single-party timeline | one party; `groups` split its acts by meaning |
| two-party timeline | two parties, one in each side group |
| multi-party timeline | several parties in each side group (the two sides may be asymmetric) |
| no split | one party (or none) and no `groups`: every event lands on the axis |

Other conventions:

- **a multi-party event** (`actorIds` of 2 or more) always lands on the axis;
- **a span event** (one with `dateEnd`) is **expressed in text only** (the card shows start and end, the overlay gives the duration). **No span bar is drawn**: slots are evenly spaced while real time is not (in the corridor case 4 seconds and 264 seconds take the same distance on the diagram), so drawing length by real duration would mislead;
- **the same data can be drawn in several ways** (sub-types), switched in the interface; see `spec/fact/rendering.md` §9;
- the placement rules themselves are in `spec/fact/timeline-rules.md`, and the elements on screen in `spec/fact/rendering.md`.

## 5. Open points (for the sponsor to rule on)

1. **`dateEnd`**: settled, kept (spans are common in litigation and the examples verify it).
2. **Approximate / calibrated time**: settled, `approx` + `dateNote` (see §3).
3. **Actor mechanism**: settled: an ordered diagram-level `actors` list, events referencing it with `actorIds`, and 2 or more parties putting the event on the axis (see §3).
4. **Views**: removed in generation 2 (2026-10): one diagram, one placement (see "Views" in §3).

> All the main design decisions for the fact schema are settled, and it can be treated as **final v1** (subject to further testing against real cases).

## 6. Settled problems (record of validation against real cases)

| Problem | Conclusion | Basis |
|---|---|---|
| `date` precision insufficient (to the day only) | switched to ISO 8601 with truncated precision (second / minute / day / month / year) | the core facts of the corridor-charging case fall between 20:14 and 20:27 |
| mixed-precision sorting fails | the authoritative order is array position; `date` does not decide the order | both string order and insufficient precision get it wrong |
| `evidenceNo` / `party` required | changed to **optional** | a judgment does not state the evidence number or the party adducing it |
| no place for approximate / calibrated time | added the optional `approx` (machine-readable) and `dateNote` (human-readable) | in the corridor-charging case the surveillance clock ran some ten minutes fast and the court used "about 9:33" |
