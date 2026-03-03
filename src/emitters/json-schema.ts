import type {
  ArrayVariant,
  AstMergeOptions,
  ObjectVariant,
  SchemaNode,
} from "../ast.ts";
import {
  buildRecordValueNode,
  inferKeyPattern,
  inferNumberEnum,
  inferStringEnum,
  inferStringFormat,
  isRecordLikeObject,
  isRequired,
} from "../heuristics.ts";
import { resolveEmissionStyleOptions } from "./style.ts";
import type {
  EmissionStyleOptions,
  ResolvedEmissionStyleOptions,
} from "./style.ts";
import { isPrototypeUnsafePropertyName } from "./property-name-safety.ts";

export type JsonSchemaValue =
  | null
  | boolean
  | number
  | string
  | JsonSchemaValue[]
  | JsonSchemaObject;

export interface JsonSchemaObject {
  [key: string]: JsonSchemaValue;
}

interface JsonSchemaEmitterOptions extends EmissionStyleOptions {
  rootTitle?: string;
  includeSchemaDialect?: boolean;
  astMergeOptions?: Partial<AstMergeOptions>;
}

export function emitJsonSchema(
  node: SchemaNode,
  options: JsonSchemaEmitterOptions = {},
): JsonSchemaObject {
  const style = resolveEmissionStyleOptions(options);
  const schema = emitNodeSchema(node, options.astMergeOptions, style);

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
  astMergeOptions: Partial<AstMergeOptions> | undefined,
  style: ResolvedEmissionStyleOptions,
): JsonSchemaObject {
  if (node.variants.unknown) {
    return {};
  }

  const variants: JsonSchemaObject[] = [];

  if (node.variants.object) {
    variants.push(
      emitObjectSchema(node.variants.object, astMergeOptions, style),
    );
  }

  if (node.variants.array) {
    variants.push(emitArraySchema(node.variants.array, astMergeOptions, style));
  }

  if (node.variants.string) {
    const stringSchema: JsonSchemaObject = { type: "string" };
    const formatCandidate = inferStringFormat(node.variants.string);
    if (formatCandidate) {
      stringSchema.format = formatCandidate.format;
    }

    if (style.typeMode === "strict") {
      const enumCandidate = inferStringEnum(node.variants.string);
      if (enumCandidate) {
        variants.push({
          ...stringSchema,
          enum: enumCandidate.values,
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
      );
      if (enumCandidate) {
        variants.push({
          type: baseType,
          enum: enumCandidate.values,
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

  if (variants.length === 1) {
    return variants[0];
  }

  return {
    anyOf: variants,
  };
}

function emitObjectSchema(
  variant: ObjectVariant,
  astMergeOptions: Partial<AstMergeOptions> | undefined,
  style: ResolvedEmissionStyleOptions,
): JsonSchemaObject {
  if (
    (style.typeMode === "loose" && inferKeyPattern(variant)) ||
    isRecordLikeObject(variant)
  ) {
    const valueNode = buildRecordValueNode(variant, astMergeOptions);
    return {
      type: "object",
      additionalProperties: emitNodeSchema(valueNode, astMergeOptions, style),
    };
  }

  const properties: JsonSchemaObject = {};
  const guardedPatternProperties: JsonSchemaObject = {};
  const required: string[] = [];

  const propertyNames = [...variant.properties.keys()].sort((left, right) =>
    left.localeCompare(right),
  );

  for (const propertyName of propertyNames) {
    const property = variant.properties.get(propertyName);
    if (!property) {
      continue;
    }

    const propertySchema = emitNodeSchema(
      property.node,
      astMergeOptions,
      style,
    );
    if (isPrototypeUnsafePropertyName(propertyName)) {
      guardedPatternProperties[`^${escapeRegExp(propertyName)}$`] =
        propertySchema;
    } else {
      properties[propertyName] = propertySchema;
    }
    if (
      !style.allOptionalProperties &&
      isRequired(property.seenCount, variant.count) &&
      !isPrototypeUnsafePropertyName(propertyName)
    ) {
      required.push(propertyName);
    }
  }

  const schema: JsonSchemaObject = {
    type: "object",
    properties,
  };

  if (required.length > 0) {
    schema.required = required;
  }

  if (Object.keys(guardedPatternProperties).length > 0) {
    schema.patternProperties = guardedPatternProperties;
  }

  return schema;
}

function emitArraySchema(
  variant: ArrayVariant,
  astMergeOptions: Partial<AstMergeOptions> | undefined,
  style: ResolvedEmissionStyleOptions,
): JsonSchemaObject {
  if (variant.elementCount === 0) {
    return {
      type: "array",
      items: {},
    };
  }

  return {
    type: "array",
    items: emitNodeSchema(variant.element, astMergeOptions, style),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
