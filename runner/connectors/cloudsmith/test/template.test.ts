import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../cloudsmith.coverage.json";
import manifest from "../manifest.json";

compileDeclarativeConnector(manifest);

const routes: Record<string, { method: string; path: string; redact: boolean }> = {
  healthcheck: { method: "GET", path: "/user/self/", redact: false },
  "users.current": { method: "GET", path: "/user/self/", redact: false },
  "packages.get": { method: "GET", path: "/packages/{{owner}}/{{repo}}/{{identifier}}/", redact: false },
  "quota.get": { method: "GET", path: "/quota/{{owner}}/", redact: false },
  "rates.limits": { method: "GET", path: "/rates/limits/", redact: false },
  "repositories.get": { method: "GET", path: "/repos/{{owner}}/{{identifier}}/", redact: true },
  "organizations.list": { method: "GET", path: "/orgs/", redact: false },
  "vulnerabilities.list": { method: "GET", path: "/vulnerabilities/{{owner}}/{{repo}}/", redact: false },
  "audit-log.search": { method: "GET", path: "/audit-log/{{owner}}/", redact: false },
  "packages.search": { method: "GET", path: "/packages/{{owner}}/{{repo}}/", redact: false },
  "repositories.search": { method: "GET", path: "/repos/{{owner}}/", redact: true },
};

test("manifest routes match the Cloudsmith OpenAPI and the live toolkit", () => {
  expect(manifest.key).toBe("cloudsmith");
  expect(manifest.http.baseUrl).toBe("https://api.cloudsmith.io");
  expect(manifest.network.allowedHosts).toEqual(["api.cloudsmith.io"]);
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "X-Api-Key",
    value: "{{apiKey}}",
  });
  expect(manifest.http.headers).toEqual({ Accept: "application/json" });
  expect(Object.keys(manifest.operations)).toEqual(Object.keys(routes));
  expect(coverage.composio_tools).toBe(10);
  expect(coverage.live_tools).toBe(10);
  expect(coverage.index_tools).toBe(10);
  expect(coverage.missing_http).toEqual([]);
  expect(coverage.missing_still).toEqual([]);
  expect(coverage.full_depth).toBe(true);
  expect(coverage.mapped).toHaveLength(10);
  expect(coverage.mapped.length + coverage.missing_still.length).toBe(coverage.composio_tools);

  const mapped = new Map(coverage.mapped.map((entry) => [entry.operation, entry]));
  expect(mapped.has("healthcheck")).toBe(false);
  for (const [key, route] of Object.entries(routes)) {
    const operation = manifest.operations[key];
    expect(operation.kind, key).toBe("action");
    expect(operation.sideEffect, key).toBe("read");
    expect(operation.title.length, key).toBeGreaterThan(0);
    expect(operation.description.length, key).toBeGreaterThan(0);
    expect(operation.inputSchema.type, key).toBe("object");
    expect(operation.outputSchema.type, key).toBe("object");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
    expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
    expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes);
    expect(operation.request.method, key).toBe(route.method);
    expect(operation.request.path, key).toBe(route.path);
    expect(operation.request.success, key).toEqual([200]);
    expect(operation.request.body, key).toBeUndefined();
    expect(operation.request.headers, key).toBeUndefined();
    expect(operation.redactResponseKeys, key).toEqual(route.redact ? ["ecdsa_keys", "gpg_keys"] : undefined);
    const serialized = JSON.stringify(operation);
    expect(serialized.includes("multipart"), key).toBe(false);
    expect(serialized.includes("{{url}}"), key).toBe(false);
  }
  for (const entry of coverage.mapped) {
    expect(manifest.operations[entry.operation].request.method, entry.tool).toBe(entry.method);
    expect(manifest.operations[entry.operation].request.path, entry.tool).toBe(entry.path);
  }
});
