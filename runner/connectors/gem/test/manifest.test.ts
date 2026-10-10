import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import rawManifest from "../manifest.json";

const manifest = rawManifest as any;
const expectedOperations = ["healthcheck", "users.list", "candidates.list", "candidates.get", "projects.list", "candidates.create", "candidates.update", "candidates.delete", "candidates.notes.list", "notes.create", "notes.get", "notes.delete", "projects.get", "projects.create", "projects.update", "projects.candidates.list", "projects.candidates.add", "sequences.list", "sequences.get", "customFields.list", "customFields.get"] as const;
const connectorDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const casesDirectory = join(connectorDirectory, "fixtures", "cases");

function readCases(): any[] {
  return readdirSync(casesDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(casesDirectory, name), "utf8")));
}

test("gem preserves the selected full manifest", () => {
  expect(manifest.key).toBe("gem");
  expect(manifest.version).toBe("0.2.0");
  expect(Object.keys(manifest.operations)).toEqual(expectedOperations);
  for (const operation of Object.values(manifest.operations) as any[]) {
    expect(operation.kind).toBe("action");
    expect(operation.request?.method).toMatch(/^(GET|POST|PUT|PATCH|DELETE)$/);
    expect(operation.request?.path).toStartWith("/");
    expect(operation.inputSchema?.type).toBe("object");
  }
});

test("gem fixtures strictly cover every action operation", () => {
  const cases = readCases();
  const positive = new Set<string>();
  const seen = new Set<string>();
  expect(cases.length).toBeGreaterThan(0);
  for (const fixture of cases) {
    expect(expectedOperations).toContain(fixture.operation);
    seen.add(fixture.operation);
    if (fixture.expected.kind === "success") {
      expect(typeof fixture.expected.resultFile).toBe("string");
      if (fixture.exchanges.length > 0) positive.add(fixture.operation);
    } else {
      expect(typeof fixture.expected.code).toBe("string");
    }
    for (const exchange of fixture.exchanges) {
      expect(exchange.request.body === null || typeof exchange.request.body === "string").toBe(true);
    }
  }
  expect(seen).toEqual(new Set(expectedOperations));
  expect(positive).toEqual(new Set(expectedOperations));
});
