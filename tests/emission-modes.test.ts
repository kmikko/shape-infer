const assert = require("node:assert/strict");
const test = require("node:test");

const { inferFromJsonText } = require("../dist/infer.js");
const { emitTypeScriptType } = require("../dist/emitters/typescript.js");
const { emitZodSchema } = require("../dist/emitters/zod.js");
const { emitJsonSchema } = require("../dist/emitters/json-schema.js");

test("allOptionalProperties forces optional object properties in TypeScript output", () => {
  const inference = inferFromJsonText('[{"a":1},{"a":2}]');

  const strictOutput = emitTypeScriptType(inference.root, {
    rootTypeName: "StrictType"
  });
  const looseOptionalOutput = emitTypeScriptType(inference.root, {
    rootTypeName: "OptionalType",
    allOptionalProperties: true
  });

  assert.match(strictOutput, /a: number;/);
  assert.match(looseOptionalOutput, /a\?: number;/);
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

  assert.match(strictOutput, /z\.union\(\[z\.enum\(\["Fair for Life", "Fairtrade"\]\), z\.null\(\)\]\)/);
  assert.match(looseOutput, /"label": z\.string\(\)\.nullable\(\)/);
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

  assert.match(strictOutput, /"tags": z\.array\(z\.enum\(\["A", "B"\]\)\)/);
  assert.match(looseOutput, /"tags": z\.array\(z\.string\(\)\)/);
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

  assert.deepEqual(strictSchema.required, ["a", "b"]);
  assert.equal(allOptionalSchema.required, undefined);
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

  assert.deepEqual(strictSchema.properties.kind.enum, ["A", "B"]);
  assert.equal(looseSchema.properties.kind.enum, undefined);
});
