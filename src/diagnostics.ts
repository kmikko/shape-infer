import type {
  AstMergeOptions,
  NodeKind,
  ObjectVariant,
  PrimitiveVariant,
  SchemaNode,
  StringFormatKind
} from "./ast.ts";
import type { InferenceStats } from "./infer.ts";
import {
  buildRecordValueNode,
  getNodeKinds,
  inferNumberEnum,
  inferStringEnum,
  inferStringFormat,
  isRecordLikeObject,
  isRequired,
  resolveHeuristicOptions
} from "./heuristics.ts";
import type { HeuristicOptions } from "./heuristics.ts";

const DEFAULT_MAX_FINDINGS_PER_CATEGORY = 25;
const RATIO_NEAR_MISS_MARGIN = 0.05;
const COUNT_NEAR_MISS_MARGIN = 2;
const FLOATING_EPSILON = Number.EPSILON * 10;

export interface DiagnosticsOptions {
  heuristics?: Partial<HeuristicOptions>;
  astMergeOptions?: Partial<AstMergeOptions>;
  maxFindingsPerCategory?: number;
}

export interface ConflictFinding {
  path: string;
  kinds: NodeKind[];
  occurrences: number;
}

export interface OptionalFieldFinding {
  path: string;
  presence: number;
}

export interface EnumFinding {
  path: string;
  type: "string" | "number";
  valueCount: number;
  distinctRatio: number;
  preview: Array<string | number>;
}

export interface FormatFinding {
  path: string;
  format: StringFormatKind;
  confidence: number;
}

export type DegradationKind =
  | "union_overflow"
  | "literal_overflow"
  | "record_like_collapsed"
  | "threshold_near_miss";

export type ThresholdNearMissMetric =
  | "required_presence"
  | "enum_sample_count"
  | "enum_distinct_count"
  | "enum_distinct_ratio"
  | "format_sample_count"
  | "format_confidence";

interface DegradationBase {
  kind: DegradationKind;
  path: string;
}

export interface UnionOverflowDegradation extends DegradationBase {
  kind: "union_overflow";
  variantCount: number;
  maxUnionSize: number;
  kinds: NodeKind[];
}

export interface LiteralOverflowDegradation extends DegradationBase {
  kind: "literal_overflow";
  primitiveKind: PrimitiveVariant["kind"];
  observedCount: number;
}

export interface RecordLikeCollapsedDegradation extends DegradationBase {
  kind: "record_like_collapsed";
  keyCount: number;
  maxPresence: number;
  averagePresence: number;
}

export interface ThresholdNearMissDegradation extends DegradationBase {
  kind: "threshold_near_miss";
  metric: ThresholdNearMissMetric;
  value: number;
  threshold: number;
  direction: "below" | "above";
  context?: string;
}

export type DegradationFinding =
  | UnionOverflowDegradation
  | LiteralOverflowDegradation
  | RecordLikeCollapsedDegradation
  | ThresholdNearMissDegradation;

export interface SchemaDiagnosticsSummary {
  nodesVisited: number;
  maxDepth: number;
  typeConflictCount: number;
  optionalFieldCount: number;
  enumCount: number;
  stringFormatCount: number;
  recordLikeObjectCount: number;
  unknownNodeCount: number;
  degradationCount: number;
  unionOverflowCount: number;
  literalOverflowCount: number;
  recordLikeCollapsedCount: number;
  thresholdNearMissCount: number;
}

export interface SchemaDiagnostics {
  summary: SchemaDiagnosticsSummary;
  conflicts: ConflictFinding[];
  optionalFields: OptionalFieldFinding[];
  enums: EnumFinding[];
  stringFormats: FormatFinding[];
  recordLikeObjects: string[];
  degradations: DegradationFinding[];
}

export function analyzeSchema(
  root: SchemaNode,
  options: DiagnosticsOptions = {}
): SchemaDiagnostics {
  const heuristics = resolveHeuristicOptions(options.heuristics);
  const maxFindingsPerCategory =
    options.maxFindingsPerCategory ?? DEFAULT_MAX_FINDINGS_PER_CATEGORY;

  if (!Number.isInteger(maxFindingsPerCategory) || maxFindingsPerCategory < 1) {
    throw new Error("maxFindingsPerCategory must be an integer >= 1.");
  }

  const diagnostics: SchemaDiagnostics = {
    summary: {
      nodesVisited: 0,
      maxDepth: 0,
      typeConflictCount: 0,
      optionalFieldCount: 0,
      enumCount: 0,
      stringFormatCount: 0,
      recordLikeObjectCount: 0,
      unknownNodeCount: 0,
      degradationCount: 0,
      unionOverflowCount: 0,
      literalOverflowCount: 0,
      recordLikeCollapsedCount: 0,
      thresholdNearMissCount: 0
    },
    conflicts: [],
    optionalFields: [],
    enums: [],
    stringFormats: [],
    recordLikeObjects: [],
    degradations: []
  };

  visitNode(
    root,
    "$",
    0,
    heuristics,
    options.astMergeOptions,
    maxFindingsPerCategory,
    diagnostics
  );

  return diagnostics;
}

export function formatDiagnosticsReport(
  diagnostics: SchemaDiagnostics,
  inferenceStats?: InferenceStats
): string {
  const lines: string[] = [];
  lines.push("Diagnostics summary:");

  if (inferenceStats) {
    lines.push(`  lines read: ${inferenceStats.linesRead}`);
    lines.push(`  records merged: ${inferenceStats.recordsMerged}`);
    lines.push(`  parse errors: ${inferenceStats.parseErrors}`);
  }

  lines.push(`  nodes visited: ${diagnostics.summary.nodesVisited}`);
  lines.push(`  max depth: ${diagnostics.summary.maxDepth}`);
  lines.push(`  type conflicts: ${diagnostics.summary.typeConflictCount}`);
  lines.push(`  optional fields: ${diagnostics.summary.optionalFieldCount}`);
  lines.push(`  enums inferred: ${diagnostics.summary.enumCount}`);
  lines.push(`  string formats inferred: ${diagnostics.summary.stringFormatCount}`);
  lines.push(`  record-like objects: ${diagnostics.summary.recordLikeObjectCount}`);
  lines.push(`  unknown nodes: ${diagnostics.summary.unknownNodeCount}`);
  lines.push(`  degradations: ${diagnostics.summary.degradationCount}`);
  lines.push(`  union overflow degradations: ${diagnostics.summary.unionOverflowCount}`);
  lines.push(`  literal overflow degradations: ${diagnostics.summary.literalOverflowCount}`);
  lines.push(
    `  record-like collapsed degradations: ${diagnostics.summary.recordLikeCollapsedCount}`
  );
  lines.push(`  threshold near misses: ${diagnostics.summary.thresholdNearMissCount}`);

  if (diagnostics.conflicts.length > 0) {
    lines.push("");
    lines.push("Top type conflicts:");
    for (const conflict of diagnostics.conflicts) {
      lines.push(`  ${conflict.path}: ${conflict.kinds.join(" | ")}`);
    }
  }

  if (diagnostics.optionalFields.length > 0) {
    lines.push("");
    lines.push("Top optional fields:");
    for (const optionalField of diagnostics.optionalFields) {
      lines.push(
        `  ${optionalField.path}: ${(optionalField.presence * 100).toFixed(1)}% presence`
      );
    }
  }

  if (diagnostics.enums.length > 0) {
    lines.push("");
    lines.push("Top inferred enums:");
    for (const entry of diagnostics.enums) {
      lines.push(
        `  ${entry.path}: ${entry.type} (${entry.valueCount} values, ratio ${entry.distinctRatio.toFixed(3)})`
      );
    }
  }

  if (diagnostics.stringFormats.length > 0) {
    lines.push("");
    lines.push("Top inferred string formats:");
    for (const entry of diagnostics.stringFormats) {
      lines.push(`  ${entry.path}: ${entry.format} (${entry.confidence.toFixed(3)})`);
    }
  }

  if (diagnostics.recordLikeObjects.length > 0) {
    lines.push("");
    lines.push("Record-like object paths:");
    for (const path of diagnostics.recordLikeObjects) {
      lines.push(`  ${path}`);
    }
  }

  if (diagnostics.degradations.length > 0) {
    lines.push("");
    lines.push("Top degradations:");
    for (const degradation of diagnostics.degradations) {
      lines.push(`  ${formatDegradation(degradation)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function visitNode(
  node: SchemaNode,
  path: string,
  depth: number,
  heuristics: HeuristicOptions,
  astMergeOptions: Partial<AstMergeOptions> | undefined,
  maxFindingsPerCategory: number,
  diagnostics: SchemaDiagnostics
): void {
  diagnostics.summary.nodesVisited += 1;
  diagnostics.summary.maxDepth = Math.max(diagnostics.summary.maxDepth, depth);

  const kinds = getNodeKinds(node);
  if (kinds.includes("unknown")) {
    diagnostics.summary.unknownNodeCount += 1;
  }

  if (kinds.length > 1) {
    diagnostics.summary.typeConflictCount += 1;
    pushLimited(diagnostics.conflicts, maxFindingsPerCategory, {
      path,
      kinds,
      occurrences: node.occurrences
    });
  }

  const emitterVariantCount = getEmitterVariantCount(node);
  if (!node.variants.unknown && emitterVariantCount > heuristics.maxUnionSize) {
    pushDegradation(
      diagnostics,
      maxFindingsPerCategory,
      {
        kind: "union_overflow",
        path,
        variantCount: emitterVariantCount,
        maxUnionSize: heuristics.maxUnionSize,
        kinds
      }
    );
  }

  for (const literalOverflow of getLiteralOverflowDegradations(node, path)) {
    pushDegradation(diagnostics, maxFindingsPerCategory, literalOverflow);
  }

  const stringEnum = inferStringEnum(node.variants.string, heuristics);
  if (stringEnum) {
    diagnostics.summary.enumCount += 1;
    pushLimited(diagnostics.enums, maxFindingsPerCategory, {
      path,
      type: "string",
      valueCount: stringEnum.values.length,
      distinctRatio: stringEnum.distinctRatio,
      preview: stringEnum.values.slice(0, 5)
    });
  } else {
    for (const nearMiss of getStringEnumNearMisses(node.variants.string, path, heuristics)) {
      pushDegradation(diagnostics, maxFindingsPerCategory, nearMiss);
    }
  }

  const numberEnum = inferNumberEnum(node.variants.integer, node.variants.number, heuristics);
  if (numberEnum) {
    diagnostics.summary.enumCount += 1;
    pushLimited(diagnostics.enums, maxFindingsPerCategory, {
      path,
      type: "number",
      valueCount: numberEnum.values.length,
      distinctRatio: numberEnum.distinctRatio,
      preview: numberEnum.values.slice(0, 5)
    });
  } else {
    for (const nearMiss of getNumberEnumNearMisses(
      node.variants.integer,
      node.variants.number,
      path,
      heuristics
    )) {
      pushDegradation(diagnostics, maxFindingsPerCategory, nearMiss);
    }
  }

  const stringFormat = inferStringFormat(node.variants.string, heuristics);
  if (stringFormat) {
    diagnostics.summary.stringFormatCount += 1;
    pushLimited(diagnostics.stringFormats, maxFindingsPerCategory, {
      path,
      format: stringFormat.format,
      confidence: stringFormat.confidence
    });
  } else {
    for (const nearMiss of getStringFormatNearMisses(node.variants.string, path, heuristics)) {
      pushDegradation(diagnostics, maxFindingsPerCategory, nearMiss);
    }
  }

  if (node.variants.array) {
    visitNode(
      node.variants.array.element,
      `${path}[]`,
      depth + 1,
      heuristics,
      astMergeOptions,
      maxFindingsPerCategory,
      diagnostics
    );
  }

  if (!node.variants.object) {
    return;
  }

  if (isRecordLikeObject(node.variants.object, heuristics)) {
    diagnostics.summary.recordLikeObjectCount += 1;
    pushLimited(diagnostics.recordLikeObjects, maxFindingsPerCategory, path);

    const presenceStats = getObjectPresenceStats(node.variants.object);
    pushDegradation(
      diagnostics,
      maxFindingsPerCategory,
      {
        kind: "record_like_collapsed",
        path,
        keyCount: node.variants.object.properties.size,
        maxPresence: presenceStats.maxPresence,
        averagePresence: presenceStats.averagePresence
      }
    );

    const valueNode = buildRecordValueNode(node.variants.object, astMergeOptions);
    visitNode(
      valueNode,
      `${path}{*}`,
      depth + 1,
      heuristics,
      astMergeOptions,
      maxFindingsPerCategory,
      diagnostics
    );
    return;
  }

  const sortedPropertyNames = [...node.variants.object.properties.keys()].sort((left, right) =>
    left.localeCompare(right)
  );

  for (const propertyName of sortedPropertyNames) {
    const property = node.variants.object.properties.get(propertyName);
    if (!property) {
      continue;
    }

    const propertyPath = `${path}.${formatPathSegment(propertyName)}`;
    const presence = property.seenCount / node.variants.object.count;

    if (!isRequired(property.seenCount, node.variants.object.count, heuristics)) {
      diagnostics.summary.optionalFieldCount += 1;
      pushLimited(diagnostics.optionalFields, maxFindingsPerCategory, {
        path: propertyPath,
        presence
      });
    }

    const requiredNearMiss = getRequiredNearMiss(propertyPath, presence, heuristics.requiredThreshold);
    if (requiredNearMiss) {
      pushDegradation(diagnostics, maxFindingsPerCategory, requiredNearMiss);
    }

    visitNode(
      property.node,
      propertyPath,
      depth + 1,
      heuristics,
      astMergeOptions,
      maxFindingsPerCategory,
      diagnostics
    );
  }
}

function getEmitterVariantCount(node: SchemaNode): number {
  let count = 0;

  if (node.variants.object) {
    count += 1;
  }
  if (node.variants.array) {
    count += 1;
  }
  if (node.variants.string) {
    count += 1;
  }
  if (node.variants.integer || node.variants.number) {
    count += 1;
  }
  if (node.variants.boolean) {
    count += 1;
  }
  if (node.variants.null) {
    count += 1;
  }

  return count;
}

function getLiteralOverflowDegradations(
  node: SchemaNode,
  path: string
): LiteralOverflowDegradation[] {
  const degradations: LiteralOverflowDegradation[] = [];

  const candidates: Array<PrimitiveVariant | undefined> = [
    node.variants.string,
    node.variants.integer,
    node.variants.number,
    node.variants.boolean
  ];

  for (const variant of candidates) {
    if (!variant?.literalOverflow) {
      continue;
    }

    degradations.push({
      kind: "literal_overflow",
      path,
      primitiveKind: variant.kind,
      observedCount: variant.count
    });
  }

  return degradations;
}

function getRequiredNearMiss(
  path: string,
  presence: number,
  threshold: number
): ThresholdNearMissDegradation | undefined {
  if (presence >= threshold || threshold <= 0) {
    return undefined;
  }

  const delta = threshold - presence;
  if (delta > RATIO_NEAR_MISS_MARGIN + FLOATING_EPSILON) {
    return undefined;
  }

  return {
    kind: "threshold_near_miss",
    path,
    metric: "required_presence",
    value: presence,
    threshold,
    direction: "below"
  };
}

function getStringEnumNearMisses(
  variant: PrimitiveVariant | undefined,
  path: string,
  heuristics: HeuristicOptions
): ThresholdNearMissDegradation[] {
  if (!variant || variant.kind !== "string" || variant.literalOverflow || !variant.literals) {
    return [];
  }

  const nearMisses: ThresholdNearMissDegradation[] = [];

  if (
    variant.count < heuristics.minEnumCount &&
    heuristics.minEnumCount - variant.count <= COUNT_NEAR_MISS_MARGIN &&
    variant.count > 0
  ) {
    nearMisses.push({
      kind: "threshold_near_miss",
      path,
      metric: "enum_sample_count",
      value: variant.count,
      threshold: heuristics.minEnumCount,
      direction: "below",
      context: "string"
    });
  }

  const distinctCount = variant.literals.size;
  if (distinctCount < 2) {
    return nearMisses;
  }

  if (
    distinctCount > heuristics.maxEnumSize &&
    distinctCount - heuristics.maxEnumSize <= COUNT_NEAR_MISS_MARGIN
  ) {
    nearMisses.push({
      kind: "threshold_near_miss",
      path,
      metric: "enum_distinct_count",
      value: distinctCount,
      threshold: heuristics.maxEnumSize,
      direction: "above",
      context: "string"
    });
  }

  if (variant.count > 0) {
    const distinctRatio = distinctCount / variant.count;
    if (
      distinctRatio > heuristics.enumThreshold &&
      distinctRatio - heuristics.enumThreshold <= RATIO_NEAR_MISS_MARGIN + FLOATING_EPSILON
    ) {
      nearMisses.push({
        kind: "threshold_near_miss",
        path,
        metric: "enum_distinct_ratio",
        value: distinctRatio,
        threshold: heuristics.enumThreshold,
        direction: "above",
        context: "string"
      });
    }
  }

  return nearMisses;
}

function getNumberEnumNearMisses(
  integerVariant: PrimitiveVariant | undefined,
  numberVariant: PrimitiveVariant | undefined,
  path: string,
  heuristics: HeuristicOptions
): ThresholdNearMissDegradation[] {
  if (!integerVariant && !numberVariant) {
    return [];
  }

  if (integerVariant?.literalOverflow || numberVariant?.literalOverflow) {
    return [];
  }

  const nearMisses: ThresholdNearMissDegradation[] = [];
  const totalCount = (integerVariant?.count ?? 0) + (numberVariant?.count ?? 0);

  if (
    totalCount < heuristics.minEnumCount &&
    heuristics.minEnumCount - totalCount <= COUNT_NEAR_MISS_MARGIN &&
    totalCount > 0
  ) {
    nearMisses.push({
      kind: "threshold_near_miss",
      path,
      metric: "enum_sample_count",
      value: totalCount,
      threshold: heuristics.minEnumCount,
      direction: "below",
      context: "number"
    });
  }

  const mergedLiterals = new Set<number>();

  if (integerVariant?.literals) {
    for (const rawValue of integerVariant.literals.keys()) {
      const value = Number(rawValue);
      if (!Number.isFinite(value)) {
        return nearMisses;
      }
      mergedLiterals.add(value);
    }
  }

  if (numberVariant?.literals) {
    for (const rawValue of numberVariant.literals.keys()) {
      const value = Number(rawValue);
      if (!Number.isFinite(value)) {
        return nearMisses;
      }
      mergedLiterals.add(value);
    }
  }

  const distinctCount = mergedLiterals.size;
  if (distinctCount < 2 || totalCount <= 0) {
    return nearMisses;
  }

  if (
    distinctCount > heuristics.maxEnumSize &&
    distinctCount - heuristics.maxEnumSize <= COUNT_NEAR_MISS_MARGIN
  ) {
    nearMisses.push({
      kind: "threshold_near_miss",
      path,
      metric: "enum_distinct_count",
      value: distinctCount,
      threshold: heuristics.maxEnumSize,
      direction: "above",
      context: "number"
    });
  }

  const distinctRatio = distinctCount / totalCount;
  if (
    distinctRatio > heuristics.enumThreshold &&
    distinctRatio - heuristics.enumThreshold <= RATIO_NEAR_MISS_MARGIN + FLOATING_EPSILON
  ) {
    nearMisses.push({
      kind: "threshold_near_miss",
      path,
      metric: "enum_distinct_ratio",
      value: distinctRatio,
      threshold: heuristics.enumThreshold,
      direction: "above",
      context: "number"
    });
  }

  return nearMisses;
}

function getStringFormatNearMisses(
  variant: PrimitiveVariant | undefined,
  path: string,
  heuristics: HeuristicOptions
): ThresholdNearMissDegradation[] {
  if (!variant || variant.kind !== "string" || !variant.formatCounts || variant.count === 0) {
    return [];
  }

  let bestFormat: StringFormatKind | undefined;
  let bestCount = -1;

  for (const [format, count] of variant.formatCounts) {
    if (count > bestCount || (count === bestCount && format < (bestFormat ?? ""))) {
      bestFormat = format;
      bestCount = count;
    }
  }

  if (!bestFormat || bestCount < 0) {
    return [];
  }

  const nearMisses: ThresholdNearMissDegradation[] = [];

  if (
    bestCount < heuristics.minFormatCount &&
    heuristics.minFormatCount - bestCount <= COUNT_NEAR_MISS_MARGIN
  ) {
    nearMisses.push({
      kind: "threshold_near_miss",
      path,
      metric: "format_sample_count",
      value: bestCount,
      threshold: heuristics.minFormatCount,
      direction: "below",
      context: bestFormat
    });
  }

  const confidence = bestCount / variant.count;
  if (
    confidence < heuristics.stringFormatThreshold &&
    heuristics.stringFormatThreshold - confidence <= RATIO_NEAR_MISS_MARGIN + FLOATING_EPSILON
  ) {
    nearMisses.push({
      kind: "threshold_near_miss",
      path,
      metric: "format_confidence",
      value: confidence,
      threshold: heuristics.stringFormatThreshold,
      direction: "below",
      context: bestFormat
    });
  }

  return nearMisses;
}

function getObjectPresenceStats(variant: ObjectVariant): {
  maxPresence: number;
  averagePresence: number;
} {
  if (variant.count <= 0 || variant.properties.size === 0) {
    return {
      maxPresence: 0,
      averagePresence: 0
    };
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

  return {
    maxPresence,
    averagePresence: totalPresence / variant.properties.size
  };
}

function formatPathSegment(propertyName: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(propertyName)
    ? propertyName
    : JSON.stringify(propertyName);
}

function pushLimited<T>(target: T[], limit: number, value: T): void {
  if (target.length < limit) {
    target.push(value);
  }
}

function pushDegradation(
  diagnostics: SchemaDiagnostics,
  limit: number,
  degradation: DegradationFinding
): void {
  diagnostics.summary.degradationCount += 1;

  switch (degradation.kind) {
    case "union_overflow":
      diagnostics.summary.unionOverflowCount += 1;
      break;
    case "literal_overflow":
      diagnostics.summary.literalOverflowCount += 1;
      break;
    case "record_like_collapsed":
      diagnostics.summary.recordLikeCollapsedCount += 1;
      break;
    case "threshold_near_miss":
      diagnostics.summary.thresholdNearMissCount += 1;
      break;
  }

  pushLimited(diagnostics.degradations, limit, degradation);
}

function formatDegradation(degradation: DegradationFinding): string {
  switch (degradation.kind) {
    case "union_overflow":
      return `${degradation.path}: union_overflow (${degradation.variantCount} variants > max ${degradation.maxUnionSize})`;
    case "literal_overflow":
      return `${degradation.path}: literal_overflow (${degradation.primitiveKind}, count ${degradation.observedCount})`;
    case "record_like_collapsed":
      return `${degradation.path}: record_like_collapsed (${degradation.keyCount} keys, max presence ${degradation.maxPresence.toFixed(3)}, avg ${degradation.averagePresence.toFixed(3)})`;
    case "threshold_near_miss":
      return `${degradation.path}: threshold_near_miss (${degradation.metric}, ${degradation.direction}, value ${degradation.value.toFixed(3)}, threshold ${degradation.threshold.toFixed(3)}${degradation.context ? `, context ${degradation.context}` : ""})`;
  }
}
