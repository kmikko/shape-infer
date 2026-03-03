---
"shape-infer": minor
---

In `--mode loose`, objects whose keys all share a common separator (`-`, `_`, `/`, `.`) and split into a consistent number of segments are now collapsed to a record type instead of emitting every key as a named literal property. This detects dynamic-key objects like restaurant or calendar APIs that return structured keys such as `"2026-10-monday"` when only a single API response is available — cases where the existing record heuristic (which requires ≥ 40 sparse keys across multiple samples) does not fire.

Emitter output for matching objects:

- TypeScript: `Record<string, V>`
- Zod: `z.record(z.string(), V)`
- JSON Schema: `{ "type": "object", "additionalProperties": V }`

Strict mode is unaffected.
