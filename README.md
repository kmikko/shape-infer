# schema-generator

Phase 3 implementation: infer a unified schema from JSONL and JSON records with advanced heuristics, diagnostics, and emitters for TypeScript, Zod, and JSON Schema.

## Install

```bash
pnpm install
```

## Build

```bash
pnpm run build
```

## Usage

```bash
node dist/cli.js --input path/to/data.jsonl --type-name MyRecord --format typescript
```

Or stream from stdin (auto-detect JSON vs JSONL):

```bash
cat path/to/data.jsonl | node dist/cli.js --type-name MyRecord --format zod --input-format auto
```

Write output to file:

```bash
node dist/cli.js --input path/to/data.jsonl --output schema.ts --format typescript
```

### Expanded ingestion (JSON + JSONL)

- Repeatable inputs: `--input` can be provided multiple times.
- Glob support: `--input "data/**/*.{json,jsonl,ndjson}"`.
- Input mode: `--input-format auto|jsonl|json` (default `auto`).

Examples:

```bash
node dist/cli.js \
  --input data/events.ndjson \
  --input data/archive.json \
  --input-format auto \
  --type-name EventRecord \
  --format json-schema
```

```bash
node dist/cli.js \
  --input "data/**/*.jsonl" \
  --input "data/**/*.json" \
  --input-format auto \
  --type-name UnifiedRecord \
  --format typescript
```

JSON file behavior:

- Top-level array: each item is merged as a record.
- Top-level object (or scalar): treated as a single record.

Supported formats:

- `typescript` (or `ts`)
- `zod`
- `json-schema` (aliases: `jsonschema`, `schema`)

### Emission style controls

- `--type-mode strict|loose` (default `strict`)
  - `strict`: emits literal unions/enums when inferred.
  - `loose`: emits primitive base types instead of literal unions/enums.
- `--all-optional-properties`
  - Forces every object property to be optional in emitted TypeScript/Zod/JSON Schema output.

Example (`--format zod`):

```bash
node dist/cli.js \
  --input path/to/data.jsonl \
  --type-name Product \
  --format zod \
  --type-mode loose \
  --all-optional-properties
```

Typical loose-mode changes:

- `z.enum(["A", "B"])` becomes `z.string()`
- `z.union([z.enum(["A", "B"]), z.null()])` becomes `z.string().nullable()`
- `z.array(z.enum(["A", "B"]))` becomes `z.array(z.string())`

## Phase 3 Heuristics

You can tune inference behavior from the CLI:

- `--required-threshold` (`0..1`, default `1`)
- `--enum-threshold` (`0..1`, default `0.2`)
- `--max-enum-size` (default `20`)
- `--min-enum-count` (default `5`)
- `--string-format-threshold` (`0..1`, default `0.9`)
- `--min-format-count` (default `5`)
- `--record-min-keys` (default `40`)
- `--record-max-presence` (`0..1`, default `0.35`)
- `--max-union-size` (default `6`)
- `--max-tracked-literals` (default `200`)

Example:

```bash
node dist/cli.js \
  --input path/to/data.jsonl \
  --type-name Event \
  --format zod \
  --required-threshold 0.95 \
  --enum-threshold 0.1 \
  --string-format-threshold 0.95
```

## Diagnostics

Print diagnostics summary:

```bash
node dist/cli.js --input "path/to/data/**/*.{json,jsonl}" --input-format auto --diagnostics
```

Write diagnostics JSON report:

```bash
node dist/cli.js --input path/to/data.jsonl --diagnostics-output diagnostics.json
```

## Smoke test

```bash
pnpm run smoke
```

## Tests

Run the automated test suite:

```bash
pnpm test
```

Run tests in watch mode:

```bash
pnpm run test:watch
```

Update golden snapshots:

```bash
pnpm run test:update
```

Run coverage:

```bash
pnpm run test:coverage
```

Run TypeScript type tests (`*.test-d.ts`):

```bash
pnpm run test:type
```

Tests are written in TypeScript and run with Vitest.

Current test coverage focuses on:

- Golden snapshot outputs for TypeScript, Zod, and JSON Schema emitters
- Focused AST and heuristic behavior checks
- JSON vs JSONL auto-detection (`auto|json|jsonl`)
- JSON top-level array/object ingestion behavior
- Multi-file ingestion merges
- Glob/path resolution and unmatched-pattern errors
- CLI ingestion flow (file glob + stdin auto-detect)
- Fuzz-like deterministic mixed-type regression checks
