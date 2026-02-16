import fg from "fast-glob";
import { resolve } from "node:path";

export async function resolveInputPaths(
  inputPatterns: string[],
  cwd: string = process.cwd()
): Promise<string[]> {
  if (inputPatterns.length === 0) {
    return [];
  }

  const resolvedPaths: string[] = [];
  const seenPaths = new Set<string>();
  const unmatchedPatterns: string[] = [];

  for (const inputPattern of inputPatterns) {
    const matches = await fg(inputPattern, {
      absolute: true,
      cwd,
      dot: true,
      onlyFiles: true,
      unique: true
    });

    if (matches.length === 0) {
      unmatchedPatterns.push(inputPattern);
      continue;
    }

    matches.sort((left, right) => left.localeCompare(right));
    for (const match of matches) {
      const normalizedPath = resolve(match);
      if (seenPaths.has(normalizedPath)) {
        continue;
      }

      seenPaths.add(normalizedPath);
      resolvedPaths.push(normalizedPath);
    }
  }

  if (unmatchedPatterns.length > 0) {
    throw new Error(
      `No files matched input pattern(s): ${unmatchedPatterns
        .map((pattern) => JSON.stringify(pattern))
        .join(", ")}`
    );
  }

  return resolvedPaths;
}
