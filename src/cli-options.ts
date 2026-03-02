import type { GenerateInputFormat } from "./public-api.ts";
import type { TypeMode } from "./emitters/style.ts";

export type OutputFormat = "typescript" | "zod" | "json-schema";

export interface CliOptions {
  inputPatterns: string[];
  outputPath?: string;
  typeName: string;
  outputFormat: OutputFormat;
  inputFormat: GenerateInputFormat;
  typeMode: TypeMode;
  allOptionalProperties: boolean;
  help: boolean;
  version: boolean;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPatterns: [],
    typeName: "Root",
    outputFormat: "typescript",
    inputFormat: "auto",
    typeMode: "strict",
    allOptionalProperties: false,
    help: false,
    version: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    let arg = argv[index];

    // Support --flag=value syntax
    const eqMatch = /^(--[\w-]+=)(.*)$/.exec(arg);
    if (eqMatch) {
      const flag = eqMatch[1].slice(0, -1); // strip trailing =
      const value = eqMatch[2];
      argv = [...argv.slice(0, index), flag, value, ...argv.slice(index + 1)];
      arg = argv[index];
    }

    // -- terminator: remaining args are positionals
    if (arg === "--") {
      for (index += 1; index < argv.length; index += 1) {
        options.inputPatterns.push(argv[index]);
      }
      break;
    }

    switch (arg) {
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
      case "--input-format":
        options.inputFormat = parseInputFormat(readArgValue(argv, index, arg));
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
      case "--version":
      case "-V":
        options.version = true;
        break;
      default:
        if (!arg.startsWith("-")) {
          options.inputPatterns.push(arg);
        } else {
          throwUnsupportedCliOption(arg);
        }
    }
  }

  return options;
}

export function buildUsage(): string {
  return [
    "Usage:",
    "  shape-infer [pattern ...] [options]",
    "  cat data.json | shape-infer [options]",
    "",
    "Arguments:",
    "  [pattern ...]    Input file path(s) or glob(s). Omit to read from stdin.",
    "",
    "Options:",
    "  -o, --output       Optional output file path. Defaults to stdout.",
    "  -t, --type-name    Root TypeScript type name. Defaults to Root.",
    "  -f, --format       Output format: typescript | zod | json-schema. Defaults to typescript.",
    "  --input-format     Input format: auto | json | jsonl. Defaults to auto.",
    "  --mode             Emission strictness: strict | loose. Defaults to strict.",
    "  --all-optional     Force all object properties to optional in output schemas.",
    "  -V, --version      Print version.",
    "  -h, --help         Show usage.",
  ].join("\n");
}

function readArgValue(argv: string[], index: number, argName: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${argName}.`);
  }
  return value;
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

function parseInputFormat(value: string): GenerateInputFormat {
  switch (value.toLowerCase()) {
    case "auto":
      return "auto";
    case "json":
      return "json";
    case "jsonl":
    case "ndjson":
      return "jsonl";
    default:
      throw new Error(
        `Unsupported input format: ${value}. Use one of: auto, json, jsonl.`,
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
