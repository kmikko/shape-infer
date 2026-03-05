import type { ErrorObject, ValidateFunction } from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import fc, { type Parameters } from "fast-check";
import { describe, test } from "vitest";
import {
  emitJsonSchema,
  type JsonSchemaObject,
} from "../src/emitters/json-schema.ts";
import { emitZodSchema } from "../src/emitters/zod.ts";
import { inferFromValues } from "../src/infer.ts";
import { z } from "zod";
import { assertNoDeprecatedOrLegacyZodApis } from "./zod-output-policy.ts";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

interface RuntimeZodSchema {
  safeParse(value: unknown): { success: boolean };
}

const DEFAULT_RUNS = 500;
const SINGLE_VALUE_SCHEMA_NAME = "PropertyRoot";
const CORPUS_SCHEMA_NAME = "PropertyCorpusRoot";

const configuredRuns = resolveRuns();
const configuredSeed = resolveSeed();

const singleValueParameters = resolveFastCheckParameters(
  configuredRuns,
  configuredSeed,
);
const corpusParameters = resolveFastCheckParameters(
  Math.max(100, Math.floor(configuredRuns / 2)),
  configuredSeed,
);

const anythingJsonArbitrary = fc
  .anything({
    withDate: false,
    withMap: false,
    withSet: false,
    withBigInt: false,
    withTypedArray: false,
    withBoxedValues: false,
    withObjectString: false,
  })
  .filter((value): value is JsonValue => isJsonValue(value));

const generatedJsonValueArbitrary = fc
  .oneof(
    fc.jsonValue().map((value) => value as JsonValue),
    fc.json().map((value) => JSON.parse(value) as JsonValue),
    anythingJsonArbitrary,
  )
  .filter((value): value is JsonValue => isJsonValue(value));

describe("property-based inference invariants", () => {
  test("reserved prototype keys validate correctly when optional and when present", () => {
    const values = [
      JSON.parse(
        '{"toString":[],"constructor":1,"hasOwnProperty":true,"__proto__":"v"}',
      ) as JsonValue,
      {} as JsonValue,
    ];

    const root = inferFromValues(values);
    const jsonSchema = emitJsonSchema(root, { rootTitle: CORPUS_SCHEMA_NAME });
    const zodSource = emitZodSchema(root, { rootTypeName: CORPUS_SCHEMA_NAME });
    const jsonSchemaValidator = compileAjvValidator(jsonSchema);
    const zodSchema = compileZodSchemaFromEmitterSource(
      zodSource,
      CORPUS_SCHEMA_NAME,
    );

    values.forEach((value, index) => {
      assertAjvAcceptsValue(jsonSchemaValidator, value, index);
      assertZodAcceptsValue(zodSchema, value, index);
    });
  });

  test("single generated value round-trips through emitted JSON Schema and Zod", () => {
    fc.assert(
      fc.property(generatedJsonValueArbitrary, (value) => {
        assertRoundTripForValue(value, SINGLE_VALUE_SCHEMA_NAME);
      }),
      singleValueParameters,
    );
  }, 45_000);

  test("generated value corpora round-trip through emitted JSON Schema and Zod", () => {
    fc.assert(
      fc.property(
        fc.array(generatedJsonValueArbitrary, { minLength: 1, maxLength: 8 }),
        (values) => {
          const root = inferFromValues(values);
          const jsonSchema = emitJsonSchema(root, {
            rootTitle: CORPUS_SCHEMA_NAME,
          });
          const zodSource = emitZodSchema(root, {
            rootTypeName: CORPUS_SCHEMA_NAME,
          });
          assertNoDeprecatedOrLegacyZodApis(zodSource);

          const jsonSchemaValidator = compileAjvValidator(jsonSchema);
          const zodSchema = compileZodSchemaFromEmitterSource(
            zodSource,
            CORPUS_SCHEMA_NAME,
          );

          values.forEach((value, index) => {
            assertAjvAcceptsValue(jsonSchemaValidator, value, index);
            assertZodAcceptsValue(zodSchema, value, index);
          });
        },
      ),
      corpusParameters,
    );
  }, 45_000);
});

function assertRoundTripForValue(value: JsonValue, schemaName: string): void {
  const root = inferFromValues([value]);
  const jsonSchema = emitJsonSchema(root, { rootTitle: schemaName });
  const zodSource = emitZodSchema(root, { rootTypeName: schemaName });
  assertNoDeprecatedOrLegacyZodApis(zodSource);
  const jsonSchemaValidator = compileAjvValidator(jsonSchema);
  const zodSchema = compileZodSchemaFromEmitterSource(zodSource, schemaName);

  assertAjvAcceptsValue(jsonSchemaValidator, value);
  assertZodAcceptsValue(zodSchema, value);
}

function compileAjvValidator(
  schema: JsonSchemaObject,
): ValidateFunction<unknown> {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
  });
  addFormats(ajv);
  return ajv.compile(schema);
}

function compileZodSchemaFromEmitterSource(
  source: string,
  schemaName: string,
): RuntimeZodSchema {
  const schemaIdentifier = schemaName;
  const runtimeSource = source
    .replace(/^\s*import\s+\{\s*z\s*\}\s+from\s+"zod";\s*$/m, "")
    .replace(/\(input:\s*unknown\):\s*unknown/g, "(input)")
    .replace(/\s+as\s+Record<string,\s*unknown>/g, "")
    .replace(
      new RegExp(
        `^\\s*export\\s+type\\s+${escapeForRegExp(schemaName)}\\s*=\\s*z\\.infer<\\s*typeof\\s+${escapeForRegExp(
          schemaIdentifier,
        )}\\s*>;\\s*$`,
        "m",
      ),
      "",
    )
    .replace(
      new RegExp(
        `^\\s*export\\s+const\\s+${escapeForRegExp(schemaIdentifier)}\\s*=`,
        "m",
      ),
      `const ${schemaIdentifier} =`,
    );

  const evaluateSchema = new Function(
    "z",
    `${runtimeSource}\nreturn ${schemaIdentifier};`,
  ) as (zImport: typeof z) => unknown;

  const compiled = evaluateSchema(z);
  if (!isRuntimeZodSchema(compiled)) {
    throw new Error(
      `Failed to evaluate emitted Zod schema: ${schemaIdentifier}.`,
    );
  }

  return compiled;
}

function assertAjvAcceptsValue(
  validate: ValidateFunction<unknown>,
  value: JsonValue,
  index?: number,
): void {
  if (validate(value)) {
    return;
  }

  const location = index === undefined ? "" : ` at index ${index}`;
  throw new Error(
    `AJV rejected generated value${location}: ${previewValue(value)}\n` +
      formatAjvErrors(validate.errors),
  );
}

function assertZodAcceptsValue(
  schema: RuntimeZodSchema,
  value: JsonValue,
  index?: number,
): void {
  const result = schema.safeParse(value);
  if (result.success) {
    return;
  }

  const location = index === undefined ? "" : ` at index ${index}`;
  throw new Error(
    `Zod rejected generated value${location}: ${previewValue(value)}`,
  );
}

function resolveFastCheckParameters(
  numRuns: number,
  seed: number | undefined,
): Parameters<unknown> {
  if (seed === undefined) {
    return { numRuns };
  }
  return { numRuns, seed };
}

function resolveRuns(): number {
  const rawRuns = process.env.SCHEMA_PBT_RUNS;
  if (!rawRuns || rawRuns.trim().length === 0) {
    return DEFAULT_RUNS;
  }

  const parsedRuns = Number(rawRuns);
  if (!Number.isInteger(parsedRuns) || parsedRuns < 1) {
    throw new Error("SCHEMA_PBT_RUNS must be an integer >= 1.");
  }

  return parsedRuns;
}

function resolveSeed(): number | undefined {
  const rawSeed = process.env.SCHEMA_PBT_SEED;
  if (!rawSeed || rawSeed.trim().length === 0) {
    return undefined;
  }

  const parsedSeed = Number(rawSeed);
  if (!Number.isInteger(parsedSeed)) {
    throw new Error("SCHEMA_PBT_SEED must be an integer.");
  }

  return parsedSeed;
}

function isJsonValue(
  value: unknown,
  visiting: Set<unknown> = new Set<unknown>(),
): value is JsonValue {
  if (value === null) {
    return true;
  }

  const valueType = typeof value;
  if (valueType === "boolean" || valueType === "string") {
    return true;
  }

  if (valueType === "number") {
    return (
      Number.isFinite(value) &&
      (!Number.isInteger(value) || Number.isSafeInteger(value))
    );
  }

  if (valueType !== "object") {
    return false;
  }

  if (visiting.has(value)) {
    return false;
  }
  visiting.add(value);

  if (Array.isArray(value)) {
    for (const element of value) {
      if (!isJsonValue(element, visiting)) {
        visiting.delete(value);
        return false;
      }
    }
    visiting.delete(value);
    return true;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    visiting.delete(value);
    return false;
  }

  for (const nestedValue of Object.values(value as Record<string, unknown>)) {
    if (!isJsonValue(nestedValue, visiting)) {
      visiting.delete(value);
      return false;
    }
  }

  visiting.delete(value);
  return true;
}

function isRuntimeZodSchema(value: unknown): value is RuntimeZodSchema {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (!("safeParse" in value)) {
    return false;
  }

  return typeof value.safeParse === "function";
}

function previewValue(value: JsonValue): string {
  const text = JSON.stringify(value);
  if (text.length <= 220) {
    return text;
  }

  return `${text.slice(0, 220)}...`;
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) {
    return "AJV error list was empty.";
  }

  return errors
    .map((error) => {
      const path = error.instancePath.length > 0 ? error.instancePath : "/";
      return `${path}: ${error.message ?? "validation failed"}`;
    })
    .join("; ");
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
