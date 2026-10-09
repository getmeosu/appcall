import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import rawManifest from "../manifest.json";

const manifest = rawManifest as any;
const expectedOperations = ["healthcheck", "employees.list", "employees.get", "jobPostings.list", "jobPostings.get", "employees.create", "employees.update", "employees.sendInvite", "employeeFields.list", "applicants.create", "branches.list", "departments.list", "teams.list", "roles.list", "levels.list", "timeOffs.list", "timeOffs.get", "timeOffs.create", "timeOffTypes.list", "newHires.get", "newHires.create", "candidateSources.list"] as const;
const connectorDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const casesDirectory = join(connectorDirectory, "fixtures", "cases");

function readCases(): any[] {
  return readdirSync(casesDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(casesDirectory, name), "utf8")));
}

test("freshteam preserves the selected full manifest", () => {
  expect(manifest.key).toBe("freshteam");
  expect(manifest.version).toBe("0.2.0");
  expect(Object.keys(manifest.operations)).toEqual(expectedOperations);
  for (const operation of Object.values(manifest.operations) as any[]) {
    expect(operation.kind).toBe("action");
    expect(operation.request?.method).toMatch(/^(GET|POST|PUT|PATCH|DELETE)$/);
    expect(operation.request?.path).toStartWith("/");
    expect(operation.inputSchema?.type).toBe("object");
  }
});

test("freshteam fixtures strictly cover every action operation", () => {
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
