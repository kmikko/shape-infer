# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
