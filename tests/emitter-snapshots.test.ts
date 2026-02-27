import { describe, expect, test } from "vitest";
import { emitJsonSchema } from "../src/emitters/json-schema.ts";
import { emitTypeScriptType } from "../src/emitters/typescript.ts";
import { emitZodSchema } from "../src/emitters/zod.ts";
import { inferFromValues } from "../src/infer.ts";

interface SnapshotCase {
  name: string;
  values: unknown[];
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
        launchedAt: "2024-01-02T12:00:00Z",
      },
      {
        id: 2,
        category: "Beer",
        price: 12,
        tags: ["local"],
        certification: null,
        launchedAt: "2024-01-03T12:00:00Z",
      },
      {
        id: "3",
        category: "Wine",
        price: null,
        tags: [],
        certification: "Fair for Life",
        launchedAt: "not-a-date",
      },
    ],
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
          d: "yes",
        },
      },
      {
        sku: "A-2",
        attributes: {
          e: "white",
          f: "sweet",
          g: "aged",
          h: "no",
        },
      },
      {
        sku: "A-3",
        attributes: {
          i: "sparkling",
          j: "dry",
          k: "young",
          l: null,
        },
      },
    ],
  },
];

describe("emitter golden snapshots", () => {
  for (const fixture of SNAPSHOT_CASES) {
    test(fixture.name, () => {
      const root = inferFromValues(fixture.values);

      const snapshot = {
        typescriptStrict: emitTypeScriptType(root, {
          rootTypeName: "SnapshotType",
        }),
        typescriptLooseOptional: emitTypeScriptType(root, {
          rootTypeName: "SnapshotType",
          typeMode: "loose",
          allOptionalProperties: true,
        }),
        zodStrict: emitZodSchema(root, {
          rootTypeName: "SnapshotType",
        }),
        zodLooseOptional: emitZodSchema(root, {
          rootTypeName: "SnapshotType",
          typeMode: "loose",
          allOptionalProperties: true,
        }),
        jsonSchemaStrict: JSON.stringify(
          emitJsonSchema(root, {
            rootTitle: "SnapshotType",
          }),
          null,
          2,
        ),
        jsonSchemaLooseOptional: JSON.stringify(
          emitJsonSchema(root, {
            rootTitle: "SnapshotType",
            typeMode: "loose",
            allOptionalProperties: true,
          }),
          null,
          2,
        ),
      };

      expect(snapshot).toMatchSnapshot();
    });
  }
});
