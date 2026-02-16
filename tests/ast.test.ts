import { describe, expect, test } from "vitest";
import { createNode, mergeNodes, mergeValue, resolveAstMergeOptions } from "../src/ast";
import { inferFromValues } from "../src/infer";

describe("ast", () => {
  test("resolveAstMergeOptions floors numeric maxTrackedLiteralsPerVariant", () => {
    expect(resolveAstMergeOptions({ maxTrackedLiteralsPerVariant: 2.9 })).toEqual({
      maxTrackedLiteralsPerVariant: 2
    });
    expect(() => resolveAstMergeOptions({ maxTrackedLiteralsPerVariant: 0 })).toThrow(
      /maxTrackedLiteralsPerVariant/
    );
  });

  test("mergeValue marks non-finite numbers as unknown", () => {
    const root = createNode();

    mergeValue(root, Number.NaN);
    mergeValue(root, Number.POSITIVE_INFINITY);

    expect(root.variants.unknown?.count).toBe(2);
    expect(root.variants.number).toBeUndefined();
    expect(root.variants.integer).toBeUndefined();
  });

  test("mergeValue sets literalOverflow when tracked literals exceed cap", () => {
    const root = createNode();

    mergeValue(root, "A", { maxTrackedLiteralsPerVariant: 2 });
    mergeValue(root, "B", { maxTrackedLiteralsPerVariant: 2 });
    mergeValue(root, "C", { maxTrackedLiteralsPerVariant: 2 });

    expect(root.variants.string?.literalOverflow).toBe(true);
    expect(root.variants.string?.literals).toBeUndefined();
  });

  test("mergeNodes combines object properties and counts", () => {
    const left = inferFromValues([{ a: 1, b: "x" }]);
    const right = inferFromValues([{ a: 2, c: true }]);
    const target = createNode();

    mergeNodes(target, left);
    mergeNodes(target, right);

    const objectVariant = target.variants.object;
    if (!objectVariant) {
      throw new Error("Expected object variant.");
    }

    expect(target.occurrences).toBe(2);
    expect(objectVariant.count).toBe(2);
    expect(objectVariant.properties.get("a")?.seenCount).toBe(2);
    expect(objectVariant.properties.get("b")?.seenCount).toBe(1);
    expect(objectVariant.properties.get("c")?.seenCount).toBe(1);
    expect(objectVariant.properties.get("a")?.node.variants.integer?.count).toBe(2);
    expect(objectVariant.properties.get("b")?.node.variants.string?.count).toBe(1);
    expect(objectVariant.properties.get("c")?.node.variants.boolean?.count).toBe(1);
  });
});
