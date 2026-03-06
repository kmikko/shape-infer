import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

interface BannedZodApiPattern {
  source: string;
  regex: RegExp;
  origin: "deprecated" | "legacy";
  detail: string;
}

const LEGACY_BANNED_PATTERNS: Array<
  Pick<BannedZodApiPattern, "source" | "detail">
> = [
  {
    source: "z\\.number\\(\\)\\.int\\(",
    detail: "z.number().int() is legacy in Zod v4; emit z.int() instead.",
  },
];

let cachedPatterns: BannedZodApiPattern[] | undefined;

export function assertNoDeprecatedOrLegacyZodApis(output: string): void {
  const patterns = getBannedPatterns();
  const sanitizedOutput = stripStringAndTemplateLiterals(output);

  for (const pattern of patterns) {
    const match = pattern.regex.exec(sanitizedOutput);
    if (!match || match.index < 0) {
      continue;
    }

    const snippet = extractSnippet(output, match.index, 100);
    throw new Error(
      `Generated Zod output contains banned API (${pattern.origin}): ${pattern.detail}\n` +
        `Pattern: ${pattern.source}\n` +
        `Snippet: ${snippet}`,
    );
  }
}

function getBannedPatterns(): BannedZodApiPattern[] {
  if (cachedPatterns) {
    return cachedPatterns;
  }

  const deprecatedPatterns = extractDeprecatedCallablePatterns();
  const legacyPatterns = LEGACY_BANNED_PATTERNS.map((pattern) => ({
    source: pattern.source,
    regex: new RegExp(pattern.source, "m"),
    origin: "legacy" as const,
    detail: pattern.detail,
  }));

  cachedPatterns = [...deprecatedPatterns, ...legacyPatterns];
  return cachedPatterns;
}

function extractDeprecatedCallablePatterns(): BannedZodApiPattern[] {
  const require = createRequire(import.meta.url);
  let typingsPath: string;
  try {
    const zodEntryPath = require.resolve("zod");
    const zodPackageRoot = path.dirname(zodEntryPath);
    typingsPath = path.join(zodPackageRoot, "v4", "classic", "schemas.d.ts");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to resolve zod typings for deprecated API policy: ${message}`,
      {
        cause: error,
      },
    );
  }

  if (!existsSync(typingsPath)) {
    throw new Error(
      `Unable to locate zod typings for deprecated API policy at ${typingsPath}.`,
    );
  }

  const typingsSource = readFileSync(typingsPath, "utf8");
  const lines = typingsSource.split(/\r?\n/);
  const patterns: BannedZodApiPattern[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes("@deprecated")) {
      continue;
    }

    const declaration = findNextDeclarationLine(lines, index + 1);
    if (!declaration) {
      continue;
    }

    const deprecatedFunction = parseDeprecatedFunctionName(declaration);
    if (deprecatedFunction) {
      const key = `function:${deprecatedFunction}`;
      if (!seen.has(key)) {
        seen.add(key);
        const escapedName = escapeForRegExp(deprecatedFunction);
        patterns.push({
          source: `z\\.${escapedName}\\(`,
          regex: new RegExp(`z\\.${escapedName}\\(`, "m"),
          origin: "deprecated",
          detail: `z.${deprecatedFunction}()`,
        });
      }
      continue;
    }

    const deprecatedMethod = parseDeprecatedMethodName(declaration);
    if (deprecatedMethod) {
      const key = `method:${deprecatedMethod}`;
      if (!seen.has(key)) {
        seen.add(key);
        const escapedName = escapeForRegExp(deprecatedMethod);
        patterns.push({
          source: `\\)\\.${escapedName}\\(`,
          regex: new RegExp(`\\)\\.${escapedName}\\(`, "m"),
          origin: "deprecated",
          detail: `).${deprecatedMethod}()`,
        });
      }
    }
  }

  if (patterns.length === 0) {
    throw new Error(
      "Failed to extract deprecated callable Zod APIs from zod/v4/classic/schemas.d.ts. Update tests/zod-output-policy.ts parser to match current typings format.",
    );
  }

  return patterns;
}

function findNextDeclarationLine(
  lines: string[],
  startIndex: number,
): string | undefined {
  for (let index = startIndex; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.length === 0) {
      continue;
    }

    if (
      trimmed.startsWith("/**") ||
      trimmed.startsWith("*/") ||
      trimmed.startsWith("*")
    ) {
      continue;
    }

    return trimmed;
  }

  return undefined;
}

function parseDeprecatedFunctionName(declaration: string): string | undefined {
  const match = declaration.match(
    /^export\s+declare\s+function\s+([A-Za-z_$][A-Za-z0-9_$]*)(?:<[^>]*>)?\s*\(/,
  );
  return match?.[1];
}

function parseDeprecatedMethodName(declaration: string): string | undefined {
  const match = declaration.match(
    /^([A-Za-z_$][A-Za-z0-9_$]*)(?:<[^>]*>)?\s*\(/,
  );
  return match?.[1];
}

function stripStringAndTemplateLiterals(source: string): string {
  let sanitized = "";
  let state: "code" | "single" | "double" | "template" = "code";
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (state === "code") {
      if (char === "'") {
        state = "single";
        sanitized += " ";
        continue;
      }
      if (char === '"') {
        state = "double";
        sanitized += " ";
        continue;
      }
      if (char === "`") {
        state = "template";
        sanitized += " ";
        continue;
      }
      sanitized += char;
      continue;
    }

    if (escaped) {
      escaped = false;
      sanitized += char === "\n" ? "\n" : " ";
      continue;
    }

    if (char === "\\") {
      escaped = true;
      sanitized += " ";
      continue;
    }

    if (
      (state === "single" && char === "'") ||
      (state === "double" && char === '"') ||
      (state === "template" && char === "`")
    ) {
      state = "code";
      sanitized += " ";
      continue;
    }

    sanitized += char === "\n" ? "\n" : " ";
  }

  return sanitized;
}

function extractSnippet(source: string, index: number, width: number): string {
  const halfWidth = Math.floor(width / 2);
  const start = Math.max(0, index - halfWidth);
  const end = Math.min(source.length, index + halfWidth);
  return source.slice(start, end).replace(/\s+/g, " ").trim();
}

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
