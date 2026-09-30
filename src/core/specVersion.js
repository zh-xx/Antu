// ============================================================
//  src/core/specVersion.js — which generation of a diagram type's JSON format a file follows
//
//  Every example and spec draft already carries `"specVersion": 1` in its envelope. This file gives it a
//  meaning (spec/versioning.md):
//
//    · it is a whole number, kept per diagram type (`specVersion` of the type's knowledge);
//    · it goes up only when that type's JSON contract changes in a way that breaks a file written for the
//      old one (a field renamed or removed, a meaning changed, a rule made stricter). Adding an optional
//      field does not raise it: an old file is still right;
//    · a file with no `specVersion` is read as the current one.
//
//  So a file that says `specVersion: 1` when the engine knows 2 is not "wrong": it is old, and once
//  there is a 2 the engine can point at the CHANGELOG entry that says how to bring it over. A file newer
//  than the engine is an error: the engine cannot know what its fields mean. Plain JS (Node and browser).
// ============================================================

/** The row of a type's field table for `specVersion`, so every type describes it the same way */
export const specVersionFieldRow = (version) => ({
  name: 'specVersion',
  req: 'no',
  ty: 'integer',
  note: `which generation of this format the file follows (now ${version}); omit = the current one. Write it: it is how an older file is recognised after a breaking change`,
})

/**
 * Check the envelope's `specVersion` against the generation the engine knows for the type.
 * @returns {{ key: string, params: object } | null}  the message to report (an `err.specVersion*` key), or null when fine
 */
export function checkSpecVersion(spec, known) {
  if (spec.specVersion === undefined) return null
  if (!Number.isInteger(spec.specVersion) || spec.specVersion < 1) {
    return { key: 'err.specVersionForm', params: { value: JSON.stringify(spec.specVersion) } }
  }
  if (Number.isInteger(known) && spec.specVersion > known) {
    return { key: 'err.specVersionNewer', params: { value: spec.specVersion, known, type: spec.type } }
  }
  return null
}
