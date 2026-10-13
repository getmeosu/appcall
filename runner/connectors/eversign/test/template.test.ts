import { expect, test } from "bun:test";
import manifest from "../manifest.json";

const routes = {
  "businesses.list": { method: "GET", path: "/business" },
  "documents.audit-log": { method: "GET", path: "/document/{{document_hash}}/audit_log" },
  "documents.create": { method: "POST", path: "/document" },
  "documents.delete": { method: "DELETE", path: "/document" },
  "documents.list": { method: "GET", path: "/document" },
  "bulk-jobs.list": { method: "GET", path: "/bulk_job" },
  "bulk-jobs.status": { method: "GET", path: "/bulk_job/{{bulk_job_id}}/status" },
  "signers.reassign": { method: "POST", path: "/reassign" },
  "templates.create": { method: "POST", path: "/document" },
  "templates.list": { method: "GET", path: "/document" },
} as const;

test("eversign operations stay one strict JSON route inside the budget", () => {
  expect(manifest.key).toBe("eversign");
  expect(manifest.version).toBe("0.1.0");
  expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(routes).sort());
  for (const [key, operation] of Object.entries(manifest.operations)) {
    const route = routes[key as keyof typeof routes];
    expect(operation.kind, key).toBe("action");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.inputSchema.type, key).toBe("object");
    expect(operation.inputSchema.additionalProperties, key).toBe(false);
    expect(operation.outputSchema.type, key).toBe("object");
    expect(operation.title.length, key).toBeGreaterThan(0);
    expect(operation.description.length, key).toBeGreaterThan(0);
    expect(operation.timeoutMs, key).toBeGreaterThan(0);
    expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
    expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
    expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes);
    expect(operation.request.method, key).toBe(route.method);
    expect(operation.request.path, key).toBe(route.path);
    expect(operation.request.baseUrl, key).toBeUndefined();
    expect(operation.request.success, key).toEqual([200]);
    expect("handler" in operation, key).toBe(false);
    if (route.method === "GET" || route.method === "DELETE") {
      expect(operation.request.body, key).toBeUndefined();
      expect(JSON.stringify(operation.request.headers ?? {}), key).not.toContain("Content-Type");
    } else {
      expect(operation.request.headers?.["Content-Type"], key).toBe("application/json");
    }
  }
  expect(JSON.stringify(manifest.http.headers ?? {})).not.toContain("Content-Type");
});
