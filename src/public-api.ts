import { Readable } from "node:stream";
import type { SchemaNode } from "./ast.ts";
import { emitJsonSchema } from "./emitters/json-schema.ts";
import { emitTypeScriptType } from "./emitters/typescript.ts";
import { emitZodSchema } from "./emitters/zod.ts";
import {
  detectInputFormatFromText,
  inferFromFiles,
  inferFromJsonText,
  inferFromJsonlStream,
} from "./infer.ts";
import type { InferenceFileSummary, InferenceResult } from "./infer.ts";
import { resolveInputPaths } from "./input-resolver.ts";

export type GenerationOutputFormat = "typescript" | "zod" | "json-schema";
export type GenerateInputFormat = "auto" | "jsonl" | "json";
export type GenerateTypeMode = "strict" | "loose";

export interface GenerateSchemaOptions {
  format?: GenerationOutputFormat;
  typeName?: string;
  typeMode?: GenerateTypeMode;
  allOptionalProperties?: boolean;
}

export interface GenerateFromFilesOptions extends GenerateSchemaOptions {
  inputPatterns: string[];
  inputFormat?: GenerateInputFormat;
  cwd?: string;
}

export interface GenerateFromTextOptions extends GenerateSchemaOptions {
  text: string;
  inputFormat?: GenerateInputFormat;
  sourceName?: string;
}

export interface GenerateResult {
  output: string;
  warnings: string[];
}

export async function generateFromFiles(
  options: GenerateFromFilesOptions,
): Promise<GenerateResult> {
  if (options.inputPatterns.length === 0) {
    throw new Error("No input patterns provided.");
  }

  const resolvedInputPaths = await resolveInputPaths(
    options.inputPatterns,
    options.cwd,
  );
  const inference = await inferFromFiles(resolvedInputPaths, {
    inputFormat: options.inputFormat,
  });

  return finalizeGeneration(inference, options);
}

export async function generateFromText(
  options: GenerateFromTextOptions,
): Promise<GenerateResult> {
  const sourceName = options.sourceName ?? "<text>";
  const inference = await inferFromText(options.text, {
    inputFormat: options.inputFormat,
    sourceName,
  });

  return finalizeGeneration(inference, options);
}

interface InferTextOptions {
  inputFormat?: GenerateInputFormat;
  sourceName: string;
}

async function inferFromText(
  text: string,
  options: InferTextOptions,
): Promise<InferenceResult> {
  if (options.inputFormat === "jsonl") {
    return inferFromJsonlStream(Readable.from([text]), {
      sourceName: options.sourceName,
    });
  }

  const resolvedFormat = detectInputFormatFromText(text, options.inputFormat);
  if (resolvedFormat === "json") {
    return inferFromJsonText(text, {
      sourceName: options.sourceName,
    });
  }

  return inferFromJsonlStream(Readable.from([text]), {
    sourceName: options.sourceName,
  });
}

function finalizeGeneration(
  inference: InferenceResult,
  options: GenerateSchemaOptions,
): GenerateResult {
  const format = options.format ?? "typescript";
  const typeName = options.typeName ?? "Root";
  const output = emitGenerationOutput(
    inference.root,
    format,
    options,
    typeName,
  );
  const warnings = buildWarnings(
    inference.files,
    inference.stats.recordsMerged,
  );

  return {
    output,
    warnings,
  };
}

function emitGenerationOutput(
  root: SchemaNode,
  format: GenerationOutputFormat,
  options: GenerateSchemaOptions,
  typeName: string,
): string {
  switch (format) {
    case "typescript":
      return emitTypeScriptType(root, {
        rootTypeName: typeName,
        typeMode: options.typeMode,
        allOptionalProperties: options.allOptionalProperties,
      });
    case "zod":
      return emitZodSchema(root, {
        rootTypeName: typeName,
        typeMode: options.typeMode,
        allOptionalProperties: options.allOptionalProperties,
      });
    case "json-schema":
      return `${JSON.stringify(
        emitJsonSchema(root, {
          rootTitle: typeName,
          typeMode: options.typeMode,
          allOptionalProperties: options.allOptionalProperties,
        }),
        null,
        2,
      )}\n`;
  }
}

function buildWarnings(
  fileSummaries: InferenceFileSummary[],
  recordsMerged: number,
): string[] {
  const warnings: string[] = [];

  for (const fileSummary of fileSummaries) {
    if (fileSummary.stats.parseErrors <= 0) {
      continue;
    }

    if (fileSummary.format === "jsonl") {
      warnings.push(
        `Warning: ${fileSummary.source}: skipped ${fileSummary.stats.parseErrors} line(s) that were not valid JSON.`,
      );
    } else {
      warnings.push(
        `Warning: ${fileSummary.source}: failed to parse JSON input (${fileSummary.stats.parseErrors} error).`,
      );
    }

    if (fileSummary.parseErrorLines.length > 0) {
      warnings.push(
        `Warning: ${fileSummary.source}: parse errors at lines ${fileSummary.parseErrorLines.join(", ")}.`,
      );
    }
  }

  if (recordsMerged === 0) {
    warnings.push(
      "Warning: no JSON records parsed; output schema defaults to unknown.",
    );
  }

  return warnings;
}
