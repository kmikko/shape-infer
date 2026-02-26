# shape-infer

Infer a unified schema from mixed JSONL/JSON datasets and emit:

- TypeScript type aliases
- Zod schemas (+ inferred type)
- JSON Schema (draft 2020-12)

The tool merges many records into one representative schema and handles missing fields, mixed types, changing values, and sparse/dynamic object keys.

## Requirements

- Node.js `>=22` (project uses direct `.ts` execution in dev scripts)
- pnpm

## Install

```bash
pnpm add shape-infer
```

### Local Development

See [Releasing Docs](docs/releasing.md) for publish instructions.

```bash
pnpm install
```

## Quick Start

Run directly from source (zero-build):

```bash
node src/cli.ts --input data.jsonl --type-name MyRecord --format typescript
```

Read from stdin:

```bash
cat data.jsonl | node src/cli.ts --input-format auto --format zod --type-name MyRecord
```

Write output to file:

```bash
node src/cli.ts --input data.jsonl --format json-schema --output schema.json
```

Build and run compiled CLI:

```bash
pnpm run build
node dist/cli.js --input data.jsonl --format typescript
```

## CLI Usage

```bash
shape-infer --input <path-or-glob> [--input <path-or-glob> ...] [options]
```

The npm `bin` command name is `shape-infer` and points to `dist/cli.js`.

## Input Behavior

- `--input` is repeatable and supports globs.
- Input paths are deduplicated and sorted per pattern expansion.
- If `--input` is omitted, input is read from stdin.
- If no `--input` is given and stdin is a TTY, CLI exits with a missing-input error.
- For file patterns that match no files, CLI exits with an error.
- `--input-format auto` resolves format per source:
  - `.jsonl` / `.ndjson` extension -> JSONL
  - `.json` extension -> JSON
  - other extensions -> content detection
- Content auto-detection:
  - first non-whitespace `[` -> JSON
  - first non-whitespace `{` and whole payload parses -> JSON
  - otherwise -> JSONL
- JSON top-level array: every array item is merged as a record.
- JSON top-level object/scalar: treated as one record.
- JSONL parse failures are skipped per line; valid lines are still merged.

## Output Behavior

- Default format is `typescript`.
- Supported formats:
  - `typescript` (alias: `ts`)
  - `zod`
  - `json-schema` (aliases: `jsonschema`, `schema`)
- If no records are parsed, output falls back to unknown schema/type.
- If union complexity exceeds `--max-union-size`, output falls back to unknown at that node.

## CLI Flags

### Core

- `-i, --input <path-or-glob>`: Input file path or glob. Repeatable.
- `--input-format <auto|jsonl|json>`: Input format mode. Default `auto`. Alias `ndjson` maps to `jsonl`.
- `-o, --output <path>`: Write schema output to file (default stdout).
- `-t, --type-name <name>`: Root type/schema name (default `Root`).
- `-f, --format <typescript|zod|json-schema>`: Output format (default `typescript`).
- `-h, --help`: Print usage.

### Emission Style

- `--type-mode <strict|loose>`: Emission strictness (default `strict`).
- `--all-optional-properties`: Force all object properties optional in emitted schemas.

Loose mode behavior:

- literal enums collapse to base primitives
- nullable unions are normalized in Zod (`x | null` -> `.nullable()`)

### Heuristics

- `--required-threshold <0..1>`: Requiredness threshold (default `1`).
- `--enum-threshold <0..1>`: Max distinct-ratio for enum inference (default `0.2`).
- `--max-enum-size <int>=2+`: Max enum literal count (default `20`).
- `--min-enum-count <int>=1+`: Min sample count for enum inference (default `5`).
- `--string-format-threshold <0..1>`: Min confidence for format inference (default `0.9`).
- `--min-format-count <int>=1+`: Min sample count for format inference (default `5`).
- `--record-min-keys <int>=1+`: Min key count for record-like object detection (default `40`).
- `--record-max-presence <0..1>`: Max key presence for record-like detection (default `0.35`).
- `--max-union-size <int>=1+`: Max union variants before unknown fallback (default `6`).
- `--max-tracked-literals <int>=1+`: Max tracked literals per primitive node (default `200`).
- `--max-captured-parse-errors <int>=0+`: Max parse-error line numbers retained per input (default `20`).

Supported string format inference: `date-time`, `date`, `email`, `uuid`, `uri`.

### Diagnostics

- `--diagnostics`: Print diagnostics report to stderr.
- `--diagnostics-output <path>`: Write diagnostics JSON report to file.
- `--diagnostics-max-findings <int>=1+`: Cap findings per diagnostics category (default `25`).

Diagnostics include:

- type conflicts
- optional field presence
- inferred enums
- inferred string formats
- record-like object paths
- degradation findings:
  - `union_overflow`
  - `literal_overflow`
  - `record_like_collapsed`
  - `threshold_near_miss`

When diagnostics are enabled with loose/optional emission flags, CLI prints explanatory notes about those mode effects.

## Parse Warnings

Warnings are written to stderr:

- JSONL: skipped invalid line count + captured line numbers
- JSON: parse failure summary + captured line number (if available)
- Global warning when zero records were merged

## Examples

Mixed files + glob + diagnostics:

```bash
node src/cli.ts \
  --input fixtures/sample.jsonl \
  --input "fixtures/sample*.json*" \
  --input-format auto \
  --format zod \
  --type-name MixedRecord \
  --diagnostics \
  --diagnostics-output diagnostics.json
```

Loose mode + all optional:

```bash
node src/cli.ts \
  --input fixtures/sample.jsonl \
  --format json-schema \
  --type-mode loose \
  --all-optional-properties
```

## Programmatic API

The package exposes a facade-only API from the published entrypoints:

- `generateFromText(...)`
- `generateFromFiles(...)`

Import from either:

- `"shape-infer"` (root export)
- `"shape-infer/public-api"` (facade-only subpath export)

```ts
import { generateFromText } from "shape-infer";

const result = await generateFromText({
  text: '[{"id":1},{"id":"2"}]',
  inputFormat: "json",
  format: "zod",
  typeName: "Record",
  includeDiagnostics: true
});

console.log(result.output);
console.log(result.stats);
console.log(result.warnings);
console.log(result.diagnostics?.summary);
```

## NPM Scripts

- `pnpm run dev -- --help`: Run CLI from `src/`.
- `pnpm run start -- --help`: Run CLI from `dist/`.
- `pnpm run build`: Compile `src` to `dist`.
- `pnpm run typecheck`: Typecheck source and scripts.
- `pnpm run api:check`: Validate published API reports for root and `public-api` entrypoints.
- `pnpm run api:update`: Refresh API report baselines after intentional public API changes.
- `pnpm test`: Run Vitest tests.
- `pnpm run test:watch`: Run tests in watch mode.
- `pnpm run test:update`: Update snapshot files.
- `pnpm run test:coverage`: Run tests with coverage output.
- `pnpm run test:type`: Run `*.test-d.ts` type-level tests.
- `pnpm run smoke`: Run source CLI smoke scenarios.
- `pnpm run smoke:dist`: Run compiled CLI smoke check.
- `pnpm run pack:check`: Validate package contents with `npm pack --dry-run`.
- `pnpm run check`: Run tests + type tests + smoke.
- `pnpm run verify`: Run `typecheck + check + build + smoke:dist + pack:check`.
- `pnpm run test:ci`: Alias for `verify`.

## Testing Notes

Tests are written in TypeScript and run with Vitest.

The suite includes:

- emitter snapshot/golden tests
- parser/inference edge-case tests (JSON, JSONL, auto-detect)
- CLI parser/runtime integration tests
- diagnostics and degradation behavior tests
- fuzz-like deterministic mixed-type fixtures
