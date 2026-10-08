# Versions of the types and the diagrams

Written by `node tools/gen/versions.mjs` from the registry (`diagrams` in `src/renderers/<type>/schema.js`); a test fails when it is out of date. Do not edit it by hand. The rules are in [versioning.md](versioning.md). The same list is told by `antu versions` (command line) and `antu_versions` (MCP).

| Type | Format generation | Diagram | Version | Status | Since | Opens in |
| --- | --- | --- | --- | --- | --- | --- |
| `fact` | 2 | `fact/timeline` | 4 | experimental | 0.2.0 | yes (default) |
|  |  | `fact/chronicle` | 2 | experimental | 0.7.0 |  |
|  |  | `fact/scale` | 3 | experimental | 0.7.0 |  |
| `procedure` | 1 | `procedure/flow` | 1 | experimental | 0.2.0 | yes (default) |
|  |  | `procedure/route` | 1 | experimental | 0.7.0 |  |
| `relationship` | 1 | `relationship/graph` | 1 | experimental | 0.2.0 | yes (default) |
|  |  | `relationship/focus` | 1 | experimental | 0.7.0 |  |
|  |  | `relationship/chain` | 1 | experimental | 0.7.0 |  |
|  |  | `relationship/matrix` | 1 | experimental | 0.7.0 |  |
|  |  | `relationship/equity` | 1 | experimental | 0.7.0 |  |
|  |  | `relationship/authority` | 1 | experimental | 0.7.0 |  |
|  |  | `relationship/related` | 1 | experimental | 0.7.0 |  |
|  |  | `relationship/path` | 1 | experimental | 0.7.0 |  |
|  |  | `relationship/summary` | 1 | experimental | 0.7.0 |  |
| `justification` | 1 | `justification/tree` | 2 | experimental | 0.2.0 | yes (default) |
