import { ArrayVariant, ObjectVariant, SchemaNode } from "../ast";

export type JsonSchemaValue = null | boolean | number | string | JsonSchemaValue[] | JsonSchemaObject;

export interface JsonSchemaObject {
  [key: string]: JsonSchemaValue;
}

export interface JsonSchemaEmitterOptions {
  rootTitle?: string;
  includeSchemaDialect?: boolean;
}

export function emitJsonSchema(
  node: SchemaNode,
  options: JsonSchemaEmitterOptions = {}
): JsonSchemaObject {
  const schema = emitNodeSchema(node);

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

function emitNodeSchema(node: SchemaNode): JsonSchemaObject {
  if (node.variants.unknown) {
    return {};
  }

  const variants: JsonSchemaObject[] = [];

  if (node.variants.object) {
    variants.push(emitObjectSchema(node.variants.object));
  }

  if (node.variants.array) {
    variants.push(emitArraySchema(node.variants.array));
  }

  if (node.variants.string) {
    variants.push({ type: "string" });
  }

  if (node.variants.integer || node.variants.number) {
    variants.push({ type: "number" });
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
    anyOf: variants
  };
}

function emitObjectSchema(variant: ObjectVariant): JsonSchemaObject {
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

    properties[propertyName] = emitNodeSchema(property.node);
    if (property.seenCount === variant.count) {
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

function emitArraySchema(variant: ArrayVariant): JsonSchemaObject {
  if (variant.elementCount === 0) {
    return {
      type: "array",
      items: {}
    };
  }

  return {
    type: "array",
    items: emitNodeSchema(variant.element)
  };
}
