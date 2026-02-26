#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";

interface SmokeCase {
  name: string;
  args: string[];
}

const root = process.cwd();
const cliPath = path.resolve(root, "src/cli.ts");
const fixture = (fileName: string): string =>
  path.resolve(root, "tests", "fixtures", "smoke", fileName);

const cases: SmokeCase[] = [
  {
    name: "typescript output",
    args: [
      "--input",
      fixture("sample.jsonl"),
      "--type-name",
      "SampleRecord",
      "--format",
      "typescript",
    ],
  },
  {
    name: "zod output",
    args: [
      "--input",
      fixture("sample.jsonl"),
      "--type-name",
      "SampleRecord",
      "--format",
      "zod",
    ],
  },
  {
    name: "json-schema output",
    args: [
      "--input",
      fixture("sample.jsonl"),
      "--type-name",
      "SampleRecord",
      "--format",
      "json-schema",
    ],
  },
  {
    name: "multi-input merge",
    args: [
      "--input",
      fixture("sample.jsonl"),
      "--input",
      fixture("sample-array.json"),
      "--input",
      fixture("sample-object.json"),
      "--input-format",
      "auto",
      "--type-name",
      "MixedRecord",
      "--format",
      "typescript",
    ],
  },
  {
    name: "glob ingestion",
    args: [
      "--input",
      path.resolve(root, "tests", "fixtures", "smoke", "sample*.json*"),
      "--input-format",
      "auto",
      "--type-name",
      "MixedRecord",
      "--format",
      "json-schema",
    ],
  },
];

for (const smokeCase of cases) {
  // Simple visual separator so CI logs show which scenario failed.
  process.stdout.write(`\n[smoke] ${smokeCase.name}\n`);
  await runCase(smokeCase.args);
}

function runCase(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Smoke command failed with exit code ${code}.`));
    });
  });
}
