import { describe, expect, test } from "vitest";
import { analyzeSchema, formatDiagnosticsReport } from "../src/diagnostics.ts";
import { inferFromValues } from "../src/infer.ts";

describe("diagnostics degradations", () => {
  test("captures union_overflow degradation when union variants exceed maxUnionSize", () => {
    const root = inferFromValues([1, "x", true, null, [1], { nested: 1 }]);

    const diagnostics = analyzeSchema(root, {
      heuristics: {
        maxUnionSize: 3
      }
    });

    expect(diagnostics.summary.unionOverflowCount).toBeGreaterThan(0);

    const overflow = diagnostics.degradations.find(
      (entry) => entry.kind === "union_overflow" && entry.path === "$"
    );

    expect(overflow).toBeDefined();
    if (!overflow || overflow.kind !== "union_overflow") {
      throw new Error("Expected union_overflow degradation finding.");
    }

    expect(overflow.variantCount).toBeGreaterThan(overflow.maxUnionSize);
  });

  test("captures literal_overflow degradation when literal tracking overflows", () => {
    const root = inferFromValues(["A", "B", "C"], {
      astMergeOptions: {
        maxTrackedLiteralsPerVariant: 2
      }
    });

    const diagnostics = analyzeSchema(root);

    expect(diagnostics.summary.literalOverflowCount).toBe(1);
    expect(diagnostics.degradations).toContainEqual({
      kind: "literal_overflow",
      path: "$",
      primitiveKind: "string",
      observedCount: 3
    });
  });

  test("captures record_like_collapsed degradation for sparse dynamic-key objects", () => {
    const root = inferFromValues([
      { id: "A", attributes: { a: "x", b: "y", c: "z", d: "w" } },
      { id: "B", attributes: { e: "x", f: "y", g: "z", h: "w" } },
      { id: "C", attributes: { i: "x", j: "y", k: "z", l: "w" } }
    ]);

    const diagnostics = analyzeSchema(root, {
      heuristics: {
        recordMinKeys: 4,
        recordMaxPresence: 0.4
      }
    });

    expect(diagnostics.summary.recordLikeCollapsedCount).toBeGreaterThan(0);

    const collapsed = diagnostics.degradations.find(
      (entry) => entry.kind === "record_like_collapsed" && entry.path === "$.attributes"
    );

    expect(collapsed).toBeDefined();
    if (!collapsed || collapsed.kind !== "record_like_collapsed") {
      throw new Error("Expected record_like_collapsed degradation finding.");
    }

    expect(collapsed.keyCount).toBe(12);
    expect(collapsed.maxPresence).toBeCloseTo(1 / 3, 6);
  });

  test("captures threshold_near_miss degradations for requiredness/enum/format thresholds", () => {
    const requiredRoot = inferFromValues([{ a: 1 }, { a: 2 }, {}]);
    const requiredDiagnostics = analyzeSchema(requiredRoot, {
      heuristics: {
        requiredThreshold: 0.7
      }
    });

    expect(requiredDiagnostics.degradations).toContainEqual({
      kind: "threshold_near_miss",
      path: "$.a",
      metric: "required_presence",
      value: 2 / 3,
      threshold: 0.7,
      direction: "below"
    });

    const enumRoot = inferFromValues(["A", "B", "C", "A"]);
    const enumDiagnostics = analyzeSchema(enumRoot, {
      heuristics: {
        minEnumCount: 2,
        enumThreshold: 0.7
      }
    });

    expect(
      enumDiagnostics.degradations.some(
        (entry) =>
          entry.kind === "threshold_near_miss" &&
          entry.metric === "enum_distinct_ratio" &&
          entry.path === "$"
      )
    ).toBe(true);

    const formatRoot = inferFromValues([
      "foo@example.com",
      "bar@example.com",
      "not-an-email",
      "also-not-an-email"
    ]);

    const formatDiagnostics = analyzeSchema(formatRoot, {
      heuristics: {
        minFormatCount: 2,
        stringFormatThreshold: 0.55
      }
    });

    expect(
      formatDiagnostics.degradations.some(
        (entry) =>
          entry.kind === "threshold_near_miss" &&
          entry.metric === "format_confidence" &&
          entry.path === "$"
      )
    ).toBe(true);
  });

  test("formatDiagnosticsReport renders degradation summary and top degradations", () => {
    const root = inferFromValues([1, "x", true, null, [1], { nested: 1 }]);
    const diagnostics = analyzeSchema(root, {
      heuristics: {
        maxUnionSize: 3
      }
    });

    const report = formatDiagnosticsReport(diagnostics, {
      linesRead: 6,
      recordsMerged: 6,
      parseErrors: 0,
      skippedEmptyLines: 0
    });

    expect(report).toContain("degradations:");
    expect(report).toContain("Top degradations:");
    expect(report).toContain("union_overflow");
  });
});
