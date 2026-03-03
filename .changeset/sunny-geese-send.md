---
"shape-infer": minor
---

The Zod emitter now uses the `--type-name` value verbatim for the exported const instead of appending a `Schema` suffix. `-t Foo -f zod` now emits `export const Foo = ...` instead of `export const FooSchema = ...`.
