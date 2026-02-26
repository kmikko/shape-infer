import { createNode, mergeNodes } from "./ast.ts";
import type {
  AstMergeOptions,
  NodeKind,
  ObjectVariant,
  PrimitiveVariant,
  SchemaNode,
  StringFormatKind,
} from "./ast.ts";

export interface HeuristicOptions {
  requiredThreshold: number;
  enumThreshold: number;
  maxEnumSize: number;
  minEnumCount: number;
  stringFormatThreshold: number;
  minFormatCount: number;
  recordMinKeys: number;
  recordMaxPresence: number;
  maxUnionSize: number;
}

export const DEFAULT_HEURISTIC_OPTIONS: HeuristicOptions = {
  requiredThreshold: 1,
  enumThreshold: 0.2,
  maxEnumSize: 20,
  minEnumCount: 5,
  stringFormatThreshold: 0.9,
  minFormatCount: 5,
  recordMinKeys: 40,
  recordMaxPresence: 0.35,
  maxUnionSize: 6,
};

export interface EnumCandidate<T extends string | number> {
  values: T[];
  distinctRatio: number;
}

export interface StringFormatCandidate {
  format: StringFormatKind;
  confidence: number;
}

export function resolveHeuristicOptions(
  options: Partial<HeuristicOptions> = {},
): HeuristicOptions {
  const resolved: HeuristicOptions = {
    requiredThreshold:
      options.requiredThreshold ?? DEFAULT_HEURISTIC_OPTIONS.requiredThreshold,
    enumThreshold:
      options.enumThreshold ?? DEFAULT_HEURISTIC_OPTIONS.enumThreshold,
    maxEnumSize: options.maxEnumSize ?? DEFAULT_HEURISTIC_OPTIONS.maxEnumSize,
    minEnumCount:
      options.minEnumCount ?? DEFAULT_HEURISTIC_OPTIONS.minEnumCount,
    stringFormatThreshold:
      options.stringFormatThreshold ??
      DEFAULT_HEURISTIC_OPTIONS.stringFormatThreshold,
    minFormatCount:
      options.minFormatCount ?? DEFAULT_HEURISTIC_OPTIONS.minFormatCount,
    recordMinKeys:
      options.recordMinKeys ?? DEFAULT_HEURISTIC_OPTIONS.recordMinKeys,
    recordMaxPresence:
      options.recordMaxPresence ?? DEFAULT_HEURISTIC_OPTIONS.recordMaxPresence,
    maxUnionSize:
      options.maxUnionSize ?? DEFAULT_HEURISTIC_OPTIONS.maxUnionSize,
  };

  assertRange(resolved.requiredThreshold, 0, 1, "requiredThreshold");
  assertRange(resolved.enumThreshold, 0, 1, "enumThreshold");
  assertRange(resolved.stringFormatThreshold, 0, 1, "stringFormatThreshold");
  assertRange(resolved.recordMaxPresence, 0, 1, "recordMaxPresence");

  assertIntegerMin(resolved.maxEnumSize, 2, "maxEnumSize");
  assertIntegerMin(resolved.minEnumCount, 1, "minEnumCount");
  assertIntegerMin(resolved.minFormatCount, 1, "minFormatCount");
  assertIntegerMin(resolved.recordMinKeys, 1, "recordMinKeys");
  assertIntegerMin(resolved.maxUnionSize, 1, "maxUnionSize");

  return resolved;
}

export function isRequired(
  seenCount: number,
  parentCount: number,
  options: HeuristicOptions,
): boolean {
  if (parentCount <= 0) {
    return false;
  }

  return seenCount / parentCount >= options.requiredThreshold;
}

export function inferStringEnum(
  variant: PrimitiveVariant | undefined,
  options: HeuristicOptions,
): EnumCandidate<string> | undefined {
  if (!variant || variant.kind !== "string") {
    return undefined;
  }

  return inferLiteralEnum(
    variant,
    options,
    (value) => value,
    (left, right) => left.localeCompare(right),
  );
}

export function inferNumberEnum(
  integerVariant: PrimitiveVariant | undefined,
  numberVariant: PrimitiveVariant | undefined,
  options: HeuristicOptions,
): EnumCandidate<number> | undefined {
  if (!integerVariant && !numberVariant) {
    return undefined;
  }

  if (integerVariant?.literalOverflow || numberVariant?.literalOverflow) {
    return undefined;
  }

  const totalCount = (integerVariant?.count ?? 0) + (numberVariant?.count ?? 0);
  if (totalCount < options.minEnumCount) {
    return undefined;
  }

  const merged = new Map<number, number>();
  if (integerVariant?.literals) {
    for (const [rawValue, count] of integerVariant.literals) {
      const numeric = Number(rawValue);
      if (!Number.isFinite(numeric)) {
        return undefined;
      }
      merged.set(numeric, (merged.get(numeric) ?? 0) + count);
    }
  }
  if (numberVariant?.literals) {
    for (const [rawValue, count] of numberVariant.literals) {
      const numeric = Number(rawValue);
      if (!Number.isFinite(numeric)) {
        return undefined;
      }
      merged.set(numeric, (merged.get(numeric) ?? 0) + count);
    }
  }

  const distinctCount = merged.size;
  if (distinctCount < 2 || distinctCount > options.maxEnumSize) {
    return undefined;
  }

  const distinctRatio = distinctCount / totalCount;
  if (distinctRatio > options.enumThreshold) {
    return undefined;
  }

  const values = [...merged.keys()].sort((left, right) => left - right);
  return {
    values,
    distinctRatio,
  };
}

export function inferStringFormat(
  variant: PrimitiveVariant | undefined,
  options: HeuristicOptions,
): StringFormatCandidate | undefined {
  if (
    !variant ||
    variant.kind !== "string" ||
    !variant.formatCounts ||
    variant.count === 0
  ) {
    return undefined;
  }

  let bestFormat: StringFormatKind | undefined;
  let bestCount = -1;
  for (const [format, count] of variant.formatCounts) {
    if (
      count > bestCount ||
      (count === bestCount && format < (bestFormat ?? ""))
    ) {
      bestFormat = format;
      bestCount = count;
    }
  }

  if (!bestFormat || bestCount < options.minFormatCount) {
    return undefined;
  }

  const confidence = bestCount / variant.count;
  if (confidence < options.stringFormatThreshold) {
    return undefined;
  }

  return {
    format: bestFormat,
    confidence,
  };
}

export function isRecordLikeObject(
  variant: ObjectVariant,
  options: HeuristicOptions,
): boolean {
  if (variant.count === 0) {
    return false;
  }

  if (variant.properties.size < options.recordMinKeys) {
    return false;
  }

  let maxPresence = 0;
  let totalPresence = 0;

  for (const property of variant.properties.values()) {
    const presence = property.seenCount / variant.count;
    totalPresence += presence;
    if (presence > maxPresence) {
      maxPresence = presence;
    }
  }

  const averagePresence = totalPresence / variant.properties.size;
  return (
    maxPresence <= options.recordMaxPresence &&
    averagePresence <= options.recordMaxPresence
  );
}

export function buildRecordValueNode(
  variant: ObjectVariant,
  astMergeOptions: Partial<AstMergeOptions> = {},
): SchemaNode {
  const valueNode = createNode();
  for (const property of variant.properties.values()) {
    mergeNodes(valueNode, property.node, astMergeOptions);
  }
  return valueNode;
}

export function getNodeKinds(node: SchemaNode): NodeKind[] {
  const kinds: NodeKind[] = [];
  if (node.variants.unknown) {
    kinds.push("unknown");
  }
  if (node.variants.object) {
    kinds.push("object");
  }
  if (node.variants.array) {
    kinds.push("array");
  }
  if (node.variants.string) {
    kinds.push("string");
  }
  if (node.variants.integer) {
    kinds.push("integer");
  }
  if (node.variants.number) {
    kinds.push("number");
  }
  if (node.variants.boolean) {
    kinds.push("boolean");
  }
  if (node.variants.null) {
    kinds.push("null");
  }
  return kinds;
}

function inferLiteralEnum<T extends string | number>(
  variant: PrimitiveVariant,
  options: HeuristicOptions,
  parseValue: (rawValue: string) => T,
  compareValues: (left: T, right: T) => number,
): EnumCandidate<T> | undefined {
  if (!variant.literals || variant.literalOverflow) {
    return undefined;
  }

  if (variant.count < options.minEnumCount) {
    return undefined;
  }

  const distinctCount = variant.literals.size;
  if (distinctCount < 2 || distinctCount > options.maxEnumSize) {
    return undefined;
  }

  const distinctRatio = distinctCount / variant.count;
  if (distinctRatio > options.enumThreshold) {
    return undefined;
  }

  const values = [...variant.literals.keys()]
    .map(parseValue)
    .sort(compareValues);
  return {
    values,
    distinctRatio,
  };
}

function assertRange(
  value: number,
  min: number,
  max: number,
  name: string,
): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(
      `${name} must be a finite number between ${min} and ${max}.`,
    );
  }
}

function assertIntegerMin(value: number, min: number, name: string): void {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min}.`);
  }
}
