import { describe, expect, test } from "vitest";
import { emitJsonSchema } from "../src/emitters/json-schema.ts";
import { emitTypeScriptType } from "../src/emitters/typescript.ts";
import { emitZodSchema } from "../src/emitters/zod.ts";
import { inferFromValues } from "../src/infer.ts";

describe("emitter edge cases", () => {
  test("emits unknown root when no records are inferred", () => {
    const root = inferFromValues([]);

    const ts = emitTypeScriptType(root, { rootTypeName: "UnknownRoot" });
    const zod = emitZodSchema(root, { rootTypeName: "UnknownRoot" });
    const schema = emitJsonSchema(root, { rootTitle: "UnknownRoot" });

    expect(ts).toContain("export type UnknownRoot = unknown;");
    expect(zod).toContain("const UnknownRootSchema = z.unknown();");
    expect(schema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "UnknownRoot"
    });
    expect(schema).not.toHaveProperty("type");
  });

  test("falls back to unknown when union variants exceed maxUnionSize", () => {
    const root = inferFromValues([1, "x", true, null, [1], { nested: 1 }]);
    const heuristics = {
      maxUnionSize: 3
    };

    const ts = emitTypeScriptType(root, {
      rootTypeName: "OverflowRoot",
      heuristics
    });
    const zod = emitZodSchema(root, {
      rootTypeName: "OverflowRoot",
      heuristics
    });
    const schema = emitJsonSchema(root, {
      rootTitle: "OverflowRoot",
      heuristics
    });

    expect(ts).toContain("export type OverflowRoot = unknown;");
    expect(zod).toContain("const OverflowRootSchema = z.unknown();");
    expect(schema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "OverflowRoot"
    });
    expect(schema).not.toHaveProperty("type");
    expect(schema).not.toHaveProperty("anyOf");
  });

  test("emits empty object and empty array defaults", () => {
    const emptyObjectRoot = inferFromValues([{}]);
    const emptyArrayRoot = inferFromValues([[]]);

    const objectTs = emitTypeScriptType(emptyObjectRoot, { rootTypeName: "EmptyObject" });
    const objectZod = emitZodSchema(emptyObjectRoot, { rootTypeName: "EmptyObject" });
    const objectSchema = emitJsonSchema(emptyObjectRoot, { rootTitle: "EmptyObject" });

    expect(objectTs).toContain("export type EmptyObject = {};");
    expect(objectZod).toContain("const EmptyObjectSchema = z.object({});");
    expect(objectSchema).toMatchObject({
      type: "object",
      properties: {}
    });

    const arrayTs = emitTypeScriptType(emptyArrayRoot, { rootTypeName: "EmptyArray" });
    const arrayZod = emitZodSchema(emptyArrayRoot, { rootTypeName: "EmptyArray" });
    const arraySchema = emitJsonSchema(emptyArrayRoot, { rootTitle: "EmptyArray" });

    expect(arrayTs).toContain("export type EmptyArray = Array<unknown>;");
    expect(arrayZod).toContain("const EmptyArraySchema = z.array(z.unknown());");
    expect(arraySchema).toMatchObject({
      type: "array",
      items: {}
    });
  });

  test("zod emitter applies additional string format helpers", () => {
    const cases = [
      {
        name: "date",
        values: ["2025-01-01", "2025-01-02"],
        expectedFragment: ".date()"
      },
      {
        name: "email",
        values: ["alpha@example.com", "beta@example.com"],
        expectedFragment: ".email()"
      },
      {
        name: "uuid",
        values: [
          "550e8400-e29b-41d4-a716-446655440000",
          "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
        ],
        expectedFragment: ".uuid()"
      },
      {
        name: "uri",
        values: ["https://example.com/a", "https://example.com/b"],
        expectedFragment: ".url()"
      }
    ] as const;

    for (const fixture of cases) {
      const root = inferFromValues(fixture.values);
      const zod = emitZodSchema(root, {
        rootTypeName: `Format${fixture.name}`,
        heuristics: {
          minFormatCount: 2,
          stringFormatThreshold: 1
        }
      });

      expect(zod).toContain(fixture.expectedFragment);
    }
  });
});
