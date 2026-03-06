import { describe, expect, test } from "vitest";
import {
  buildRecordValueNode,
  inferKeyPattern,
  inferNumberEnum,
  inferStringEnum,
  inferStringFormat,
  isRecordLikeObject,
  isRequired,
} from "../src/heuristics.ts";
import type { NodeKind, SchemaNode } from "../src/ast.ts";
import { inferFromValues } from "../src/infer.ts";

function getNodeKinds(node: SchemaNode): NodeKind[] {
  const kinds: NodeKind[] = [];
  if (node.variants.unknown) {
    kinds.push("unknown");
  }
  if (node.variants.object) {
    kinds.push("object");
  }
  if (node.variants.array) {
    kinds.push("array");
  }
  if (node.variants.string) {
    kinds.push("string");
  }
  if (node.variants.integer) {
    kinds.push("integer");
  }
  if (node.variants.number) {
    kinds.push("number");
  }
  if (node.variants.boolean) {
    kinds.push("boolean");
  }
  if (node.variants.null) {
    kinds.push("null");
  }
  return kinds;
}

describe("heuristics", () => {
  test("isRequired uses strict default threshold", () => {
    expect(isRequired(4, 4)).toBe(true);
    expect(isRequired(3, 4)).toBe(false);
    expect(isRequired(1, 0)).toBe(false);
  });

  test("inferStringEnum returns enum candidate when default thresholds are met", () => {
    const root = inferFromValues([
      "A",
      "A",
      "A",
      "A",
      "A",
      "A",
      "A",
      "A",
      "B",
      "B",
    ]);

    const candidate = inferStringEnum(root.variants.string);
    expect(candidate).toEqual({
      values: ["A", "B"],
      distinctRatio: 0.2,
    });
  });

  test("inferNumberEnum merges integer and number literals", () => {
    const root = inferFromValues([1, 1, 1, 1, 1, 1, 1, 1, 1.5, 1.5]);

    const candidate = inferNumberEnum(
      root.variants.integer,
      root.variants.number,
    );
    expect(candidate?.values).toEqual([1, 1.5]);
  });

  test("inferStringFormat promotes best format candidate by confidence", () => {
    const root = inferFromValues([
      "foo@example.com",
      "bar@example.com",
      "baz@example.com",
      "qux@example.com",
      "quux@example.com",
      "corge@example.com",
      "grault@example.com",
      "garply@example.com",
      "waldo@example.com",
      "not-an-email",
    ]);

    const candidate = inferStringFormat(root.variants.string);
    expect(candidate).toEqual({
      format: "email",
      confidence: 0.9,
    });
  });

  test("inferStringFormat does not infer uri when any observed value is invalid", () => {
    const root = inferFromValues([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
      "https://example.com/d",
      "https://example.com/e",
      "https://example.com/f",
      "https://example.com/g",
      "https://example.com/h",
      "https://example.com/i",
      ":cookie-policy",
    ]);

    const candidate = inferStringFormat(root.variants.string);
    expect(candidate).toBeUndefined();
  });

  test("inferStringFormat infers uri when all observed values are valid", () => {
    const root = inferFromValues([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
      "https://example.com/d",
      "https://example.com/e",
    ]);

    const candidate = inferStringFormat(root.variants.string);
    expect(candidate).toEqual({
      format: "uri",
      confidence: 1,
    });
  });

  test("isRecordLikeObject uses strict default key-count and presence thresholds", () => {
    const sparseRecords = Array.from({ length: 3 }, (_, recordIndex) => {
      return Object.fromEntries(
        Array.from({ length: 15 }, (_, keyIndex) => {
          const key = `k${recordIndex * 15 + keyIndex}`;
          return [key, keyIndex];
        }),
      );
    });

    const root = inferFromValues(sparseRecords);

    const objectVariant = root.variants.object;
    if (!objectVariant) {
      throw new Error("Expected object variant.");
    }

    const denseRecords = sparseRecords.map((record) => ({
      common: 1,
      ...record,
    }));
    const denseRoot = inferFromValues(denseRecords);
    const denseObjectVariant = denseRoot.variants.object;
    if (!denseObjectVariant) {
      throw new Error("Expected dense object variant.");
    }

    expect(isRecordLikeObject(objectVariant)).toBe(true);
    expect(isRecordLikeObject(denseObjectVariant)).toBe(false);
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

  test("inferKeyPattern detects separator-uniform keys like date-day entries", () => {
    const keys = [
      "2026-7-monday",
      "2026-7-tuesday",
      "2026-7-wednesday",
      "2026-7-thursday",
      "2026-7-friday",
      "2026-7-saturday",
      "2026-7-sunday",
    ];
    const root = inferFromValues([Object.fromEntries(keys.map((k) => [k, 1]))]);
    const objectVariant = root.variants.object;
    if (!objectVariant) {
      throw new Error("Expected object variant.");
    }
    expect(inferKeyPattern(objectVariant)).toBe(true);
  });

  test("inferKeyPattern returns false for plain named-property objects", () => {
    const root = inferFromValues([
      {
        name: "Alice",
        age: 30,
        id: 1,
        role: "admin",
        active: true,
        created: "2026-01-01",
        score: 99,
      },
    ]);
    const objectVariant = root.variants.object;
    if (!objectVariant) {
      throw new Error("Expected object variant.");
    }
    expect(inferKeyPattern(objectVariant)).toBe(false);
  });

  test("inferKeyPattern returns false when fewer than 6 keys", () => {
    const keys = [
      "2026-7-mon",
      "2026-7-tue",
      "2026-7-wed",
      "2026-7-thu",
      "2026-7-fri",
    ];
    const root = inferFromValues([Object.fromEntries(keys.map((k) => [k, 1]))]);
    const objectVariant = root.variants.object;
    if (!objectVariant) {
      throw new Error("Expected object variant.");
    }
    expect(inferKeyPattern(objectVariant)).toBe(false);
  });

  test("inferKeyPattern returns false when keys have inconsistent segment counts", () => {
    const keys = ["a-b", "a-b-c", "a-b-c-d", "a-b", "a-b-c", "a-b-c-d", "a-b"];
    const root = inferFromValues([Object.fromEntries(keys.map((k) => [k, 1]))]);
    const objectVariant = root.variants.object;
    if (!objectVariant) {
      throw new Error("Expected object variant.");
    }
    expect(inferKeyPattern(objectVariant)).toBe(false);
  });
});
