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
      maxCapturedParseErrorLines: 20,
      diagnostics: false,
      diagnosticsMaxFindings: 25,
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
      "--type-mode",
      "loose",
      "--all-optional-properties",
      "--diagnostics",
      "--diagnostics-output",
      "diag.json",
      "--diagnostics-max-findings",
      "10",
    ]);

    expect(options).toMatchObject({
      inputPatterns: ["a.jsonl"],
      outputPath: "schema.ts",
      typeName: "RecordType",
      outputFormat: "typescript",
      inputFormat: "jsonl",
      typeMode: "loose",
      allOptionalProperties: true,
      diagnostics: true,
      diagnosticsOutputPath: "diag.json",
      diagnosticsMaxFindings: 10,
    });
  });

  test("parses explicit strict mode and schema aliases", () => {
    const options = parseCliArgs([
      "--input-format",
      "json",
      "--format",
      "schema",
      "--type-mode",
      "strict",
    ]);

    expect(options.inputFormat).toBe("json");
    expect(options.outputFormat).toBe("json-schema");
    expect(options.typeMode).toBe("strict");
  });

  test("parses heuristic numeric options", () => {
    const options = parseCliArgs([
      "--required-threshold",
      "0.95",
      "--enum-threshold",
      "0.25",
      "--max-enum-size",
      "30",
      "--min-enum-count",
      "3",
      "--string-format-threshold",
      "0.8",
      "--min-format-count",
      "2",
      "--record-min-keys",
      "8",
      "--record-max-presence",
      "0.5",
      "--max-union-size",
      "4",
      "--max-tracked-literals",
      "300",
      "--max-captured-parse-errors",
      "12",
    ]);

    expect(options.heuristics).toEqual({
      requiredThreshold: 0.95,
      enumThreshold: 0.25,
      maxEnumSize: 30,
      minEnumCount: 3,
      stringFormatThreshold: 0.8,
      minFormatCount: 2,
      recordMinKeys: 8,
      recordMaxPresence: 0.5,
      maxUnionSize: 4,
    });
    expect(options.maxTrackedLiteralsPerVariant).toBe(300);
    expect(options.maxCapturedParseErrorLines).toBe(12);
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

  test("throws for strict integer and bounded-number validation", () => {
    expect(() => parseCliArgs(["--max-enum-size", "2.5"])).toThrow(
      /integer >= 2/,
    );
    expect(() => parseCliArgs(["--max-captured-parse-errors", "-1"])).toThrow(
      /integer >= 0/,
    );
    expect(() => parseCliArgs(["--required-threshold", "1.5"])).toThrow(
      /between 0 and 1/,
    );
  });

  test("throws for unsupported enum-like argument values", () => {
    expect(() => parseCliArgs(["--input-format", "yaml"])).toThrow(
      /Unsupported input format/,
    );
    expect(() => parseCliArgs(["--format", "avro"])).toThrow(
      /Unsupported format/,
    );
    expect(() => parseCliArgs(["--type-mode", "relaxed"])).toThrow(
      /Unsupported type mode/,
    );
  });

  test("buildUsage includes key option groups", () => {
    const usage = buildUsage();

    expect(usage).toContain("--input-format");
    expect(usage).toContain("--all-optional-properties");
    expect(usage).toContain("--max-captured-parse-errors");
    expect(usage).toContain("--diagnostics-max-findings");
  });
});
