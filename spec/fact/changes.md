# fact: changes to the JSON format

The rules are in [spec/versioning.md](../versioning.md) ("Managing a type"). Newest first. Each entry gives the generation, the field, what changed (added, deprecated, changed in meaning, removed) and, if a file has to change, how.

## Generation 2

Placement rules v1 ([timeline-rules.md](timeline-rules.md)). A file of generation 1 has to change:

- **`views`: removed.** A diagram has one placement. Delete the field.
- **`actors[].groupId`: added, and required when the diagram has 2 or more parties.** It names the party's side: the 1st or the 2nd group (never the 3rd, which is the axis). Take it from the view that split by party: the parties in `side1.actors` get the 1st group, those in `side2.actors` the 2nd; give the groups the labels of the two sides (and the 3rd the label of `axis`).
- **`events[].groupId`: only when the diagram has 0 or 1 party.** With 2 or more, delete it from every event: an event is placed by its `actorIds` (one party: that party's side; several or none: the axis).
- **`groups`: changed in meaning with 2 or more parties.** They split the parties (the two sides), not the events by kind. With one party they still split the events by kind, as before.

## Generation 1

The generation of the first release that has a changelog (0.2.0). It has not been raised since: no field has been removed or changed in meaning. What each later release added is in [CHANGELOG.md](../../CHANGELOG.md).
