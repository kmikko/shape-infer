import { describe, expect, test } from "vitest";
import { buildUsage, parseCliArgs } from "../src/cli-options.ts";

describe("cli-options", () => {
  test("returns expected defaults", () => {
    const options = parseCliArgs([]);

    expect(options).toMatchObject({
      inputPatterns: [],
      inputFormat: "auto",
      typeName: "Root",
      outputFormat: "typescript",
      typeMode: "strict",
      allOptionalProperties: false,
      help: false,
    });
  });

  test("parses short aliases and format aliases", () => {
    const options = parseCliArgs([
      "-i",
      "a.jsonl",
      "-o",
      "schema.ts",
      "-t",
      "RecordType",
      "-f",
      "ts",
      "--input-format",
      "ndjson",
      "--mode",
      "loose",
      "--all-optional",
    ]);

    expect(options).toMatchObject({
      inputPatterns: ["a.jsonl"],
      outputPath: "schema.ts",
      typeName: "RecordType",
      outputFormat: "typescript",
      inputFormat: "jsonl",
      typeMode: "loose",
      allOptionalProperties: true,
    });
  });

  test("parses explicit strict mode and schema aliases", () => {
    const options = parseCliArgs([
      "--input-format",
      "json",
      "--format",
      "schema",
      "--mode",
      "strict",
    ]);

    expect(options.inputFormat).toBe("json");
    expect(options.outputFormat).toBe("json-schema");
    expect(options.typeMode).toBe("strict");
  });

  test("throws for unknown argument", () => {
    expect(() => parseCliArgs(["--does-not-exist"])).toThrow(
      /Unknown argument/,
    );
  });

  test("throws for missing argument values", () => {
    expect(() => parseCliArgs(["--format"])).toThrow(/Missing value/);
    expect(() => parseCliArgs(["-i"])).toThrow(/Missing value/);
  });

  test("throws for removed arguments", () => {
    expect(() => parseCliArgs(["--type-mode", "loose"])).toThrow(
      /Removed argument: --type-mode/,
    );
    expect(() => parseCliArgs(["--optional-fields"])).toThrow(
      /Removed argument: --optional-fields/,
    );
    expect(() => parseCliArgs(["--all-optional-properties"])).toThrow(
      /Removed argument: --all-optional-properties/,
    );
    expect(() => parseCliArgs(["--required-threshold", "0.9"])).toThrow(
      /Removed argument: --required-threshold/,
    );
    expect(() => parseCliArgs(["--diagnostics"])).toThrow(
      /Removed argument: --diagnostics/,
    );
    expect(() => parseCliArgs(["--diagnostics-output", "diag.json"])).toThrow(
      /Removed argument: --diagnostics-output/,
    );
  });

  test("throws for unsupported enum-like argument values", () => {
    expect(() => parseCliArgs(["--input-format", "yaml"])).toThrow(
      /Unsupported input format/,
    );
    expect(() => parseCliArgs(["--format", "avro"])).toThrow(
      /Unsupported format/,
    );
    expect(() => parseCliArgs(["--mode", "relaxed"])).toThrow(
      /Unsupported type mode/,
    );
  });

  test("buildUsage shows only public options", () => {
    const usage = buildUsage();

    expect(usage).toContain("--mode");
    expect(usage).toContain("--all-optional");
    expect(usage).toContain("--input-format");
    expect(usage).not.toContain("--type-mode");
    expect(usage).not.toContain("--optional-fields");
    expect(usage).not.toContain("--all-optional-properties");
    expect(usage).not.toContain("--max-captured-parse-errors");
    expect(usage).not.toContain("--diagnostics-max-findings");
  });
});
