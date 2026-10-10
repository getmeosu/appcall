import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const expectedOperations = [
  "healthcheck",
  "users.list",
  "roles.list",
  "roles.get",
  "auditLogs.list",
  "organizations.list",
  "repositories.list",
  "users.manageSeats",
  "users.changeRoles",
  "users.seatAssignmentMode",
  "roles.create",
  "roles.update",
  "roles.delete",
  "roles.permissions",
  "learnings.list",
  "learnings.update",
  "learnings.delete",
  "metrics.reviews",
  "metrics.reviewComments",
  "security.scans.list",
] as const;
const operations = manifest.operations as Record<string, Record<string, any>>;
const compiled = compileDeclarativeConnector(manifest as never);

test("CodeRabbit retains all original request-backed operations", () => {
  expect(manifest.key).toBe("coderabbit");
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

test("CodeRabbit compiles a callable handler for every operation", () => {
  for (const name of expectedOperations) expect(compiled.actions[name], name).toBeTypeOf("function");
});
