export type NodeKind =
  | "unknown"
  | "null"
  | "boolean"
  | "integer"
  | "number"
  | "string"
  | "array"
  | "object";

export type StringFormatKind = "date-time" | "date" | "email" | "uuid" | "uri";

export interface PrimitiveVariant {
  kind: "unknown" | "null" | "boolean" | "integer" | "number" | "string";
  count: number;
  literals?: Map<string, number>;
  literalOverflow?: boolean;
  formatCounts?: Map<StringFormatKind, number>;
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

export interface AstMergeOptions {
  maxTrackedLiteralsPerVariant: number;
}

export const DEFAULT_AST_MERGE_OPTIONS: AstMergeOptions = {
  maxTrackedLiteralsPerVariant: 200,
};

export function createNode(): SchemaNode {
  return {
    occurrences: 0,
    variants: {},
  };
}

export function resolveAstMergeOptions(
  options: Partial<AstMergeOptions> = {},
): AstMergeOptions {
  const maxTrackedLiteralsPerVariant =
    options.maxTrackedLiteralsPerVariant ??
    DEFAULT_AST_MERGE_OPTIONS.maxTrackedLiteralsPerVariant;

  if (
    !Number.isFinite(maxTrackedLiteralsPerVariant) ||
    maxTrackedLiteralsPerVariant < 1
  ) {
    throw new Error(
      "maxTrackedLiteralsPerVariant must be a finite number >= 1.",
    );
  }

  return {
    maxTrackedLiteralsPerVariant: Math.floor(maxTrackedLiteralsPerVariant),
  };
}

export function mergeValue(
  node: SchemaNode,
  value: unknown,
  options: Partial<AstMergeOptions> = {},
): void {
  const resolvedOptions = resolveAstMergeOptions(options);
  mergeValueInternal(node, value, resolvedOptions);
}

export function mergeNodes(
  target: SchemaNode,
  source: SchemaNode,
  options: Partial<AstMergeOptions> = {},
): void {
  const resolvedOptions = resolveAstMergeOptions(options);
  mergeNodesInternal(target, source, resolvedOptions);
}

function mergeValueInternal(
  node: SchemaNode,
  value: unknown,
  options: AstMergeOptions,
): void {
  node.occurrences += 1;

  const kind = detectKind(value);

  switch (kind) {
    case "unknown":
    case "null":
    case "boolean":
    case "integer":
    case "number":
    case "string": {
      const variant = ensurePrimitiveVariant(node, kind);
      variant.count += 1;
      recordPrimitiveObservation(variant, value, options);
      return;
    }
    case "array": {
      const arrayVariant = ensureArrayVariant(node);
      arrayVariant.count += 1;
      for (const elementValue of value as unknown[]) {
        arrayVariant.elementCount += 1;
        mergeValueInternal(arrayVariant.element, elementValue, options);
      }
      return;
    }
    case "object": {
      const objectVariant = ensureObjectVariant(node);
      objectVariant.count += 1;
      for (const [propertyName, propertyValue] of Object.entries(
        value as Record<string, unknown>,
      )) {
        let property = objectVariant.properties.get(propertyName);
        if (!property) {
          property = {
            seenCount: 0,
            node: createNode(),
          };
          objectVariant.properties.set(propertyName, property);
        }
        property.seenCount += 1;
        mergeValueInternal(property.node, propertyValue, options);
      }
      return;
    }
  }
}

function mergeNodesInternal(
  target: SchemaNode,
  source: SchemaNode,
  options: AstMergeOptions,
): void {
  target.occurrences += source.occurrences;

  mergePrimitiveVariant(target, source, "unknown", options);
  mergePrimitiveVariant(target, source, "null", options);
  mergePrimitiveVariant(target, source, "boolean", options);
  mergePrimitiveVariant(target, source, "integer", options);
  mergePrimitiveVariant(target, source, "number", options);
  mergePrimitiveVariant(target, source, "string", options);

  if (source.variants.array) {
    const targetArray = ensureArrayVariant(target);
    targetArray.count += source.variants.array.count;
    targetArray.elementCount += source.variants.array.elementCount;
    mergeNodesInternal(
      targetArray.element,
      source.variants.array.element,
      options,
    );
  }

  if (source.variants.object) {
    const targetObject = ensureObjectVariant(target);
    targetObject.count += source.variants.object.count;
    for (const [propertyName, sourceProperty] of source.variants.object
      .properties) {
      let targetProperty = targetObject.properties.get(propertyName);
      if (!targetProperty) {
        targetProperty = {
          seenCount: 0,
          node: createNode(),
        };
        targetObject.properties.set(propertyName, targetProperty);
      }

      targetProperty.seenCount += sourceProperty.seenCount;
      mergeNodesInternal(targetProperty.node, sourceProperty.node, options);
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
  kind: PrimitiveVariant["kind"],
): PrimitiveVariant {
  const existing = node.variants[kind];
  if (existing) {
    return existing;
  }

  const created: PrimitiveVariant = {
    kind,
    count: 0,
  };
  node.variants[kind] = created;
  return created;
}

function mergePrimitiveVariant(
  targetNode: SchemaNode,
  sourceNode: SchemaNode,
  kind: PrimitiveVariant["kind"],
  options: AstMergeOptions,
): void {
  const sourceVariant = sourceNode.variants[kind];
  if (!sourceVariant) {
    return;
  }

  const targetVariant = ensurePrimitiveVariant(targetNode, kind);
  targetVariant.count += sourceVariant.count;

  if (sourceVariant.literalOverflow) {
    targetVariant.literalOverflow = true;
  }

  if (sourceVariant.literals) {
    for (const [literalValue, count] of sourceVariant.literals) {
      addLiteralObservation(targetVariant, literalValue, count, options);
    }
  }

  if (sourceVariant.formatCounts) {
    for (const [format, count] of sourceVariant.formatCounts) {
      addFormatObservation(targetVariant, format, count);
    }
  }
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
    element: createNode(),
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
    properties: new Map<string, ObjectProperty>(),
  };
  node.variants.object = created;
  return created;
}

function recordPrimitiveObservation(
  variant: PrimitiveVariant,
  value: unknown,
  options: AstMergeOptions,
): void {
  switch (variant.kind) {
    case "string": {
      addLiteralObservation(variant, value as string, 1, options);
      const detectedFormat = detectStringFormat(value as string);
      if (detectedFormat) {
        addFormatObservation(variant, detectedFormat, 1);
      }
      break;
    }
    case "integer":
    case "number":
    case "boolean":
      addLiteralObservation(variant, String(value), 1, options);
      break;
    default:
      break;
  }
}

function addLiteralObservation(
  variant: PrimitiveVariant,
  literalValue: string,
  incrementBy: number,
  options: AstMergeOptions,
): void {
  if (variant.literalOverflow) {
    return;
  }

  if (!variant.literals) {
    variant.literals = new Map<string, number>();
  }

  const existingCount = variant.literals.get(literalValue);
  if (existingCount !== undefined) {
    variant.literals.set(literalValue, existingCount + incrementBy);
    return;
  }

  if (variant.literals.size >= options.maxTrackedLiteralsPerVariant) {
    variant.literalOverflow = true;
    variant.literals = undefined;
    return;
  }

  variant.literals.set(literalValue, incrementBy);
}

function addFormatObservation(
  variant: PrimitiveVariant,
  format: StringFormatKind,
  incrementBy: number,
): void {
  if (!variant.formatCounts) {
    variant.formatCounts = new Map<StringFormatKind, number>();
  }

  const existingCount = variant.formatCounts.get(format) ?? 0;
  variant.formatCounts.set(format, existingCount + incrementBy);
}

function detectStringFormat(value: string): StringFormatKind | undefined {
  if (isDateTime(value)) {
    return "date-time";
  }

  if (isDate(value)) {
    return "date";
  }

  if (isEmail(value)) {
    return "email";
  }

  if (isUuid(value)) {
    return "uuid";
  }

  if (isUri(value)) {
    return "uri";
  }

  return undefined;
}

function isDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
    value,
  );
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isUri(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol.length > 1;
  } catch {
    return false;
  }
}
