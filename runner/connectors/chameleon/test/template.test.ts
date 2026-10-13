import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../chameleon.coverage.json";
import manifest from "../manifest.json";

test("Chameleon has no generated template and each operation is one static JSON route", () => {
  const { actions } = compileDeclarativeConnector(manifest);
  const operations = manifest.operations;
  expect(Object.keys(operations).sort()).toEqual(coverage.mapped.map((row) => row.operation).sort());
  for (const [key, operation] of Object.entries(operations)) {
    const row = coverage.mapped.find((item) => item.operation === key);
    expect(row?.method).toBe(operation.request.method);
    expect(row?.path).toBe(operation.request.path);
    expect(operation.kind).toBe("action");
    expect(typeof operation.title).toBe("string");
    expect(operation.title.length).toBeGreaterThan(0);
    expect(typeof operation.description).toBe("string");
    expect(operation.description.length).toBeGreaterThan(0);
    expect(operation.inputSchema.type).toBe("object");
    expect(operation.outputSchema.type).toBe("object");
    expect(operation.responseFormat).toBe("json");
    expect(operation.validationMode).toBe("strict-generated");
    expect(operation.enforceOutputSchema).toBe(true);
    expect(operation.request.baseUrl).toBeUndefined();
    expect(operation.request.path.startsWith("/")).toBe(true);
    expect(operation.request.path.includes("://")).toBe(false);
    expect(operation.request.path.includes("account_secret")).toBe(false);
    expect(["GET", "POST", "PUT", "PATCH", "DELETE"].includes(operation.request.method)).toBe(true);
    if (operation.request.method === "GET" || operation.request.method === "DELETE") {
      expect(operation.request.body).toBeUndefined();
      expect(operation.request.headers).toBeUndefined();
    } else {
      expect(operation.request.headers["Content-Type"]).toBe("application/json");
      expect(operation.request.body).toBeDefined();
    }
    expect(operation.maxResponseBytes).toBeGreaterThanOrEqual(operation.maxInputBytes);
    expect(operation.maxInputBytes).toBeLessThanOrEqual(26214400);
    expect(operation.timeoutMs).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs).toBeLessThanOrEqual(300000);
    expect(actions[key]).toBeFunction();
  }
});
