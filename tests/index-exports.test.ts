import { describe, expect, test } from "vitest";
import * as api from "../src/index.ts";

describe("index exports", () => {
  test("re-exports facade-only runtime APIs", () => {
    expect(typeof api.generateFromText).toBe("function");
    expect(typeof api.generateFromFiles).toBe("function");
    expect(Object.keys(api).sort((left, right) => left.localeCompare(right))).toEqual([
      "generateFromFiles",
      "generateFromText"
    ]);
  });

  test("supports end-to-end generation via barrel imports", async () => {
    const result = await api.generateFromText({
      text: '[{"id":1},{"id":"2"}]',
      inputFormat: "json",
      format: "typescript",
      typeName: "BarrelRecord"
    });

    expect(result.output).toContain("export type BarrelRecord =");
    expect(result.output).toContain("id: string | number;");
  });
});
