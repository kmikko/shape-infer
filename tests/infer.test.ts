import { Readable } from "node:stream";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  detectInputFormatFromText,
  inferFromFile,
  inferFromFiles,
  inferFromJsonFile,
  inferFromJsonlFile,
  inferFromJsonlStream,
  inferFromJsonText,
  resolveInputFormatForFile,
} from "../src/infer.ts";
import { withTempDir } from "./helpers.ts";

describe("infer", () => {
  test("detectInputFormatFromText auto-detects json and jsonl", () => {
    expect(detectInputFormatFromText('[{"id":1}]', "auto")).toBe("json");
    expect(detectInputFormatFromText('{"id":1}', "auto")).toBe("json");
    expect(detectInputFormatFromText('{"id":1}\n{"id":2}\n', "auto")).toBe(
      "jsonl",
    );
    expect(detectInputFormatFromText("   \n\t", "auto")).toBe("jsonl");
    expect(detectInputFormatFromText('{"id":1}\n', "jsonl")).toBe("jsonl");
    expect(detectInputFormatFromText('{"id":1}\n', "json")).toBe("json");
  });

  test("inferFromJsonText merges top-level array values", () => {
    const result = inferFromJsonText('[{"id":1},{"id":"2"}]', {
      sourceName: "array.json",
    });

    expect(result.stats.recordsMerged).toBe(2);
    expect(result.stats.parseErrors).toBe(0);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].source).toBe("array.json");
    expect(result.files[0].format).toBe("json");
  });

  test("inferFromJsonText parses a top-level object as one record", () => {
    const result = inferFromJsonText('{"id":1}', {
      sourceName: "single.json",
    });

    expect(result.stats.recordsMerged).toBe(1);
    expect(result.stats.parseErrors).toBe(0);
    expect(result.files[0].format).toBe("json");
  });

  test("inferFromJsonText captures parse errors with line information", () => {
    const result = inferFromJsonText('{\n  "id": 1,\n  "name":\n}\n', {
      sourceName: "broken.json",
    });

    expect(result.stats.recordsMerged).toBe(0);
    expect(result.stats.parseErrors).toBe(1);
    expect(result.parseErrorLines).toHaveLength(1);
    expect(result.parseErrorLines[0]).toBeGreaterThanOrEqual(1);
  });

  test("inferFromJsonText handles empty input text", () => {
    const result = inferFromJsonText("", {
      sourceName: "empty.json",
    });

    expect(result.stats.linesRead).toBe(0);
    expect(result.stats.recordsMerged).toBe(0);
    expect(result.stats.parseErrors).toBe(1);
    expect(result.parseErrorLines).toContain(1);
  });

  test("inferFromJsonText uses parse error position when present", () => {
    const originalParse = JSON.parse;

    try {
      JSON.parse = (() => {
        throw new Error("Synthetic JSON parse failure at position 4.");
      }) as typeof JSON.parse;

      const result = inferFromJsonText("a\nb\nc", {
        sourceName: "synthetic.json",
      });

      expect(result.stats.parseErrors).toBe(1);
      expect(result.parseErrorLines).toEqual([3]);
    } finally {
      JSON.parse = originalParse;
    }
  });

  test("inferFromJsonText falls back to line 1 when parse position is invalid", () => {
    const originalParse = JSON.parse;

    try {
      JSON.parse = (() => {
        throw new Error("Synthetic JSON parse failure at position -1.");
      }) as typeof JSON.parse;

      const result = inferFromJsonText("a\nb\nc", {
        sourceName: "synthetic-invalid-position.json",
      });

      expect(result.stats.parseErrors).toBe(1);
      expect(result.parseErrorLines).toEqual([1]);
    } finally {
      JSON.parse = originalParse;
    }
  });

  test("inferFromJsonText falls back when parse position overflows number range", () => {
    const originalParse = JSON.parse;

    try {
      JSON.parse = (() => {
        throw new Error(
          `Synthetic JSON parse failure at position ${"9".repeat(400)}.`,
        );
      }) as typeof JSON.parse;

      const result = inferFromJsonText("a\nb\nc", {
        sourceName: "synthetic-overflow-position.json",
      });

      expect(result.stats.parseErrors).toBe(1);
      expect(result.parseErrorLines).toEqual([1]);
    } finally {
      JSON.parse = originalParse;
    }
  });

  test("resolveInputFormatForFile uses extension first, then content fallback", async () => {
    await withTempDir("shape-infer-infer-", async (directory) => {
      const jsonlFile = path.join(directory, "events.ndjson");
      const jsonFile = path.join(directory, "events.json");
      const unknownJsonFile = path.join(directory, "ambiguous.data");
      const unknownJsonlFile = path.join(directory, "ambiguous.log");

      await writeFile(jsonlFile, '{"id":1}\n{"id":2}\n', "utf8");
      await writeFile(jsonFile, '{"id":1}', "utf8");
      await writeFile(unknownJsonFile, '[{"id":1}]', "utf8");
      await writeFile(unknownJsonlFile, '{"id":1}\n{"id":2}\n', "utf8");

      await expect(resolveInputFormatForFile(jsonlFile, "auto")).resolves.toBe(
        "jsonl",
      );
      await expect(resolveInputFormatForFile(jsonFile, "auto")).resolves.toBe(
        "json",
      );
      await expect(
        resolveInputFormatForFile(unknownJsonFile, "auto"),
      ).resolves.toBe("json");
      await expect(
        resolveInputFormatForFile(unknownJsonlFile, "auto"),
      ).resolves.toBe("jsonl");
    });
  });

  test("resolveInputFormatForFile respects explicit format override", async () => {
    await withTempDir("shape-infer-infer-", async (directory) => {
      const inputFile = path.join(directory, "events.any");
      await writeFile(inputFile, '{"id":1}\n{"id":2}\n', "utf8");

      await expect(resolveInputFormatForFile(inputFile, "json")).resolves.toBe(
        "json",
      );
      await expect(resolveInputFormatForFile(inputFile, "jsonl")).resolves.toBe(
        "jsonl",
      );
    });
  });

  test("inferFromFiles merges mixed jsonl and json inputs in auto mode", async () => {
    await withTempDir("shape-infer-infer-", async (directory) => {
      const jsonlFile = path.join(directory, "part-a.jsonl");
      const jsonFile = path.join(directory, "part-b.json");

      await writeFile(jsonlFile, '{"id":1}\n{"id":2}\n', "utf8");
      await writeFile(jsonFile, '[{"id":"3"}]', "utf8");

      const result = await inferFromFiles([jsonlFile, jsonFile], {
        inputFormat: "auto",
      });

      expect(result.stats.recordsMerged).toBe(3);
      expect(result.stats.parseErrors).toBe(0);
      expect(result.files).toHaveLength(2);
      expect(result.files.map((entry) => entry.format)).toEqual([
        "jsonl",
        "json",
      ]);
    });
  });

  test("inferFromFiles tracks skipped empty JSONL lines", async () => {
    await withTempDir("shape-infer-infer-", async (directory) => {
      const jsonlFile = path.join(directory, "empty-lines.jsonl");
      await writeFile(jsonlFile, '\n{"id":1}\n\n{"id":2}\n', "utf8");

      const result = await inferFromFiles([jsonlFile], {
        inputFormat: "auto",
      });

      expect(result.stats.linesRead).toBe(4);
      expect(result.stats.recordsMerged).toBe(2);
      expect(result.stats.skippedEmptyLines).toBe(2);
      expect(result.files[0].stats.skippedEmptyLines).toBe(2);
    });
  });

  test("inferFromFiles throws on empty input file list", async () => {
    await expect(inferFromFiles([], { inputFormat: "auto" })).rejects.toThrow(
      /No input files provided/,
    );
  });

  test("file and stream helpers use default source names and inferFromFile defaults to auto format", async () => {
    await withTempDir("shape-infer-infer-", async (directory) => {
      const jsonlFile = path.join(directory, "records.jsonl");
      const jsonFile = path.join(directory, "records.json");

      await writeFile(jsonlFile, '{"id":1}\n{"id":2}\n', "utf8");
      await writeFile(jsonFile, '{"id":1}', "utf8");

      const jsonlFileResult = await inferFromJsonlFile(jsonlFile);
      expect(jsonlFileResult.files[0].source).toBe(jsonlFile);

      const jsonFileResult = await inferFromJsonFile(jsonFile);
      expect(jsonFileResult.files[0].source).toBe(jsonFile);

      const streamResult = await inferFromJsonlStream(
        Readable.from(['{"id":1}\n']),
      );
      expect(streamResult.files[0].source).toBe("<stream>");

      const inferFromFileResult = await inferFromFile(jsonlFile);
      expect(inferFromFileResult.files[0].format).toBe("jsonl");
    });
  });

  test("inferFromJsonText falls back when error thrown is not an Error object", () => {
    const originalParse = JSON.parse;

    try {
      JSON.parse = (() => {
        // Throw a plain non-Error value with no position info — exercises the String(error) branch
        throw "unexpected character";
      }) as typeof JSON.parse;

      const result = inferFromJsonText("a\nb", {
        sourceName: "non-error.json",
      });

      // String(error) path: no "position \d+" match → extractJsonParseErrorLine returns undefined
      // → falls back to line 1
      expect(result.stats.parseErrors).toBe(1);
      expect(result.parseErrorLines).toEqual([1]);
    } finally {
      JSON.parse = originalParse;
    }
  });

  test("inferFromJsonlStream handles trailing newlines and empty lines", async () => {
    const content = '\n{"id":1}\n\n{"id":2}\n';
    const stream = Readable.from([content]);
    const result = await inferFromJsonlStream(stream, {
      sourceName: "trailing.jsonl",
    });

    expect(result.stats.linesRead).toBe(4);
    expect(result.stats.recordsMerged).toBe(2);
    expect(result.stats.skippedEmptyLines).toBe(2);
    expect(result.stats.parseErrors).toBe(0);
    expect(result.files[0].source).toBe("trailing.jsonl");
    expect(result.files[0].format).toBe("jsonl");
  });

  test("inferFromJsonlStream handles mixed valid and invalid lines", async () => {
    const content = '{"id":1}\nBAD_JSON\n{"id":2}\nALSO_BAD\n';
    const stream = Readable.from([content]);
    const result = await inferFromJsonlStream(stream, {
      sourceName: "mixed.jsonl",
    });

    expect(result.stats.linesRead).toBe(4);
    expect(result.stats.recordsMerged).toBe(2);
    expect(result.stats.parseErrors).toBe(2);
    expect(result.parseErrorLines).toEqual([2, 4]);
  });

  test("inferFromJsonlStream caps captured parse error lines at default limit", async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `BAD_LINE_${i}`).join(
      "\n",
    );
    const stream = Readable.from([lines]);
    const result = await inferFromJsonlStream(stream, {
      sourceName: "capped.jsonl",
    });

    expect(result.stats.parseErrors).toBe(10);
    expect(result.parseErrorLines).toHaveLength(10);
  });
});
