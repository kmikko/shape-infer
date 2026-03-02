#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { stderr, stdin, stdout } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const _require = createRequire(import.meta.url);
const { version } = _require("../package.json") as { version: string };
import { buildUsage, parseCliArgs } from "./cli-options.ts";
import type { CliOptions } from "./cli-options.ts";
import { generateFromFiles, generateFromText } from "./public-api.ts";
import type { GenerateSchemaOptions } from "./public-api.ts";

export interface CliIo {
  stdin: NodeJS.ReadableStream & { isTTY?: boolean };
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

const DEFAULT_CLI_IO: CliIo = {
  stdin,
  stdout,
  stderr,
};

export async function runCli(
  argv: string[],
  io: CliIo = DEFAULT_CLI_IO,
): Promise<void> {
  const options = parseCliArgs(argv);

  if (options.help) {
    io.stdout.write(`${buildUsage()}\n`);
    return;
  }

  if (options.version) {
    io.stdout.write(`${version}\n`);
    return;
  }

  if (options.inputPatterns.length === 0 && io.stdin.isTTY) {
    throw new Error("shape-infer: no input. Try 'shape-infer --help'.");
  }

  const generationOptions = resolveGenerationOptions(options);
  const generation =
    options.inputPatterns.length > 0
      ? await generateFromFiles({
          ...generationOptions,
          inputPatterns: options.inputPatterns,
          inputFormat: options.inputFormat,
        })
      : await generateFromText({
          ...generationOptions,
          text: await readStdinText(io.stdin),
          sourceName: "<stdin>",
          inputFormat: options.inputFormat,
        });

  if (options.outputPath) {
    await writeFile(options.outputPath, generation.output, "utf8");
  } else {
    io.stdout.write(generation.output);
  }

  for (const warning of generation.warnings) {
    io.stderr.write(`${warning}\n`);
  }
}

async function readStdinText(input: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of input) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(Buffer.from(chunk));
    }
  }

  return Buffer.concat(chunks).toString("utf8");
}

function resolveGenerationOptions(options: CliOptions): GenerateSchemaOptions {
  return {
    format: options.outputFormat,
    typeName: options.typeName,
    typeMode: options.typeMode,
    allOptionalProperties: options.allOptionalProperties,
  };
}

export function isDirectExecution(
  entry: string | undefined = process.argv[1],
  moduleUrl: string = import.meta.url,
): boolean {
  if (!entry) {
    return false;
  }

  try {
    const realEntry = realpathSync(resolve(entry));
    const realModule = fileURLToPath(moduleUrl);
    return realpathSync(realModule) === realEntry;
  } catch {
    return moduleUrl === pathToFileURL(resolve(entry)).href;
  }
}

export function launchCliFromProcessArgs(
  argv: string[] = process.argv,
  io: CliIo = DEFAULT_CLI_IO,
  errorOutput: NodeJS.WritableStream = stderr,
): Promise<void> | undefined {
  if (!isDirectExecution(argv[1])) {
    return undefined;
  }

  return runCli(argv.slice(2), io).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    errorOutput.write(`Error: ${message}\n`);
    process.exitCode = 1;
  });
}

void launchCliFromProcessArgs();
