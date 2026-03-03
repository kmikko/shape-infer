import { describe, expect, test } from "vitest";
import { emitJsonSchema } from "../src/emitters/json-schema.ts";
import { emitTypeScriptType } from "../src/emitters/typescript.ts";
import { emitZodSchema } from "../src/emitters/zod.ts";
import { inferFromJsonText } from "../src/infer.ts";

describe("emission modes", () => {
  test("allOptionalProperties forces optional object properties in TypeScript output", () => {
    const inference = inferFromJsonText('[{"a":1},{"a":2}]');

    const strictOutput = emitTypeScriptType(inference.root, {
      rootTypeName: "StrictType",
    });
    const optionalOutput = emitTypeScriptType(inference.root, {
      rootTypeName: "OptionalType",
      allOptionalProperties: true,
    });

    expect(strictOutput).toMatch(/a: number;/);
    expect(optionalOutput).toMatch(/a\?: number;/);
  });

  test("loose type mode collapses zod enum+null union to nullable primitive", () => {
    const inference = inferFromJsonText(
      '[{"label":"Fairtrade"},{"label":"Fairtrade"},{"label":"Fairtrade"},{"label":"Fairtrade"},{"label":"Fairtrade"},{"label":"Fairtrade"},{"label":"Fairtrade"},{"label":"Fairtrade"},{"label":"Fair for Life"},{"label":"Fair for Life"},{"label":null},{"label":null}]',
    );

    const strictOutput = emitZodSchema(inference.root, {
      rootTypeName: "StrictSchema",
    });

    const looseOutput = emitZodSchema(inference.root, {
      rootTypeName: "LooseSchema",
      typeMode: "loose",
    });

    expect(strictOutput).toMatch(
      /z\.union\(\[z\.enum\(\["Fair for Life", "Fairtrade"\]\), z\.null\(\)\]\)/,
    );
    expect(looseOutput).toMatch(/"label": z\.string\(\)\.nullable\(\)/);
  });

  test("loose type mode collapses zod array enum elements to primitive", () => {
    const inference = inferFromJsonText(
      '[{"tags":["A","A","A","A","B"]},{"tags":["A","A","A","A","B"]}]',
    );

    const strictOutput = emitZodSchema(inference.root, {
      rootTypeName: "StrictArray",
    });

    const looseOutput = emitZodSchema(inference.root, {
      rootTypeName: "LooseArray",
      typeMode: "loose",
    });

    expect(strictOutput).toMatch(/"tags": z\.array\(z\.enum\(\["A", "B"\]\)\)/);
    expect(looseOutput).toMatch(/"tags": z\.array\(z\.string\(\)\)/);
  });

  test("allOptionalProperties omits JSON schema required arrays", () => {
    const inference = inferFromJsonText('[{"a":1,"b":"x"}]');

    const strictSchema = emitJsonSchema(inference.root, {
      rootTitle: "StrictJsonSchema",
    });
    const allOptionalSchema = emitJsonSchema(inference.root, {
      rootTitle: "OptionalJsonSchema",
      allOptionalProperties: true,
    });

    expect(strictSchema.required).toEqual(["a", "b"]);
    expect(allOptionalSchema.required).toBeUndefined();
  });

  test("loose type mode removes JSON schema enum keywords", () => {
    const inference = inferFromJsonText(
      '[{"kind":"A"},{"kind":"A"},{"kind":"A"},{"kind":"A"},{"kind":"A"},{"kind":"A"},{"kind":"A"},{"kind":"A"},{"kind":"B"},{"kind":"B"}]',
    );

    const strictSchema = emitJsonSchema(inference.root);
    const looseSchema = emitJsonSchema(inference.root, {
      typeMode: "loose",
    });

    expect(strictSchema.properties.kind.enum).toEqual(["A", "B"]);
    expect(looseSchema.properties.kind.enum).toBeUndefined();
  });

  test("loose type mode collapses separator-uniform object keys to Record<string, V> in TypeScript", () => {
    const days = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];
    const input = JSON.stringify([
      Object.fromEntries(days.map((d) => [`2026-7-${d}`, []])),
    ]);
    const inference = inferFromJsonText(input);

    const strictOutput = emitTypeScriptType(inference.root, {
      rootTypeName: "Root",
    });
    const looseOutput = emitTypeScriptType(inference.root, {
      rootTypeName: "Root",
      typeMode: "loose",
    });

    expect(strictOutput).toMatch(/"2026-7-monday"/);
    expect(looseOutput).toMatch(/Record<string,/);
    expect(looseOutput).not.toMatch(/"2026-7-monday"/);
  });

  test("loose type mode collapses separator-uniform object keys to z.record in Zod", () => {
    const days = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];
    const input = JSON.stringify([
      Object.fromEntries(days.map((d) => [`2026-7-${d}`, []])),
    ]);
    const inference = inferFromJsonText(input);

    const strictOutput = emitZodSchema(inference.root, {
      rootTypeName: "Root",
    });
    const looseOutput = emitZodSchema(inference.root, {
      rootTypeName: "Root",
      typeMode: "loose",
    });

    expect(strictOutput).toMatch(/"2026-7-monday"/);
    expect(looseOutput).toMatch(/z\.record\(z\.string\(\)/);
    expect(looseOutput).not.toMatch(/"2026-7-monday"/);
  });

  test("loose type mode collapses separator-uniform object keys to additionalProperties in JSON Schema", () => {
    const days = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];
    const input = JSON.stringify([
      Object.fromEntries(days.map((d) => [`2026-7-${d}`, []])),
    ]);
    const inference = inferFromJsonText(input);

    const strictSchema = emitJsonSchema(inference.root, { rootTitle: "Root" });
    const looseSchema = emitJsonSchema(inference.root, {
      rootTitle: "Root",
      typeMode: "loose",
    });

    expect(strictSchema.properties["2026-7-monday"]).toBeDefined();
    expect(looseSchema.properties).toBeUndefined();
    expect(looseSchema.additionalProperties).toBeDefined();
  });

  test("loose type mode does not collapse regular named-property objects", () => {
    const input = JSON.stringify([
      {
        name: "Alice",
        age: 30,
        id: 1,
        role: "admin",
        active: true,
        created: "2026-01-01",
        score: 99,
      },
    ]);
    const inference = inferFromJsonText(input);

    const looseOutput = emitTypeScriptType(inference.root, {
      rootTypeName: "Root",
      typeMode: "loose",
    });

    expect(looseOutput).toMatch(/name/);
    expect(looseOutput).not.toMatch(/Record<string,/);
  });
});
