# schema-generator

Phase 1 implementation: infer a unified TypeScript schema from JSONL records.

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
node dist/cli.js --input path/to/data.jsonl --type-name MyRecord
```

Or stream JSONL from stdin:

```bash
cat path/to/data.jsonl | node dist/cli.js --type-name MyRecord
```

Write output to file:

```bash
node dist/cli.js --input path/to/data.jsonl --output schema.ts
```

## Smoke test

```bash
pnpm run smoke
```
