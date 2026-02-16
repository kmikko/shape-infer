import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    typecheck: {
      tsconfig: "./tsconfig.vitest.json",
      include: ["tests/**/*.test-d.ts"]
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 100,
        lines: 90
      }
    }
  }
});
