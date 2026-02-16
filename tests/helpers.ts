import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const cliPath = path.resolve(process.cwd(), "src/cli.ts");

export interface CliRunResult {
  stdout: string;
  stderr: string;
}

export async function withTempDir<T>(
  prefix: string,
  run: (directory: string) => Promise<T> | T
): Promise<T> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));

  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function runCli(args: string[], stdinText?: string): Promise<CliRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, ...args],
      {
        stdio: ["pipe", "pipe", "pipe"]
      }
    );

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
          new Error(`CLI exited with code ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`)
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
