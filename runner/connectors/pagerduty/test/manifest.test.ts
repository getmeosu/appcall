import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

const actionKeys = [
  "escalation_policies.list",
  "healthcheck",
  "incidents.acknowledge",
  "incidents.create",
  "incidents.get",
  "incidents.list",
  "incidents.resolve",
  "incidents.update",
  "log_entries.list",
  "oncalls.list",
  "schedules.list",
  "services.create",
  "services.get",
  "services.list",
  "users.get",
  "users.list",
];

describe("pagerduty manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("pagerduty");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.categories).toEqual(["dev-tools"]);
    expect(manifest.models.length).toBeGreaterThan(0);
  });

  it("sends the personal user token in PagerDuty's Token token= scheme", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.http.auth.value).toBe("Token token={{apiKey}}");
    expect(manifest.http.headers.Accept).toBe("application/vnd.pagerduty+json;version=2");
  });

  it("exposes the high-value incident, service, and on-call actions", () => {
    expect(Object.keys(operations).sort()).toEqual(actionKeys);
  });

  it("gives every action the limits and tool schema the MCP gateway requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.timeoutMs as number).toBeGreaterThan(0);
      expect(operation.maxInputBytes as number).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number).toBeGreaterThan(0);
      expect(String(operation.title ?? "").length).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length).toBeGreaterThan(0);
      expect((operation.inputSchema as Record<string, unknown>).type).toBe("object");
      expect(["read", "write"]).toContain(operation.sideEffect as string);
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect(operation.enforceOutputSchema).toBe(true);
      expect(operation.validationMode).toBe("strict-generated");
      expect(operation.responseFormat).toBe("json");
    }
  });

  it("classifies every mutating operation as a write", () => {
    const writes = Object.entries(operations)
      .filter(([, operation]) => ["POST", "PUT", "PATCH", "DELETE"].includes(String((operation.request as Record<string, unknown>).method)))
      .map(([key]) => key);
    expect(writes.sort()).toEqual([
      "incidents.acknowledge",
      "incidents.create",
      "incidents.resolve",
      "incidents.update",
      "services.create",
    ]);
    for (const key of writes) {
      expect(operations[key]!.sideEffect, `${key} mutates and must be sideEffect write`).toBe("write");
    }
  });

  it("keeps every request inside the declared outbound host", () => {
    for (const operation of Object.values(operations)) {
      const request = operation.request as Record<string, unknown>;
      const baseUrl = String(request.baseUrl ?? manifest.http.baseUrl);
      expect(new URL(baseUrl).hostname).toBe("api.pagerduty.com");
    }
    expect(manifest.network.allowedHosts).toEqual(["api.pagerduty.com"]);
  });

  it("only interpolates path placeholders the operation's schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  it("templates every query, header, and body value from a declared input", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { properties?: Record<string, unknown> };
      const declared = Object.keys(schema.properties ?? {});
      const templated = [...JSON.stringify([request.query ?? {}, request.headers ?? {}, request.body ?? {}]).matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)]
        .map((match) => match[1]!);
      for (const name of templated) {
        expect(declared, `${key} references {{${name}}}`).toContain(name);
      }
    }
  });

  it("keeps every operation key inside the control plane's safe charset", () => {
    for (const key of Object.keys(operations)) {
      expect(key).toMatch(/^[a-zA-Z0-9._-]+$/);
    }
  });
});
