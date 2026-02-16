#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { stderr, stdin, stdout } from "node:process";
import { emitTypeScriptType } from "./emitters/typescript";
import { inferFromJsonlFile, inferFromJsonlStream } from "./infer";

interface CliOptions {
  inputPath?: string;
  outputPath?: string;
  typeName: string;
  help: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    stdout.write(`${buildUsage()}\n`);
    return;
  }

  if (!options.inputPath && stdin.isTTY) {
    throw new Error("Missing input. Use --input <path> or pipe JSONL data through stdin.");
  }

  const inference = options.inputPath
    ? await inferFromJsonlFile(options.inputPath)
    : await inferFromJsonlStream(stdin);

  const outputText = emitTypeScriptType(inference.root, {
    rootTypeName: options.typeName
  });

  if (options.outputPath) {
    await writeFile(options.outputPath, outputText, "utf8");
  } else {
    stdout.write(outputText);
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

function readArgValue(argv: string[], index: number, argName: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${argName}.`);
  }
  return value;
}

function buildUsage(): string {
  return [
    "Usage:",
    "  schema-gen --input <path> [--output <path>] [--type-name <name>]",
    "",
    "Options:",
    "  -i, --input      JSONL file path. If omitted, read JSONL from stdin.",
    "  -o, --output     Optional output file path. Defaults to stdout.",
    "  -t, --type-name  Root TypeScript type name. Defaults to Root.",
    "  -h, --help       Show usage."
  ].join("\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
