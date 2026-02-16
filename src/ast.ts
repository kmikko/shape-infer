export type NodeKind =
  | "unknown"
  | "null"
  | "boolean"
  | "integer"
  | "number"
  | "string"
  | "array"
  | "object";

export interface PrimitiveVariant {
  kind: "unknown" | "null" | "boolean" | "integer" | "number" | "string";
  count: number;
}

export interface ArrayVariant {
  kind: "array";
  count: number;
  elementCount: number;
  element: SchemaNode;
}

export interface ObjectProperty {
  seenCount: number;
  node: SchemaNode;
}

export interface ObjectVariant {
  kind: "object";
  count: number;
  properties: Map<string, ObjectProperty>;
}

export interface VariantMap {
  unknown?: PrimitiveVariant;
  null?: PrimitiveVariant;
  boolean?: PrimitiveVariant;
  integer?: PrimitiveVariant;
  number?: PrimitiveVariant;
  string?: PrimitiveVariant;
  array?: ArrayVariant;
  object?: ObjectVariant;
}

export interface SchemaNode {
  occurrences: number;
  variants: VariantMap;
}

export function createNode(): SchemaNode {
  return {
    occurrences: 0,
    variants: {}
  };
}

export function mergeValue(node: SchemaNode, value: unknown): void {
  node.occurrences += 1;

  const kind = detectKind(value);

  switch (kind) {
    case "unknown":
    case "null":
    case "boolean":
    case "integer":
    case "number":
    case "string":
      ensurePrimitiveVariant(node, kind).count += 1;
      return;
    case "array": {
      const arrayVariant = ensureArrayVariant(node);
      arrayVariant.count += 1;
      for (const elementValue of value as unknown[]) {
        arrayVariant.elementCount += 1;
        mergeValue(arrayVariant.element, elementValue);
      }
      return;
    }
    case "object": {
      const objectVariant = ensureObjectVariant(node);
      objectVariant.count += 1;
      for (const [propertyName, propertyValue] of Object.entries(
        value as Record<string, unknown>
      )) {
        let property = objectVariant.properties.get(propertyName);
        if (!property) {
          property = {
            seenCount: 0,
            node: createNode()
          };
          objectVariant.properties.set(propertyName, property);
        }
        property.seenCount += 1;
        mergeValue(property.node, propertyValue);
      }
      return;
    }
  }
}

function detectKind(value: unknown): NodeKind {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  switch (typeof value) {
    case "boolean":
      return "boolean";
    case "number":
      if (!Number.isFinite(value)) {
        return "unknown";
      }
      return Number.isInteger(value) ? "integer" : "number";
    case "string":
      return "string";
    case "object":
      return "object";
    default:
      return "unknown";
  }
}

function ensurePrimitiveVariant(
  node: SchemaNode,
  kind: PrimitiveVariant["kind"]
): PrimitiveVariant {
  const existing = node.variants[kind];
  if (existing) {
    return existing;
  }

  const created: PrimitiveVariant = {
    kind,
    count: 0
  };
  node.variants[kind] = created;
  return created;
}

function ensureArrayVariant(node: SchemaNode): ArrayVariant {
  const existing = node.variants.array;
  if (existing) {
    return existing;
  }

  const created: ArrayVariant = {
    kind: "array",
    count: 0,
    elementCount: 0,
    element: createNode()
  };
  node.variants.array = created;
  return created;
}

function ensureObjectVariant(node: SchemaNode): ObjectVariant {
  const existing = node.variants.object;
  if (existing) {
    return existing;
  }

  const created: ObjectVariant = {
    kind: "object",
    count: 0,
    properties: new Map<string, ObjectProperty>()
  };
  node.variants.object = created;
  return created;
}
