import { describe, expect, test } from "vitest";
import * as api from "../src/index.ts";

describe("index exports", () => {
  test("re-exports public runtime APIs", () => {
    expect(typeof api.createNode).toBe("function");
    expect(typeof api.mergeValue).toBe("function");
    expect(typeof api.inferFromValues).toBe("function");
    expect(typeof api.analyzeSchema).toBe("function");
    expect(typeof api.emitTypeScriptType).toBe("function");
    expect(typeof api.emitZodSchema).toBe("function");
    expect(typeof api.emitJsonSchema).toBe("function");
    expect(typeof api.resolveInputPaths).toBe("function");
  });

  test("supports end-to-end inference and emission via barrel imports", () => {
    const root = api.inferFromValues([{ id: 1 }, { id: "2" }]);

    const tsOutput = api.emitTypeScriptType(root, {
      rootTypeName: "BarrelRecord"
    });

    expect(tsOutput).toContain("export type BarrelRecord =");
    expect(tsOutput).toContain("id: string | number;");
  });
});
