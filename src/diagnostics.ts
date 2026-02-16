import type { AstMergeOptions, NodeKind, SchemaNode, StringFormatKind } from "./ast.ts";
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

export interface SchemaDiagnosticsSummary {
  nodesVisited: number;
  maxDepth: number;
  typeConflictCount: number;
  optionalFieldCount: number;
  enumCount: number;
  stringFormatCount: number;
  recordLikeObjectCount: number;
  unknownNodeCount: number;
}

export interface SchemaDiagnostics {
  summary: SchemaDiagnosticsSummary;
  conflicts: ConflictFinding[];
  optionalFields: OptionalFieldFinding[];
  enums: EnumFinding[];
  stringFormats: FormatFinding[];
  recordLikeObjects: string[];
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
      unknownNodeCount: 0
    },
    conflicts: [],
    optionalFields: [],
    enums: [],
    stringFormats: [],
    recordLikeObjects: []
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
  }

  const stringFormat = inferStringFormat(node.variants.string, heuristics);
  if (stringFormat) {
    diagnostics.summary.stringFormatCount += 1;
    pushLimited(diagnostics.stringFormats, maxFindingsPerCategory, {
      path,
      format: stringFormat.format,
      confidence: stringFormat.confidence
    });
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

    if (!isRequired(property.seenCount, node.variants.object.count, heuristics)) {
      diagnostics.summary.optionalFieldCount += 1;
      pushLimited(diagnostics.optionalFields, maxFindingsPerCategory, {
        path: `${path}.${formatPathSegment(propertyName)}`,
        presence: property.seenCount / node.variants.object.count
      });
    }

    visitNode(
      property.node,
      `${path}.${formatPathSegment(propertyName)}`,
      depth + 1,
      heuristics,
      astMergeOptions,
      maxFindingsPerCategory,
      diagnostics
    );
  }
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
