import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import {
  AstMergeOptions,
  createNode,
  mergeValue,
  resolveAstMergeOptions,
  SchemaNode
} from "./ast";

const DEFAULT_MAX_CAPTURED_PARSE_ERROR_LINES = 20;

export interface InferenceStats {
  linesRead: number;
  recordsMerged: number;
  parseErrors: number;
  skippedEmptyLines: number;
}

export interface InferenceResult {
  root: SchemaNode;
  stats: InferenceStats;
  parseErrorLines: number[];
}

export interface InferOptions {
  astMergeOptions?: Partial<AstMergeOptions>;
  maxCapturedParseErrorLines?: number;
}

export async function inferFromJsonlFile(
  filePath: string,
  options: InferOptions = {}
): Promise<InferenceResult> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  return inferFromJsonlStream(stream, options);
}

export async function inferFromJsonlStream(
  input: NodeJS.ReadableStream,
  options: InferOptions = {}
): Promise<InferenceResult> {
  const root = createNode();
  const astMergeOptions = resolveAstMergeOptions(options.astMergeOptions);
  const maxCapturedParseErrorLines = resolveMaxCapturedParseErrorLines(
    options.maxCapturedParseErrorLines
  );

  const stats: InferenceStats = {
    linesRead: 0,
    recordsMerged: 0,
    parseErrors: 0,
    skippedEmptyLines: 0
  };
  const parseErrorLines: number[] = [];

  const lineReader = createInterface({
    input,
    crlfDelay: Number.POSITIVE_INFINITY
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
        mergeValue(root, parsedRecord, astMergeOptions);
        stats.recordsMerged += 1;
      } catch {
        stats.parseErrors += 1;
        if (parseErrorLines.length < maxCapturedParseErrorLines) {
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
    parseErrorLines
  };
}

export function inferFromValues(
  values: Iterable<unknown>,
  options: InferOptions = {}
): SchemaNode {
  const root = createNode();
  const astMergeOptions = resolveAstMergeOptions(options.astMergeOptions);
  for (const value of values) {
    mergeValue(root, value, astMergeOptions);
  }
  return root;
}

function resolveMaxCapturedParseErrorLines(value?: number): number {
  const resolved = value ?? DEFAULT_MAX_CAPTURED_PARSE_ERROR_LINES;
  if (!Number.isInteger(resolved) || resolved < 0) {
    throw new Error("maxCapturedParseErrorLines must be an integer >= 0.");
  }
  return resolved;
}
