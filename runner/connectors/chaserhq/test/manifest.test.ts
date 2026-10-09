import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "../manifest.json";

const casesDir = fileURLToPath(new URL("../fixtures/cases/", import.meta.url));
const cases = readdirSync(casesDir).filter((name) => name.endsWith(".json")).sort().map((name) => ({
  file: name,
  value: JSON.parse(readFileSync(resolve(casesDir, name), "utf8")),
}));

test("fixture cases cover every operation with a positive result", () => {
  const operationKeys = Object.keys(manifest.operations).sort();
  const caseOperations = [...new Set(cases.map(({ value }) => value.operation))].sort();
  expect(caseOperations).toEqual(operationKeys);
  for (const { file, value } of cases) {
    expect(operationKeys).toContain(value.operation);
    expect(value.input && typeof value.input === "object" && !Array.isArray(value.input)).toBe(true);
    expect(Array.isArray(value.exchanges)).toBe(true);
    for (const exchange of value.exchanges) {
      expect(exchange.request.body === null || typeof exchange.request.body === "string").toBe(true);
      expect(typeof exchange.request.method).toBe("string");
      expect(typeof exchange.request.url).toBe("string");
      expect(existsSync(resolve(casesDir, exchange.response.bodyFile))).toBe(true);
    }
    if (value.expected.kind === "success") {
      expect(typeof value.expected.resultFile).toBe("string");
      expect(existsSync(resolve(casesDir, value.expected.resultFile))).toBe(true);
    } else {
      expect(typeof value.expected.code).toBe("string");
    }
  }
  for (const key of operationKeys) {
    expect(cases.some(({ value }) => value.operation === key && value.expected.kind === "success" && value.exchanges.length > 0)).toBe(true);
  }
});

test("operations use strict generated validation", () => {
  for (const operation of Object.values(manifest.operations)) {
    expect(operation.kind).toBe("action");
    expect(operation.validationMode).toBe("strict-generated");
    expect(operation.enforceOutputSchema).toBe(true);
    expect(operation.responseFormat).toBe("json");
    expect(operation.inputSchema.additionalProperties).toBe(false);
  }
});
