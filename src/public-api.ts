import { Readable } from "node:stream";
import type { SchemaNode } from "./ast.ts";
import { analyzeSchema } from "./diagnostics.ts";
import { emitJsonSchema } from "./emitters/json-schema.ts";
import { emitTypeScriptType } from "./emitters/typescript.ts";
import { emitZodSchema } from "./emitters/zod.ts";
import {
  detectInputFormatFromText,
  inferFromFiles,
  inferFromJsonText,
  inferFromJsonlStream
} from "./infer.ts";
import type { InferenceFileSummary, InferenceResult } from "./infer.ts";
import { resolveInputPaths } from "./input-resolver.ts";

export type GenerationOutputFormat = "typescript" | "zod" | "json-schema";
export type GenerateInputFormat = "auto" | "jsonl" | "json";
export type GenerateTypeMode = "strict" | "loose";

export interface GenerateHeuristicOptions {
  requiredThreshold?: number;
  enumThreshold?: number;
  maxEnumSize?: number;
  minEnumCount?: number;
  stringFormatThreshold?: number;
  minFormatCount?: number;
  recordMinKeys?: number;
  recordMaxPresence?: number;
  maxUnionSize?: number;
}

export interface GenerateAstMergeOptions {
  maxTrackedLiteralsPerVariant?: number;
}

export interface GenerateInferenceStats {
  linesRead: number;
  recordsMerged: number;
  parseErrors: number;
  skippedEmptyLines: number;
}

export interface GenerateInferenceFileSummary {
  source: string;
  format: "jsonl" | "json";
  stats: GenerateInferenceStats;
  parseErrorLines: number[];
}

export interface GenerateDiagnosticsSummary {
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

export interface GenerateDiagnostics {
  summary: GenerateDiagnosticsSummary;
  conflicts: Array<{
    path: string;
    kinds: string[];
    occurrences: number;
  }>;
  optionalFields: Array<{
    path: string;
    presence: number;
  }>;
  enums: Array<{
    path: string;
    type: "string" | "number";
    valueCount: number;
    distinctRatio: number;
    preview: Array<string | number>;
  }>;
  stringFormats: Array<{
    path: string;
    format: string;
    confidence: number;
  }>;
  recordLikeObjects: string[];
  degradations: unknown[];
}

export interface GenerateSchemaOptions {
  format?: GenerationOutputFormat;
  typeName?: string;
  typeMode?: GenerateTypeMode;
  allOptionalProperties?: boolean;
  heuristics?: GenerateHeuristicOptions;
  astMergeOptions?: GenerateAstMergeOptions;
  includeDiagnostics?: boolean;
  diagnosticsMaxFindings?: number;
}

export interface GenerateFromFilesOptions extends GenerateSchemaOptions {
  inputPatterns: string[];
  inputFormat?: GenerateInputFormat;
  maxCapturedParseErrorLines?: number;
  cwd?: string;
}

export interface GenerateFromTextOptions extends GenerateSchemaOptions {
  text: string;
  inputFormat?: GenerateInputFormat;
  maxCapturedParseErrorLines?: number;
  sourceName?: string;
}

export interface GenerateSchemaResult {
  root: unknown;
  output: string;
  format: GenerationOutputFormat;
  typeName: string;
  stats: GenerateInferenceStats;
  parseErrorLines: number[];
  files: GenerateInferenceFileSummary[];
  diagnostics?: GenerateDiagnostics;
  warnings: string[];
}

export interface GenerateFromFilesResult extends GenerateSchemaResult {
  resolvedInputPaths: string[];
}

export async function generateFromFiles(
  options: GenerateFromFilesOptions
): Promise<GenerateFromFilesResult> {
  if (options.inputPatterns.length === 0) {
    throw new Error("No input patterns provided.");
  }

  const resolvedInputPaths = await resolveInputPaths(options.inputPatterns, options.cwd);
  const inference = await inferFromFiles(resolvedInputPaths, {
    astMergeOptions: options.astMergeOptions,
    inputFormat: options.inputFormat,
    maxCapturedParseErrorLines: options.maxCapturedParseErrorLines
  });
  const result = finalizeGeneration(inference, options);

  return {
    ...result,
    resolvedInputPaths
  };
}

export async function generateFromText(
  options: GenerateFromTextOptions
): Promise<GenerateSchemaResult> {
  const sourceName = options.sourceName ?? "<text>";
  const inference = await inferFromText(options.text, {
    inputFormat: options.inputFormat,
    astMergeOptions: options.astMergeOptions,
    maxCapturedParseErrorLines: options.maxCapturedParseErrorLines,
    sourceName
  });

  return finalizeGeneration(inference, options);
}

interface InferTextOptions {
  inputFormat?: GenerateInputFormat;
  astMergeOptions?: GenerateAstMergeOptions;
  maxCapturedParseErrorLines?: number;
  sourceName: string;
}

async function inferFromText(text: string, options: InferTextOptions): Promise<InferenceResult> {
  if (options.inputFormat === "jsonl") {
    return inferFromJsonlStream(Readable.from([text]), {
      astMergeOptions: options.astMergeOptions,
      maxCapturedParseErrorLines: options.maxCapturedParseErrorLines,
      sourceName: options.sourceName
    });
  }

  const resolvedFormat = detectInputFormatFromText(text, options.inputFormat);
  if (resolvedFormat === "json") {
    return inferFromJsonText(text, {
      astMergeOptions: options.astMergeOptions,
      maxCapturedParseErrorLines: options.maxCapturedParseErrorLines,
      sourceName: options.sourceName
    });
  }

  return inferFromJsonlStream(Readable.from([text]), {
    astMergeOptions: options.astMergeOptions,
    maxCapturedParseErrorLines: options.maxCapturedParseErrorLines,
    sourceName: options.sourceName
  });
}

function finalizeGeneration(
  inference: InferenceResult,
  options: GenerateSchemaOptions
): GenerateSchemaResult {
  const format = options.format ?? "typescript";
  const typeName = options.typeName ?? "Root";
  const output = emitGenerationOutput(inference.root, format, options, typeName);
  const diagnostics = options.includeDiagnostics
    ? analyzeSchema(inference.root, {
        heuristics: options.heuristics,
        astMergeOptions: options.astMergeOptions,
        maxFindingsPerCategory: options.diagnosticsMaxFindings
      })
    : undefined;
  const warnings = buildWarnings(inference.files, inference.stats.recordsMerged);

  return {
    root: inference.root,
    output,
    format,
    typeName,
    stats: inference.stats,
    parseErrorLines: inference.parseErrorLines,
    files: inference.files,
    diagnostics,
    warnings
  };
}

function emitGenerationOutput(
  root: SchemaNode,
  format: GenerationOutputFormat,
  options: GenerateSchemaOptions,
  typeName: string
): string {
  switch (format) {
    case "typescript":
      return emitTypeScriptType(root, {
        rootTypeName: typeName,
        heuristics: options.heuristics,
        astMergeOptions: options.astMergeOptions,
        typeMode: options.typeMode,
        allOptionalProperties: options.allOptionalProperties
      });
    case "zod":
      return emitZodSchema(root, {
        rootTypeName: typeName,
        heuristics: options.heuristics,
        astMergeOptions: options.astMergeOptions,
        typeMode: options.typeMode,
        allOptionalProperties: options.allOptionalProperties
      });
    case "json-schema":
      return `${JSON.stringify(
        emitJsonSchema(root, {
          rootTitle: typeName,
          heuristics: options.heuristics,
          astMergeOptions: options.astMergeOptions,
          typeMode: options.typeMode,
          allOptionalProperties: options.allOptionalProperties
        }),
        null,
        2
      )}\n`;
  }
}

function buildWarnings(
  fileSummaries: InferenceFileSummary[],
  recordsMerged: number
): string[] {
  const warnings: string[] = [];

  for (const fileSummary of fileSummaries) {
    if (fileSummary.stats.parseErrors <= 0) {
      continue;
    }

    if (fileSummary.format === "jsonl") {
      warnings.push(
        `Warning: ${fileSummary.source}: skipped ${fileSummary.stats.parseErrors} line(s) that were not valid JSON.`
      );
    } else {
      warnings.push(
        `Warning: ${fileSummary.source}: failed to parse JSON input (${fileSummary.stats.parseErrors} error).`
      );
    }

    if (fileSummary.parseErrorLines.length > 0) {
      warnings.push(
        `Warning: ${fileSummary.source}: parse errors at lines ${fileSummary.parseErrorLines.join(", ")}.`
      );
    }
  }

  if (recordsMerged === 0) {
    warnings.push("Warning: no JSON records parsed; output schema defaults to unknown.");
  }

  return warnings;
}
