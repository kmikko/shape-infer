import { describe, expect, test } from "vitest";
import { emitJsonSchema } from "../src/emitters/json-schema.ts";
import { emitTypeScriptType } from "../src/emitters/typescript.ts";
import { emitZodSchema } from "../src/emitters/zod.ts";
import { inferFromValues } from "../src/infer.ts";

function mulberry32(seed: number): () => number {
  let current = seed;

  return () => {
    current |= 0;
    current = (current + 0x6d2b79f5) | 0;
    let t = Math.imul(current ^ (current >>> 15), 1 | current);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomString(random: () => number): string {
  const alphabet = "abcdefxyz";
  const length = randomInt(random, 1, 8);
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += alphabet[randomInt(random, 0, alphabet.length - 1)];
  }
  return value;
}

function randomValue(random: () => number, depth: number): unknown {
  const terminalOnly = depth >= 2;
  const choice = randomInt(random, 0, terminalOnly ? 4 : 6);

  switch (choice) {
    case 0:
      return null;
    case 1:
      return random() > 0.5;
    case 2:
      return randomInt(random, -50, 50);
    case 3:
      return Number((random() * 100).toFixed(2));
    case 4:
      return randomString(random);
    case 5: {
      const size = randomInt(random, 0, 4);
      const array: unknown[] = [];
      for (let index = 0; index < size; index += 1) {
        array.push(randomValue(random, depth + 1));
      }
      return array;
    }
    default:
      return randomObject(random, depth + 1);
  }
}

function randomObject(
  random: () => number,
  depth: number,
): Record<string, unknown> {
  const keyCount = randomInt(random, 1, 5);
  const record: Record<string, unknown> = {};

  for (let index = 0; index < keyCount; index += 1) {
    const key = `k${randomInt(random, 1, 12)}`;
    record[key] = randomValue(random, depth);
  }

  return record;
}

function generateDataset(
  seed: number,
  size: number,
): Array<Record<string, unknown>> {
  const random = mulberry32(seed);
  const values: Array<Record<string, unknown>> = [];

  for (let index = 0; index < size; index += 1) {
    values.push(randomObject(random, 0));
  }

  return values;
}

function emitAll(values: unknown[]) {
  const root = inferFromValues(values);

  return {
    tsStrict: emitTypeScriptType(root, { rootTypeName: "FuzzRoot" }),
    tsLoose: emitTypeScriptType(root, {
      rootTypeName: "FuzzRoot",
      typeMode: "loose",
      allOptionalProperties: true,
    }),
    zodStrict: emitZodSchema(root, { rootTypeName: "FuzzRoot" }),
    zodLoose: emitZodSchema(root, {
      rootTypeName: "FuzzRoot",
      typeMode: "loose",
      allOptionalProperties: true,
    }),
    jsonSchemaStrict: JSON.stringify(
      emitJsonSchema(root, { rootTitle: "FuzzRoot" }),
      null,
      2,
    ),
    jsonSchemaLoose: JSON.stringify(
      emitJsonSchema(root, {
        rootTitle: "FuzzRoot",
        typeMode: "loose",
        allOptionalProperties: true,
      }),
      null,
      2,
    ),
  };
}

describe("fuzz-like inference invariants", () => {
  for (const seed of [11, 22, 33, 44, 55]) {
    test(`seed ${seed} emits deterministically and without throwing`, () => {
      const values = generateDataset(seed, 25);
      const clonedValues = JSON.parse(JSON.stringify(values)) as unknown[];

      const first = emitAll(values);
      const second = emitAll(clonedValues);

      expect(first).toEqual(second);
      expect(first.tsStrict).toContain("export type FuzzRoot");
      expect(first.zodStrict).toContain("export const FuzzRoot");
      expect(first.jsonSchemaStrict).toContain('"title": "FuzzRoot"');
    });
  }
});
