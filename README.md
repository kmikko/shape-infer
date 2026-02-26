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

## CLI Flags

### Core (shown in `--help`)

- `-i, --input <path-or-glob>`: Input file path or glob. Repeatable.
- `--input-format <auto|jsonl|json>`: Input format mode. Default `auto`. Alias `ndjson` maps to `jsonl`.
- `-o, --output <path>`: Write schema output to file (default stdout).
- `-t, --type-name <name>`: Root type/schema name (default `Root`).
- `-f, --format <typescript|zod|json-schema>`: Output format (default `typescript`).
- `--mode <strict|loose>`: Emission strictness (default `strict`).
- `--all-optional`: Force all object properties optional in emitted schemas.
- `-h, --help`: Print usage.

Loose mode behavior:

- literal enums collapse to base primitives
- nullable unions are normalized in Zod (`x | null` -> `.nullable()`)

## Parse Warnings

Warnings are written to stderr:

- JSONL: skipped invalid line count + captured line numbers
- JSON: parse failure summary + captured line number (if available)
- Global warning when zero records were merged

## Examples

Mixed files + glob:

```bash
node src/cli.ts \
  --input fixtures/sample.jsonl \
  --input "fixtures/sample*.json*" \
  --input-format auto \
  --format zod \
  --type-name MixedRecord
```

Loose mode + all optional:

```bash
node src/cli.ts \
  --input fixtures/sample.jsonl \
  --format json-schema \
  --mode loose \
  --all-optional
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
});

console.log(result.output);
console.log(result.stats);
console.log(result.warnings);
```

## NPM Scripts

- `pnpm run dev -- --help`: Run CLI from `src/`.
- `pnpm run start -- --help`: Run CLI from `dist/`.
- `pnpm run build`: Compile `src` to `dist`.
- `pnpm run check:type`: Typecheck source and scripts.
- `pnpm run api:check`: Validate published API reports for root and `public-api` entrypoints.
- `pnpm run api:update`: Refresh API report baselines after intentional public API changes.
- `pnpm test`: Run Vitest tests.
- `pnpm run test:watch`: Run tests in watch mode.
- `pnpm run test:update`: Update snapshot files.
- `pnpm run test:coverage`: Run tests with coverage output.
- `pnpm run test:type`: Run `*.test-d.ts` type-level tests.
- `pnpm run test:smoke`: Run source CLI smoke scenarios.
- `pnpm run test:cli`: Build and run compiled CLI smoke check.
- `pnpm run test:pack`: Run consumer pack smoke scenarios.
- `pnpm run test:all`: Run full test suite (unit + type + smoke + CLI + pack).
- `pnpm run check:pack`: Validate package contents with `npm pack --dry-run`.
- `pnpm run check:all`: Run typecheck + lint + API report validation + pack check.

## Testing Notes

Tests are written in TypeScript and run with Vitest.

The suite includes:

- emitter snapshot/golden tests
- parser/inference edge-case tests (JSON, JSONL, auto-detect)
- CLI parser/runtime integration tests
- fuzz-like deterministic mixed-type fixtures
