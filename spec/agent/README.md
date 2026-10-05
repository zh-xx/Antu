# Specification for agents

**Everything in this directory is for agents only.** The `spec/*.md` files one level up
are for designers. The two are kept apart.

```
spec/agent/<type>/guide.md     mechanism notes for that type (short, sufficient, actionable)
spec/*.md                      designer documents (why it was decided this way; long)
```

There are four types so far: fact, procedure, relationship and justification:

```
spec/agent/
├── README.md
├── fact/
│   └── guide.md
├── procedure/
│   └── guide.md
├── relationship/
│   └── guide.md
└── justification/
    └── guide.md
```

When a new type is added, create a directory under `spec/agent/` and put a `<type>/guide.md`
in it. The MCP side then exposes `antu://agent/<type>/guide` by itself, with no code
change.

**This directory is English-only.** These files go into a model's context, the same as
the field table and the validation errors, so they are not translated and have no
Chinese counterpart. See the header of `src/core/i18n.js`.

## The field table is not here

The field table is not written to a file, because **it has to share one source with the
validator**: it is generated from `FACT_FIELDS` in `src/renderers/fact/schema.js`,
registered into the knowledge table in `core/registry.js`, and served per type by the
MCP tool `antu_schema`. Written to a file it would exist twice and drift.

## Examples are not here either

Examples for agents live under `examples/agent/<type>/`. They are also split by type;
adding a type means adding a directory.

## The rule

**Before adding anything to this directory, ask: does an agent need this to write JSON,
or is this something a human wants to know?**

Only the former belongs here. Design rationale, history, pitfalls and the to-fix list
all go one level up.

## Write `specVersion`

Put `"specVersion": 1` in the envelope of every diagram you write (the field table shows the number the engine
knows for that type). Without it the file is read as the current generation, which is fine today; with it, a file
written now can still be recognised as older after a later format change. A number higher than the engine
knows is an error. The rules are in `spec/versioning.md`.

## The look of the page is not for the agent to decide

Nothing in the JSON chooses a theme (`document`, `modern`, `legal`; see `../theme.md`): the same file is shown to
different readers. Leave `theme` out of `antu_render` / `antu_preview` and `--theme` out of the command line unless
the user asked for a look; then the reader chooses in the page, and the default is black and white. A preview taken
with a theme shows only that theme.
