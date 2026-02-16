import { Readable } from "node:stream";
import { createNode, mergeValue } from "./ast.ts";
import type { AstMergeOptions, SchemaNode } from "./ast.ts";
import { analyzeSchema } from "./diagnostics.ts";
import type { SchemaDiagnostics } from "./diagnostics.ts";
import { emitJsonSchema } from "./emitters/json-schema.ts";
import { emitTypeScriptType } from "./emitters/typescript.ts";
import { emitZodSchema } from "./emitters/zod.ts";
import type { TypeMode } from "./emitters/style.ts";
import {
  detectInputFormatFromText,
  inferFromFiles,
  inferFromJsonText,
  inferFromJsonlStream
} from "./infer.ts";
import type {
  InferenceFileSummary,
  InferenceResult,
  InferenceStats,
  InputFormat
} from "./infer.ts";
import type { HeuristicOptions } from "./heuristics.ts";
import { resolveInputPaths } from "./input-resolver.ts";

export type GenerationOutputFormat = "typescript" | "zod" | "json-schema";

export interface GenerateSchemaOptions {
  format?: GenerationOutputFormat;
  typeName?: string;
  typeMode?: TypeMode;
  allOptionalProperties?: boolean;
  heuristics?: Partial<HeuristicOptions>;
  astMergeOptions?: Partial<AstMergeOptions>;
  includeDiagnostics?: boolean;
  diagnosticsMaxFindings?: number;
}

export interface GenerateFromFilesOptions extends GenerateSchemaOptions {
  inputPatterns: string[];
  inputFormat?: InputFormat;
  maxCapturedParseErrorLines?: number;
  cwd?: string;
}

export interface GenerateFromTextOptions extends GenerateSchemaOptions {
  text: string;
  inputFormat?: InputFormat;
  maxCapturedParseErrorLines?: number;
  sourceName?: string;
}

export interface GenerateFromValuesOptions extends GenerateSchemaOptions {
  values: Iterable<unknown>;
}

export interface GenerateSchemaResult {
  root: SchemaNode;
  output: string;
  format: GenerationOutputFormat;
  typeName: string;
  stats: InferenceStats;
  parseErrorLines: number[];
  files: InferenceFileSummary[];
  diagnostics?: SchemaDiagnostics;
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

export function generateFromValues(options: GenerateFromValuesOptions): GenerateSchemaResult {
  const root = createNode();
  let recordCount = 0;

  for (const value of options.values) {
    mergeValue(root, value, options.astMergeOptions);
    recordCount += 1;
  }

  const inference: InferenceResult = {
    root,
    stats: {
      linesRead: 0,
      recordsMerged: recordCount,
      parseErrors: 0,
      skippedEmptyLines: 0
    },
    parseErrorLines: [],
    files: []
  };

  return finalizeGeneration(inference, options);
}

interface InferTextOptions {
  inputFormat?: InputFormat;
  astMergeOptions?: Partial<AstMergeOptions>;
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
