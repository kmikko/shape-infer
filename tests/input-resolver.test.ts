const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { mkdtemp, mkdir, writeFile, rm } = require("node:fs/promises");
const test = require("node:test");

const { resolveInputPaths } = require("../dist/input-resolver.js");

type AsyncDirectoryRun = (directory: string) => Promise<void>;

async function withTempDir(run: AsyncDirectoryRun): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "schema-generator-resolver-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("resolveInputPaths expands globs, removes duplicates, and returns absolute paths", async () => {
  await withTempDir(async (directory) => {
    const nestedDir = path.join(directory, "nested");
    await mkdir(nestedDir, { recursive: true });

    const fileA = path.join(directory, "a.jsonl");
    const fileB = path.join(nestedDir, "b.json");
    await writeFile(fileA, '{"id":1}\n', "utf8");
    await writeFile(fileB, '{"id":2}\n', "utf8");

    const resolved = await resolveInputPaths(["*.jsonl", "**/*.json*"], directory);

    assert.equal(resolved.length, 2);
    assert.ok(resolved.every((entry: string) => path.isAbsolute(entry)));
    assert.deepEqual([...new Set(resolved)], resolved);
    assert.ok(resolved.includes(fileA));
    assert.ok(resolved.includes(fileB));
  });
});

test("resolveInputPaths throws when any pattern has no matches", async () => {
  await withTempDir(async (directory) => {
    await writeFile(path.join(directory, "a.json"), '{"id":1}\n', "utf8");

    await assert.rejects(
      () => resolveInputPaths(["*.json", "*.missing"], directory),
      /No files matched input pattern\(s\)/
    );
  });
});
