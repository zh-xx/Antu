# source (origin / provenance) · Schema draft v0

> Status: **draft v0.3; all seven types are refined and final**.
> Position: the global provenance mechanism (section 4 of the main document). **The diagram carries its own copy of the sources** (every diagram carries the sources it references), and expressive elements reference the sources inside the diagram through `sourceIds`.
> Core value: **every expression must carry its provenance**. Every point on the diagram can point to the original material behind "what makes you say that". This is Antu's core advantage, and every kind of diagram must be able to do it.
> Principles: reference rather than copy (the table inside the diagram is stored once and many-to-many goes through ids); controlled enums plus optional dedicated fields; **a stable foundation first (structured location), then functional extension**.

## 0. Decisions taken (settled by the founder, 2025-09)

1. **Location fields take route B** (type-specific structured fields: validatable, jumpable and traceable back to the original material). A stable foundation makes later development possible;
2. **every `type` is designed carefully**, refined one by one, without rushing the work;
3. **where `sources` live = option B: each diagram carries its own copy of the sources.** Every diagram carries the source table it references, so one diagram is self-contained, renders on its own and is easy to share; if a case later has many diagrams sharing many sources that need to be maintained in one place by hand, it may be upgraded to a case-level global table (option C, recorded as a future path).

→ The benefit of option B: one diagram file works on its own; the engine never has to look across files; the agent copies the sources as it generates, so the machine bears the cost of the redundancy.

## 1. The three questions a source must answer

Before designing any field, settle the three things the source entity must support:

1. **What is it** (the name and type shown to the user): `name`, `type`
2. **Where exactly is it** (provenance location: page / article number / case number): structured, in `loc` (see §3)
3. **What does the original look like** (an optional excerpt, visible on opening): `quote`

> Note: an early draft had `fileRef`/`url` at the common layer pointing at the original material. **Abandoned.** Pointing at the original material is the job of location and belongs entirely to each type's `loc` (in-case-file types → `loc.file`, web → `loc.url`, statute/case use standard addressing), so as not to duplicate what `loc` does.

## 2. Draft of the common fields

```jsonc
{
  "id": "s-1",              // ✅ required, unique within the diagram
  "type": "contract",       // ✅ required, controlled enum (see §4)
  "name": "Loan contract",  // ✅ required, display name
  "title": "No. XY-2023-001", // ❌ optional: the material's own number or title (as distinct from name: name = plain words, title = the original title)
  "loc": { … },             // location fields (type-specific, see §3/§4). "Pointing at the original material" happens here
  "quote": "…excerpt from the original…"      // ❌ optional: a short passage of the original, visible on opening, without digging through the material
}
```

## 3. Location fields: route B decided (type-specific structured location fields)

✅ Settled by the founder: **structured location, a stable foundation first**.

Principle: every source.type gets a set of **standard location fields** (validatable, jumpable and traceable back to the original material). The location fields are **refined one type at a time** (see the checklist in §4); here are examples showing the direction:

```jsonc
// statute → the specific provision (the article number is a number, see the decisions in §4.2)
{ "type": "statute",
  "loc": { "lawName": "中华人民共和国民法典", "article": 585, "version": "2020修正" } }

// case → the specific judgment
{ "type": "case",
  "loc": { "caseNo": "（2024）京01民终1234号", "court": "北京市第一中级人民法院" } }

// document / contract / evidence → a position inside the file
{ "type": "document",
  "loc": { "file": "loan-contract.pdf", "page": 3 } }
```

> One agreed convention: location fields always live inside the `loc` object; the concrete fields of `loc` are refined per type, see §4.

## 4. The `type` enum and the field tables (seven types settled; the fields are the v0 draft)

**The founder's decision: every type is designed carefully.** Below are the field tables for the seven types; each may still be refined further.

### 4.0 Common fields (shared by every type)

| Field | Required | Notes |
|---|---|---|
| `id` | ✅ | unique within the diagram; `sourceIds` references it |
| `type` | ✅ | one of the seven types below (controlled enum) |
| `name` | ✅ | plain-word name (what the diagram shows, e.g. "Loan contract") |
| `title` | ❌ | the material's own number or original title (as distinct from name) |
| `quote` | ❌ | a short excerpt from the original (visible on opening) |

> The common layer has **no** "points at the original material" field. That is the job of `loc` (in-case-file types → loc.file, web → loc.url).

### 4.1 The location fields of each type (`loc`, type-specific)

| type | What it is | Required `loc` fields | Optional `loc` fields | Location logic |
|---|---|---|---|---|
| `statute` | statute or regulation | `lawName`, `article` (a number), `version` | none | law + article + version → the specific provision (refined, see §4.2) |
| `case` | precedent or judgment | `caseNo` (the standard whole string), `court` | meta: `level`, `docType` | case number + court → a unique decision (refined, see §4.3) |
| `contract` | contract or agreement | `file` (the original file), `clause` (a number) | `page` | the clause or page inside the file (refined, see §4.4) |
| `evidence` | evidence in litigation | loc: `file` (the original file) | loc: `page`; meta: `evidenceNo` (the name in the evidence index), `party` (the party who adduced it), both optional | file plus (optionally) the evidence number or the adducing party (refined, see §4.5) |
| `document` | other documents in the case file | `file` (the original file) | `page` | the general in-case-file location (refined, see §4.6) |
| `web` | an online reference from outside the case | loc: `url`, `accessedAt` | loc: `platform`, `query` | a URL plus a fixed point in time (refined, see §4.7) |
| `other` | the fallback | none | `note`, free text | used when nothing else fits (refined, see §4.8) |

> Design points:
> - the `loc` of `statute`/`case` has **no file**: statutes and decisions use standard-database addressing (law name + article number / case number + court) and need no "file + page";
> - `contract`/`evidence`/`document` are materials in the case file, so they must be located as "file + page";
> - `web` is special in `accessedAt`: a web page changes, so the point in time must be fixed (fixing the evidence); the `snapshot` field is optional;
> - `type` looks at the role the source plays in the present case, not at how it was obtained: an online public record submitted as evidence → `evidence`; merely cited from outside the case → `web`.

### 4.2 Refined and final: statute, the first type refined

Settled by the founder (2025-09):

| Decision point | Outcome |
|---|---|
| Location granularity | down to the **article** only (no sub-division into paragraph or item) |
| Article number format | a **number** (e.g. `585`), not the Chinese characters "第五百八十五条" |
| Version | `version` **is required** (e.g. `"2020修正"`): statutes are amended, and a wrong version voids the citation |
| name and loc | **route B**: `name` is a free business label (e.g. "Basis for the liquidated-damages clause"); `loc` does the precise addressing |
| Provision text | **option C**: `quote` holds an **excerpt**, is **length-limited** and is **not mandatory** (optional) |

```jsonc
{ "id": "s-2", "type": "statute",
  "name": "Basis for the liquidated-damages clause",   // a business label, free text
  "loc": { "lawName": "中华人民共和国民法典",       // the authoritative full name
           "article": 585,                       // a numeric article number
           "version": "2020修正" },              // version / currency
  "quote": "The parties may agree that, if one party breaches the contract, it shall pay the other party a certain amount of liquidated damages in light of the breach…"  // an excerpt, length-limited, optional
}
```

**The general rule for `quote` (it applies to every type; statute established it first)**: an excerpt rather than the full text, length-limited (a suggested maximum of 200 characters, adjustable) and not mandatory.

> Note: whether `lawName` uses the authoritative full name ("中华人民共和国民法典") or the short form ("民法典") is left to the validation layer to discuss; the schema does not enforce either for now.

### 4.3 Refined and final: case (a precedent or judgment)

Settled by the founder (2025-09):

| Decision point | Outcome |
|---|---|
| Case number | **stored as the standard whole string** (e.g. `（2024）京01民终1234号`), not split into fields |
| Court | `court` is **required** |
| Instance / document type | **must be recorded**, in `meta` (instance: first instance / second instance / retrial…; document type: the controlled enum judgment / order / mediation / decision / notice) |
| Channel field | **dropped**: the channel a judgment came from is not recorded |
| Full-text availability | not guaranteed (only a limited range of judgments is published online) → the `quote` excerpt is **especially important for `case`**; the general rule applies |

```jsonc
{ "id": "s-4", "type": "case",
  "name": "Appeal in a lending dispute",                     // a business label, free text
  "loc": { "caseNo": "（2024）京01民终1234号",   // the standard case number, whole string
           "court": "北京市第一中级人民法院" },   // required
  "meta": { "level": "second instance", "docType": "judgment" },  // instance + document type (controlled enum)
  "quote": "…excerpt from the holding…"                      // optional, ≤200 characters
}
```

### 4.4 Refined and final: contract (a contract or agreement)

Settled by the founder (2025-09):

| Decision point | Outcome |
|---|---|
| Location granularity | `clause` is a **number** (e.g. `3`), with no sub-division into paragraph or item |
| file | points at the **original file** (the signed contract or a scan), not a retyped version |
| The two contract parties | **not stored**: who is party A and who is party B belongs to the relationship diagram, and source does not duplicate it |
| Dispute markers | **dropped** |

```jsonc
{ "id": "s-1", "type": "contract",
  "name": "Loan contract",                              // a business label
  "loc": { "file": "loan-contract.pdf",                 // the original file
           "clause": 3,                            // a numeric clause number
           "page": 2 },                            // optional: page
  "quote": "…excerpt from the clause…"                            // optional, ≤200 characters
}
```

### 4.5 Refined and final: evidence (evidence in litigation)

Settled by the founder (2025-09):

| Decision point | Outcome |
|---|---|
| Evidence number | the name used in the practitioner's index, e.g. "证据1" / "证据3" (kept as written, not turned into a number); **optional** |
| Purpose of proof | **not stored**: the fact event's `sourceIds` make that connection (argumentation belongs to the diagram content and is not frozen into the source; one piece of evidence often proves several facts, so the many-to-many sits on the event side) |
| Adducing party | `party` (plaintiff / defendant / third party); **optional** |
| Evidence category | **dropped**: no enumerating the eight categories of the Civil Procedure Law |

> **Revision 2026-09 (verified against real cases)**: `evidenceNo` and `party` changed from **required to optional**.
> Reason: when extracting from a judgment they are often unavailable. A judgment usually says "according to the video" or "together with the medical certificate" and **does not state the evidence number or the party who adduced it** (see `examples/fact/elevator-smoking-case.zh-CN.json`, where for all four evidence items these two fields could only be filled in as "not stated in the judgment"). Filling them in requires extra material (the evidence index).

```jsonc
{ "id": "s-5", "type": "evidence",
  "name": "Bank transfer statement",                          // a business label
  "loc": { "file": "bank-statement.pdf",                     // the original file
           "page": 1 },                            // optional
  "meta": { "evidenceNo": "证据3",                 // optional: the name in the practitioner's index
            "party": "Plaintiff" },                     // optional: the party who adduced it
  "quote": "…excerpt from the statement…"                            // optional
}
```

> The boundary between evidence and document: document = "there is a file in the case file"; evidence = "that file was submitted as evidence", which adds the procedural standing of an evidence number and an adducing party.
> The purpose of proof is not stored in evidence: it is argumentation (it changes with litigation strategy), and argumentation belongs to the event side that references the source, not to the source's objective attributes.

### 4.6 Refined and final: document (other documents in the case file)

Settled by the founder (2025-09):

| Decision point | Outcome |
|---|---|
| Paragraph location | **no** `para`: citing a document down to "file + page" is enough |
| Document classification | **no** `docKind`: nothing is classified, everything falls into document (add it when a real need to "filter one kind of document" appears) |

```jsonc
{ "id": "s-6", "type": "document",
  "name": "Civil complaint",                            // a business label
  "loc": { "file": "complaint.pdf",                   // the original file
           "page": 1 },                            // optional
  "quote": "…excerpt…"                                // optional
}
```

> Boundary: document = the other documents in the case file that are neither contracts nor submitted evidence (complaint, statement of defence, lawyer's letter, summons, registration materials…).

### 4.7 Refined and final: web (an online reference from outside the case)

Settled by the founder (2025-09):

| Decision point | Outcome |
|---|---|
| `accessedAt` | **required**: web pages change, and without the access time the reference cannot be checked (fixing the evidence) |
| `platform` / `query` | **optional**: platform shows the site the material came from; query is needed only for dynamic lookups (the category B government or judicial records) |
| `snapshot` | **not in version one**: use the general `quote` excerpt to preserve what the page said at the time, and add snapshots when evidence really goes to court |

```jsonc
{ "id": "s-3", "type": "web",
  "name": "Xincheng Building Materials, business registration record",   // a business label
  "title": "National Enterprise Credit Information Publicity System: enterprise information",  // the page's original title (optional)
  "loc": { "url": "https://www.gsxt.gov.cn/…",       // the URL, required
           "platform": "National Enterprise Credit Information Publicity System",      // optional: the site it came from
           "query": "统一社会信用代码 91110…",        // optional: the search terms
           "accessedAt": "2025-09-07" },             // the access date, required
  "quote": "Registered capital CNY 50,000,000; registration status: in existence"       // preserves what the page said at the time (optional)
}
```

> The essential difference between web and the in-case-file types: a web page is dynamic and uncontrolled, so its fields are designed around "fixing the point in time and preserving the content".
> Boundary: if an online public record is printed and submitted as evidence → `evidence` (`type` looks at the role, not at how it was obtained).

### 4.8 Refined and final: other (the fallback)

Settled by the founder (2025-09):

| Decision point | Outcome |
|---|---|
| Dedicated fields | **no dedicated `loc`**: other is an exception, not a type, and no rules are built for exceptions |
| `note`, free text | **wanted** (optional): an unexplained other leaves the reader baffled |

```jsonc
{ "id": "s-9", "type": "other",
  "name": "Internal ledger (company X)",              // a business label
  "note": "An internal ledger kept by the company, with no formal number",  // optional: why it is filed as other
  "quote": "…excerpt…"                   // optional, common
}
```

> Promotion rule: if one kind of material keeps falling into other, that kind is promoted to a new type (add a value to the enum) rather than adding fields to other.

### 4.9 Closing notes

- all seven source types are refined and final (§4.2–4.8);
- controlled enum: adding a source category means adding an enum value (versioned), not changing the structure;
- if a source ever turns out to be an expression of another diagram (for instance an event referencing a claim), discuss it then; do not design it in advance.

## 5. Where the `sources` table lives: option B decided (each diagram carries its own copy)

✅ Settled by the founder: **option B: every diagram carries the source table it references**.

- every diagram JSON carries a `sources` array containing only the sources **that diagram references** (self-contained, one file that works on its own);
- expressive elements reference the sources **inside the diagram** through `sourceIds`;
- a future path (option C, not designed in advance): if a case has many diagrams sharing many sources that need to be maintained in one place by hand, upgrade to a case-level global table.

## 6. Progress of the refinement

### Refined and final (7/7 complete ✅)
- [x] `statute` (statute or regulation): see §4.2 (the first type refined)
- [x] `case` (precedent or judgment): see §4.3
- [x] `contract` (contract or agreement): see §4.4
- [x] `evidence` (evidence in litigation): see §4.5
- [x] `document` (other documents in the case file): see §4.6
- [x] `web` (an online reference from outside the case): see §4.7
- [x] `other` (the fallback): see §4.8

> 7/7 settled. The general rule for `quote` is fixed (an excerpt, a suggested maximum of 200 characters, not mandatory; see §4.2) and the web `snapshot` is decided (not in version one; see §4.7). Both are in place; nothing is left open.
