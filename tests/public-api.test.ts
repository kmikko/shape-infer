import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { generateFromFiles, generateFromText } from "../src/public-api.ts";
import { withTempDir } from "./helpers.ts";

describe("public api facade", () => {
  test("generateFromText emits output and diagnostics", async () => {
    const result = await generateFromText({
      text: '[{"id":1},{"id":"2"}]',
      format: "zod",
      typeName: "FromText",
      includeDiagnostics: true,
    });

    expect(result.output).toContain("export const FromTextSchema");
    expect(result.stats.recordsMerged).toBe(2);
    expect(result.warnings).toEqual([]);
    expect(result.files).toHaveLength(1);
    expect(result.diagnostics?.summary.nodesVisited).toBeGreaterThan(0);
  });

  test("generateFromText reports no-record warning when parsing fails", async () => {
    const result = await generateFromText({
      text: "",
      format: "typescript",
    });

    expect(result.output).toContain("export type Root = unknown;");
    expect(result.warnings).toContain(
      "Warning: no JSON records parsed; output schema defaults to unknown.",
    );
  });

  test("generateFromText captures JSONL parse warnings", async () => {
    const result = await generateFromText({
      text: '{"id":1}\nnot-json\n{"id":2}\n',
      inputFormat: "jsonl",
      format: "typescript",
    });

    expect(result.stats.recordsMerged).toBe(2);
    expect(result.stats.parseErrors).toBe(1);
    expect(result.warnings).toContain(
      "Warning: <text>: skipped 1 line(s) that were not valid JSON.",
    );
    expect(result.warnings).toContain(
      "Warning: <text>: parse errors at lines 2.",
    );
    expect(result.diagnostics).toBeUndefined();
  });

  test("generateFromFiles resolves globs and returns merged result", async () => {
    await withTempDir("shape-infer-public-api-", async (directory) => {
      const jsonlPath = path.join(directory, "records.jsonl");
      const jsonPath = path.join(directory, "records.json");
      const pattern = path.join(directory, "*.json*");

      await writeFile(jsonlPath, '{"id":1}\n{"id":"2"}\n', "utf8");
      await writeFile(jsonPath, '[{"id":3}]', "utf8");

      const result = await generateFromFiles({
        inputPatterns: [pattern],
        inputFormat: "auto",
        format: "json-schema",
        typeName: "FromFiles",
        includeDiagnostics: true,
      });

      expect(result.resolvedInputPaths).toHaveLength(2);
      expect(result.resolvedInputPaths).toEqual(
        expect.arrayContaining([jsonlPath, jsonPath]),
      );
      expect(result.stats.recordsMerged).toBe(3);
      expect(result.warnings).toEqual([]);
      expect(result.output).toContain('"title": "FromFiles"');
      expect(result.diagnostics?.summary.nodesVisited).toBeGreaterThan(0);
    });
  });
});
