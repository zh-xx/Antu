# Fields of the fact diagram

```
Fields of a fact spec. "yes" means required.

[envelope]
  type         yes string          always "fact"
  specVersion  no  integer         which generation of this format the file follows (now 1); omit = the current one. Write it: it is how an older file is recognised after a breaking change
  title        yes string          diagram title, shown at the top left

[actors]
  id           yes string          unique within the diagram; events reference it via actorIds
  name         yes string          display name, e.g. "Huayuan Trading"
  role         no  string          procedural standing, e.g. "plaintiff"

[groups]
  id           yes string          events reference it via groupId
  label        yes string          column heading, e.g. "performance as agreed"
  · at most 3: the 1st on the left (top) side, the 2nd on the right (bottom) side, the 3rd on the axis

[sources]
  id           yes string          events reference it via sourceIds
  type         yes string          contract / evidence / judgment / transcript, etc.
  name         yes string          material name, e.g. "elevator lobby surveillance video"
  loc          no  object          location, e.g. { file, page } or { file, timestamp }
  quote        no  string          verbatim excerpt, shown when the card is opened

[slots]
  events       yes array           events at this time point; must not be empty
  · array order is chronological order; date is display-only and never reorders

[events]
  id           yes string          unique within the diagram
  date         no  string          ISO 8601. Go to seconds when known, otherwise stop at the day. **Leave it out when the material gives no date: never make one up.** The card then says the date is unknown; the order is the order of slots, so nothing moves
  label        yes string          card title; about 20 characters per line, at most two lines
  dateEnd      no  string          for a span, the end instant; needs date, and must not be earlier than it
  approx       no  boolean         time is not exact (estimated or inferred); the diagram shows "approx."
  dateNote     no  string          why the time is not exact, and how it was derived
  summary      no  string          the line under the card title; about 22 characters
  detail       no  string          full text revealed when the card is opened
  actorIds     no  string[]        parties involved. Two or more puts this event on the centre axis
  groupId      no  string          which side this event falls on
  sourceIds    no  string[]        which materials it rests on

[views]
  label        yes string          view name, shown in the dropdown
  splitBy      yes "actor" | "group" split the sides by party or by group
  side1 / side2 no  object          { label, actors: [...] }. Required when splitBy=actor
  axis         no  object          { label }. Heading of the centre column
  · views may be omitted; the engine then provides a single "all" view

Cross-field rules (dangling references, a span running backwards, one party on
both sides at once, two events in the same lane of one time slot) are not listed
above: call antu_validate after writing. It reports each problem with its field path.
```
