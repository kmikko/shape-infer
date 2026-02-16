const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { mkdtemp, writeFile, rm } = require("node:fs/promises");
const test = require("node:test");

const {
  detectInputFormatFromText,
  inferFromFiles,
  inferFromJsonText,
  resolveInputFormatForFile
} = require("../dist/infer.js");

type AsyncDirectoryRun = (directory: string) => Promise<void>;

async function withTempDir(run: AsyncDirectoryRun): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "schema-generator-infer-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("detectInputFormatFromText auto-detects json and jsonl", () => {
  assert.equal(detectInputFormatFromText('[{"id":1}]', "auto"), "json");
  assert.equal(detectInputFormatFromText('{"id":1}', "auto"), "json");
  assert.equal(detectInputFormatFromText('{"id":1}\n{"id":2}\n', "auto"), "jsonl");
  assert.equal(detectInputFormatFromText('{"id":1}\n', "jsonl"), "jsonl");
  assert.equal(detectInputFormatFromText('{"id":1}\n', "json"), "json");
});

test("inferFromJsonText merges top-level array values", () => {
  const result = inferFromJsonText('[{"id":1},{"id":"2"}]', {
    sourceName: "array.json"
  });

  assert.equal(result.stats.recordsMerged, 2);
  assert.equal(result.stats.parseErrors, 0);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].source, "array.json");
  assert.equal(result.files[0].format, "json");
});

test("inferFromJsonText parses a top-level object as one record", () => {
  const result = inferFromJsonText('{"id":1}', {
    sourceName: "single.json"
  });

  assert.equal(result.stats.recordsMerged, 1);
  assert.equal(result.stats.parseErrors, 0);
  assert.equal(result.files[0].format, "json");
});

test("inferFromJsonText captures parse errors with line information", () => {
  const result = inferFromJsonText('{\n  "id": 1,\n  "name":\n}\n', {
    sourceName: "broken.json"
  });

  assert.equal(result.stats.recordsMerged, 0);
  assert.equal(result.stats.parseErrors, 1);
  assert.equal(result.parseErrorLines.length, 1);
  assert.ok(result.parseErrorLines[0] >= 1);
});

test("resolveInputFormatForFile uses extension first, then content fallback", async () => {
  await withTempDir(async (directory) => {
    const jsonlFile = path.join(directory, "events.ndjson");
    const jsonFile = path.join(directory, "events.json");
    const unknownJsonFile = path.join(directory, "ambiguous.data");
    const unknownJsonlFile = path.join(directory, "ambiguous.log");

    await writeFile(jsonlFile, '{"id":1}\n{"id":2}\n', "utf8");
    await writeFile(jsonFile, '{"id":1}', "utf8");
    await writeFile(unknownJsonFile, '[{"id":1}]', "utf8");
    await writeFile(unknownJsonlFile, '{"id":1}\n{"id":2}\n', "utf8");

    assert.equal(await resolveInputFormatForFile(jsonlFile, "auto"), "jsonl");
    assert.equal(await resolveInputFormatForFile(jsonFile, "auto"), "json");
    assert.equal(await resolveInputFormatForFile(unknownJsonFile, "auto"), "json");
    assert.equal(await resolveInputFormatForFile(unknownJsonlFile, "auto"), "jsonl");
  });
});

test("inferFromFiles merges mixed jsonl and json inputs in auto mode", async () => {
  await withTempDir(async (directory) => {
    const jsonlFile = path.join(directory, "part-a.jsonl");
    const jsonFile = path.join(directory, "part-b.json");

    await writeFile(jsonlFile, '{"id":1}\n{"id":2}\n', "utf8");
    await writeFile(jsonFile, '[{"id":"3"}]', "utf8");

    const result = await inferFromFiles([jsonlFile, jsonFile], {
      inputFormat: "auto"
    });

    assert.equal(result.stats.recordsMerged, 3);
    assert.equal(result.stats.parseErrors, 0);
    assert.equal(result.files.length, 2);
    assert.deepEqual(
      result.files.map((entry: { format: string }) => entry.format),
      ["jsonl", "json"]
    );
  });
});
