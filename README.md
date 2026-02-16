# schema-generator

Infer a unified schema from JSONL and JSON input and emit TypeScript, Zod, or JSON Schema.

## Install

```bash
pnpm install
```

## Run

Zero-build source execution (recommended for local use):

```bash
node src/cli.ts --input path/to/data.jsonl --type-name MyRecord --format typescript
```

Read from stdin (auto-detect JSON vs JSONL):

```bash
cat path/to/data.jsonl | node src/cli.ts --type-name MyRecord --format zod --input-format auto
```

Write output to file:

```bash
node src/cli.ts --input path/to/data.jsonl --output schema.ts --format typescript
```

## Build Dist

```bash
pnpm run build
```

Build output is written to `dist/`.

Run compiled CLI:

```bash
node dist/cli.js --input path/to/data.jsonl --type-name MyRecord --format typescript
```

## Input Behavior

- `--input` is repeatable.
- Glob patterns are supported.
- If `--input` is omitted, input is read from stdin.
- `--input-format auto` detects per file/content.
- JSON top-level array: merges each item as a record.
- JSON top-level object or scalar: treated as a single record.

Mixed input example:

```bash
node src/cli.ts \
  --input data/events.ndjson \
  --input data/archive.json \
  --input-format auto \
  --type-name EventRecord \
  --format json-schema
```

## Output Formats

- `typescript` (alias: `ts`)
- `zod`
- `json-schema` (aliases: `jsonschema`, `schema`)

## CLI Flags

### Core

- `-i, --input <path-or-glob>`: Input file path or glob. Repeatable.
- `--input-format <auto|jsonl|json>`: Input format mode. Default `auto`. Alias `ndjson` maps to `jsonl`.
- `-o, --output <path>`: Write schema output to file. Default is stdout.
- `-t, --type-name <name>`: Root type/schema name. Default `Root`.
- `-f, --format <typescript|zod|json-schema>`: Output format. Default `typescript`.
- `-h, --help`: Print usage.

### Emission Style

- `--type-mode <strict|loose>`: Emission strictness. Default `strict`.
- `--all-optional-properties`: Force all object properties optional in emitted output.

Loose mode examples:

- `z.enum(["A", "B"])` -> `z.string()`
- `z.union([z.enum(["A", "B"]), z.null()])` -> `z.string().nullable()`
- `z.array(z.enum(["A", "B"]))` -> `z.array(z.string())`

### Heuristics

- `--required-threshold <0..1>`: Requiredness threshold. Default `1`.
- `--enum-threshold <0..1>`: Max distinct-ratio for enum inference. Default `0.2`.
- `--max-enum-size <int>=2+`: Max enum literal count. Default `20`.
- `--min-enum-count <int>=1+`: Min samples before enum inference. Default `5`.
- `--string-format-threshold <0..1>`: Min confidence for string format inference. Default `0.9`.
- `--min-format-count <int>=1+`: Min samples before string format inference. Default `5`.
- `--record-min-keys <int>=1+`: Min key count for record-like object detection. Default `40`.
- `--record-max-presence <0..1>`: Max per-key presence for record-like object detection. Default `0.35`.
- `--max-union-size <int>=1+`: Max union variants before fallback to unknown. Default `6`.
- `--max-tracked-literals <int>=1+`: Max tracked distinct literals per primitive node. Default `200`.
- `--max-captured-parse-errors <int>=0+`: Max parse-error line numbers retained per input. Default `20`.

### Diagnostics

- `--diagnostics`: Print diagnostics summary to stderr.
- `--diagnostics-output <path>`: Write diagnostics JSON to file.
- `--diagnostics-max-findings <int>=1+`: Max findings per diagnostics category. Default `25`.

Diagnostics example:

```bash
node src/cli.ts \
  --input "path/to/data/**/*.{json,jsonl}" \
  --input-format auto \
  --diagnostics \
  --diagnostics-output diagnostics.json
```

## NPM Scripts

- `pnpm run dev -- --help`: Run CLI from `src/`.
- `pnpm run start -- --help`: Run CLI from `dist/`.
- `pnpm run typecheck`: Typecheck source and scripts.
- `pnpm test`: Run Vitest tests.
- `pnpm run test:watch`: Run tests in watch mode.
- `pnpm run test:update`: Update golden snapshots.
- `pnpm run test:coverage`: Run tests with coverage.
- `pnpm run test:type`: Run `*.test-d.ts` type tests.
- `pnpm run smoke`: Run smoke scenarios against source CLI.
- `pnpm run smoke:dist`: Sanity-check compiled CLI in `dist/`.
- `pnpm run check`: Run tests + type tests + smoke.
- `pnpm run verify`: Run `typecheck + check + build + smoke:dist`.

## Tests

Tests are written in TypeScript and run with Vitest.

Coverage currently includes:

- Emitter golden snapshots (TypeScript, Zod, JSON Schema)
- AST and heuristic behavior checks
- JSON/JSONL ingestion and auto-detection
- Glob/path resolution and error handling
- CLI integration behavior
- Fuzz-like deterministic mixed-type regressions
