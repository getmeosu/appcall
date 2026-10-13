import { expect, test } from "bun:test";
import manifest from "../manifest.json";

test("Explorium has no openconnector template and every operation is one strict JSON route", () => {
  const operations = Object.entries(manifest.operations);
  expect(operations).toHaveLength(9);
  const paths = new Set<string>();
  for (const [key, operation] of operations) {
    expect(operation.kind, key).toBe("action");
    expect(operation.request.method, key).toMatch(/^(GET|POST)$/);
    expect(operation.request.path.startsWith("/v2/"), key).toBe(true);
    expect(operation.request.path.includes("http"), key).toBe(false);
    expect(paths.has(operation.request.path), key).toBe(false);
    paths.add(operation.request.path);
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.outputSchema.type, key).toBe("object");
  }
  expect(manifest.http.baseUrl).toBe("https://api.explorium.ai");
  expect(Object.keys(manifest.http.headers)).toEqual(["Accept"]);
});
