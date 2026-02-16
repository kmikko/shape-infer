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
