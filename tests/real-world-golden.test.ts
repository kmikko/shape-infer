import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { generateFromText } from "../src/public-api.ts";

type FixtureInputFormat = "json" | "jsonl";
type SampleMode = "json-array" | "jsonl-lines" | "json-map-keys";

interface FixtureCase {
  fileName: string;
  inputFormat: FixtureInputFormat;
  sampleMode: SampleMode;
  typeBaseName: string;
}

interface SampleSummary {
  inputFormat: FixtureInputFormat;
  sampleMode: SampleMode;
  emissionModes: Array<"strict" | "loose">;
  recordsBeforeSampling: number;
  recordsAfterSampling: number;
  sampledArrayProperty?: string;
  mapKeysBeforeSampling?: number;
  mapKeysAfterSampling?: number;
  limits: {
    jsonArrayItems: number;
    jsonlLines: number;
    jsonMapKeys: number;
  };
}

interface ModeOutputs {
  typescript: string;
  zod: string;
  jsonSchema: string;
}

const JSON_ARRAY_SAMPLE_LIMIT = 100;
const JSONL_SAMPLE_LIMIT = 100;
const JSON_MAP_KEY_SAMPLE_LIMIT = 100;

const FIXTURE_CASES: FixtureCase[] = [
  {
    fileName: "pokedex.json",
    inputFormat: "json",
    sampleMode: "json-array",
    typeBaseName: "Pokedex",
  },
  {
    fileName: "sample-mtg-allidentifiers-100.json",
    inputFormat: "json",
    sampleMode: "json-map-keys",
    typeBaseName: "MtgAllIdentifiers",
  },
  {
    fileName: "sample-gharchive-100.jsonl",
    inputFormat: "jsonl",
    sampleMode: "jsonl-lines",
    typeBaseName: "GhArchiveEvents",
  },
  {
    fileName: "sample-ol-editions-100.jsonl",
    inputFormat: "jsonl",
    sampleMode: "jsonl-lines",
    typeBaseName: "OpenLibraryEditions",
  },
  {
    fileName: "sample-ol-works-100.jsonl",
    inputFormat: "jsonl",
    sampleMode: "jsonl-lines",
    typeBaseName: "OpenLibraryWorks",
  },
  {
    fileName: "sample-openfoodfacts-products-100.jsonl",
    inputFormat: "jsonl",
    sampleMode: "jsonl-lines",
    typeBaseName: "OpenFoodFactsProducts",
  },
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, "fixtures", "samples");

describe("real-world golden snapshots", () => {
  test("fixture manifest includes at least three fixtures", () => {
    expect(FIXTURE_CASES.length).toBeGreaterThanOrEqual(3);
  });

  test("all configured fixtures exist", () => {
    for (const fixture of FIXTURE_CASES) {
      const fixturePath = path.join(FIXTURES_DIR, fixture.fileName);
      expect(existsSync(fixturePath)).toBe(true);
    }
  });

  for (const fixture of FIXTURE_CASES) {
    test(`fixture: ${fixture.fileName}`, async () => {
      const fixturePath = path.join(FIXTURES_DIR, fixture.fileName);
      const { values, sampleSummary } = loadAndSampleFixture(
        fixturePath,
        fixture,
      );

      expect(values.length).toBeGreaterThan(0);

      const snapshotPayload = {
        fixture: fixture.fileName,
        sampleSummary,
        strict: await emitFixtureOutputs(values, fixture.typeBaseName, "strict"),
        loose: await emitFixtureOutputs(values, fixture.typeBaseName, "loose"),
      };

      expect(snapshotPayload).toMatchSnapshot();
    });
  }
});

function loadAndSampleFixture(
  fixturePath: string,
  fixture: FixtureCase,
): { values: unknown[]; sampleSummary: SampleSummary } {
  const raw = readFileSync(fixturePath, "utf8");

  if (fixture.inputFormat === "jsonl" && fixture.sampleMode !== "jsonl-lines") {
    throw new Error(
      `Fixture ${fixture.fileName} has incompatible inputFormat/sampleMode: ${fixture.inputFormat}/${fixture.sampleMode}.`,
    );
  }

  if (fixture.inputFormat === "json" && fixture.sampleMode === "jsonl-lines") {
    throw new Error(
      `Fixture ${fixture.fileName} has incompatible inputFormat/sampleMode: ${fixture.inputFormat}/${fixture.sampleMode}.`,
    );
  }

  if (fixture.inputFormat === "jsonl") {
    const parsedLines = parseJsonlRecords(raw, fixture.fileName);
    const sampledLines = parsedLines.slice(0, JSONL_SAMPLE_LIMIT);

    return {
      values: sampledLines,
      sampleSummary: {
        inputFormat: fixture.inputFormat,
        sampleMode: fixture.sampleMode,
        emissionModes: ["strict", "loose"],
        recordsBeforeSampling: parsedLines.length,
        recordsAfterSampling: sampledLines.length,
        limits: {
          jsonArrayItems: JSON_ARRAY_SAMPLE_LIMIT,
          jsonlLines: JSONL_SAMPLE_LIMIT,
          jsonMapKeys: JSON_MAP_KEY_SAMPLE_LIMIT,
        },
      },
    };
  }

  const parsedJson = parseJsonValue(raw, fixture.fileName);

  if (fixture.sampleMode === "json-array") {
    if (Array.isArray(parsedJson)) {
      const sampledArray = parsedJson.slice(0, JSON_ARRAY_SAMPLE_LIMIT);
      return {
        values: sampledArray,
        sampleSummary: {
          inputFormat: fixture.inputFormat,
          sampleMode: fixture.sampleMode,
          emissionModes: ["strict", "loose"],
          recordsBeforeSampling: parsedJson.length,
          recordsAfterSampling: sampledArray.length,
          limits: {
            jsonArrayItems: JSON_ARRAY_SAMPLE_LIMIT,
            jsonlLines: JSONL_SAMPLE_LIMIT,
            jsonMapKeys: JSON_MAP_KEY_SAMPLE_LIMIT,
          },
        },
      };
    }

    if (isRecord(parsedJson)) {
      const arrayPropertyEntry = Object.entries(parsedJson).find(([, value]) =>
        Array.isArray(value),
      );

      if (!arrayPropertyEntry) {
        throw new Error(
          `Fixture ${fixture.fileName} uses json-array sampling but has no top-level array property.`,
        );
      }

      const [arrayPropertyName, arrayValue] = arrayPropertyEntry;
      const topLevelArray = arrayValue as unknown[];
      const sampledArrayValue = topLevelArray.slice(0, JSON_ARRAY_SAMPLE_LIMIT);
      const sampledObject = {
        ...parsedJson,
        [arrayPropertyName]: sampledArrayValue,
      };

      return {
        values: [sampledObject],
        sampleSummary: {
          inputFormat: fixture.inputFormat,
          sampleMode: fixture.sampleMode,
          emissionModes: ["strict", "loose"],
          recordsBeforeSampling: topLevelArray.length,
          recordsAfterSampling: sampledArrayValue.length,
          sampledArrayProperty: arrayPropertyName,
          limits: {
            jsonArrayItems: JSON_ARRAY_SAMPLE_LIMIT,
            jsonlLines: JSONL_SAMPLE_LIMIT,
            jsonMapKeys: JSON_MAP_KEY_SAMPLE_LIMIT,
          },
        },
      };
    }

    throw new Error(
      `Fixture ${fixture.fileName} uses json-array sampling but root JSON value is not an array or object.`,
    );
  }

  const mapContainer = resolveJsonMapContainer(parsedJson, fixture.fileName);
  const mapEntries = Object.entries(mapContainer);
  const sampledEntries = mapEntries.slice(0, JSON_MAP_KEY_SAMPLE_LIMIT);
  const sampledMapObject = Object.fromEntries(sampledEntries);

  return {
    values: [sampledMapObject],
    sampleSummary: {
      inputFormat: fixture.inputFormat,
      sampleMode: fixture.sampleMode,
      emissionModes: ["strict", "loose"],
      recordsBeforeSampling: 1,
      recordsAfterSampling: 1,
      mapKeysBeforeSampling: mapEntries.length,
      mapKeysAfterSampling: sampledEntries.length,
      limits: {
        jsonArrayItems: JSON_ARRAY_SAMPLE_LIMIT,
        jsonlLines: JSONL_SAMPLE_LIMIT,
        jsonMapKeys: JSON_MAP_KEY_SAMPLE_LIMIT,
      },
    },
  };
}

function parseJsonValue(raw: string, fileName: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${fileName} as JSON: ${message}`);
  }
}

function parseJsonlRecords(raw: string, fileName: string): unknown[] {
  const values: unknown[] = [];
  const lines = raw.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const trimmedLine = lines[index].trim();
    if (trimmedLine.length === 0) {
      continue;
    }

    try {
      values.push(JSON.parse(trimmedLine));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to parse ${fileName} JSONL line ${index + 1}: ${message}`,
      );
    }
  }

  return values;
}

function resolveJsonMapContainer(
  parsedJson: unknown,
  fileName: string,
): Record<string, unknown> {
  if (isRecord(parsedJson)) {
    return parsedJson;
  }

  if (
    Array.isArray(parsedJson) &&
    parsedJson.length === 1 &&
    isRecord(parsedJson[0])
  ) {
    return parsedJson[0];
  }

  throw new Error(
    `Fixture ${fileName} uses json-map-keys sampling but JSON root is not an object or a single-item object array.`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function emitFixtureOutputs(
  values: unknown[],
  typeBaseName: string,
  typeMode: "strict" | "loose",
): Promise<ModeOutputs> {
  const text = JSON.stringify(values);
  return {
    typescript: (await generateFromText({
      text,
      format: "typescript",
      typeName: typeBaseName,
      typeMode,
    })).output,
    zod: (await generateFromText({
      text,
      format: "zod",
      typeName: typeBaseName,
      typeMode,
    })).output,
    jsonSchema: (await generateFromText({
      text,
      format: "json-schema",
      typeName: typeBaseName,
      typeMode,
    })).output,
  };
}
