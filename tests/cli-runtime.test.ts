import { readFile } from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import { describe, expect, test } from "vitest";
import { runCli } from "../src/cli.ts";
import { withTempDir } from "./helpers.ts";

class CaptureWritable extends Writable {
  private readonly chunks: string[] = [];

  _write(
    chunk: string | Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    callback();
  }

  text(): string {
    return this.chunks.join("");
  }
}

function createIo(inputText: string, isTTY = false) {
  const input = Readable.from([inputText]) as NodeJS.ReadableStream & { isTTY?: boolean };
  input.isTTY = isTTY;

  const output = new CaptureWritable();
  const errors = new CaptureWritable();

  return {
    input,
    output,
    errors
  };
}

describe("cli runtime", () => {
  test("prints usage with --help", async () => {
    const io = createIo("", true);

    await runCli(["--help"], {
      stdin: io.input,
      stdout: io.output,
      stderr: io.errors
    });

    expect(io.output.text()).toContain("Usage:");
    expect(io.output.text()).toContain("--input-format");
    expect(io.errors.text()).toBe("");
  });

  test("throws when no input and stdin is TTY", async () => {
    const io = createIo("", true);

    await expect(
      runCli([], {
        stdin: io.input,
        stdout: io.output,
        stderr: io.errors
      })
    ).rejects.toThrow(/Missing input/);
  });

  test("parses stdin JSON in auto mode", async () => {
    const io = createIo('[{"id":1},{"id":"2"}]\n');

    await runCli(["--input-format", "auto", "--type-name", "FromRuntime", "--format", "typescript"], {
      stdin: io.input,
      stdout: io.output,
      stderr: io.errors
    });

    expect(io.output.text()).toContain("export type FromRuntime =");
    expect(io.output.text()).toContain("id: string | number");
    expect(io.errors.text()).toBe("");
  });

  test("emits diagnostics output file", async () => {
    await withTempDir("schema-generator-cli-runtime-", async (directory) => {
      const diagnosticsPath = `${directory}/diagnostics.json`;
      const io = createIo('{"id":1}\n{"id":2}\n');

      await runCli(
        [
          "--input-format",
          "jsonl",
          "--format",
          "typescript",
          "--diagnostics-output",
          diagnosticsPath
        ],
        {
          stdin: io.input,
          stdout: io.output,
          stderr: io.errors
        }
      );

      const diagnosticsText = await readFile(diagnosticsPath, "utf8");
      const diagnostics = JSON.parse(diagnosticsText) as {
        summary: {
          nodesVisited: number;
        };
      };

      expect(diagnostics.summary.nodesVisited).toBeGreaterThan(0);
      expect(io.output.text()).toContain("export type Root =");
      expect(io.errors.text()).toBe("");
    });
  });

  test("prints parse warnings for invalid jsonl lines", async () => {
    const io = createIo('{"id":1}\nnot-json\n{"id":2}\n');

    await runCli(["--input-format", "jsonl", "--format", "typescript", "--diagnostics"], {
      stdin: io.input,
      stdout: io.output,
      stderr: io.errors
    });

    expect(io.output.text()).toContain("export type Root =");
    expect(io.errors.text()).toContain("Diagnostics summary:");
    expect(io.errors.text()).toContain("Warning: <stdin>: skipped 1 line(s)");
    expect(io.errors.text()).toContain("parse errors at lines 2");
  });
});
