import type { TypeMode } from "./emitters/style.ts";
import type { InputFormat } from "./infer.ts";

export type OutputFormat = "typescript" | "zod" | "json-schema";

export interface CliOptions {
  inputPatterns: string[];
  inputFormat: InputFormat;
  outputPath?: string;
  typeName: string;
  outputFormat: OutputFormat;
  typeMode: TypeMode;
  allOptionalProperties: boolean;
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
      case "--mode":
        options.typeMode = parseTypeMode(readArgValue(argv, index, arg));
        index += 1;
        break;
      case "--all-optional":
        options.allOptionalProperties = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throwUnsupportedCliOption(arg);
    }
  }

  return options;
}

export function buildUsage(): string {
  return [
    "Usage:",
    "  shape-infer --input <path-or-glob> [--input <path-or-glob> ...] [--input-format <format>] [--output <path>] [--type-name <name>] [--format <format>] [--mode <strict|loose>] [--all-optional] [options]",
    "",
    "Options:",
    "  -i, --input      Input file path or glob. Repeatable.",
    "  --input-format   Input format: auto | jsonl | json. Defaults to auto.",
    "  -o, --output     Optional output file path. Defaults to stdout.",
    "  -t, --type-name  Root TypeScript type name. Defaults to Root.",
    "  -f, --format     Output format: typescript | zod | json-schema. Defaults to typescript.",
    "  --mode           Emission strictness: strict | loose. Defaults to strict.",
    "  --all-optional   Force all object properties to optional in output schemas.",
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

function throwUnsupportedCliOption(arg: string): never {
  const removedOptions = new Map<string, string>([
    ["--type-mode", "Use --mode instead."],
    ["--optional-fields", "Use --all-optional instead."],
    ["--all-optional-properties", "Use --all-optional instead."],
    [
      "--required-threshold",
      "Advanced heuristic tuning has been removed from the CLI.",
    ],
    [
      "--enum-threshold",
      "Advanced heuristic tuning has been removed from the CLI.",
    ],
    [
      "--max-enum-size",
      "Advanced heuristic tuning has been removed from the CLI.",
    ],
    [
      "--min-enum-count",
      "Advanced heuristic tuning has been removed from the CLI.",
    ],
    [
      "--string-format-threshold",
      "Advanced heuristic tuning has been removed from the CLI.",
    ],
    [
      "--min-format-count",
      "Advanced heuristic tuning has been removed from the CLI.",
    ],
    [
      "--record-min-keys",
      "Advanced heuristic tuning has been removed from the CLI.",
    ],
    [
      "--record-max-presence",
      "Advanced heuristic tuning has been removed from the CLI.",
    ],
    [
      "--max-union-size",
      "Advanced heuristic tuning has been removed from the CLI.",
    ],
    [
      "--max-tracked-literals",
      "Advanced heuristic tuning has been removed from the CLI.",
    ],
    [
      "--max-captured-parse-errors",
      "Advanced parse-error tuning has been removed from the CLI.",
    ],
    ["--diagnostics", "Diagnostics output has been removed from the CLI."],
    [
      "--diagnostics-output",
      "Diagnostics output has been removed from the CLI.",
    ],
    [
      "--diagnostics-max-findings",
      "Diagnostics output has been removed from the CLI.",
    ],
  ]);

  const message = removedOptions.get(arg);
  if (message) {
    throw new Error(`Removed argument: ${arg}. ${message}`);
  }

  throw new Error(`Unknown argument: ${arg}`);
}
