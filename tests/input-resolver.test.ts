import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { resolveInputPaths } from "../src/input-resolver.ts";
import { withTempDir } from "./helpers.ts";

describe("resolveInputPaths", () => {
  test("expands globs, removes duplicates, and returns absolute paths", async () => {
    await withTempDir("shape-infer-resolver-", async (directory) => {
      const nestedDir = path.join(directory, "nested");
      await mkdir(nestedDir, { recursive: true });

      const fileA = path.join(directory, "a.jsonl");
      const fileB = path.join(nestedDir, "b.json");
      await writeFile(fileA, '{"id":1}\n', "utf8");
      await writeFile(fileB, '{"id":2}\n', "utf8");

      const resolved = await resolveInputPaths(
        ["*.jsonl", "**/*.json*"],
        directory,
      );

      expect(resolved).toHaveLength(2);
      expect(resolved.every((entry) => path.isAbsolute(entry))).toBe(true);
      expect([...new Set(resolved)]).toEqual(resolved);
      expect(resolved).toContain(fileA);
      expect(resolved).toContain(fileB);
    });
  });

  test("throws when any pattern has no matches", async () => {
    await withTempDir("shape-infer-resolver-", async (directory) => {
      await writeFile(path.join(directory, "a.json"), '{"id":1}\n', "utf8");

      await expect(
        resolveInputPaths(["*.json", "*.missing"], directory),
      ).rejects.toThrow(/No files matched input pattern\(s\)/);
    });
  });
});
