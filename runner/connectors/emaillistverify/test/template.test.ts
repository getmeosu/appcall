import { expect, test } from "bun:test";
import manifest from "../manifest.json";

const bodyless = new Set(["GET", "DELETE"]);

test("EmailListVerify operations use strict JSON defaults", () => {
  const operations = manifest.operations;
  expect(Object.keys(operations).sort()).toEqual([
    "blacklists.check",
    "contacts.find",
    "credits.get",
    "domains.checkDisposable",
    "emailJobs.get",
    "emails.verifyDetailed",
    "healthcheck",
    "maillists.progress",
  ]);
  for (const [name, operation] of Object.entries(operations)) {
    expect(operation.kind, name).toBe("action");
    expect(operation.title.length, name).toBeGreaterThan(0);
    expect(operation.description.length, name).toBeGreaterThan(0);
    expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
    expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
    expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
    expect(operation.inputSchema.type, name).toBe("object");
    expect(operation.inputSchema.additionalProperties, name).toBe(false);
    expect(operation.outputSchema.type, name).toBe("object");
    expect(operation.enforceOutputSchema, name).toBe(true);
    expect(operation.validationMode, name).toBe("strict-generated");
    expect(operation.responseFormat, name).toBe("json");
    expect(operation.request.method, name).toMatch(/^(GET|POST)$/);
    expect(operation.request.path.startsWith("/api/"), name).toBe(true);
    const sendsBody = operation.request.body !== undefined;
    if (bodyless.has(operation.request.method) || !sendsBody) {
      expect(operation.request.body, name).toBeUndefined();
      expect(operation.request.headers?.["Content-Type"], name).toBeUndefined();
    } else {
      expect(operation.request.headers?.["Content-Type"], name).toBe("application/json");
    }
  }
});
