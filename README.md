# schema-generator

Phase 2 implementation: infer a unified schema from JSONL records and emit TypeScript, Zod, or JSON Schema.

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

Or stream JSONL from stdin:

```bash
cat path/to/data.jsonl | node dist/cli.js --type-name MyRecord --format zod
```

Write output to file:

```bash
node dist/cli.js --input path/to/data.jsonl --output schema.ts --format typescript
```

Supported formats:

- `typescript` (or `ts`)
- `zod`
- `json-schema` (aliases: `jsonschema`, `schema`)

## Smoke test

```bash
pnpm run smoke
```
