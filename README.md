# shape-infer

[![npm version](https://img.shields.io/npm/v/shape-infer)](https://www.npmjs.com/package/shape-infer)
[![license](https://img.shields.io/npm/l/shape-infer)](LICENSE)
[![node](https://img.shields.io/node/v/shape-infer)](package.json)

Infer a unified schema from JSON or JSONL records and emit **TypeScript types**, **Zod schemas**, or **JSON Schema** (draft 2020-12).

`shape-infer` merges many records into one representative schema, handling missing fields, mixed types, changing values, and sparse or dynamic object keys along the way.

```sh
curl -s "https://swapi.info/api/planets" | npx shape-infer -t Planet -f zod
```

```ts
import { z } from "zod";

export const Planet = z.object({
  climate: z.string(),
  created: z.iso.datetime(),
  diameter: z.string(),
  edited: z.iso.datetime(),
  films: z.array(
    z.enum([
      "https://swapi.info/api/films/1",
      "https://swapi.info/api/films/2",
      "https://swapi.info/api/films/3",
      "https://swapi.info/api/films/4",
      "https://swapi.info/api/films/5",
      "https://swapi.info/api/films/6",
    ]),
  ),
  gravity: z.string(),
  name: z.string(),
  orbital_period: z.string(),
  population: z.string(),
  residents: z.array(z.url()),
  rotation_period: z.string(),
  surface_water: z.string(),
  terrain: z.string(),
  url: z.url(),
});

export type Planet = z.infer<typeof Planet>;
```

No install required. Pipe any JSON or JSONL source and get back something you can use.

## When is this useful?

- **Third-party APIs without published types** — point it at recorded responses and get TypeScript types or a Zod validator immediately
- **Bootstrapping types from sample data** — faster than writing them by hand, especially for deeply nested or sparse payloads
- **Exploring unknown datasets** — JSONL event logs, API captures, data dumps — get a structural overview before writing any parsing code

## Quick start

No install needed:

```sh
npx shape-infer data.jsonl -f zod
```

Pick your output format:

```sh
npx shape-infer data.jsonl -f zod          # Zod v4 schema + inferred type
npx shape-infer data.jsonl -f typescript   # plain type alias, no runtime dependency
npx shape-infer data.jsonl -f json-schema  # JSON Schema draft 2020-12
```

For frequent use, install globally:

```sh
npm install -g shape-infer
```

Or as a project dependency if you're using the [programmatic API](#programmatic-api):

```sh
npm/yarn/pnpm add shape-infer
```

## CLI Usage

```
shape-infer [pattern ...] [options]
cat data.json | shape-infer [options]
```

### Zod schema

Want runtime validation alongside your types? Start here:

```sh
$ curl -s "https://swapi.info/api/planets" | shape-infer -t Planet -f zod
import { z } from "zod";

export const Planet = z.object({
  "climate": z.string(),
  "created": z.iso.datetime(),
  "diameter": z.string(),
  "edited": z.iso.datetime(),
  "films": z.array(z.enum(["https://swapi.info/api/films/1", "https://swapi.info/api/films/2", "https://swapi.info/api/films/3", "https://swapi.info/api/films/4", "https://swapi.info/api/films/5", "https://swapi.info/api/films/6"])),
  "gravity": z.string(),
  "name": z.string(),
  "orbital_period": z.string(),
  "population": z.string(),
  "residents": z.array(z.url()),
  "rotation_period": z.string(),
  "surface_water": z.string(),
  "terrain": z.string(),
  "url": z.url(),
});

export type Planet = z.infer<typeof Planet>;
```

### TypeScript type

Don't need runtime parsing? Emit a plain type instead:

```sh
$ curl -s "https://swapi.info/api/planets" | shape-infer -t Planet -f ts
export type Planet = {
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
$ curl -s "https://swapi.info/api/planets" | shape-infer -t Planet -f json-schema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Planet",
  "type": "object",
  "properties": {
    "climate": { "type": "string" },
    "created": { "type": "string", "format": "date-time" },
    "residents": {
      "type": "array",
      "items": { "type": "string", "format": "uri" }
    },
    "url": { "type": "string", "format": "uri" }
    // ...
  },
  "required": ["climate", "created", "diameter", ...]
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

Loose mode — useful when working with a limited number of samples against a seemingly complex schema:

```bash
shape-infer data.jsonl -f zod --mode loose
```

In loose mode the emitter relaxes the output: literal enums collapse to their base primitive type, nullable unions normalize in Zod (`x | null` → `.nullable()`), and unions are preserved without size truncation.

Force all properties optional:

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

## Prior art

Several tools exist in this space and are worth knowing about before reaching for `shape-infer`.

[**quicktype**](https://github.com/glideapps/quicktype) is the most established option and the right choice if you need output beyond the JS/TS ecosystem — it supports 20+ target languages. Its TypeScript output is solid. The Zod target exists but is not a primary focus of the project, and targets Zod v3. It does not treat JSONL as a native input format.

[**@jsonhero/schema-infer**](https://github.com/triggerdotdev/schema-infer) has the closest inference model to `shape-infer` — it merges multiple JSON samples into a single representative JSON Schema 2020-12 document and handles optional fields and conflicting types well. If JSON Schema is all you need, it is a solid choice. It does not emit TypeScript types or Zod schemas and has no dedicated JSONL pipeline. The project has been quiet since 2023.

[**json-schema-to-zod**](https://github.com/StefanTerdell/json-schema-to-zod) solves a related but different problem: converting an existing JSON Schema into Zod source code. Worth knowing about, though the project was archived following Zod v4's release.

`shape-infer` exists for a specific situation: you have data from an external source — an API without published types, a recorded response log, an unfamiliar dataset — and you need to understand its shape before you can work with it meaningfully. The goal is to infer a single coherent schema from many records rather than a single sample, and emit it in whatever form is most useful: a runtime validator, a plain type, or a language-agnostic schema.

## Contributing

### Setup

```bash
git clone https://github.com/kmikko/shape-infer.git
cd shape-infer
pnpm install
```

### Running locally

```bash
pnpm run dev -- --help               # run CLI from source (no build needed)
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
