import { describe, expect, test } from "vitest";
import {
  buildRecordValueNode,
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
});
