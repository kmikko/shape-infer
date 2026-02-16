import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createNode, mergeValue, SchemaNode } from "./ast";

const MAX_CAPTURED_PARSE_ERROR_LINES = 20;

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

export async function inferFromJsonlFile(filePath: string): Promise<InferenceResult> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  return inferFromJsonlStream(stream);
}

export async function inferFromJsonlStream(
  input: NodeJS.ReadableStream
): Promise<InferenceResult> {
  const root = createNode();
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
        mergeValue(root, parsedRecord);
        stats.recordsMerged += 1;
      } catch {
        stats.parseErrors += 1;
        if (parseErrorLines.length < MAX_CAPTURED_PARSE_ERROR_LINES) {
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

export function inferFromValues(values: Iterable<unknown>): SchemaNode {
  const root = createNode();
  for (const value of values) {
    mergeValue(root, value);
  }
  return root;
}
