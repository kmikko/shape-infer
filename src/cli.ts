#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { stderr, stdin, stdout } from "node:process";
import { Readable } from "node:stream";
import { DEFAULT_AST_MERGE_OPTIONS, SchemaNode } from "./ast";
import { analyzeSchema, formatDiagnosticsReport } from "./diagnostics";
import { emitJsonSchema } from "./emitters/json-schema";
import { emitTypeScriptType } from "./emitters/typescript";
import { emitZodSchema } from "./emitters/zod";
import {
  InputFormat,
  InferenceFileSummary,
  detectInputFormatFromText,
  inferFromFiles,
  inferFromJsonText,
  inferFromJsonlStream
} from "./infer";
import { HeuristicOptions, resolveHeuristicOptions } from "./heuristics";
import { resolveInputPaths } from "./input-resolver";

type OutputFormat = "typescript" | "zod" | "json-schema";

interface CliOptions {
  inputPatterns: string[];
  inputFormat: InputFormat;
  outputPath?: string;
  diagnosticsOutputPath?: string;
  typeName: string;
  outputFormat: OutputFormat;
  heuristics: Partial<HeuristicOptions>;
  maxTrackedLiteralsPerVariant: number;
  maxCapturedParseErrorLines: number;
  diagnostics: boolean;
  diagnosticsMaxFindings: number;
  help: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const heuristics = resolveHeuristicOptions(options.heuristics);
  const astMergeOptions = {
    maxTrackedLiteralsPerVariant: options.maxTrackedLiteralsPerVariant
  };

  if (options.help) {
    stdout.write(`${buildUsage()}\n`);
    return;
  }

  if (options.inputPatterns.length === 0 && stdin.isTTY) {
    throw new Error(
      "Missing input. Use --input <path/glob> (repeatable) or pipe data through stdin."
    );
  }

  const inference =
    options.inputPatterns.length > 0
      ? await inferFromInputFiles(options, astMergeOptions)
      : await inferFromStdin(options, astMergeOptions);

  const outputText = emitOutput(inference.root, options, heuristics, astMergeOptions);

  if (options.outputPath) {
    await writeFile(options.outputPath, outputText, "utf8");
  } else {
    stdout.write(outputText);
  }

  if (options.diagnostics || options.diagnosticsOutputPath) {
    const diagnostics = analyzeSchema(inference.root, {
      heuristics,
      astMergeOptions,
      maxFindingsPerCategory: options.diagnosticsMaxFindings
    });

    if (options.diagnostics) {
      stderr.write(formatDiagnosticsReport(diagnostics, inference.stats));
    }

    if (options.diagnosticsOutputPath) {
      await writeFile(
        options.diagnosticsOutputPath,
        `${JSON.stringify(diagnostics, null, 2)}\n`,
        "utf8"
      );
    }
  }

  emitParseWarnings(inference.files);

  if (inference.stats.recordsMerged === 0) {
    stderr.write("Warning: no JSON records parsed; output schema defaults to unknown.\n");
  }
}

async function inferFromInputFiles(
  options: CliOptions,
  astMergeOptions: { maxTrackedLiteralsPerVariant: number }
) {
  const resolvedInputPaths = await resolveInputPaths(options.inputPatterns);
  return inferFromFiles(resolvedInputPaths, {
    astMergeOptions,
    maxCapturedParseErrorLines: options.maxCapturedParseErrorLines,
    inputFormat: options.inputFormat
  });
}

async function inferFromStdin(
  options: CliOptions,
  astMergeOptions: { maxTrackedLiteralsPerVariant: number }
) {
  if (options.inputFormat === "jsonl") {
    return inferFromJsonlStream(stdin, {
      astMergeOptions,
      maxCapturedParseErrorLines: options.maxCapturedParseErrorLines,
      sourceName: "<stdin>"
    });
  }

  const stdinText = await readStdinText();
  const resolvedFormat = detectInputFormatFromText(stdinText, options.inputFormat);

  if (resolvedFormat === "json") {
    return inferFromJsonText(stdinText, {
      astMergeOptions,
      maxCapturedParseErrorLines: options.maxCapturedParseErrorLines,
      sourceName: "<stdin>"
    });
  }

  return inferFromJsonlStream(Readable.from([stdinText]), {
    astMergeOptions,
    maxCapturedParseErrorLines: options.maxCapturedParseErrorLines,
    sourceName: "<stdin>"
  });
}

function emitParseWarnings(fileSummaries: InferenceFileSummary[]): void {
  for (const fileSummary of fileSummaries) {
    if (fileSummary.stats.parseErrors <= 0) {
      continue;
    }

    if (fileSummary.format === "jsonl") {
      stderr.write(
        `Warning: ${fileSummary.source}: skipped ${fileSummary.stats.parseErrors} line(s) that were not valid JSON.\n`
      );
    } else {
      stderr.write(
        `Warning: ${fileSummary.source}: failed to parse JSON input (${fileSummary.stats.parseErrors} error).\n`
      );
    }

    if (fileSummary.parseErrorLines.length > 0) {
      stderr.write(
        `Warning: ${fileSummary.source}: parse errors at lines ${fileSummary.parseErrorLines.join(", ")}.\n`
      );
    }
  }
}

async function readStdinText(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of stdin) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(Buffer.from(chunk));
    }
  }

  return Buffer.concat(chunks).toString("utf8");
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPatterns: [],
    inputFormat: "auto",
    typeName: "Root",
    outputFormat: "typescript",
    heuristics: {},
    maxTrackedLiteralsPerVariant: DEFAULT_AST_MERGE_OPTIONS.maxTrackedLiteralsPerVariant,
    maxCapturedParseErrorLines: 20,
    diagnostics: false,
    diagnosticsMaxFindings: 25,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--input":
      case "-i":
        options.inputPatterns.push(readArgValue(argv, index, arg));
        index += 1;
        break;
      case "--input-format":
        options.inputFormat = parseInputFormat(readArgValue(argv, index, arg));
        index += 1;
        break;
      case "--output":
      case "-o":
        options.outputPath = readArgValue(argv, index, arg);
        index += 1;
        break;
      case "--type-name":
      case "-t":
        options.typeName = readArgValue(argv, index, arg);
        index += 1;
        break;
      case "--format":
      case "-f":
        options.outputFormat = parseOutputFormat(readArgValue(argv, index, arg));
        index += 1;
        break;
      case "--required-threshold":
        options.heuristics.requiredThreshold = parseBoundedNumber(
          readArgValue(argv, index, arg),
          0,
          1,
          arg
        );
        index += 1;
        break;
      case "--enum-threshold":
        options.heuristics.enumThreshold = parseBoundedNumber(
          readArgValue(argv, index, arg),
          0,
          1,
          arg
        );
        index += 1;
        break;
      case "--max-enum-size":
        options.heuristics.maxEnumSize = parseIntegerMin(readArgValue(argv, index, arg), 2, arg);
        index += 1;
        break;
      case "--min-enum-count":
        options.heuristics.minEnumCount = parseIntegerMin(readArgValue(argv, index, arg), 1, arg);
        index += 1;
        break;
      case "--string-format-threshold":
        options.heuristics.stringFormatThreshold = parseBoundedNumber(
          readArgValue(argv, index, arg),
          0,
          1,
          arg
        );
        index += 1;
        break;
      case "--min-format-count":
        options.heuristics.minFormatCount = parseIntegerMin(readArgValue(argv, index, arg), 1, arg);
        index += 1;
        break;
      case "--record-min-keys":
        options.heuristics.recordMinKeys = parseIntegerMin(readArgValue(argv, index, arg), 1, arg);
        index += 1;
        break;
      case "--record-max-presence":
        options.heuristics.recordMaxPresence = parseBoundedNumber(
          readArgValue(argv, index, arg),
          0,
          1,
          arg
        );
        index += 1;
        break;
      case "--max-union-size":
        options.heuristics.maxUnionSize = parseIntegerMin(readArgValue(argv, index, arg), 1, arg);
        index += 1;
        break;
      case "--max-tracked-literals":
        options.maxTrackedLiteralsPerVariant = parseIntegerMin(
          readArgValue(argv, index, arg),
          1,
          arg
        );
        index += 1;
        break;
      case "--max-captured-parse-errors":
        options.maxCapturedParseErrorLines = parseIntegerMin(
          readArgValue(argv, index, arg),
          0,
          arg
        );
        index += 1;
        break;
      case "--diagnostics":
        options.diagnostics = true;
        break;
      case "--diagnostics-output":
        options.diagnosticsOutputPath = readArgValue(argv, index, arg);
        index += 1;
        break;
      case "--diagnostics-max-findings":
        options.diagnosticsMaxFindings = parseIntegerMin(
          readArgValue(argv, index, arg),
          1,
          arg
        );
        index += 1;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function emitOutput(
  rootNode: SchemaNode,
  options: CliOptions,
  heuristics: HeuristicOptions,
  astMergeOptions: { maxTrackedLiteralsPerVariant: number }
): string {
  switch (options.outputFormat) {
    case "typescript":
      return emitTypeScriptType(rootNode, {
        rootTypeName: options.typeName,
        heuristics,
        astMergeOptions
      });
    case "zod":
      return emitZodSchema(rootNode, {
        rootTypeName: options.typeName,
        heuristics,
        astMergeOptions
      });
    case "json-schema":
      return `${JSON.stringify(
        emitJsonSchema(rootNode, {
          rootTitle: options.typeName,
          heuristics,
          astMergeOptions
        }),
        null,
        2
      )}\n`;
  }
}

function readArgValue(argv: string[], index: number, argName: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${argName}.`);
  }
  return value;
}

function parseIntegerMin(value: string, minimum: number, argName: string): number {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`${argName} must be an integer >= ${minimum}.`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${argName} must be an integer >= ${minimum}.`);
  }
  return parsed;
}

function parseBoundedNumber(value: string, min: number, max: number, argName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${argName} must be a finite number between ${min} and ${max}.`);
  }
  return parsed;
}

function parseInputFormat(value: string): InputFormat {
  switch (value.toLowerCase()) {
    case "auto":
      return "auto";
    case "jsonl":
    case "ndjson":
      return "jsonl";
    case "json":
      return "json";
    default:
      throw new Error(`Unsupported input format: ${value}. Use one of: auto, jsonl, json.`);
  }
}

function parseOutputFormat(value: string): OutputFormat {
  switch (value.toLowerCase()) {
    case "ts":
    case "typescript":
      return "typescript";
    case "zod":
      return "zod";
    case "json-schema":
    case "jsonschema":
    case "schema":
      return "json-schema";
    default:
      throw new Error(
        `Unsupported format: ${value}. Use one of: typescript, zod, json-schema.`
      );
  }
}

function buildUsage(): string {
  return [
    "Usage:",
    "  schema-gen --input <path-or-glob> [--input <path-or-glob> ...] [--input-format <format>] [--output <path>] [--type-name <name>] [--format <format>] [phase-3 options]",
    "",
    "Options:",
    "  -i, --input      Input file path or glob. Repeatable.",
    "  --input-format   Input format: auto | jsonl | json. Defaults to auto.",
    "  -o, --output     Optional output file path. Defaults to stdout.",
    "  -t, --type-name  Root TypeScript type name. Defaults to Root.",
    "  -f, --format     Output format: typescript | zod | json-schema. Defaults to typescript.",
    "  --required-threshold      Property requiredness threshold (0..1). Defaults to 1.",
    "  --enum-threshold          Max distinct-ratio for enum inference (0..1). Defaults to 0.2.",
    "  --max-enum-size           Max enum literal count. Defaults to 20.",
    "  --min-enum-count          Min sample count for enum inference. Defaults to 5.",
    "  --string-format-threshold Min confidence for string format inference (0..1). Defaults to 0.9.",
    "  --min-format-count        Min sample count for string format inference. Defaults to 5.",
    "  --record-min-keys         Min key count to treat object as record-like. Defaults to 40.",
    "  --record-max-presence     Max per-key presence ratio for record-like objects (0..1). Defaults to 0.35.",
    "  --max-union-size          Max allowed union variants before falling back to unknown. Defaults to 6.",
    "  --max-tracked-literals    Max distinct literals tracked per primitive node. Defaults to 200.",
    "  --max-captured-parse-errors Max parse-error line numbers to retain. Defaults to 20.",
    "  --diagnostics             Print diagnostics summary to stderr.",
    "  --diagnostics-output      Write diagnostics JSON report to file.",
    "  --diagnostics-max-findings Max entries per diagnostics category. Defaults to 25.",
    "  -h, --help       Show usage."
  ].join("\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
