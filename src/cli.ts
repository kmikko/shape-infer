#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { stderr, stdin, stdout } from "node:process";
import { DEFAULT_AST_MERGE_OPTIONS, SchemaNode } from "./ast";
import { analyzeSchema, formatDiagnosticsReport } from "./diagnostics";
import { emitJsonSchema } from "./emitters/json-schema";
import { emitTypeScriptType } from "./emitters/typescript";
import { emitZodSchema } from "./emitters/zod";
import { inferFromJsonlFile, inferFromJsonlStream } from "./infer";
import { HeuristicOptions, resolveHeuristicOptions } from "./heuristics";

type OutputFormat = "typescript" | "zod" | "json-schema";

interface CliOptions {
  inputPath?: string;
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

  if (!options.inputPath && stdin.isTTY) {
    throw new Error("Missing input. Use --input <path> or pipe JSONL data through stdin.");
  }

  const inference = options.inputPath
    ? await inferFromJsonlFile(options.inputPath, {
        astMergeOptions,
        maxCapturedParseErrorLines: options.maxCapturedParseErrorLines
      })
    : await inferFromJsonlStream(stdin, {
        astMergeOptions,
        maxCapturedParseErrorLines: options.maxCapturedParseErrorLines
      });

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

  if (inference.stats.parseErrors > 0) {
    stderr.write(
      `Warning: skipped ${inference.stats.parseErrors} line(s) that were not valid JSON.\n`
    );
    if (inference.parseErrorLines.length > 0) {
      stderr.write(`Warning: parse errors at lines ${inference.parseErrorLines.join(", ")}.\n`);
    }
  }

  if (inference.stats.recordsMerged === 0) {
    stderr.write("Warning: no JSON records parsed; output schema defaults to unknown.\n");
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
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
        options.inputPath = readArgValue(argv, index, arg);
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
  const parsed = Number.parseInt(value, 10);
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
    "  schema-gen --input <path> [--output <path>] [--type-name <name>] [--format <format>] [phase-3 options]",
    "",
    "Options:",
    "  -i, --input      JSONL file path. If omitted, read JSONL from stdin.",
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
