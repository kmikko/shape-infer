# Changelog

## 0.3.0

### Minor Changes

- [#5](https://github.com/kmikko/shape-infer/pull/5) [`2e82309`](https://github.com/kmikko/shape-infer/commit/2e823097a110dfe46c4cc1407b1bbc63ae6537b2) Thanks [@kmikko](https://github.com/kmikko)! - In `--mode loose`, objects whose keys all share a common separator (`-`, `_`, `/`, `.`) and split into a consistent number of segments are now collapsed to a record type instead of emitting every key as a named literal property. This detects dynamic-key objects like restaurant or calendar APIs that return structured keys such as `"2026-10-monday"` when only a single API response is available — cases where the existing record heuristic (which requires ≥ 40 sparse keys across multiple samples) does not fire.

  Emitter output for matching objects:
  - TypeScript: `Record<string, V>`
  - Zod: `z.record(z.string(), V)`
  - JSON Schema: `{ "type": "object", "additionalProperties": V }`

  Strict mode is unaffected.

## 0.2.0

### Minor Changes

- [#4](https://github.com/kmikko/shape-infer/pull/4) [`555aee0`](https://github.com/kmikko/shape-infer/commit/555aee030d3e5f74a1cf3a0b49ff876aa54a4a17) Thanks [@kmikko](https://github.com/kmikko)! - The Zod emitter now uses the `--type-name` value verbatim for the exported const instead of appending a `Schema` suffix. `-t Foo -f zod` now emits `export const Foo = ...` instead of `export const FooSchema = ...`.

### Patch Changes

- [#2](https://github.com/kmikko/shape-infer/pull/2) [`d75c66e`](https://github.com/kmikko/shape-infer/commit/d75c66ed85e088f628d4789bb6bf9ad50c39f8f3) Thanks [@kmikko](https://github.com/kmikko)! - Internal: bump pnpm to 10.30.3

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0

### Added

- CLI with support for JSON/JSONL input and TypeScript/Zod/JSON-Schema output.
- Programmatic API with `generateFromText` and `generateFromFiles`.
- Type inference heuristics for enums, string formats (date-time, date, email, uuid, uri), and record-like objects.
- Github Actions CI workflow for verification.

### Changed

- Simplified CLI surface to core options only:
  - kept: `--input-format`, `--output`, `--type-name`, `--format`, `--mode`, `--all-optional`, `--version`, `--help`
  - removed: heuristic tuning flags, diagnostics flags, and legacy aliases (`--type-mode`, `--optional-fields`, `--all-optional-properties`)
- Simplified programmatic API by removing advanced tuning and diagnostics options from `generateFromText`/`generateFromFiles`.
- Removed union-size truncation fallback; emitters now preserve inferred unions in both `strict` and `loose` modes.
