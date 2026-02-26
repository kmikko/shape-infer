import { describe, expect, test } from "vitest";
import { generateFromText } from "../src/public-api.ts";

// Complex dataset to exercise various inference paths
const COMPLEX_DATASET = [
  {
    id: 1,
    name: "Alice",
    email: "alice@example.com",
    roles: ["admin", "editor"],
    meta: {
      login_count: 42,
      last_seen: "2023-01-01T12:00:00Z",
      preferences: { theme: "dark" }
    },
    flags: { valid: true }
  },
  {
    id: "2",
    name: "Bob",
    email: null,
    roles: ["viewer"],
    meta: {
      login_count: 0,
      last_seen: null,
      preferences: {}
    },
    flags: { verified: false }
  },
  {
    id: 3,
    // missing name
    roles: [],
    meta: {
      // missing login_count
      extra: "field"
    }
    // missing flags
  }
];

describe("public api golden snapshots", () => {
  test("matches typescript output snapshot", async () => {
    const result = await generateFromText({
      text: JSON.stringify(COMPLEX_DATASET),
      format: "typescript",
      typeName: "UserRecord",
      typeMode: "strict",
      includeDiagnostics: true
    });
    expect(result.output).toMatchSnapshot();
    expect(result.diagnostics).toMatchSnapshot();
  });

  test("matches zod output snapshot", async () => {
    const result = await generateFromText({
      text: JSON.stringify(COMPLEX_DATASET),
      format: "zod",
      typeName: "UserSchema",
      typeMode: "strict"
    });
    expect(result.output).toMatchSnapshot();
  });

  test("matches json-schema output snapshot", async () => {
    const result = await generateFromText({
      text: JSON.stringify(COMPLEX_DATASET),
      format: "json-schema",
      typeName: "User"
    });
    expect(result.output).toMatchSnapshot();
  });
});
