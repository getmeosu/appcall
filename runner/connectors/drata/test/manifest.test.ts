import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const expectedOperations = [
  "healthcheck",
  "workspaces.list",
  "personnel.list",
  "personnel.get",
  "vendors.list",
  "vendors.get",
  "vendors.create",
  "vendors.update",
  "vendors.delete",
  "assets.list",
  "assets.get",
  "assets.create",
  "policies.list",
  "policies.get",
  "devices.list",
  "devices.get",
  "controls.list",
  "controls.get",
  "personnel.devices.list",
  "users.list",
  "events.list",
  "risks.list",
] as const;
const operations = manifest.operations as Record<string, Record<string, any>>;
const compiled = compileDeclarativeConnector(manifest as never);

test("Drata retains all original request-backed operations", () => {
  expect(manifest.key).toBe("drata");
  expect(Object.keys(operations).sort()).toEqual([...expectedOperations].sort());
  for (const [name, operation] of Object.entries(operations)) {
    expect(operation.kind, name).toBe("action");
    expect(operation.title?.trim(), name).toBeTruthy();
    expect(operation.description?.trim(), name).toBeTruthy();
    expect(operation.inputSchema?.type, name).toBe("object");
    expect(operation.inputSchema?.additionalProperties, name).toBe(false);
    expect(operation.request?.path, name).toMatch(/^\//);
    expect(operation.request?.method, name).toMatch(/^(GET|POST|PUT|PATCH|DELETE)$/);

    const method = operation.request.method.toUpperCase();
    if (method === "GET") expect(operation.sideEffect, name).toBe("read");
    else if (method === "DELETE") expect(operation.sideEffect, name).toBe("destructive");
    else expect(operation.sideEffect, name).toMatch(/^(write|destructive)$/);
  }
});

test("Drata compiles a callable handler for every operation", () => {
  for (const name of expectedOperations) expect(compiled.actions[name], name).toBeTypeOf("function");
});
