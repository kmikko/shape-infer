import { describe, expect, test } from "vitest";
import {
  buildRecordValueNode,
  getNodeKinds,
  inferNumberEnum,
  inferStringEnum,
  inferStringFormat,
  isRecordLikeObject,
  isRequired,
  resolveHeuristicOptions,
} from "../src/heuristics.ts";
import { inferFromValues } from "../src/infer.ts";

describe("heuristics", () => {
  test("resolveHeuristicOptions validates bounds", () => {
    expect(() => resolveHeuristicOptions({ requiredThreshold: -0.1 })).toThrow(
      /requiredThreshold/,
    );
    expect(() => resolveHeuristicOptions({ maxEnumSize: 1 })).toThrow(
      /maxEnumSize/,
    );
  });

  test("isRequired honors configured threshold", () => {
    const options = resolveHeuristicOptions({ requiredThreshold: 0.75 });

    expect(isRequired(3, 4, options)).toBe(true);
    expect(isRequired(2, 4, options)).toBe(false);
    expect(isRequired(1, 0, options)).toBe(false);
  });

  test("inferStringEnum returns enum candidate when ratio is below threshold", () => {
    const root = inferFromValues(["A", "B", "A", "B"]);
    const options = resolveHeuristicOptions({
      minEnumCount: 2,
      enumThreshold: 1,
      maxEnumSize: 10,
    });

    const candidate = inferStringEnum(root.variants.string, options);
    expect(candidate).toEqual({
      values: ["A", "B"],
      distinctRatio: 0.5,
    });
  });

  test("inferNumberEnum merges integer and number literals", () => {
    const root = inferFromValues([1, 2, 1.5, 2, 1]);
    const options = resolveHeuristicOptions({
      minEnumCount: 2,
      enumThreshold: 1,
      maxEnumSize: 10,
    });

    const candidate = inferNumberEnum(
      root.variants.integer,
      root.variants.number,
      options,
    );
    expect(candidate?.values).toEqual([1, 1.5, 2]);
  });

  test("inferStringFormat promotes best format candidate by confidence", () => {
    const root = inferFromValues([
      "foo@example.com",
      "bar@example.com",
      "baz@example.com",
      "not-an-email",
    ]);

    const options = resolveHeuristicOptions({
      minFormatCount: 2,
      stringFormatThreshold: 0.7,
    });

    const candidate = inferStringFormat(root.variants.string, options);
    expect(candidate).toEqual({
      format: "email",
      confidence: 0.75,
    });
  });

  test("isRecordLikeObject uses key-count and presence thresholds", () => {
    const root = inferFromValues([
      { a: 1, b: 1, c: 1, d: 1 },
      { e: 2, f: 2, g: 2, h: 2 },
      { i: 3, j: 3, k: 3, l: 3 },
    ]);

    const objectVariant = root.variants.object;
    if (!objectVariant) {
      throw new Error("Expected object variant.");
    }

    const positive = resolveHeuristicOptions({
      recordMinKeys: 4,
      recordMaxPresence: 0.5,
    });
    const negative = resolveHeuristicOptions({
      recordMinKeys: 4,
      recordMaxPresence: 0.3,
    });

    expect(isRecordLikeObject(objectVariant, positive)).toBe(true);
    expect(isRecordLikeObject(objectVariant, negative)).toBe(false);
  });

  test("buildRecordValueNode merges all record value nodes", () => {
    const root = inferFromValues([{ x: 1 }, { y: "text" }, { z: null }]);
    const objectVariant = root.variants.object;
    if (!objectVariant) {
      throw new Error("Expected object variant.");
    }

    const valueNode = buildRecordValueNode(objectVariant);
    const kinds = getNodeKinds(valueNode).sort((left, right) =>
      left.localeCompare(right),
    );

    expect(kinds).toEqual(["integer", "null", "string"]);
  });
});
