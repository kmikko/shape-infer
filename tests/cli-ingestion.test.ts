import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { runCli, withTempDir } from "./helpers.ts";

describe("CLI ingestion", () => {
  test("supports mixed json/jsonl input globs with auto-detect", async () => {
    await withTempDir("schema-generator-cli-", async (directory) => {
      await writeFile(path.join(directory, "a.jsonl"), '{"id":1}\n', "utf8");
      await writeFile(path.join(directory, "b.json"), '[{"id":"2"}]\n', "utf8");

      const { stdout, stderr } = await runCli([
        "--input",
        path.join(directory, "*.json*"),
        "--input-format",
        "auto",
        "--type-name",
        "AutoMixed",
        "--format",
        "typescript"
      ]);

      expect(stdout).toMatch(/export type AutoMixed =/);
      expect(stdout).toMatch(/id: string \| number;/);
      expect(stderr).toBe("");
    });
  });

  test("stdin auto-detect parses JSON array input", async () => {
    const { stdout, stderr } = await runCli(
      ["--input-format", "auto", "--type-name", "FromStdin", "--format", "json-schema"],
      '[{"id":1},{"id":"2"}]\n'
    );

    expect(stdout).toMatch(/"title": "FromStdin"/);
    expect(stdout).toMatch(/"type": "object"/);
    expect(stderr).toBe("");
  });

  test("applies loose mode and all-optional properties in zod output", async () => {
    const { stdout, stderr } = await runCli(
      [
        "--input-format",
        "auto",
        "--type-name",
        "LooseOptional",
        "--format",
        "zod",
        "--type-mode",
        "loose",
        "--all-optional-properties"
      ],
      '[{"kind":"A"},{"kind":"B"},{"kind":null}]\n'
    );

    expect(stdout).toMatch(/export const LooseOptionalSchema =/);
    expect(stdout).toMatch(/"kind": z\.string\(\)\.nullable\(\)\.optional\(\)/);
    expect(stderr).toBe("");
  });
});
