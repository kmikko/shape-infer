import { describe, expect, test } from "vitest";
import { emitJsonSchema } from "../src/emitters/json-schema";
import { emitTypeScriptType } from "../src/emitters/typescript";
import { emitZodSchema } from "../src/emitters/zod";
import { HeuristicOptions } from "../src/heuristics";
import { inferFromValues } from "../src/infer";

interface SnapshotCase {
  name: string;
  values: unknown[];
  heuristics?: Partial<HeuristicOptions>;
}

const SNAPSHOT_CASES: SnapshotCase[] = [
  {
    name: "catalog-mixed",
    values: [
      {
        id: 1,
        category: "Wine",
        price: 10.5,
        tags: ["sale", "europe"],
        certification: "Fairtrade",
        launchedAt: "2024-01-02T12:00:00Z"
      },
      {
        id: 2,
        category: "Beer",
        price: 12,
        tags: ["local"],
        certification: null,
        launchedAt: "2024-01-03T12:00:00Z"
      },
      {
        id: "3",
        category: "Wine",
        price: null,
        tags: [],
        certification: "Fair for Life",
        launchedAt: "not-a-date"
      }
    ],
    heuristics: {
      minEnumCount: 2,
      enumThreshold: 1,
      minFormatCount: 2,
      stringFormatThreshold: 0.6
    }
  },
  {
    name: "record-like-attributes",
    values: [
      {
        sku: "A-1",
        attributes: {
          a: "red",
          b: "dry",
          c: "fresh",
          d: "yes"
        }
      },
      {
        sku: "A-2",
        attributes: {
          e: "white",
          f: "sweet",
          g: "aged",
          h: "no"
        }
      },
      {
        sku: "A-3",
        attributes: {
          i: "sparkling",
          j: "dry",
          k: "young",
          l: null
        }
      }
    ],
    heuristics: {
      minEnumCount: 2,
      enumThreshold: 1,
      recordMinKeys: 4,
      recordMaxPresence: 0.4
    }
  }
];

describe("emitter golden snapshots", () => {
  for (const fixture of SNAPSHOT_CASES) {
    test(fixture.name, () => {
      const root = inferFromValues(fixture.values);

      const snapshot = {
        typescriptStrict: emitTypeScriptType(root, {
          rootTypeName: "SnapshotType",
          heuristics: fixture.heuristics
        }),
        typescriptLooseOptional: emitTypeScriptType(root, {
          rootTypeName: "SnapshotType",
          typeMode: "loose",
          allOptionalProperties: true,
          heuristics: fixture.heuristics
        }),
        zodStrict: emitZodSchema(root, {
          rootTypeName: "SnapshotType",
          heuristics: fixture.heuristics
        }),
        zodLooseOptional: emitZodSchema(root, {
          rootTypeName: "SnapshotType",
          typeMode: "loose",
          allOptionalProperties: true,
          heuristics: fixture.heuristics
        }),
        jsonSchemaStrict: JSON.stringify(
          emitJsonSchema(root, {
            rootTitle: "SnapshotType",
            heuristics: fixture.heuristics
          }),
          null,
          2
        ),
        jsonSchemaLooseOptional: JSON.stringify(
          emitJsonSchema(root, {
            rootTitle: "SnapshotType",
            typeMode: "loose",
            allOptionalProperties: true,
            heuristics: fixture.heuristics
          }),
          null,
          2
        )
      };

      expect(snapshot).toMatchSnapshot();
    });
  }
});
