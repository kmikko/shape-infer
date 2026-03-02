import { describe, expect, test } from "vitest";
import { buildUsage, parseCliArgs } from "../src/cli-options.ts";

describe("cli-options", () => {
  test("returns expected defaults", () => {
    const options = parseCliArgs([]);

    expect(options).toMatchObject({
      inputPatterns: [],
      typeName: "Root",
      outputFormat: "typescript",
      typeMode: "strict",
      allOptionalProperties: false,
      help: false,
      version: false,
    });
  });

  test("parses positional args as input patterns", () => {
    const options = parseCliArgs(["a.jsonl", "b.json"]);

    expect(options.inputPatterns).toEqual(["a.jsonl", "b.json"]);
  });

  test("parses positional args interleaved with flags", () => {
    const options = parseCliArgs([
      "a.jsonl",
      "--format",
      "zod",
      "b.json",
      "--type-name",
      "Rec",
    ]);

    expect(options.inputPatterns).toEqual(["a.jsonl", "b.json"]);
    expect(options.outputFormat).toBe("zod");
    expect(options.typeName).toBe("Rec");
  });

  test("treats args after -- as positionals", () => {
    const options = parseCliArgs(["--format", "zod", "--", "--weird.json"]);

    expect(options.inputPatterns).toEqual(["--weird.json"]);
    expect(options.outputFormat).toBe("zod");
  });

  test("parses --flag=value syntax", () => {
    const options = parseCliArgs([
      "--format=zod",
      "--type-name=Rec",
      "--mode=loose",
    ]);

    expect(options.outputFormat).toBe("zod");
    expect(options.typeName).toBe("Rec");
    expect(options.typeMode).toBe("loose");
  });

  test("parses short aliases and format aliases", () => {
    const options = parseCliArgs([
      "a.jsonl",
      "-o",
      "schema.ts",
      "-t",
      "RecordType",
      "-f",
      "ts",
      "--mode",
      "loose",
      "--all-optional",
    ]);

    expect(options).toMatchObject({
      inputPatterns: ["a.jsonl"],
      outputPath: "schema.ts",
      typeName: "RecordType",
      outputFormat: "typescript",
      typeMode: "loose",
      allOptionalProperties: true,
    });
  });

  test("parses explicit strict mode and schema alias", () => {
    const options = parseCliArgs(["--format", "schema", "--mode", "strict"]);

    expect(options.outputFormat).toBe("json-schema");
    expect(options.typeMode).toBe("strict");
  });

  test("parses -V and --version", () => {
    expect(parseCliArgs(["-V"]).version).toBe(true);
    expect(parseCliArgs(["--version"]).version).toBe(true);
  });

  test("throws for unknown argument", () => {
    expect(() => parseCliArgs(["--does-not-exist"])).toThrow(
      /Unknown argument/,
    );
  });

  test("throws for missing argument values", () => {
    expect(() => parseCliArgs(["--format"])).toThrow(/Missing value/);
    expect(() => parseCliArgs(["-o"])).toThrow(/Missing value/);
  });

  test("throws for removed --input", () => {
    expect(() => parseCliArgs(["--input", "file.json"])).toThrow(
      /Unknown argument: --input/,
    );
    expect(() => parseCliArgs(["-i", "file.json"])).toThrow(
      /Unknown argument: -i/,
    );
  });

  test("parses --input-format", () => {
    expect(parseCliArgs(["--input-format", "jsonl"]).inputFormat).toBe("jsonl");
    expect(parseCliArgs(["--input-format", "json"]).inputFormat).toBe("json");
    expect(parseCliArgs(["--input-format", "auto"]).inputFormat).toBe("auto");
    expect(parseCliArgs(["--input-format=jsonl"]).inputFormat).toBe("jsonl");
  });

  test("throws for unsupported --input-format value", () => {
    expect(() => parseCliArgs(["--input-format", "csv"])).toThrow(
      /Unsupported input format/,
    );
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
    expect(usage).toContain("--version");
    expect(usage).toContain("stdin");
    expect(usage).toContain("--input-format");
    expect(usage).not.toContain("--type-mode");
    expect(usage).not.toContain("--optional-fields");
    expect(usage).not.toContain("--all-optional-properties");
    expect(usage).not.toContain("--max-captured-parse-errors");
    expect(usage).not.toContain("--diagnostics-max-findings");
  });
});
