// What can be told about a run without judging it: the checks that are not a matter of opinion. The judgement of
// the picture, of faithfulness and of what the model told the user is made by reading the run (spec/trial.md).

const walk = (v, f, key = '') => {
  if (Array.isArray(v)) v.forEach((x) => walk(x, f, key))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, f, k)
  else f(key, v)
}

/** A date of the diagram that the material does not have, in either way of writing it */
export function datesNotInMaterial(spec, material) {
  const missing = []
  walk(spec, (key, v) => {
    if ((key !== 'date' && key !== 'dateEnd') || typeof v !== 'string') return
    const m = v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/)
    if (!m) return
    const [, y, mo, d] = m
    const ways = d ? [`${y}年${+mo}月${+d}日`, `${y}-${mo}-${d}`, `${y}年${mo}月${d}日`] : [`${y}年${+mo}月`, `${y}-${mo}`]
    if (!ways.some((w) => material.includes(w))) missing.push(v)
  })
  return missing
}

/** Article numbers and case numbers written in the diagram that the material does not have */
export function numbersNotInMaterial(spec, material) {
  const text = JSON.stringify(spec)
  const found = [...(text.match(/第[一二三四五六七八九十百零〇\d]+条/g) ?? []), ...(text.match(/（\d{4}）[^\s，。、"\\]{2,14}号/g) ?? [])]
  return [...new Set(found.filter((n) => !material.includes(n)))]
}

const namesOf = (spec) => {
  const out = []
  walk(spec, (k, v) => { if (k === 'name' && typeof v === 'string' && v.length >= 2) out.push(v) })
  return [...new Set(out)]
}

/** How much of the reference the diagram has: the names, and the length of each list both have */
export function coverage(spec, reference) {
  const text = JSON.stringify(spec)
  const names = namesOf(reference)
  const have = names.filter((n) => text.includes(n))
  const lists = {}
  for (const [k, v] of Object.entries(reference)) if (Array.isArray(v) && Array.isArray(spec[k])) lists[k] = { diagram: spec[k].length, reference: v.length }
  return { names: { have: have.length, of: names.length, missing: names.filter((n) => !have.includes(n)) }, lists }
}

export function scoreRun({ spec, material, reference, validateExit, turns, usage, stopped }) {
  const r = { turns, tokens: usage, stopped, valid: validateExit === 0 }
  if (spec) {
    r.type = spec.type ?? null
    r.datesNotInMaterial = datesNotInMaterial(spec, material)
    r.numbersNotInMaterial = numbersNotInMaterial(spec, material)
    r.coverage = coverage(spec, reference)
  }
  return r
}
