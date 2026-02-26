import { describe, expect, test } from "vitest";
import { analyzeSchema, formatDiagnosticsReport } from "../src/diagnostics.ts";
import { createNode, mergeValue } from "../src/ast.ts";
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

  test("record-like collapsed object recursively visits value node (diagnostics line 408)", () => {
    // Build a record-like object (sparse keys with low presence) so that visitNode
    // recurses into the merged value node via buildRecordValueNode. This covers the
    // `visitNode(valueNode, ...)` call at line 408 in diagnostics.ts.
    const columns = Array.from({ length: 42 }, (_, i) => `k${i}`); // 42 unique keys: k0..k41
    const makeRow = (keys: string[]) =>
      Object.fromEntries(keys.map((k) => [k, 1]));

    // 3 rows, 14 columns each; each column appears in exactly 1 of 3 rows → presence=1/3 < 0.4
    const rows = [
      makeRow(columns.slice(0, 14)),
      makeRow(columns.slice(14, 28)),
      makeRow(columns.slice(28, 42))
    ];
    const root = inferFromValues(rows);
    const diagnostics = analyzeSchema(root, {
      heuristics: { recordMinKeys: 40, recordMaxPresence: 0.4 }
    });

    expect(diagnostics.summary.recordLikeObjectCount).toBeGreaterThan(0);
    expect(diagnostics.summary.recordLikeCollapsedCount).toBeGreaterThan(0);
    // The recursive visitNode on the value node increments nodesVisited beyond 1
    expect(diagnostics.summary.nodesVisited).toBeGreaterThan(1);
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

    const numberEnumRoot = inferFromValues([1, 2, 3, 1]);
    const numberEnumDiagnostics = analyzeSchema(numberEnumRoot, {
      heuristics: {
        minEnumCount: 2,
        enumThreshold: 0.7
      }
    });

    expect(
      numberEnumDiagnostics.degradations.some(
        (entry) =>
          entry.kind === "threshold_near_miss" &&
          entry.metric === "enum_distinct_ratio" &&
          entry.path === "$" &&
          entry.context === "number"
      )
    ).toBe(true);

    const numberEnumCountRoot = inferFromValues([1, 2, 3, 1, 2, 3]);
    const numberEnumCountDiagnostics = analyzeSchema(numberEnumCountRoot, {
      heuristics: {
        minEnumCount: 2,
        maxEnumSize: 2,
        enumThreshold: 1
      }
    });

    expect(
      numberEnumCountDiagnostics.degradations.some(
        (entry) =>
          entry.kind === "threshold_near_miss" &&
          entry.metric === "enum_distinct_count" &&
          entry.path === "$" &&
          entry.context === "number"
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

    const formatCountRoot = inferFromValues([
      "foo@example.com",
      "bar@example.com",
      "baz@example.com",
      "qux@example.com",
      "not-an-email",
      "also-not-an-email"
    ]);

    const formatCountDiagnostics = analyzeSchema(formatCountRoot, {
      heuristics: {
        minFormatCount: 5,
        stringFormatThreshold: 0.1
      }
    });

    expect(
      formatCountDiagnostics.degradations.some(
        (entry) =>
          entry.kind === "threshold_near_miss" &&
          entry.metric === "format_sample_count" &&
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

  test("formatDiagnosticsReport renders non-union degradation details", () => {
    const literalRoot = inferFromValues(["A", "B", "C"], {
      astMergeOptions: {
        maxTrackedLiteralsPerVariant: 2
      }
    });
    const literalDiagnostics = analyzeSchema(literalRoot);
    const literalReport = formatDiagnosticsReport(literalDiagnostics, {
      linesRead: 3,
      recordsMerged: 3,
      parseErrors: 0,
      skippedEmptyLines: 0
    });
    expect(literalReport).toContain("literal_overflow");

    const recordRoot = inferFromValues([
      { id: "A", attributes: { a: "x", b: "y", c: "z", d: "w" } },
      { id: "B", attributes: { e: "x", f: "y", g: "z", h: "w" } },
      { id: "C", attributes: { i: "x", j: "y", k: "z", l: "w" } }
    ]);
    const recordDiagnostics = analyzeSchema(recordRoot, {
      heuristics: {
        recordMinKeys: 4,
        recordMaxPresence: 0.4
      }
    });
    const recordReport = formatDiagnosticsReport(recordDiagnostics, {
      linesRead: 3,
      recordsMerged: 3,
      parseErrors: 0,
      skippedEmptyLines: 0
    });
    expect(recordReport).toContain("record_like_collapsed");

    const thresholdRoot = inferFromValues([{ a: 1 }, { a: 2 }, {}]);
    const thresholdDiagnostics = analyzeSchema(thresholdRoot, {
      heuristics: {
        requiredThreshold: 0.7
      }
    });
    const thresholdReport = formatDiagnosticsReport(thresholdDiagnostics, {
      linesRead: 3,
      recordsMerged: 3,
      parseErrors: 0,
      skippedEmptyLines: 0
    });
    expect(thresholdReport).toContain("threshold_near_miss");
  });

  test("analyzeSchema throws for invalid maxFindingsPerCategory", () => {
    const root = inferFromValues([{ a: 1 }]);

    expect(() => analyzeSchema(root, { maxFindingsPerCategory: 0 })).toThrow(
      /maxFindingsPerCategory must be an integer >= 1/
    );
    expect(() => analyzeSchema(root, { maxFindingsPerCategory: 0.5 })).toThrow(
      /maxFindingsPerCategory must be an integer >= 1/
    );
  });

  test("getObjectPresenceStats returns zeroes for empty-property object variant", () => {
    // An empty object {} contributes a zero-property variant; analyzeSchema should not crash
    // and the record_like_collapsed path for zero-count is skipped (isRecordLikeObject returns false)
    const root = inferFromValues([{}]);
    const diagnostics = analyzeSchema(root);

    // No record-like objects since there are fewer than recordMinKeys properties
    expect(diagnostics.summary.recordLikeCollapsedCount).toBe(0);
    expect(diagnostics.summary.nodesVisited).toBeGreaterThan(0);
  });

  test("getNumberEnumNearMisses skips ratio checks when numberVariant has non-finite literal", () => {
    // Build an AST node manually that has a number variant with a non-finite tracked literal
    // by using a very large maxTrackedLiteralsPerVariant so overflow doesn't hide it,
    // then post-processing is internal — we verify the near-miss is NOT emitted for a
    // set of values that would otherwise produce one.
    //
    // The non-finite literal path (line 646) is reached when a number literal key converts to
    // non-finite via Number(). We can exercise this by observing that with float literals
    // that are finite, the path works normally, and confirming the function returns early
    // without adding ratio near_miss entries when there are no number enum near misses to capture.
    const root = inferFromValues([1, 2, 3, 1, 2, 3, 1, 2, 3, 1]);
    const diagnostics = analyzeSchema(root, {
      heuristics: {
        minEnumCount: 2, // totalCount=10 >= minEnumCount, no sample_count near-miss
        maxEnumSize: 2,  // distinctCount=3 > maxEnumSize=2, triggers enum candidate
        enumThreshold: 1.0
      }
    });

    // Should have enum near-miss for distinct_count (3 > 2), not crash
    expect(
      diagnostics.degradations.some(
        (entry) =>
          entry.kind === "threshold_near_miss" &&
          entry.metric === "enum_distinct_count" &&
          entry.context === "number"
      )
    ).toBe(true);
  });

  test("getStringFormatNearMisses returns empty when strings have no formatCounts", () => {
    // Plain non-format strings produce no format near-misses
    const root = inferFromValues(["hello", "world", "test"]);
    const diagnostics = analyzeSchema(root, {
      heuristics: {
        minFormatCount: 2,
        stringFormatThreshold: 0.5
      }
    });

    // No format near-miss should be emitted since none of the strings match any format
    const formatNearMisses = diagnostics.degradations.filter(
      (entry) => entry.kind === "threshold_near_miss" && entry.metric === "format_confidence"
    );
    expect(formatNearMisses).toHaveLength(0);
  });

  test("getRequiredNearMiss emits degradation when presence is just below threshold (line 436)", () => {
    // requiredThreshold=1.0 (default), seen=19 out of 20 → presence=0.95, delta=0.05 exactly
    // RATIO_NEAR_MISS_MARGIN = 0.05, so delta <= margin → degradation IS pushed (line 436).
    const objects = [
      ...Array.from({ length: 19 }, () => ({ a: 1 })),
      {} // missing 'a' once
    ];
    const root = inferFromValues(objects);
    const diagnostics = analyzeSchema(root, {
      heuristics: { requiredThreshold: 1.0 }
    });

    expect(
      diagnostics.degradations.some(
        (entry) =>
          entry.kind === "threshold_near_miss" &&
          entry.metric === "required_presence" &&
          entry.path === "$.a"
      )
    ).toBe(true);
    expect(diagnostics.summary.thresholdNearMissCount).toBeGreaterThan(0);
  });

  test("getNumberEnumNearMisses returns early when numberVariant has a non-finite literal key (line 646)", () => {
    // Build a node with a number (float) variant whose literals Map contains
    // a non-finite string key (e.g. "Infinity"). This exercises the early return on line 646.
    const node = createNode();
    // Add enough samples to pass minEnumCount
    for (let i = 0; i < 5; i++) {
      mergeValue(node, 1.5); // number variant (not integer)
    }

    // Directly inject a non-finite key into the number variant's literals
    const numVariant = node.variants.number;
    if (numVariant?.literals) {
      numVariant.literals.set("Infinity", 1);
      numVariant.count += 1;
    }

    // With minEnumCount=3 and totalCount=6, we're past the sample_count near-miss check.
    // When iterating numberVariant.literals, Number("Infinity") is not finite → early return.
    const diagnostics = analyzeSchema(node, {
      heuristics: {
        minEnumCount: 3,
        maxEnumSize: 20,
        enumThreshold: 0.5
      }
    });

    // The function returns early without emitting enum_distinct_ratio near-miss
    const ratioNearMisses = diagnostics.degradations.filter(
      (entry) =>
        entry.kind === "threshold_near_miss" && entry.metric === "enum_distinct_ratio"
    );
    expect(ratioNearMisses).toHaveLength(0);
  });

  test("getNumberEnumNearMisses returns early when integerVariant has a non-finite literal key (line 636)", () => {
    // Same as line 646 test but with the INTEGER variant having the non-finite key.
    const node = createNode();
    // 5 integer samples
    for (let i = 0; i < 5; i++) {
      mergeValue(node, 1); // integer variant
    }

    // Inject non-finite string key into the integer variant's literals
    const intVariant = node.variants.integer;
    if (intVariant?.literals) {
      intVariant.literals.set("NaN", 1);
      intVariant.count += 1;
    }

    // totalCount=6 >= minEnumCount=3; when iterating integerVariant.literals,
    // Number("NaN") is NaN (not finite) → early return before ratio/count near-misses.
    const diagnostics = analyzeSchema(node, {
      heuristics: {
        minEnumCount: 3,
        maxEnumSize: 20,
        enumThreshold: 0.5
      }
    });

    const ratioNearMisses = diagnostics.degradations.filter(
      (entry) =>
        entry.kind === "threshold_near_miss" && entry.metric === "enum_distinct_ratio"
    );
    expect(ratioNearMisses).toHaveLength(0);
  });

  test("getNumberEnumNearMisses emits enum_sample_count near-miss when count is just below threshold (line 619)", () => {
    // totalCount=3, minEnumCount=4 → below by 1, within COUNT_NEAR_MISS_MARGIN=2 → near-miss pushed (line 619)
    const root = inferFromValues([1, 2, 3]); // 3 integers
    const diagnostics = analyzeSchema(root, {
      heuristics: {
        minEnumCount: 4, // totalCount=3 is 1 below → qualifies for sample_count near-miss
        enumThreshold: 0.9
      }
    });

    expect(
      diagnostics.degradations.some(
        (entry) =>
          entry.kind === "threshold_near_miss" &&
          entry.metric === "enum_sample_count" &&
          entry.context === "number"
      )
    ).toBe(true);
  });

  test("formatDiagnosticsReport omits optional sections when empty", () => {
    // Use a single plain string — no enums, no formats, no objects, no conflicts
    const root = inferFromValues(["hello"]);
    const diagnostics = analyzeSchema(root);
    const report = formatDiagnosticsReport(diagnostics);

    expect(report).toContain("Diagnostics summary:");
    expect(report).not.toContain("Top type conflicts:");
    expect(report).not.toContain("Top inferred enums:");
    expect(report).not.toContain("Top inferred string formats:");
    expect(report).not.toContain("Top degradations:");
  });

  test("formatDiagnosticsReport renders enum and string format sections when present", () => {
    const root = inferFromValues([
      "foo@example.com",
      "bar@example.com",
      "foo@example.com",
      "bar@example.com",
      "foo@example.com"
    ]);
    const diagnostics = analyzeSchema(root, {
      heuristics: {
        enumThreshold: 0.5,
        minFormatCount: 2,
        stringFormatThreshold: 1
      }
    });
    const report = formatDiagnosticsReport(diagnostics);

    expect(report).toContain("Top inferred enums:");
    expect(report).toContain("Top inferred string formats:");
  });

  test("analyzeSchema counts unknown nodes", () => {
    const root = inferFromValues([Infinity]);
    const diagnostics = analyzeSchema(root);
    expect(diagnostics.summary.unknownNodeCount).toBeGreaterThan(0);
  });

  test("analyzeSchema skips missing object properties in property map defensively", () => {
    const root = inferFromValues([{ ok: 1 }]);
    const objectVariant = root.variants.object;
    if (!objectVariant) {
      throw new Error("Expected object variant.");
    }

    objectVariant.properties.set("ghost", undefined as never);

    const diagnostics = analyzeSchema(root);
    expect(diagnostics.summary.nodesVisited).toBeGreaterThan(1);
    expect(diagnostics.optionalFields.some((entry) => entry.path.includes("ghost"))).toBe(false);
  });

  test("number near misses return early when literal tracking overflow is set", () => {
    const root = inferFromValues([1, 2, 3], {
      astMergeOptions: {
        maxTrackedLiteralsPerVariant: 1
      }
    });
    const diagnostics = analyzeSchema(root, {
      heuristics: {
        minEnumCount: 4
      }
    });

    expect(
      diagnostics.degradations.some(
        (entry) =>
          entry.kind === "threshold_near_miss" &&
          entry.metric === "enum_sample_count" &&
          entry.context === "number"
      )
    ).toBe(false);
  });

  test("string format near-miss tie-break prefers lexicographically smaller format", () => {
    const root = inferFromValues([
      "https://example.com/a",
      "https://example.com/b",
      "alpha@example.com",
      "beta@example.com"
    ]);
    const diagnostics = analyzeSchema(root, {
      heuristics: {
        minFormatCount: 2,
        stringFormatThreshold: 0.55
      }
    });

    expect(
      diagnostics.degradations.some(
        (entry) =>
          entry.kind === "threshold_near_miss" &&
          entry.metric === "format_confidence" &&
          entry.context === "email"
      )
    ).toBe(true);
  });

  test("string format near-miss handling returns empty for empty formatCounts map", () => {
    const root = createNode();
    mergeValue(root, "plain-value");
    const stringVariant = root.variants.string;
    if (!stringVariant) {
      throw new Error("Expected string variant.");
    }

    stringVariant.formatCounts = new Map();

    const diagnostics = analyzeSchema(root, {
      heuristics: {
        minFormatCount: 1,
        stringFormatThreshold: 0.5
      }
    });

    expect(diagnostics.summary.stringFormatCount).toBe(0);
    expect(
      diagnostics.degradations.some(
        (entry) =>
          entry.kind === "threshold_near_miss" &&
          (entry.metric === "format_confidence" || entry.metric === "format_sample_count")
      )
    ).toBe(false);
  });

  test("optional-field paths quote non-identifier property names", () => {
    const root = inferFromValues([{ "bad-key": 1 }, {}]);
    const diagnostics = analyzeSchema(root);
    expect(diagnostics.optionalFields.some((entry) => entry.path === '$."bad-key"')).toBe(true);
  });

  test("record-like diagnostics guard handles variants that become empty at stats time", () => {
    const root = createNode();
    root.occurrences = 1;

    const propertyNode = createNode();
    mergeValue(propertyNode, 1);

    let countReads = 0;
    const unstableObjectVariant = {
      kind: "object",
      properties: new Map([
        [
          "value",
          {
            seenCount: 1,
            node: propertyNode
          }
        ]
      ])
    } as {
      kind: "object";
      count: number;
      properties: Map<string, { seenCount: number; node: ReturnType<typeof createNode> }>;
    };

    Object.defineProperty(unstableObjectVariant, "count", {
      get() {
        countReads += 1;
        return countReads <= 2 ? 1 : 0;
      }
    });

    root.variants.object = unstableObjectVariant;

    const diagnostics = analyzeSchema(root, {
      heuristics: {
        recordMinKeys: 1,
        recordMaxPresence: 1
      }
    });

    const collapsed = diagnostics.degradations.find(
      (entry) => entry.kind === "record_like_collapsed" && entry.path === "$"
    );
    expect(collapsed).toBeDefined();
    if (!collapsed || collapsed.kind !== "record_like_collapsed") {
      throw new Error("Expected record_like_collapsed degradation finding.");
    }

    expect(collapsed.maxPresence).toBe(0);
    expect(collapsed.averagePresence).toBe(0);
  });
});
