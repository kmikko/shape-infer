import type { ArrayVariant, AstMergeOptions, ObjectVariant, SchemaNode } from "../ast.ts";
import {
  buildRecordValueNode,
  inferNumberEnum,
  inferStringEnum,
  inferStringFormat,
  isRecordLikeObject,
  isRequired,
  resolveHeuristicOptions
} from "../heuristics.ts";
import type { HeuristicOptions } from "../heuristics.ts";
import {
  resolveEmissionStyleOptions
} from "./style.ts";
import type { EmissionStyleOptions, ResolvedEmissionStyleOptions } from "./style.ts";

export type JsonSchemaValue = null | boolean | number | string | JsonSchemaValue[] | JsonSchemaObject;

export interface JsonSchemaObject {
  [key: string]: JsonSchemaValue;
}

export interface JsonSchemaEmitterOptions extends EmissionStyleOptions {
  rootTitle?: string;
  includeSchemaDialect?: boolean;
  heuristics?: Partial<HeuristicOptions>;
  astMergeOptions?: Partial<AstMergeOptions>;
}

export function emitJsonSchema(
  node: SchemaNode,
  options: JsonSchemaEmitterOptions = {}
): JsonSchemaObject {
  const heuristics = resolveHeuristicOptions(options.heuristics);
  const style = resolveEmissionStyleOptions(options);
  const schema = emitNodeSchema(node, heuristics, options.astMergeOptions, style);

  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    throw new Error("Invalid schema root generated.");
  }

  const result: JsonSchemaObject = {};
  if (options.includeSchemaDialect ?? true) {
    result.$schema = "https://json-schema.org/draft/2020-12/schema";
  }
  if (options.rootTitle) {
    result.title = options.rootTitle;
  }

  for (const [key, value] of Object.entries(schema)) {
    result[key] = value;
  }

  return result;
}

function emitNodeSchema(
  node: SchemaNode,
  heuristics: HeuristicOptions,
  astMergeOptions: Partial<AstMergeOptions> | undefined,
  style: ResolvedEmissionStyleOptions
): JsonSchemaObject {
  if (node.variants.unknown) {
    return {};
  }

  const variants: JsonSchemaObject[] = [];

  if (node.variants.object) {
    variants.push(emitObjectSchema(node.variants.object, heuristics, astMergeOptions, style));
  }

  if (node.variants.array) {
    variants.push(emitArraySchema(node.variants.array, heuristics, astMergeOptions, style));
  }

  if (node.variants.string) {
    const stringSchema: JsonSchemaObject = { type: "string" };
    const formatCandidate = inferStringFormat(node.variants.string, heuristics);
    if (formatCandidate) {
      stringSchema.format = formatCandidate.format;
    }

    if (style.typeMode === "strict") {
      const enumCandidate = inferStringEnum(node.variants.string, heuristics);
      if (enumCandidate) {
        variants.push({
          ...stringSchema,
          enum: enumCandidate.values
        });
      } else {
        variants.push(stringSchema);
      }
    } else {
      variants.push(stringSchema);
    }
  }

  if (node.variants.integer || node.variants.number) {
    const baseType = node.variants.number ? "number" : "integer";
    if (style.typeMode === "strict") {
      const enumCandidate = inferNumberEnum(
        node.variants.integer,
        node.variants.number,
        heuristics
      );
      if (enumCandidate) {
        variants.push({
          type: baseType,
          enum: enumCandidate.values
        });
      } else {
        variants.push({ type: baseType });
      }
    } else {
      variants.push({ type: baseType });
    }
  }

  if (node.variants.boolean) {
    variants.push({ type: "boolean" });
  }

  if (node.variants.null) {
    variants.push({ type: "null" });
  }

  if (variants.length === 0) {
    return {};
  }

  if (variants.length > heuristics.maxUnionSize) {
    return {};
  }

  if (variants.length === 1) {
    return variants[0];
  }

  return {
    anyOf: variants
  };
}

function emitObjectSchema(
  variant: ObjectVariant,
  heuristics: HeuristicOptions,
  astMergeOptions: Partial<AstMergeOptions> | undefined,
  style: ResolvedEmissionStyleOptions
): JsonSchemaObject {
  if (isRecordLikeObject(variant, heuristics)) {
    const valueNode = buildRecordValueNode(variant, astMergeOptions);
    return {
      type: "object",
      additionalProperties: emitNodeSchema(valueNode, heuristics, astMergeOptions, style)
    };
  }

  const properties: JsonSchemaObject = {};
  const required: string[] = [];

  const propertyNames = [...variant.properties.keys()].sort((left, right) =>
    left.localeCompare(right)
  );

  for (const propertyName of propertyNames) {
    const property = variant.properties.get(propertyName);
    if (!property) {
      continue;
    }

    properties[propertyName] = emitNodeSchema(
      property.node,
      heuristics,
      astMergeOptions,
      style
    );
    if (
      !style.allOptionalProperties &&
      isRequired(property.seenCount, variant.count, heuristics)
    ) {
      required.push(propertyName);
    }
  }

  const schema: JsonSchemaObject = {
    type: "object",
    properties
  };

  if (required.length > 0) {
    schema.required = required;
  }

  return schema;
}

function emitArraySchema(
  variant: ArrayVariant,
  heuristics: HeuristicOptions,
  astMergeOptions: Partial<AstMergeOptions> | undefined,
  style: ResolvedEmissionStyleOptions
): JsonSchemaObject {
  if (variant.elementCount === 0) {
    return {
      type: "array",
      items: {}
    };
  }

  return {
    type: "array",
    items: emitNodeSchema(variant.element, heuristics, astMergeOptions, style)
  };
}
