# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-16

### Added

- Initial release of schema-generator.
- CLI with support for JSON/JSONL input and TypeScript/Zod/JSON-Schema output.
- Programmatic API with `generateFromValues`, `generateFromText`, `generateFromFiles`.
- Type inference heuristics for enums, string formats (date, email, uuid, uri), and record-like objects.
- Github Actions CI workflow for verification.
