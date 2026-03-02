import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { createInterface } from "node:readline";
import { createNode, mergeNodes, mergeValue } from "./ast.ts";
import type { SchemaNode } from "./ast.ts";

const DEFAULT_MAX_CAPTURED_PARSE_ERROR_LINES = 20;
const JSONL_EXTENSIONS = new Set([".jsonl", ".ndjson"]);
const JSON_EXTENSIONS = new Set([".json"]);

export interface InferenceStats {
  linesRead: number;
  recordsMerged: number;
  parseErrors: number;
  skippedEmptyLines: number;
}

type InputFormat = "auto" | "jsonl" | "json";
export type ResolvedInputFormat = "jsonl" | "json";

export interface InferenceFileSummary {
  source: string;
  format: ResolvedInputFormat;
  stats: InferenceStats;
  parseErrorLines: number[];
}

export interface InferenceResult {
  root: SchemaNode;
  stats: InferenceStats;
  parseErrorLines: number[];
  files: InferenceFileSummary[];
}

interface InferOptions {
  inputFormat?: InputFormat;
  sourceName?: string;
}

export async function inferFromJsonlFile(
  filePath: string,
  options: InferOptions = {},
): Promise<InferenceResult> {
  const sourceName = options.sourceName ?? filePath;
  const stream = createReadStream(filePath, { encoding: "utf8" });
  return inferFromJsonlStream(stream, {
    ...options,
    sourceName,
  });
}

export async function inferFromJsonlStream(
  input: NodeJS.ReadableStream,
  options: InferOptions = {},
): Promise<InferenceResult> {
  const root = createNode();
  const sourceName = options.sourceName ?? "<stream>";

  const stats: InferenceStats = {
    linesRead: 0,
    recordsMerged: 0,
    parseErrors: 0,
    skippedEmptyLines: 0,
  };
  const parseErrorLines: number[] = [];

  const lineReader = createInterface({
    input,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  try {
    for await (const rawLine of lineReader) {
      stats.linesRead += 1;

      const line = rawLine.trim();
      if (line.length === 0) {
        stats.skippedEmptyLines += 1;
        continue;
      }

      try {
        const parsedRecord = JSON.parse(line) as unknown;
        mergeValue(root, parsedRecord);
        stats.recordsMerged += 1;
      } catch {
        stats.parseErrors += 1;
        if (parseErrorLines.length < DEFAULT_MAX_CAPTURED_PARSE_ERROR_LINES) {
          parseErrorLines.push(stats.linesRead);
        }
      }
    }
  } finally {
    lineReader.close();
  }

  return {
    root,
    stats,
    parseErrorLines,
    files: [
      {
        source: sourceName,
        format: "jsonl",
        stats: { ...stats },
        parseErrorLines: [...parseErrorLines],
      },
    ],
  };
}

export async function inferFromJsonFile(
  filePath: string,
  options: InferOptions = {},
): Promise<InferenceResult> {
  const sourceName = options.sourceName ?? filePath;
  const fileText = await readFile(filePath, "utf8");

  return inferFromJsonText(fileText, {
    ...options,
    sourceName,
  });
}

export function inferFromJsonText(
  jsonText: string,
  options: InferOptions = {},
): InferenceResult {
  const root = createNode();
  const sourceName = options.sourceName ?? "<json>";

  const stats: InferenceStats = {
    linesRead: countLines(jsonText),
    recordsMerged: 0,
    parseErrors: 0,
    skippedEmptyLines: 0,
  };
  const parseErrorLines: number[] = [];

  try {
    const parsedValue = JSON.parse(jsonText) as unknown;
    if (Array.isArray(parsedValue)) {
      for (const value of parsedValue) {
        mergeValue(root, value);
        stats.recordsMerged += 1;
      }
    } else {
      mergeValue(root, parsedValue);
      stats.recordsMerged = 1;
    }
  } catch (error) {
    stats.parseErrors = 1;
    const parseErrorLine = extractJsonParseErrorLine(error, jsonText) ?? 1;
    parseErrorLines.push(parseErrorLine);
  }

  return {
    root,
    stats,
    parseErrorLines,
    files: [
      {
        source: sourceName,
        format: "json",
        stats: { ...stats },
        parseErrorLines: [...parseErrorLines],
      },
    ],
  };
}

export async function inferFromFile(
  filePath: string,
  options: InferOptions = {},
): Promise<InferenceResult> {
  const inputFormat = options.inputFormat ?? "auto";
  const resolvedFormat = await resolveInputFormatForFile(filePath, inputFormat);

  if (resolvedFormat === "json") {
    return inferFromJsonFile(filePath, options);
  }

  return inferFromJsonlFile(filePath, options);
}

export async function inferFromFiles(
  filePaths: string[],
  options: InferOptions = {},
): Promise<InferenceResult> {
  if (filePaths.length === 0) {
    throw new Error("No input files provided.");
  }

  const root = createNode();
  const files: InferenceFileSummary[] = [];
  const stats: InferenceStats = {
    linesRead: 0,
    recordsMerged: 0,
    parseErrors: 0,
    skippedEmptyLines: 0,
  };
  const parseErrorLines: number[] = [];

  for (const filePath of filePaths) {
    const result = await inferFromFile(filePath, {
      ...options,
      sourceName: filePath,
    });
    mergeNodes(root, result.root);
    stats.linesRead += result.stats.linesRead;
    stats.recordsMerged += result.stats.recordsMerged;
    stats.parseErrors += result.stats.parseErrors;
    stats.skippedEmptyLines += result.stats.skippedEmptyLines;
    files.push(...result.files);
    parseErrorLines.push(...result.parseErrorLines);
  }

  return {
    root,
    stats,
    parseErrorLines,
    files,
  };
}

export async function resolveInputFormatForFile(
  filePath: string,
  requestedFormat: InputFormat = "auto",
): Promise<ResolvedInputFormat> {
  if (requestedFormat !== "auto") {
    return requestedFormat;
  }

  const extension = extname(filePath).toLowerCase();
  if (JSONL_EXTENSIONS.has(extension)) {
    return "jsonl";
  }

  if (JSON_EXTENSIONS.has(extension)) {
    return "json";
  }

  const fileText = await readFile(filePath, "utf8");
  return detectInputFormatFromText(fileText, "auto");
}

export function detectInputFormatFromText(
  text: string,
  requestedFormat: InputFormat = "auto",
): ResolvedInputFormat {
  if (requestedFormat !== "auto") {
    return requestedFormat;
  }

  const firstCharacter = firstNonWhitespaceCharacter(text);
  if (firstCharacter === "[") {
    return "json";
  }

  if (firstCharacter === "{") {
    try {
      JSON.parse(text);
      return "json";
    } catch {
      return "jsonl";
    }
  }

  return "jsonl";
}

export function inferFromValues(values: Iterable<unknown>): SchemaNode {
  const root = createNode();
  for (const value of values) {
    mergeValue(root, value);
  }
  return root;
}

function countLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  let lineCount = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      lineCount += 1;
    }
  }
  return lineCount;
}

function firstNonWhitespaceCharacter(text: string): string | undefined {
  const match = text.match(/\S/);
  if (!match || typeof match.index !== "number") {
    return undefined;
  }
  return text[match.index];
}

function extractJsonParseErrorLine(
  error: unknown,
  text: string,
): number | undefined {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const positionMatch = errorMessage.match(/position\s+(\d+)/i);
  if (!positionMatch) {
    return undefined;
  }

  const positionValue = Number.parseInt(positionMatch[1], 10);
  if (!Number.isInteger(positionValue) || positionValue < 0) {
    return undefined;
  }

  return offsetToLineNumber(text, positionValue);
}

function offsetToLineNumber(text: string, offset: number): number {
  const boundedOffset = Math.max(0, Math.min(offset, text.length));
  let line = 1;

  for (let index = 0; index < boundedOffset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
    }
  }

  return line;
}
