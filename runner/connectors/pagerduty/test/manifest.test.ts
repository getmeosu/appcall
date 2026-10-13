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
    expect(manifest.version).toBe("0.5.1");
    expect(manifest.categories).toEqual(["dev-tools"]);
    expect(manifest.models.length).toBeGreaterThan(0);
    expect(Object.keys(operations).length).toBe(482);
  });

  it("sends the personal user token in PagerDuty's Token token= scheme", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.http.auth.value).toBe("Token token={{apiKey}}");
    expect(manifest.http.headers.Accept).toBe("application/vnd.pagerduty+json;version=2");
  });

  it("exposes the high-value incident, service, and on-call actions", () => {
    for (const key of actionKeys) {
      expect(operations[key], key).toBeDefined();
    }
    expect(Object.keys(operations).length).toBeGreaterThan(actionKeys.length);
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
    const originalWrites = [
      "incidents.acknowledge",
      "incidents.create",
      "incidents.resolve",
      "incidents.update",
      "services.create",
    ];
    for (const key of originalWrites) {
      expect(operations[key]!.sideEffect, key).toBe("write");
    }
    for (const [key, operation] of Object.entries(operations)) {
      const method = String((operation.request as Record<string, unknown>).method);
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        expect(operation.sideEffect, `${key} mutates and must be sideEffect write`).toBe("write");
      } else {
        expect(operation.sideEffect, `${key} is a read`).toBe("read");
      }
    }
  });

  it("keeps every request inside the declared outbound host", () => {
    const hosts = new Set(["api.pagerduty.com", "events.pagerduty.com", "mcp.pagerduty.com"]);
    for (const operation of Object.values(operations)) {
      const request = operation.request as Record<string, unknown>;
      const baseUrl = String(request.baseUrl ?? manifest.http.baseUrl);
      expect(hosts.has(new URL(baseUrl).hostname), String(request.path ?? baseUrl)).toBe(true);
    }
    expect(manifest.network.allowedHosts).toEqual([...hosts]);
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

  it("reads deprecated OAuth revocation request status without a body", () => {
    const operation = operations["oauth-delegations.get-revocation-requests-status"];
    expect(operation).toBeDefined();
    expect(operation!.sideEffect).toBe("read");
    expect(operation!.responseFormat).toBe("json");
    expect(operation!.timeoutMs as number).toBeGreaterThan(0);
    expect(operation!.timeoutMs as number).toBeLessThanOrEqual(300000);
    expect(operation!.maxResponseBytes as number).toBeGreaterThanOrEqual(operation!.maxInputBytes as number);
    const request = operation!.request as Record<string, unknown>;
    expect(request.method).toBe("GET");
    expect(request.path).toBe("/oauth_delegations/revocation_requests/status");
    expect(request.baseUrl).toBeUndefined();
    expect(request.body).toBeUndefined();
    expect(request.headers).toBeUndefined();
    const schema = operation!.inputSchema as { properties?: Record<string, { type?: string }>; required?: string[] };
    expect(schema.properties?.requested_at_end?.type).toBe("string");
    expect(schema.required ?? []).not.toContain("requested_at_end");
  });

  it("keeps every operation key inside the control plane's safe charset", () => {
    for (const key of Object.keys(operations)) {
      expect(key).toMatch(/^[a-zA-Z0-9._-]+$/);
    }
  });
});
