import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  detectInputFormatFromText,
  inferFromFiles,
  inferFromJsonText,
  resolveInputFormatForFile
} from "../src/infer.ts";
import { withTempDir } from "./helpers.ts";

describe("infer", () => {
  test("detectInputFormatFromText auto-detects json and jsonl", () => {
    expect(detectInputFormatFromText('[{"id":1}]', "auto")).toBe("json");
    expect(detectInputFormatFromText('{"id":1}', "auto")).toBe("json");
    expect(detectInputFormatFromText('{"id":1}\n{"id":2}\n', "auto")).toBe("jsonl");
    expect(detectInputFormatFromText("   \n\t", "auto")).toBe("jsonl");
    expect(detectInputFormatFromText('{"id":1}\n', "jsonl")).toBe("jsonl");
    expect(detectInputFormatFromText('{"id":1}\n', "json")).toBe("json");
  });

  test("inferFromJsonText merges top-level array values", () => {
    const result = inferFromJsonText('[{"id":1},{"id":"2"}]', {
      sourceName: "array.json"
    });

    expect(result.stats.recordsMerged).toBe(2);
    expect(result.stats.parseErrors).toBe(0);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].source).toBe("array.json");
    expect(result.files[0].format).toBe("json");
  });

  test("inferFromJsonText parses a top-level object as one record", () => {
    const result = inferFromJsonText('{"id":1}', {
      sourceName: "single.json"
    });

    expect(result.stats.recordsMerged).toBe(1);
    expect(result.stats.parseErrors).toBe(0);
    expect(result.files[0].format).toBe("json");
  });

  test("inferFromJsonText captures parse errors with line information", () => {
    const result = inferFromJsonText('{\n  "id": 1,\n  "name":\n}\n', {
      sourceName: "broken.json"
    });

    expect(result.stats.recordsMerged).toBe(0);
    expect(result.stats.parseErrors).toBe(1);
    expect(result.parseErrorLines).toHaveLength(1);
    expect(result.parseErrorLines[0]).toBeGreaterThanOrEqual(1);
  });

  test("inferFromJsonText can skip parse error line capture", () => {
    const result = inferFromJsonText('{\n  "id": 1,\n  "name":\n}\n', {
      sourceName: "broken-no-lines.json",
      maxCapturedParseErrorLines: 0
    });

    expect(result.stats.recordsMerged).toBe(0);
    expect(result.stats.parseErrors).toBe(1);
    expect(result.parseErrorLines).toEqual([]);
  });

  test("inferFromJsonText handles empty input text", () => {
    const result = inferFromJsonText("", {
      sourceName: "empty.json"
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
        sourceName: "synthetic.json"
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
        sourceName: "synthetic-invalid-position.json"
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
        throw new Error(`Synthetic JSON parse failure at position ${"9".repeat(400)}.`);
      }) as typeof JSON.parse;

      const result = inferFromJsonText("a\nb\nc", {
        sourceName: "synthetic-overflow-position.json"
      });

      expect(result.stats.parseErrors).toBe(1);
      expect(result.parseErrorLines).toEqual([1]);
    } finally {
      JSON.parse = originalParse;
    }
  });

  test("inferFromJsonText validates maxCapturedParseErrorLines", () => {
    expect(() =>
      inferFromJsonText("{}", {
        maxCapturedParseErrorLines: -1
      })
    ).toThrow(/maxCapturedParseErrorLines must be an integer >= 0/);

    expect(() =>
      inferFromJsonText("{}", {
        maxCapturedParseErrorLines: 0.5
      })
    ).toThrow(/maxCapturedParseErrorLines must be an integer >= 0/);
  });

  test("resolveInputFormatForFile uses extension first, then content fallback", async () => {
    await withTempDir("schema-generator-infer-", async (directory) => {
      const jsonlFile = path.join(directory, "events.ndjson");
      const jsonFile = path.join(directory, "events.json");
      const unknownJsonFile = path.join(directory, "ambiguous.data");
      const unknownJsonlFile = path.join(directory, "ambiguous.log");

      await writeFile(jsonlFile, '{"id":1}\n{"id":2}\n', "utf8");
      await writeFile(jsonFile, '{"id":1}', "utf8");
      await writeFile(unknownJsonFile, '[{"id":1}]', "utf8");
      await writeFile(unknownJsonlFile, '{"id":1}\n{"id":2}\n', "utf8");

      await expect(resolveInputFormatForFile(jsonlFile, "auto")).resolves.toBe("jsonl");
      await expect(resolveInputFormatForFile(jsonFile, "auto")).resolves.toBe("json");
      await expect(resolveInputFormatForFile(unknownJsonFile, "auto")).resolves.toBe("json");
      await expect(resolveInputFormatForFile(unknownJsonlFile, "auto")).resolves.toBe("jsonl");
    });
  });

  test("resolveInputFormatForFile respects explicit format override", async () => {
    await withTempDir("schema-generator-infer-", async (directory) => {
      const inputFile = path.join(directory, "events.any");
      await writeFile(inputFile, '{"id":1}\n{"id":2}\n', "utf8");

      await expect(resolveInputFormatForFile(inputFile, "json")).resolves.toBe("json");
      await expect(resolveInputFormatForFile(inputFile, "jsonl")).resolves.toBe("jsonl");
    });
  });

  test("inferFromFiles merges mixed jsonl and json inputs in auto mode", async () => {
    await withTempDir("schema-generator-infer-", async (directory) => {
      const jsonlFile = path.join(directory, "part-a.jsonl");
      const jsonFile = path.join(directory, "part-b.json");

      await writeFile(jsonlFile, '{"id":1}\n{"id":2}\n', "utf8");
      await writeFile(jsonFile, '[{"id":"3"}]', "utf8");

      const result = await inferFromFiles([jsonlFile, jsonFile], {
        inputFormat: "auto"
      });

      expect(result.stats.recordsMerged).toBe(3);
      expect(result.stats.parseErrors).toBe(0);
      expect(result.files).toHaveLength(2);
      expect(result.files.map((entry) => entry.format)).toEqual(["jsonl", "json"]);
    });
  });

  test("inferFromFiles tracks skipped empty JSONL lines", async () => {
    await withTempDir("schema-generator-infer-", async (directory) => {
      const jsonlFile = path.join(directory, "empty-lines.jsonl");
      await writeFile(jsonlFile, '\n{"id":1}\n\n{"id":2}\n', "utf8");

      const result = await inferFromFiles([jsonlFile], {
        inputFormat: "auto"
      });

      expect(result.stats.linesRead).toBe(4);
      expect(result.stats.recordsMerged).toBe(2);
      expect(result.stats.skippedEmptyLines).toBe(2);
      expect(result.files[0].stats.skippedEmptyLines).toBe(2);
    });
  });

  test("inferFromFiles throws on empty input file list", async () => {
    await expect(inferFromFiles([], { inputFormat: "auto" })).rejects.toThrow(
      /No input files provided/
    );
  });
});
