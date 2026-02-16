const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { mkdtemp, writeFile, rm } = require("node:fs/promises");
const { spawn } = require("node:child_process");
const test = require("node:test");

const cliPath = path.resolve(__dirname, "../dist/cli.js");

type AsyncDirectoryRun = (directory: string) => Promise<void>;

interface CliRunResult {
  stdout: string;
  stderr: string;
}

async function withTempDir(run: AsyncDirectoryRun): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "schema-generator-cli-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function runCli(args: string[], stdinText?: string): Promise<CliRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code !== 0) {
        reject(
          new Error(
            `CLI exited with code ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`
          )
        );
        return;
      }
      resolve({ stdout, stderr });
    });

    if (stdinText !== undefined) {
      child.stdin.write(stdinText);
    }
    child.stdin.end();
  });
}

test("CLI supports mixed json/jsonl input globs with auto-detect", async () => {
  await withTempDir(async (directory) => {
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

    assert.match(stdout, /export type AutoMixed =/);
    assert.match(stdout, /id: string \| number;/);
    assert.equal(stderr, "");
  });
});

test("CLI stdin auto-detect parses JSON array input", async () => {
  const { stdout, stderr } = await runCli(
    ["--input-format", "auto", "--type-name", "FromStdin", "--format", "json-schema"],
    '[{"id":1},{"id":"2"}]\n'
  );

  assert.match(stdout, /"title": "FromStdin"/);
  assert.match(stdout, /"type": "object"/);
  assert.equal(stderr, "");
});
