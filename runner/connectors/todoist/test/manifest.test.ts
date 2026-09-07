import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("todoist manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("todoist");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.models.length).toBeGreaterThan(0);
  });

  it("sends the personal token as a bearer credential, which is what Todoist wants", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
  });

  it("reads the retry header as a delay, which is the shape Todoist sends", () => {
    expect(manifest.http.errors.retryAfterHeader).toBe("retry-after");
    expect(manifest.http.errors.retryAfterKind).toBe("seconds");
    expect(manifest.http.errors.defaultRetryAfterSeconds).toBeGreaterThan(0);
  });

  it("looks for the provider's own error text at Todoist's top-level error field", () => {
    // Todoist returns {"error": "Unauthorized", "error_tag": "UNAUTHORIZED", ...}. A path
    // list that only tried error.message would discard every provider reason.
    expect(manifest.http.errors.messagePaths).toContain("error");
    expect(manifest.http.errors.messagePaths[0]).toBe("error");
  });

  it("targets the unified v1 API rather than the retired REST v2", () => {
    expect(manifest.http.baseUrl).toBe("https://api.todoist.com");
    for (const [key, operation] of Object.entries(operations)) {
      const path = String((operation.request as Record<string, unknown>).path ?? "");
      expect(path, `${key} must call /api/v1`).toStartWith("/api/v1/");
    }
  });

  it("gives every action the limits and tool schema the MCP gateway requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind).toBe("action");
      expect(operation.timeoutMs as number).toBeGreaterThan(0);
      expect(operation.maxInputBytes as number).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number).toBeGreaterThan(0);
      expect(String(operation.title ?? "").length).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length).toBeGreaterThan(0);
      expect((operation.inputSchema as Record<string, unknown>).type).toBe("object");
      expect(["read", "write"]).toContain(operation.sideEffect as string);
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
    }
  });

  it("classifies every mutating operation as a write", () => {
    const writes = Object.entries(operations)
      .filter(([, operation]) => ["POST", "PUT", "PATCH", "DELETE"].includes(String((operation.request as Record<string, unknown>).method)))
      .map(([key]) => key);
    for (const key of writes) {
      expect(operations[key]!.sideEffect, `${key} mutates and must be sideEffect write`).toBe("write");
    }
  });

  it("keeps every request inside the declared outbound host", () => {
    for (const operation of Object.values(operations)) {
      const request = operation.request as Record<string, unknown>;
      const baseUrl = String(request.baseUrl ?? manifest.http.baseUrl);
      expect(new URL(baseUrl).hostname).toBe("api.todoist.com");
    }
    expect(manifest.network.allowedHosts).toEqual(["api.todoist.com"]);
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

  it("templates every query and body value from a declared input", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { properties?: Record<string, unknown> };
      const declared = Object.keys(schema.properties ?? {});
      const templated = [...JSON.stringify([request.query ?? {}, request.body ?? {}]).matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)]
        .map((match) => match[1]!);
      for (const name of templated) {
        expect(declared, `${key} references {{${name}}}`).toContain(name);
      }
    }
  });

  it("hands the caller a cursor on every paginated list", () => {
    // Every /api/v1 collection endpoint answers {results, next_cursor}, so an operation
    // that reads one must both accept a cursor and return the next one, or the caller
    // can never reach page two.
    const paginated = Object.entries(operations).filter(([, operation]) =>
      Object.prototype.hasOwnProperty.call((operation.request as Record<string, unknown>).result ?? {}, "nextCursor"),
    );
    expect(paginated.length).toBeGreaterThan(0);
    for (const [key, operation] of paginated) {
      const schema = operation.inputSchema as { properties?: Record<string, unknown> };
      expect(Object.keys(schema.properties ?? {}), `${key} must accept a cursor`).toContain("cursor");
      const result = (operation.request as Record<string, unknown>).result as Record<string, unknown>;
      expect(result.nextCursor).toBe("{{response.next_cursor}}");
    }
  });

  it("never echoes the whole user record, which carries the caller's own API token", () => {
    // GET /api/v1/user returns the personal token under "token". Mapping the raw body
    // would hand a caller its own credential back through the action result.
    const result = JSON.stringify((operations.healthcheck!.request as Record<string, unknown>).result);
    expect(result).not.toContain("{{response}}");
    expect(result).not.toContain("token");
  });

  it("keeps every operation key inside the control plane's safe charset", () => {
    for (const key of Object.keys(operations)) {
      expect(key).toMatch(/^[a-zA-Z0-9._-]+$/);
    }
  });
});
