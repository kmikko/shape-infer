import { describe, expect, test } from "vitest";
import { emitJsonSchema } from "../src/emitters/json-schema";
import { emitTypeScriptType } from "../src/emitters/typescript";
import { emitZodSchema } from "../src/emitters/zod";
import { inferFromJsonText } from "../src/infer";

describe("emission modes", () => {
  test("allOptionalProperties forces optional object properties in TypeScript output", () => {
    const inference = inferFromJsonText('[{"a":1},{"a":2}]');

    const strictOutput = emitTypeScriptType(inference.root, {
      rootTypeName: "StrictType"
    });
    const optionalOutput = emitTypeScriptType(inference.root, {
      rootTypeName: "OptionalType",
      allOptionalProperties: true
    });

    expect(strictOutput).toMatch(/a: number;/);
    expect(optionalOutput).toMatch(/a\?: number;/);
  });

  test("loose type mode collapses zod enum+null union to nullable primitive", () => {
    const inference = inferFromJsonText(
      '[{"label":"Fairtrade"},{"label":"Fair for Life"},{"label":null}]'
    );

    const strictOutput = emitZodSchema(inference.root, {
      rootTypeName: "StrictSchema",
      heuristics: {
        minEnumCount: 2,
        enumThreshold: 1
      }
    });

    const looseOutput = emitZodSchema(inference.root, {
      rootTypeName: "LooseSchema",
      typeMode: "loose",
      heuristics: {
        minEnumCount: 2,
        enumThreshold: 1
      }
    });

    expect(strictOutput).toMatch(
      /z\.union\(\[z\.enum\(\["Fair for Life", "Fairtrade"\]\), z\.null\(\)\]\)/
    );
    expect(looseOutput).toMatch(/"label": z\.string\(\)\.nullable\(\)/);
  });

  test("loose type mode collapses zod array enum elements to primitive", () => {
    const inference = inferFromJsonText('[{"tags":["A","B"]},{"tags":["B","A"]}]');

    const strictOutput = emitZodSchema(inference.root, {
      rootTypeName: "StrictArray",
      heuristics: {
        minEnumCount: 2,
        enumThreshold: 1
      }
    });

    const looseOutput = emitZodSchema(inference.root, {
      rootTypeName: "LooseArray",
      typeMode: "loose",
      heuristics: {
        minEnumCount: 2,
        enumThreshold: 1
      }
    });

    expect(strictOutput).toMatch(/"tags": z\.array\(z\.enum\(\["A", "B"\]\)\)/);
    expect(looseOutput).toMatch(/"tags": z\.array\(z\.string\(\)\)/);
  });

  test("allOptionalProperties omits JSON schema required arrays", () => {
    const inference = inferFromJsonText('[{"a":1,"b":"x"}]');

    const strictSchema = emitJsonSchema(inference.root, {
      rootTitle: "StrictJsonSchema"
    });
    const allOptionalSchema = emitJsonSchema(inference.root, {
      rootTitle: "OptionalJsonSchema",
      allOptionalProperties: true
    });

    expect(strictSchema.required).toEqual(["a", "b"]);
    expect(allOptionalSchema.required).toBeUndefined();
  });

  test("loose type mode removes JSON schema enum keywords", () => {
    const inference = inferFromJsonText('[{"kind":"A"},{"kind":"B"}]');

    const strictSchema = emitJsonSchema(inference.root, {
      heuristics: {
        minEnumCount: 2,
        enumThreshold: 1
      }
    });
    const looseSchema = emitJsonSchema(inference.root, {
      typeMode: "loose",
      heuristics: {
        minEnumCount: 2,
        enumThreshold: 1
      }
    });

    expect(strictSchema.properties.kind.enum).toEqual(["A", "B"]);
    expect(looseSchema.properties.kind.enum).toBeUndefined();
  });
});
