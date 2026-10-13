import { expect, test } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, any>>;

test("CrewAI operations use strict JSON defaults", () => {
  expect(Object.keys(operations).sort()).toEqual([
    "deployments.list",
    "deployments.logs",
    "deployments.redeploy",
    "deployments.status",
    "executions.resume",
    "executions.start",
    "executions.status",
    "inputs.get",
  ]);
  for (const [key, operation] of Object.entries(operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.handler, key).toBeUndefined();
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.inputSchema.type, key).toBe("object");
    expect(operation.outputSchema.type, key).toBe("object");
    expect(typeof operation.title, key).toBe("string");
    expect(operation.title.length, key).toBeGreaterThan(0);
    expect(typeof operation.description, key).toBe("string");
    expect(operation.description.length, key).toBeGreaterThan(0);
    expect(typeof operation.request.method, key).toBe("string");
    expect(typeof operation.request.path, key).toBe("string");
    expect(operation.request.path.startsWith("/"), key).toBe(true);
    expect(operation.request.path.includes("http"), key).toBe(false);
  }
});
