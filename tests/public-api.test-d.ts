import { expectTypeOf } from "vitest";
import {
  emitJsonSchema,
  emitTypeScriptType,
  emitZodSchema,
  generateFromFiles,
  generateFromText,
  generateFromValues,
  inferFromValues,
  resolveHeuristicOptions
} from "../src/index.ts";
import type {
  GenerateFromFilesResult,
  GenerateSchemaResult,
  HeuristicOptions,
  JsonSchemaObject,
  SchemaNode,
  TypeMode
} from "../src/index.ts";

const rootNode = inferFromValues([{ id: 1 }, { id: "2" }]);
expectTypeOf(rootNode).toEqualTypeOf<SchemaNode>();

const tsOutput = emitTypeScriptType(rootNode, {
  rootTypeName: "Product",
  typeMode: "loose",
  allOptionalProperties: true
});
expectTypeOf(tsOutput).toEqualTypeOf<string>();

const zodOutput = emitZodSchema(rootNode, {
  rootTypeName: "Product",
  typeMode: "strict"
});
expectTypeOf(zodOutput).toEqualTypeOf<string>();

const jsonSchemaOutput = emitJsonSchema(rootNode, {
  rootTitle: "Product"
});
expectTypeOf(jsonSchemaOutput).toEqualTypeOf<JsonSchemaObject>();

const heuristics = resolveHeuristicOptions({
  requiredThreshold: 0.5,
  enumThreshold: 0.25
});
expectTypeOf(heuristics).toEqualTypeOf<HeuristicOptions>();

const mode: TypeMode = "loose";
expectTypeOf(mode).toMatchTypeOf<"strict" | "loose">();

const generatedFromValues = generateFromValues({
  values: [{ id: 1 }, { id: "2" }],
  format: "typescript",
  includeDiagnostics: true
});
expectTypeOf(generatedFromValues).toEqualTypeOf<GenerateSchemaResult>();

const generatedFromText = generateFromText({
  text: '{"id":1}\n{"id":"2"}\n',
  inputFormat: "jsonl"
});
expectTypeOf(generatedFromText).toEqualTypeOf<Promise<GenerateSchemaResult>>();

const generatedFromFiles = generateFromFiles({
  inputPatterns: ["fixtures/*.json*"],
  inputFormat: "auto"
});
expectTypeOf(generatedFromFiles).toEqualTypeOf<Promise<GenerateFromFilesResult>>();
