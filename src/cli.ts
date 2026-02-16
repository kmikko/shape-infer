#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stderr, stdin, stdout } from "node:process";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import type { SchemaNode } from "./ast.ts";
import { buildUsage, parseCliArgs } from "./cli-options.ts";
import type { CliOptions } from "./cli-options.ts";
import { analyzeSchema, formatDiagnosticsReport } from "./diagnostics.ts";
import { emitJsonSchema } from "./emitters/json-schema.ts";
import { emitTypeScriptType } from "./emitters/typescript.ts";
import { emitZodSchema } from "./emitters/zod.ts";
import {
  detectInputFormatFromText,
  inferFromFiles,
  inferFromJsonText,
  inferFromJsonlStream
} from "./infer.ts";
import type { InferenceFileSummary } from "./infer.ts";
import { resolveHeuristicOptions } from "./heuristics.ts";
import type { HeuristicOptions } from "./heuristics.ts";
import { resolveInputPaths } from "./input-resolver.ts";

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
  const heuristics = resolveHeuristicOptions(options.heuristics);
  const astMergeOptions = {
    maxTrackedLiteralsPerVariant: options.maxTrackedLiteralsPerVariant
  };

  if (options.help) {
    io.stdout.write(`${buildUsage()}\n`);
    return;
  }

  if (options.inputPatterns.length === 0 && io.stdin.isTTY) {
    throw new Error(
      "Missing input. Use --input <path/glob> (repeatable) or pipe data through stdin."
    );
  }

  const inference =
    options.inputPatterns.length > 0
      ? await inferFromInputFiles(options, astMergeOptions)
      : await inferFromStdin(options, astMergeOptions, io.stdin);

  const outputText = emitOutput(inference.root, options, heuristics, astMergeOptions);

  if (options.outputPath) {
    await writeFile(options.outputPath, outputText, "utf8");
  } else {
    io.stdout.write(outputText);
  }

  if (options.diagnostics || options.diagnosticsOutputPath) {
    const diagnostics = analyzeSchema(inference.root, {
      heuristics,
      astMergeOptions,
      maxFindingsPerCategory: options.diagnosticsMaxFindings
    });

    if (options.diagnostics) {
      io.stderr.write(formatDiagnosticsReport(diagnostics, inference.stats));
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
      await writeFile(
        options.diagnosticsOutputPath,
        `${JSON.stringify(diagnostics, null, 2)}\n`,
        "utf8"
      );
    }
  }

  emitParseWarnings(inference.files, io.stderr);

  if (inference.stats.recordsMerged === 0) {
    io.stderr.write("Warning: no JSON records parsed; output schema defaults to unknown.\n");
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
  astMergeOptions: { maxTrackedLiteralsPerVariant: number },
  input: NodeJS.ReadableStream
) {
  if (options.inputFormat === "jsonl") {
    return inferFromJsonlStream(input, {
      astMergeOptions,
      maxCapturedParseErrorLines: options.maxCapturedParseErrorLines,
      sourceName: "<stdin>"
    });
  }

  const stdinText = await readStdinText(input);
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

function emitParseWarnings(
  fileSummaries: InferenceFileSummary[],
  output: NodeJS.WritableStream
): void {
  for (const fileSummary of fileSummaries) {
    if (fileSummary.stats.parseErrors <= 0) {
      continue;
    }

    if (fileSummary.format === "jsonl") {
      output.write(
        `Warning: ${fileSummary.source}: skipped ${fileSummary.stats.parseErrors} line(s) that were not valid JSON.\n`
      );
    } else {
      output.write(
        `Warning: ${fileSummary.source}: failed to parse JSON input (${fileSummary.stats.parseErrors} error).\n`
      );
    }

    if (fileSummary.parseErrorLines.length > 0) {
      output.write(
        `Warning: ${fileSummary.source}: parse errors at lines ${fileSummary.parseErrorLines.join(", ")}.\n`
      );
    }
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
        astMergeOptions,
        typeMode: options.typeMode,
        allOptionalProperties: options.allOptionalProperties
      });
    case "zod":
      return emitZodSchema(rootNode, {
        rootTypeName: options.typeName,
        heuristics,
        astMergeOptions,
        typeMode: options.typeMode,
        allOptionalProperties: options.allOptionalProperties
      });
    case "json-schema":
      return `${JSON.stringify(
        emitJsonSchema(rootNode, {
          rootTitle: options.typeName,
          heuristics,
          astMergeOptions,
          typeMode: options.typeMode,
          allOptionalProperties: options.allOptionalProperties
        }),
        null,
        2
      )}\n`;
  }
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isDirectExecution()) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
  });
}
