import { expect, it } from "bun:test";
import manifest from "../manifest.json";

it("declares bounded action schemas with titles and descriptions", () => {
  expect(manifest.version).toBe("0.3.0");
  expect(manifest.http?.baseUrl).toBe("https://api.pingdom.com/api/3.1");
  expect(manifest.http?.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "Authorization",
    value: "Bearer {{apiKey}}",
  });
  expect(manifest.network?.allowedHosts).toEqual(["api.pingdom.com"]);
  expect(Object.keys(manifest.operations).length).toBe(24);
  const ops = manifest.operations as Record<string, any>;
  expect(ops["contacts.get"].request).toEqual({
    method: "GET",
    path: "/alerting/contacts/{{contactid}}",
    success: [200],
  });
  expect(ops["maintenance.occurrences"].request).toMatchObject({
    method: "GET",
    path: "/maintenance.occurrences",
    success: [200],
  });
  expect(ops["reference.get"].request).toEqual({
    method: "GET",
    path: "/reference",
    success: [200],
  });
  expect(ops["checks.single"].request).toEqual({
    method: "GET",
    path: "/single",
    query: { host: "{{host}}", type: "{{type}}" },
    success: [200],
  });
  expect(ops["teams.get"].request).toEqual({
    method: "GET",
    path: "/alerting/teams/{{teamid}}",
    success: [200],
  });
  expect(ops["tms.checks.list"].request).toMatchObject({
    method: "GET",
    path: "/tms/check",
    success: [200],
  });
  for (const [key, op] of Object.entries(manifest.operations) as [string, any][]) {
    expect(op.title.length).toBeGreaterThan(0);
    expect(op.description.length).toBeGreaterThan(0);
    expect(op.timeoutMs).toBeGreaterThan(0);
    expect(op.maxResponseBytes).toBeLessThanOrEqual(5242880);
    expect(op.maxResponseBytes).toBeGreaterThanOrEqual(op.maxInputBytes);
    if (op.kind === "webhook") {
      expect(key.startsWith("webhook.")).toBe(true);
      expect(op.request).toBeUndefined();
      continue;
    }
    expect(op.kind).toBe("action");
    expect(op.inputSchema.type).toBe("object");
    expect(op.outputSchema.type).toBe("object");
    expect(op.sideEffect).toBe(/delete/.test(key) ? "destructive" : /create|update/.test(key) ? "write" : "read");
    expect(op.enforceOutputSchema).toBe(true);
    expect(op.validationMode).toBe("strict-generated");
    expect(op.responseFormat).toBe("json");
    if (op.request.method === "GET" || op.request.method === "DELETE") {
      expect(op.request.body).toBeUndefined();
      expect(op.request.headers).toBeUndefined();
    }
  }
});
