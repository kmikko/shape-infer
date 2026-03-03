import { createNode, mergeNodes } from "./ast.ts";
import type {
  AstMergeOptions,
  ObjectVariant,
  PrimitiveVariant,
  SchemaNode,
  StringFormatKind,
} from "./ast.ts";

const REQUIRED_THRESHOLD = 1;
const ENUM_THRESHOLD = 0.2;
const MAX_ENUM_SIZE = 20;
const MIN_ENUM_COUNT = 5;
const STRING_FORMAT_THRESHOLD = 0.9;
const MIN_FORMAT_COUNT = 5;
const RECORD_MIN_KEYS = 40;
const RECORD_MAX_PRESENCE = 0.35;
const PATTERN_KEY_SEPARATORS = ["-", "_", "/", "."] as const;
const PATTERN_MIN_KEYS = 6;
const PATTERN_MIN_SEGMENTS = 2;

interface EnumCandidate<T extends string | number> {
  values: T[];
  distinctRatio: number;
}

interface StringFormatCandidate {
  format: StringFormatKind;
  confidence: number;
}

export function isRequired(seenCount: number, parentCount: number): boolean {
  if (parentCount <= 0) {
    return false;
  }

  return seenCount / parentCount >= REQUIRED_THRESHOLD;
}

export function inferStringEnum(
  variant: PrimitiveVariant | undefined,
): EnumCandidate<string> | undefined {
  if (!variant || variant.kind !== "string") {
    return undefined;
  }

  return inferLiteralEnum(
    variant,
    (value) => value,
    (left, right) => left.localeCompare(right),
  );
}

export function inferNumberEnum(
  integerVariant: PrimitiveVariant | undefined,
  numberVariant: PrimitiveVariant | undefined,
): EnumCandidate<number> | undefined {
  if (!integerVariant && !numberVariant) {
    return undefined;
  }

  if (integerVariant?.literalOverflow || numberVariant?.literalOverflow) {
    return undefined;
  }

  const totalCount = (integerVariant?.count ?? 0) + (numberVariant?.count ?? 0);
  if (totalCount < MIN_ENUM_COUNT) {
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
  if (distinctCount < 2 || distinctCount > MAX_ENUM_SIZE) {
    return undefined;
  }

  const distinctRatio = distinctCount / totalCount;
  if (distinctRatio > ENUM_THRESHOLD) {
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

  if (!bestFormat || bestCount < MIN_FORMAT_COUNT) {
    return undefined;
  }

  const confidence = bestCount / variant.count;
  if (confidence < STRING_FORMAT_THRESHOLD) {
    return undefined;
  }

  return {
    format: bestFormat,
    confidence,
  };
}

export function isRecordLikeObject(variant: ObjectVariant): boolean {
  if (variant.count === 0) {
    return false;
  }

  if (variant.properties.size < RECORD_MIN_KEYS) {
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
    maxPresence <= RECORD_MAX_PRESENCE && averagePresence <= RECORD_MAX_PRESENCE
  );
}

export function inferKeyPattern(variant: ObjectVariant): boolean {
  if (variant.properties.size < PATTERN_MIN_KEYS) {
    return false;
  }

  const keys = [...variant.properties.keys()];

  for (const separator of PATTERN_KEY_SEPARATORS) {
    const segmentCounts = keys.map((key) => key.split(separator).length);
    const firstCount = segmentCounts[0];
    if (
      firstCount >= PATTERN_MIN_SEGMENTS &&
      segmentCounts.every((count) => count === firstCount)
    ) {
      return true;
    }
  }

  return false;
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

function inferLiteralEnum<T extends string | number>(
  variant: PrimitiveVariant,
  parseValue: (rawValue: string) => T,
  compareValues: (left: T, right: T) => number,
): EnumCandidate<T> | undefined {
  if (!variant.literals || variant.literalOverflow) {
    return undefined;
  }

  if (variant.count < MIN_ENUM_COUNT) {
    return undefined;
  }

  const distinctCount = variant.literals.size;
  if (distinctCount < 2 || distinctCount > MAX_ENUM_SIZE) {
    return undefined;
  }

  const distinctRatio = distinctCount / variant.count;
  if (distinctRatio > ENUM_THRESHOLD) {
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
