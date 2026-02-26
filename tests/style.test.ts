import { describe, expect, test } from "vitest";
import { resolveEmissionStyleOptions } from "../src/emitters/style.ts";

describe("emitter style options", () => {
  test("resolves strict defaults", () => {
    expect(resolveEmissionStyleOptions()).toEqual({
      typeMode: "strict",
      allOptionalProperties: false,
    });
  });

  test("accepts loose mode and allOptionalProperties", () => {
    expect(
      resolveEmissionStyleOptions({
        typeMode: "loose",
        allOptionalProperties: true,
      }),
    ).toEqual({
      typeMode: "loose",
      allOptionalProperties: true,
    });
  });

  test("throws for unsupported type mode", () => {
    expect(() =>
      resolveEmissionStyleOptions({ typeMode: "relaxed" as never }),
    ).toThrow(/Unsupported type mode/);
  });
});
