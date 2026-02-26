import { DEFAULT_AST_MERGE_OPTIONS } from "./ast.ts";
import type { TypeMode } from "./emitters/style.ts";
import type { InputFormat } from "./infer.ts";
import type { HeuristicOptions } from "./heuristics.ts";

export type OutputFormat = "typescript" | "zod" | "json-schema";

export interface CliOptions {
  inputPatterns: string[];
  inputFormat: InputFormat;
  outputPath?: string;
  diagnosticsOutputPath?: string;
  typeName: string;
  outputFormat: OutputFormat;
  typeMode: TypeMode;
  allOptionalProperties: boolean;
  heuristics: Partial<HeuristicOptions>;
  maxTrackedLiteralsPerVariant: number;
  maxCapturedParseErrorLines: number;
  diagnostics: boolean;
  diagnosticsMaxFindings: number;
  help: boolean;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPatterns: [],
    inputFormat: "auto",
    typeName: "Root",
    outputFormat: "typescript",
    typeMode: "strict",
    allOptionalProperties: false,
    heuristics: {},
    maxTrackedLiteralsPerVariant:
      DEFAULT_AST_MERGE_OPTIONS.maxTrackedLiteralsPerVariant,
    maxCapturedParseErrorLines: 20,
    diagnostics: false,
    diagnosticsMaxFindings: 25,
    help: false,
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
        options.outputFormat = parseOutputFormat(
          readArgValue(argv, index, arg),
        );
        index += 1;
        break;
      case "--type-mode":
        options.typeMode = parseTypeMode(readArgValue(argv, index, arg));
        index += 1;
        break;
      case "--all-optional-properties":
        options.allOptionalProperties = true;
        break;
      case "--required-threshold":
        options.heuristics.requiredThreshold = parseBoundedNumber(
          readArgValue(argv, index, arg),
          0,
          1,
          arg,
        );
        index += 1;
        break;
      case "--enum-threshold":
        options.heuristics.enumThreshold = parseBoundedNumber(
          readArgValue(argv, index, arg),
          0,
          1,
          arg,
        );
        index += 1;
        break;
      case "--max-enum-size":
        options.heuristics.maxEnumSize = parseIntegerMin(
          readArgValue(argv, index, arg),
          2,
          arg,
        );
        index += 1;
        break;
      case "--min-enum-count":
        options.heuristics.minEnumCount = parseIntegerMin(
          readArgValue(argv, index, arg),
          1,
          arg,
        );
        index += 1;
        break;
      case "--string-format-threshold":
        options.heuristics.stringFormatThreshold = parseBoundedNumber(
          readArgValue(argv, index, arg),
          0,
          1,
          arg,
        );
        index += 1;
        break;
      case "--min-format-count":
        options.heuristics.minFormatCount = parseIntegerMin(
          readArgValue(argv, index, arg),
          1,
          arg,
        );
        index += 1;
        break;
      case "--record-min-keys":
        options.heuristics.recordMinKeys = parseIntegerMin(
          readArgValue(argv, index, arg),
          1,
          arg,
        );
        index += 1;
        break;
      case "--record-max-presence":
        options.heuristics.recordMaxPresence = parseBoundedNumber(
          readArgValue(argv, index, arg),
          0,
          1,
          arg,
        );
        index += 1;
        break;
      case "--max-union-size":
        options.heuristics.maxUnionSize = parseIntegerMin(
          readArgValue(argv, index, arg),
          1,
          arg,
        );
        index += 1;
        break;
      case "--max-tracked-literals":
        options.maxTrackedLiteralsPerVariant = parseIntegerMin(
          readArgValue(argv, index, arg),
          1,
          arg,
        );
        index += 1;
        break;
      case "--max-captured-parse-errors":
        options.maxCapturedParseErrorLines = parseIntegerMin(
          readArgValue(argv, index, arg),
          0,
          arg,
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
          arg,
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

export function buildUsage(): string {
  return [
    "Usage:",
    "  shape-infer --input <path-or-glob> [--input <path-or-glob> ...] [--input-format <format>] [--output <path>] [--type-name <name>] [--format <format>] [options]",
    "",
    "Options:",
    "  -i, --input      Input file path or glob. Repeatable.",
    "  --input-format   Input format: auto | jsonl | json. Defaults to auto.",
    "  -o, --output     Optional output file path. Defaults to stdout.",
    "  -t, --type-name  Root TypeScript type name. Defaults to Root.",
    "  -f, --format     Output format: typescript | zod | json-schema. Defaults to typescript.",
    "  --type-mode      Emission strictness: strict | loose. Defaults to strict.",
    "  --all-optional-properties  Force all object properties to optional in output schemas.",
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
    "  -h, --help       Show usage.",
  ].join("\n");
}

function readArgValue(argv: string[], index: number, argName: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${argName}.`);
  }
  return value;
}

function parseIntegerMin(
  value: string,
  minimum: number,
  argName: string,
): number {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`${argName} must be an integer >= ${minimum}.`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${argName} must be an integer >= ${minimum}.`);
  }
  return parsed;
}

function parseBoundedNumber(
  value: string,
  min: number,
  max: number,
  argName: string,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(
      `${argName} must be a finite number between ${min} and ${max}.`,
    );
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
      throw new Error(
        `Unsupported input format: ${value}. Use one of: auto, jsonl, json.`,
      );
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
        `Unsupported format: ${value}. Use one of: typescript, zod, json-schema.`,
      );
  }
}

function parseTypeMode(value: string): TypeMode {
  switch (value.toLowerCase()) {
    case "strict":
      return "strict";
    case "loose":
      return "loose";
    default:
      throw new Error(
        `Unsupported type mode: ${value}. Use one of: strict, loose.`,
      );
  }
}
