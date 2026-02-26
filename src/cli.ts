#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stderr, stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { buildUsage, parseCliArgs } from "./cli-options.ts";
import type { CliOptions } from "./cli-options.ts";
import { formatDiagnosticsReport } from "./diagnostics.ts";
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
  stderr
};

export async function runCli(argv: string[], io: CliIo = DEFAULT_CLI_IO): Promise<void> {
  const options = parseCliArgs(argv);

  if (options.help) {
    io.stdout.write(`${buildUsage()}\n`);
    return;
  }

  if (options.inputPatterns.length === 0 && io.stdin.isTTY) {
    throw new Error(
      "Missing input. Use --input <path/glob> (repeatable) or pipe data through stdin."
    );
  }

  const generationOptions = resolveGenerationOptions(options);
  const generation =
    options.inputPatterns.length > 0
      ? await generateFromFiles({
          ...generationOptions,
          inputPatterns: options.inputPatterns,
          inputFormat: options.inputFormat,
          maxCapturedParseErrorLines: options.maxCapturedParseErrorLines
        })
      : await generateFromText({
          ...generationOptions,
          text: await readStdinText(io.stdin),
          inputFormat: options.inputFormat,
          maxCapturedParseErrorLines: options.maxCapturedParseErrorLines,
          sourceName: "<stdin>"
        });

  if (options.outputPath) {
    await writeFile(options.outputPath, generation.output, "utf8");
  } else {
    io.stdout.write(generation.output);
  }

  if (options.diagnostics) {
    if (!generation.diagnostics) {
      throw new Error("Diagnostics were requested but were not generated.");
    }

    io.stderr.write(
      formatDiagnosticsReport(
        generation.diagnostics as unknown as Parameters<typeof formatDiagnosticsReport>[0],
        generation.stats
      )
    );
    if (options.typeMode === "loose") {
      io.stderr.write(
        "Diagnostics note: loose type mode collapses inferred literal enums to primitive base types.\n"
      );
    }
    if (options.allOptionalProperties) {
      io.stderr.write(
        "Diagnostics note: all optional mode forces every object property to optional in emitted schemas.\n"
      );
    }
  }

  if (options.diagnosticsOutputPath) {
    if (!generation.diagnostics) {
      throw new Error("Diagnostics output was requested but diagnostics were not generated.");
    }
    await writeFile(
      options.diagnosticsOutputPath,
      `${JSON.stringify(generation.diagnostics, null, 2)}\n`,
      "utf8"
    );
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
    heuristics: options.heuristics,
    astMergeOptions: {
      maxTrackedLiteralsPerVariant: options.maxTrackedLiteralsPerVariant
    },
    includeDiagnostics: options.diagnostics || Boolean(options.diagnosticsOutputPath),
    diagnosticsMaxFindings: options.diagnosticsMaxFindings
  };
}

export function isDirectExecution(
  entry: string | undefined = process.argv[1],
  moduleUrl: string = import.meta.url
): boolean {
  if (!entry) {
    return false;
  }

  return moduleUrl === pathToFileURL(resolve(entry)).href;
}

export function launchCliFromProcessArgs(
  argv: string[] = process.argv,
  io: CliIo = DEFAULT_CLI_IO,
  errorOutput: NodeJS.WritableStream = stderr
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
