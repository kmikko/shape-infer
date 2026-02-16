import { expectTypeOf } from "vitest";
import {
  emitJsonSchema,
  emitTypeScriptType,
  emitZodSchema,
  inferFromValues,
  resolveHeuristicOptions
} from "../src";
import type { HeuristicOptions, JsonSchemaObject, SchemaNode, TypeMode } from "../src";

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
