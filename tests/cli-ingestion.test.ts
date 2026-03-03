import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { runCli, withTempDir } from "./helpers.ts";

describe("CLI ingestion", () => {
  test("supports mixed json/jsonl input globs with auto-detect", async () => {
    await withTempDir("shape-infer-cli-", async (directory) => {
      await writeFile(path.join(directory, "a.jsonl"), '{"id":1}\n', "utf8");
      await writeFile(path.join(directory, "b.json"), '[{"id":"2"}]\n', "utf8");

      const { stdout, stderr } = await runCli([
        path.join(directory, "*.json*"),
        "--type-name",
        "AutoMixed",
        "--format",
        "typescript",
      ]);

      expect(stdout).toMatch(/export type AutoMixed =/);
      expect(stdout).toMatch(/id: string \| number;/);
      expect(stderr).toBe("");
    });
  });

  test("stdin auto-detect parses JSON array input", async () => {
    const { stdout, stderr } = await runCli(
      ["--type-name", "FromStdin", "--format", "json-schema"],
      '[{"id":1},{"id":"2"}]\n',
    );

    expect(stdout).toMatch(/"title": "FromStdin"/);
    expect(stdout).toMatch(/"type": "object"/);
    expect(stderr).toBe("");
  });

  test("applies loose mode and all-optional properties in zod output", async () => {
    const { stdout, stderr } = await runCli(
      [
        "--type-name",
        "LooseOptional",
        "--format",
        "zod",
        "--mode",
        "loose",
        "--all-optional",
      ],
      '[{"kind":"A"},{"kind":"B"},{"kind":null}]\n',
    );

    expect(stdout).toMatch(/export const LooseOptional =/);
    expect(stdout).toMatch(/"kind": z\.string\(\)\.nullable\(\)\.optional\(\)/);
    expect(stderr).toBe("");
  });

  test("stdin with --input-format jsonl parses concatenated JSON objects", async () => {
    const { stdout, stderr } = await runCli(
      ["--input-format", "jsonl", "--type-name", "Piped"],
      '{"id":1}\n{"id":"2"}\n',
    );

    expect(stdout).toMatch(/export type Piped =/);
    expect(stdout).toMatch(/id: string \| number;/);
    expect(stderr).toBe("");
  });
});
