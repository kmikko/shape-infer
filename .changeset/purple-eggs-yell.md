---
"shape-infer": patch
---

Prevent deprecated and legacy Zod APIs from appearing in generated Zod output.

- Emit `z.int()` for integer-only inference instead of legacy `z.number().int()`.
- Add a test-only Zod output policy that auto-detects callable `@deprecated` APIs from installed Zod typings and blocks explicit legacy patterns.
- Enforce the policy across snapshot, golden, fuzz, and property-based test paths; refresh affected snapshots.
- Run `pnpm run test` in the Changesets publish workflow before version/publish.
