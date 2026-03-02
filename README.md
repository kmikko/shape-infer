# shape-infer

[![npm version](https://img.shields.io/npm/v/shape-infer)](https://www.npmjs.com/package/shape-infer)
[![license](https://img.shields.io/npm/l/shape-infer)](LICENSE)
[![node](https://img.shields.io/node/v/shape-infer)](package.json)

Feed it JSON or JSONL, get back a clean schema — as **TypeScript types**, **Zod schemas**, or **JSON Schema** (draft 2020-12).

`shape-infer` merges many records into one representative schema, handling missing fields, mixed types, changing values, and sparse or dynamic object keys along the way.

### When is this useful?

- **Generating types for third-party APIs** that don't ship their own schema
- **Bootstrapping TypeScript types** from sample JSON data instead of writing them by hand
- **Building runtime validators** (Zod) for unknown or loosely-documented payloads

## Getting Started

Install globally to use the CLI anywhere:

```sh
npm install -g shape-infer   # or pnpm / yarn
```

Or add it as a project dependency:

```sh
npm add shape-infer
```

> Requires **Node.js >= 24**.

## CLI Usage

```
shape-infer [pattern ...] [options]
cat data.json | shape-infer [options]
```

Pipe any JSON or JSONL source straight into `shape-infer` and pick your output format.

### Zod schema

```sh
$ curl -s "https://swapi.info/api/planets" | shape-infer -t SwapiPlanet -f zod
import { z } from "zod";

export const SwapiPlanetSchema = z.object({
  "climate": z.string(),
  "created": z.string().datetime(),
  "diameter": z.string(),
  "edited": z.string().datetime(),
  "films": z.array(z.enum(["https://swapi.info/api/films/1", "https://swapi.info/api/films/2", "https://swapi.info/api/films/3", "https://swapi.info/api/films/4", "https://swapi.info/api/films/5", "https://swapi.info/api/films/6"])),
  "gravity": z.string(),
  "name": z.string(),
  "orbital_period": z.string(),
  "population": z.string(),
  "residents": z.array(z.string().url()),
  "rotation_period": z.string(),
  "surface_water": z.string(),
  "terrain": z.string(),
  "url": z.string().url(),
});

export type SwapiPlanet = z.infer<typeof SwapiPlanetSchema>;
```

### TypeScript type

Don't need runtime parsing? Emit a plain type instead:

```sh
$ curl -s "https://swapi.info/api/planets" | shape-infer -t SwapiPlanet -f ts
export type SwapiPlanet = {
  climate: string;
  created: string;
  diameter: string;
  edited: string;
  films: Array<"https://swapi.info/api/films/1" | "https://swapi.info/api/films/2" | "https://swapi.info/api/films/3" | "https://swapi.info/api/films/4" | "https://swapi.info/api/films/5" | "https://swapi.info/api/films/6">;
  gravity: string;
  name: string;
  orbital_period: string;
  population: string;
  residents: Array<string>;
  rotation_period: string;
  surface_water: string;
  terrain: string;
  url: string;
};
```

### JSON Schema

Not in the TypeScript ecosystem? Output JSON Schema instead:

```sh
$ curl -s "https://swapi.info/api/planets" | shape-infer -t SwapiPlanet -f json-schema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SwapiPlanet",
  "type": "object",
  "properties": {
    "climate": {
      "type": "string"
    },
    "created": {
      "type": "string",
      "format": "date-time"
    },
    "diameter": {
      "type": "string"
    },
    "edited": {
      "type": "string",
      "format": "date-time"
    },
    "films": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri",
        "enum": [
          "https://swapi.info/api/films/1",
          "https://swapi.info/api/films/2",
          "https://swapi.info/api/films/3",
          "https://swapi.info/api/films/4",
          "https://swapi.info/api/films/5",
          "https://swapi.info/api/films/6"
        ]
      }
    },
    "gravity": {
      "type": "string"
    },
    "name": {
      "type": "string"
    },
    "orbital_period": {
      "type": "string"
    },
    "population": {
      "type": "string"
    },
    "residents": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri"
      }
    },
    "rotation_period": {
      "type": "string"
    },
    "surface_water": {
      "type": "string"
    },
    "terrain": {
      "type": "string"
    },
    "url": {
      "type": "string",
      "format": "uri"
    }
  },
  "required": [
    "climate",
    "created",
    "diameter",
    "edited",
    "films",
    "gravity",
    "name",
    "orbital_period",
    "population",
    "residents",
    "rotation_period",
    "surface_water",
    "terrain",
    "url"
  ]
}
```

### More examples

Read from files or globs:

```bash
shape-infer data.jsonl --format zod --type-name MyRecord
shape-infer "fixtures/sample*.json*" --format typescript
```

Write output to a file:

```bash
shape-infer data.jsonl -f json-schema -o schema.json
```

Loose mode (enums collapse to primitives, unions preserved) with all properties optional:

```bash
shape-infer data.jsonl -f json-schema --mode loose --all-optional
```

## CLI Reference

| Flag                   | Alias | Description                                                                        | Default      |
| ---------------------- | ----- | ---------------------------------------------------------------------------------- | ------------ |
| `[pattern ...]`        |       | Input file path(s) or glob(s). Omit to read from stdin.                            |              |
| `--output <path>`      | `-o`  | Write output to a file instead of stdout.                                          | stdout       |
| `--type-name <name>`   | `-t`  | Root type / schema name.                                                           | `Root`       |
| `--format <fmt>`       | `-f`  | Output format: `typescript` (`ts`), `zod`, `json-schema` (`jsonschema`, `schema`). | `typescript` |
| `--input-format <fmt>` |       | Input format hint: `auto`, `json`, `jsonl` (`ndjson`).                             | `auto`       |
| `--mode <mode>`        |       | Emission strictness: `strict` or `loose`.                                          | `strict`     |
| `--all-optional`       |       | Force all object properties to optional.                                           |              |
| `--version`            | `-V`  | Print version.                                                                     |              |
| `--help`               | `-h`  | Show usage.                                                                        |              |

Flags accept both `--flag value` and `--flag=value` syntax. Use `--` to stop flag parsing and treat remaining arguments as file patterns.

### Loose mode

In loose mode the emitter relaxes the output:

- Literal enums collapse to their base primitive type
- Nullable unions normalize in Zod (`x | null` → `.nullable()`)
- Unions are preserved without size truncation

### Input detection

Input format is auto-detected unless overridden with `--input-format`:

- `.jsonl` / `.ndjson` extension → JSONL
- `.json` extension → JSON
- Other extensions → content-based detection (leading `[` or parseable `{` → JSON, otherwise JSONL)
- JSON top-level arrays: each element is merged as a record
- JSON top-level objects or scalars: treated as a single record
- JSONL: invalid lines are skipped; valid lines are still merged

File paths are deduplicated and sorted per pattern expansion. Unmatched patterns cause an error. When no positional arguments are given and stdin is a TTY, the CLI exits with an error.

### Warnings

Parse warnings are written to stderr:

- JSONL: count of skipped invalid lines with line numbers
- JSON: parse failure summary
- A global warning when zero records were merged

## Programmatic API

For more advanced use cases, `shape-infer` also exports a programmatic interface. Import from either `"shape-infer"` or `"shape-infer/public-api"` — both expose the same surface.

### `generateFromText`

Infer a schema from a string of JSON or JSONL:

```ts
import { generateFromText } from "shape-infer";

const result = await generateFromText({
  text: '[{"id":1},{"id":"2"}]',
  inputFormat: "json",
  format: "zod",
  typeName: "Record",
});

console.log(result.output); // the generated schema string
console.log(result.warnings); // any parse warnings
```

### `generateFromFiles`

Infer a schema from one or more file patterns:

```ts
import { generateFromFiles } from "shape-infer";

const result = await generateFromFiles({
  inputPatterns: ["data/*.jsonl"],
  format: "typescript",
  typeName: "MyRecord",
});

console.log(result.output);
```

### Options

Both functions accept a shared set of options:

| Option                  | Type                                     | Default        | Description                    |
| ----------------------- | ---------------------------------------- | -------------- | ------------------------------ |
| `format`                | `"typescript" \| "zod" \| "json-schema"` | `"typescript"` | Output format.                 |
| `typeName`              | `string`                                 | `"Root"`       | Root type / schema name.       |
| `typeMode`              | `"strict" \| "loose"`                    | `"strict"`     | Emission strictness.           |
| `allOptionalProperties` | `boolean`                                | `false`        | Force all properties optional. |
| `inputFormat`           | `"auto" \| "json" \| "jsonl"`            | `"auto"`       | Input format hint.             |

`generateFromFiles` additionally accepts `inputPatterns: string[]` (required) and `cwd?: string`.
`generateFromText` additionally accepts `text: string` (required) and `sourceName?: string`.

Both return a `GenerateResult` with `output: string` and `warnings: string[]`.

## Contributing

### Setup

```bash
git clone https://github.com/kmikko/shape-infer.git
cd shape-infer
pnpm install
```

### Running locally

```bash
pnpm run dev -- --help              # run CLI from source (no build needed)
pnpm run build                       # bundle to dist/
pnpm run start -- --help             # run compiled CLI
```

### Testing

Tests are written in TypeScript and run with [Vitest](https://vitest.dev/). The suite includes snapshot/golden tests, inference edge-case tests, CLI integration tests, and fuzz-like deterministic fixtures.

```bash
pnpm test                            # unit tests
pnpm run test:all                    # full suite (unit + type + smoke + CLI + pack)
pnpm run check:all                   # typecheck + lint + format + API reports + pack validation
```

### Releasing

See the [releasing docs](docs/releasing.md) for the full publish workflow (changesets, CI, npm).

## License

[MIT](LICENSE)
