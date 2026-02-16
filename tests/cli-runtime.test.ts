import { readFile, writeFile } from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { isDirectExecution, launchCliFromProcessArgs, runCli } from "../src/cli.ts";
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

function createIoFromChunks(chunks: Array<string | Buffer>, isTTY = false) {
  const input = Readable.from(chunks) as NodeJS.ReadableStream & { isTTY?: boolean };
  input.isTTY = isTTY;

  const output = new CaptureWritable();
  const errors = new CaptureWritable();

  return {
    input,
    output,
    errors
  };
}

function createIo(inputText: string, isTTY = false) {
  return createIoFromChunks([inputText], isTTY);
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

  test("isDirectExecution returns false when entry is missing", () => {
    expect(isDirectExecution("", "file:///tmp/cli.ts")).toBe(false);
  });

  test("launchCliFromProcessArgs handles startup errors", async () => {
    const cliEntry = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
    const io = createIo("", true);
    const entryErrors = new CaptureWritable();
    const previousExitCode = process.exitCode;

    try {
      process.exitCode = undefined;

      const launched = launchCliFromProcessArgs(
        [process.execPath, cliEntry, "--does-not-exist"],
        {
          stdin: io.input,
          stdout: io.output,
          stderr: io.errors
        },
        entryErrors
      );

      expect(launched).toBeDefined();
      if (!launched) {
        throw new Error("Expected launchCliFromProcessArgs to run in direct mode.");
      }
      await launched;

      expect(entryErrors.text()).toContain("Error: Unknown argument: --does-not-exist");
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }
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

  test("auto-detects jsonl from stdin object lines", async () => {
    const io = createIo('{"id":1}\n{"id":"2"}\n');

    await runCli(["--input-format", "auto", "--type-name", "FromJsonl", "--format", "typescript"], {
      stdin: io.input,
      stdout: io.output,
      stderr: io.errors
    });

    expect(io.output.text()).toContain("export type FromJsonl =");
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

  test("supports file input flow and json-schema output file", async () => {
    await withTempDir("schema-generator-cli-runtime-", async (directory) => {
      const inputPath = `${directory}/records.json`;
      const outputPath = `${directory}/schema.json`;

      await writeFile(inputPath, '[{"id":1},{"id":"2"}]\n', "utf8");

      const io = createIo("", true);
      await runCli(
        [
          "--input",
          inputPath,
          "--input-format",
          "auto",
          "--format",
          "json-schema",
          "--output",
          outputPath,
          "--type-name",
          "RuntimeRecord"
        ],
        {
          stdin: io.input,
          stdout: io.output,
          stderr: io.errors
        }
      );

      const schemaText = await readFile(outputPath, "utf8");
      expect(schemaText).toContain('"title": "RuntimeRecord"');
      expect(schemaText).toContain('"type": "object"');
      expect(io.output.text()).toBe("");
      expect(io.errors.text()).toBe("");
    });
  });

  test("handles buffer stdin and prints json parse warning + no-record warning", async () => {
    const io = createIoFromChunks([Buffer.from('{\n  "id": 1,\n  "name":\n}\n')]);

    await runCli(["--input-format", "json", "--format", "typescript"], {
      stdin: io.input,
      stdout: io.output,
      stderr: io.errors
    });

    expect(io.output.text()).toContain("export type Root = unknown;");
    expect(io.errors.text()).toContain("failed to parse JSON input");
    expect(io.errors.text()).toContain("Warning: no JSON records parsed");
  });

  test("prints loose/optional diagnostics notes when enabled", async () => {
    const io = createIo('[{"kind":"A"},{"kind":"B"}]\n');

    await runCli(
      [
        "--input-format",
        "auto",
        "--format",
        "zod",
        "--diagnostics",
        "--type-mode",
        "loose",
        "--all-optional-properties"
      ],
      {
        stdin: io.input,
        stdout: io.output,
        stderr: io.errors
      }
    );

    expect(io.output.text()).toContain("export const RootSchema");
    expect(io.errors.text()).toContain(
      "Diagnostics note: loose type mode collapses inferred literal enums"
    );
    expect(io.errors.text()).toContain(
      "Diagnostics note: all optional mode forces every object property"
    );
  });
});
