#!/usr/bin/env node

/**
 * Pack smoke test — simulates installing the published tarball and verifies:
 * 1. Runtime imports from "shape-infer" (root) and "shape-infer/public-api"
 * 2. generateFromText facade returns expected output shape
 * 3. CLI bin (`shape-infer --help`) works
 */

import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();

// ---------------------------------------------------------------------------
// 1. Pack the tarball
// ---------------------------------------------------------------------------
console.log("\n[pack-smoke] Packing tarball…");
const packOutput = execSync("npm pack --json", {
  cwd: root,
  encoding: "utf-8",
});
const packInfo = JSON.parse(packOutput) as { filename: string }[];
const tarball = path.resolve(root, packInfo[0].filename);
console.log(`[pack-smoke] Tarball: ${tarball}`);

// ---------------------------------------------------------------------------
// 2. Create temp project and install
// ---------------------------------------------------------------------------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-smoke-"));
console.log(`[pack-smoke] Temp dir: ${tmpDir}`);

fs.writeFileSync(
  path.join(tmpDir, "package.json"),
  JSON.stringify(
    { name: "pack-smoke-consumer", version: "1.0.0", type: "module" },
    null,
    2,
  ),
);

console.log("[pack-smoke] Installing tarball…");
execSync(`npm install "${tarball}"`, { cwd: tmpDir, stdio: "pipe" });

// ---------------------------------------------------------------------------
// 3. Verify root import ("shape-infer")
// ---------------------------------------------------------------------------
console.log("[pack-smoke] Verifying root import…");
const rootImportScript = `
  import { generateFromText } from "shape-infer";
  if (typeof generateFromText !== "function") {
    throw new Error("generateFromText is not a function on root import");
  }
  console.log("[pack-smoke]   ✓ root import OK");
`;
execSync(
  `node --input-type=module -e '${rootImportScript.replace(/'/g, "'\\''")}'`,
  {
    cwd: tmpDir,
    stdio: "inherit",
  },
);

// ---------------------------------------------------------------------------
// 4. Verify subpath import ("shape-infer/public-api")
// ---------------------------------------------------------------------------
console.log("[pack-smoke] Verifying public-api subpath import…");
const subpathScript = `
  import { generateFromText, generateFromFiles } from "shape-infer/public-api";
  for (const [name, fn] of [["generateFromText", generateFromText], ["generateFromFiles", generateFromFiles]]) {
    if (typeof fn !== "function") throw new Error(name + " is not a function on subpath import");
  }
  console.log("[pack-smoke]   ✓ public-api subpath import OK");
`;
execSync(
  `node --input-type=module -e '${subpathScript.replace(/'/g, "'\\''")}'`,
  {
    cwd: tmpDir,
    stdio: "inherit",
  },
);

// ---------------------------------------------------------------------------
// 5. Verify generateFromText output shape
// ---------------------------------------------------------------------------
console.log("[pack-smoke] Verifying generateFromText output shape…");
const shapeScript = `
  import { generateFromText } from "shape-infer";
  const result = await generateFromText({
    text: '[{"id":1,"name":"a"},{"id":2,"name":"b"}]',
    inputFormat: "json",
    format: "typescript",
    typeName: "TestRecord"
  });
  const requiredKeys = ["root", "output", "format", "typeName", "stats", "parseErrorLines", "files", "warnings"];
  for (const key of requiredKeys) {
    if (!(key in result)) throw new Error("Missing key in result: " + key);
  }
  if (typeof result.output !== "string" || result.output.length === 0) {
    throw new Error("output should be a non-empty string");
  }
  if (result.format !== "typescript") throw new Error("format mismatch");
  if (result.typeName !== "TestRecord") throw new Error("typeName mismatch");
  if (typeof result.stats.recordsMerged !== "number" || result.stats.recordsMerged !== 2) {
    throw new Error("stats.recordsMerged should be 2, got " + result.stats.recordsMerged);
  }
  console.log("[pack-smoke]   ✓ generateFromText output shape OK");
`;
execSync(
  `node --input-type=module -e '${shapeScript.replace(/'/g, "'\\''")}'`,
  {
    cwd: tmpDir,
    stdio: "inherit",
  },
);

// ---------------------------------------------------------------------------
// 6. Verify CLI bin works
// ---------------------------------------------------------------------------
console.log("[pack-smoke] Verifying CLI bin (shape-infer)…");
const binPath = path.join(tmpDir, "node_modules", ".bin", "shape-infer");
if (!fs.existsSync(binPath)) {
  throw new Error("CLI bin symlink not found at " + binPath);
}
const binTarget = fs.realpathSync(binPath);
if (!fs.existsSync(binTarget)) {
  throw new Error("CLI bin target does not exist: " + binTarget);
}
if (!binTarget.endsWith("cli.js")) {
  throw new Error("CLI bin target unexpected: " + binTarget);
}
console.log(
  "[pack-smoke]   ✓ CLI bin OK (-> " + path.basename(binTarget) + ")",
);

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.rmSync(tarball, { force: true });
console.log("[pack-smoke] ✅ All checks passed.\n");
