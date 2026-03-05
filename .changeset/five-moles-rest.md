---
"shape-infer": patch
---

Fix Zod format emission and URI over-inference.

- Emit modern Zod v4 top-level format schemas (`z.iso.datetime()`, `z.iso.date()`, `z.email()`, `z.uuid()`, `z.url()`) instead of deprecated chained `z.string().*` helpers.
- Tighten URI inference so format `uri` is inferred only when all observed values are valid URIs, avoiding over-constrained schemas for mixed samples (for example values like `:cookie-policy`).
- Add targeted heuristic and CLI regressions, update emitter expectations and README examples, and refresh affected golden snapshots.
