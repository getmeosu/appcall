import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const operations = manifest.operations as Record<string, {
  kind?: string;
  sideEffect?: string;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  title?: string;
  description?: string;
  responseFormat?: string;
  validationMode?: string;
  enforceOutputSchema?: boolean;
  inputSchema?: { type?: string; additionalProperties?: boolean; required?: string[] };
  outputSchema?: { type?: string };
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, string>; baseUrl?: string; success?: number[] };
}>;

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

const settings = {
  allow_new_signups: true,
  allow_reset_password: true,
  email_verification: "recommended",
};

describe("Baserow contract", () => {
  test("uses the cloud host and the JWT access-token header", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.baserow.io"]);
    expect(manifest.http.baseUrl).toBe("https://api.baserow.io");
    expect(manifest.http.baseUrl).not.toContain("{{");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "JWT {{apiKey}}",
    });
    expect(JSON.stringify(manifest.http.auth)).not.toContain("Bearer");
    expect(JSON.stringify(manifest.auth)).not.toContain("://");
  });

  test("keeps budgets, JSON bodies, and object outputs inside the declarative rules", () => {
    const httpHeaders = (manifest.http.headers ?? {}) as Record<string, string>;
    expect(httpHeaders["Content-Type"] ?? httpHeaders["content-type"]).toBeUndefined();
    const paths: string[] = [];
    for (const [name, operation] of Object.entries(operations)) {
      expect(operation.kind, name).toBe("action");
      expect(operation.title, name).toBeString();
      expect(operation.description, name).toBeString();
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.validationMode, name).toBe("strict-generated");
      expect(operation.enforceOutputSchema, name).toBe(true);
      expect(operation.outputSchema?.type, name).toBe("object");
      expect(operation.inputSchema?.type, name).toBe("object");
      expect(operation.inputSchema?.additionalProperties, name).toBe(false);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
      const request = operation.request;
      expect(request?.baseUrl, name).toBeUndefined();
      expect(request?.method, name).toBeString();
      expect(String(request?.path ?? "").startsWith("/api/"), name).toBe(true);
      paths.push(String(request?.path));
      if (request?.method === "GET" || request?.method === "DELETE") {
        expect(request.body, name).toBeUndefined();
        expect(request.headers?.["Content-Type"] ?? request.headers?.["content-type"], name).toBeUndefined();
      }
      if (request?.body !== undefined) {
        expect(request.headers?.["Content-Type"], name).toBe("application/json");
      }
      if (name.startsWith("webhook.")) expect(operation.sideEffect, name).toBe("read");
    }
    expect(paths).not.toContain("/api/user/send-reset-password-email/");
    expect(paths).not.toContain("/api/user/send-verify-email/");
    expect(Object.keys(operations)).toHaveLength(12);
  });

  test("sends the JWT on settings and does not follow a response URL", async () => {
    const seen: Request[] = [];
    const result = await actions["settings.get"]!({
      apiKey: "secret",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ ...settings, docs: "https://evil.example/next" });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe("https://api.baserow.io/api/settings/");
    expect(seen[0].headers.get("authorization")).toBe("JWT secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].body).toBeNull();
    expect(result).toMatchObject({ connector: "baserow", action: "settings.get", source: "provider", data: { ...settings, docs: "https://evil.example/next" } });
  });

  test("keeps a domain name on the cloud host and encodes it as one path segment", async () => {
    const seen: Request[] = [];
    await actions["builders.get-public"]!({
      apiKey: "secret",
      domainName: "https://evil.example",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ id: 4, type: "public_builder", name: "Site" });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("api.baserow.io");
    expect(url.pathname).toBe("/api/builder/domains/published/by_name/https%3A%2F%2Fevil.example/");
    await expect(actions["builders.get-public"]!({
      apiKey: "secret",
      domainName: "..",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("lists applications once and lists tables on the official database path", async () => {
    const seen: string[] = [];
    await actions["databases.list"]!({
      apiKey: "secret",
      fetch: async (input) => {
        seen.push(String(input));
        return response([{ id: 9, type: "database", name: "CRM" }]);
      },
    });
    expect(seen).toEqual(["https://api.baserow.io/api/applications/"]);
    const tables: Request[] = [];
    await actions["tables.list"]!({
      apiKey: "secret",
      databaseId: 9,
      fetch: async (input, init) => {
        tables.push(new Request(input, init));
        return response([{ id: 12, name: "Tasks", order: 1, database_id: 9, data_sync: null }]);
      },
    });
    expect(tables[0].method).toBe("GET");
    expect(tables[0].url).toBe("https://api.baserow.io/api/database/tables/database/9/");
    expect(tables[0].body).toBeNull();
    expect(tables[0].headers.get("content-type")).toBeNull();
  });

  test("posts create-user and dispatch JSON without a session header unless one is set", async () => {
    const created: Request[] = [];
    await actions["users.create"]!({
      apiKey: "secret",
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "fixture-password",
      language: "en",
      authenticate: true,
      fetch: async (input, init) => {
        created.push(new Request(input, init));
        return response({ user: { username: "ada@example.com" }, access_token: "access-fixture" });
      },
    });
    expect(created[0].method).toBe("POST");
    expect(created[0].url).toBe("https://api.baserow.io/api/user/");
    expect(created[0].headers.get("content-type")).toBe("application/json");
    expect(await created[0].text()).toBe('{"name":"Ada Lovelace","email":"ada@example.com","password":"fixture-password","language":"en","authenticate":true}');
    const dispatched: Request[] = [];
    await actions["data-sources.dispatch-public"]!({
      apiKey: "secret",
      dataSourceId: 43,
      fetch: async (input, init) => {
        dispatched.push(new Request(input, init));
        return response([{ id: 1, name: "Alpha" }]);
      },
    });
    expect(dispatched[0].url).toBe("https://api.baserow.io/api/builder/domains/published/data-source/43/dispatch/");
    expect(dispatched[0].headers.get("clientsessionid")).toBeNull();
    expect(await dispatched[0].text()).toBe("{}");
    const named: Request[] = [];
    await actions["data-sources.record-names"]!({
      apiKey: "secret",
      dataSourceId: 42,
      recordIds: "1,2",
      fetch: async (input, init) => {
        named.push(new Request(input, init));
        return response({ "1": "Alpha", "2": "Beta" });
      },
    });
    expect(named[0].url).toBe("https://api.baserow.io/api/builder/data-source/42/record-names/?record_ids=1%2C2");
    expect(named[0].body).toBeNull();
  });

  test("rejects bad input, non-object JSON, upstream failure, and rate limits", async () => {
    await expect(actions["users.create"]!({ apiKey: "secret", name: "A", email: "ada@example.com", password: "x", fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["forms.metadata"]!({ apiKey: "secret", slug: "", fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["settings.get"]!({ apiKey: "secret", extra: true, fetch: async () => response(settings) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["settings.get"]!({ apiKey: "secret", fetch: async () => response("OK") })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["settings.get"]!({ apiKey: "secret", fetch: async () => response([]) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["settings.get"]!({ apiKey: "secret", fetch: async () => response({}, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["tables.list"]!({ apiKey: "secret", databaseId: 9, fetch: async () => response({ error: "ERROR_APPLICATION_DOES_NOT_EXIST", detail: "missing" }, 404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["templates.list"]!({ apiKey: "secret", fetch: async () => response({}, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
