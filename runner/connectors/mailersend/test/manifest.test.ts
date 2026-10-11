import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "domains.list"] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  MAILERSEND_CREATE_DOMAIN: "domains.create",
  MAILERSEND_CREATE_SMTP_USER: "smtp_users.create",
  MAILERSEND_CREATE_TOKEN: "tokens.create",
  MAILERSEND_CREATE_WEBHOOK: "webhooks.create",
  MAILERSEND_DELETE_WEBHOOK: "webhooks.delete",
  MAILERSEND_GET_API_QUOTA: "quota.get",
  MAILERSEND_GET_DOMAIN: "domains.get",
  MAILERSEND_GET_DOMAIN_RECIPIENTS: "domains.recipients.list",
  MAILERSEND_GET_DOMAINS: "domains.list",
  MAILERSEND_GET_GENERAL_RESOURCES: "resources.general",
  MAILERSEND_GET_IDENTITIES: "identities.list",
  MAILERSEND_GET_MESSAGES: "messages.list",
  MAILERSEND_GET_RECIPIENTS: "recipients.list",
  MAILERSEND_GET_SMS_ACTIVITY: "sms.activity.list",
  MAILERSEND_GET_SMS_INBOUNDS: "sms.inbounds.list",
  MAILERSEND_GET_SMS_MESSAGES: "sms.messages.list",
  MAILERSEND_GET_SMS_NUMBERS: "sms.numbers.list",
  MAILERSEND_GET_SMS_RECIPIENTS: "sms.recipients.list",
  MAILERSEND_GET_SMTP_USERS: "smtp_users.list",
  MAILERSEND_GET_TEMPLATES: "templates.list",
  MAILERSEND_GET_TOKENS: "tokens.list",
  MAILERSEND_GET_USERS: "users.list",
  MAILERSEND_GET_WEBHOOKS: "webhooks.list",
};

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("mailersend manifest", () => {
  test("has bounded host, origin auth, and compiles", () => {
    expect(manifest.key).toBe("mailersend");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.network.allowedHosts).toEqual(["api.mailersend.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.mailersend.com");
    expect(manifest.http.auth.name).toBe("authorization");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toBeUndefined();
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin two operations and domains pagination", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({
      method: "GET",
      path: "/v1/domains",
      query: { limit: "10" },
    });
    expect(requestOf("domains.list")).toMatchObject({
      method: "GET",
      path: "/v1/domains",
      query: { limit: "{{limit}}", page: "{{page}}", verified: "{{verified}}" },
    });
    const listSchema = operations["domains.list"]!.inputSchema as {
      properties: Record<string, { minimum?: number; maximum?: number }>;
    };
    expect(listSchema.properties.limit).toMatchObject({ type: "integer", minimum: 10, maximum: 100 });
    expect(listSchema.properties.page).toMatchObject({ type: "integer", minimum: 1 });
    expect(listSchema.properties.verified).toMatchObject({ type: "boolean" });
  });

  test("covers every Composio MailerSend tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(23);
    expect(Object.keys(operations).length).toBe(24);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations["healthcheck"]).toBeDefined();
  });

  test("gives every action a real request, title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect(String(request.path).startsWith("/"), key).toBe(true);
    }
  });

  test("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const method = String((operation.request as Record<string, unknown>).method);
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
  });

  test("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map(
        (match) => match[1],
      );
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("puts Content-Type only on JSON bodies and envelopes 204 deletes", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body !== undefined) {
        expect(headers["Content-Type"], key).toBe("application/json");
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET") expect(request.body, key).toBeUndefined();
      if (Array.isArray(request.success) && (request.success as number[]).includes(204) && request.body === undefined) {
        const statuses = request.success as number[];
        if (statuses.length === 1 && statuses[0] === 204) {
          expect(request.result, `${key} 204 needs a static result`).toEqual({ success: true });
        }
      }
    }
  });

  test("maps documented MailerSend family paths", () => {
    expect(requestOf("domains.get").path).toBe("/v1/domains/{{domain_id}}");
    expect(requestOf("domains.create")).toMatchObject({ method: "POST", path: "/v1/domains" });
    expect(requestOf("domains.recipients.list").path).toBe("/v1/domains/{{domain_id}}/recipients");
    expect(requestOf("smtp_users.list").path).toBe("/v1/domains/{{domain_id}}/smtp-users");
    expect(requestOf("smtp_users.create")).toMatchObject({
      method: "POST",
      path: "/v1/domains/{{domain_id}}/smtp-users",
    });
    expect(requestOf("tokens.list").path).toBe("/v1/token");
    expect(requestOf("tokens.create")).toMatchObject({ method: "POST", path: "/v1/token" });
    expect(requestOf("webhooks.list")).toMatchObject({
      method: "GET",
      path: "/v1/webhooks",
      query: { page: "{{page}}", limit: "{{limit}}", domain_id: "{{domain_id}}" },
    });
    expect((operations["webhooks.list"]!.inputSchema as { required: string[] }).required).toContain("domain_id");
    expect(requestOf("webhooks.create")).toMatchObject({ method: "POST", path: "/v1/webhooks" });
    expect(requestOf("webhooks.delete")).toMatchObject({
      method: "DELETE",
      path: "/v1/webhooks/{{webhook_id}}",
      success: [204],
      result: { success: true },
    });
    expect(requestOf("quota.get").path).toBe("/v1/api-quota");
    expect(requestOf("resources.general")).toMatchObject({
      method: "GET",
      path: "/v1/domains",
      query: { limit: "10" },
    });
    expect(requestOf("identities.list").path).toBe("/v1/identities");
    expect(requestOf("messages.list").path).toBe("/v1/messages");
    expect(requestOf("recipients.list").path).toBe("/v1/recipients");
    expect(requestOf("sms.activity.list")).toMatchObject({
      method: "GET",
      path: "/v1/sms-activity",
    });
    expect((requestOf("sms.activity.list").query as Record<string, string>)["status[]"]).toBe("{{status}}");
    expect(requestOf("sms.inbounds.list").path).toBe("/v1/sms-inbounds");
    expect(requestOf("sms.messages.list").path).toBe("/v1/sms-messages");
    expect(requestOf("sms.numbers.list").path).toBe("/v1/sms-numbers");
    expect(requestOf("sms.recipients.list").path).toBe("/v1/sms-recipients");
    expect(requestOf("templates.list").path).toBe("/v1/templates");
    expect(requestOf("users.list").path).toBe("/v1/users");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/mailersend/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.selection.operations.sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("mailersend compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function invoke(
    key: string,
    input: Record<string, unknown>,
    respond: (request: Request) => Promise<Response> | Response,
  ) {
    const requests: Request[] = [];
    const result = await compiled.actions[key]!({
      apiKey: "test-secret",
      ...input,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        requests.push(request);
        return respond(request);
      },
    });
    return { requests, result };
  }

  test("healthcheck GET /v1/domains?limit=10", async () => {
    const { requests, result } = await invoke("healthcheck", {}, () =>
      jsonResponse({ data: [{ id: "dom_123", name: "example.com" }] }),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe("https://api.mailersend.com/v1/domains?limit=10");
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer test-secret");
    expect(requests[0]!.headers.get("content-type")).toBeNull();
    expect(result).toMatchObject({
      connector: "mailersend",
      action: "healthcheck",
      source: "provider",
      data: { data: [{ id: "dom_123", name: "example.com" }] },
    });
  });

  test("domains.list forwards verified and drops unset page", async () => {
    const { requests } = await invoke("domains.list", { limit: 25, verified: true }, () =>
      jsonResponse({ data: [] }),
    );
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/v1/domains");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("verified")).toBe("true");
    expect(url.searchParams.has("page")).toBe(false);
  });

  test("domains.create posts JSON and drops unset subdomains", async () => {
    const { requests, result } = await invoke(
      "domains.create",
      { name: "mail.example.com", return_path_subdomain: "rp" },
      () => jsonResponse({ data: { id: "dom_new", name: "mail.example.com" } }, 201),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/domains");
    expect(requests[0]!.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]!.json()).toEqual({
      name: "mail.example.com",
      return_path_subdomain: "rp",
    });
    expect(result).toMatchObject({
      connector: "mailersend",
      action: "domains.create",
      data: { data: { id: "dom_new", name: "mail.example.com" } },
    });
  });

  test("webhooks.delete returns the static 204 envelope", async () => {
    const { requests, result } = await invoke("webhooks.delete", { webhook_id: "wh_1" }, () =>
      new Response("", { status: 204 }),
    );
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/webhooks/wh_1");
    expect(requests[0]!.headers.get("content-type")).toBeNull();
    expect(result).toEqual({
      connector: "mailersend",
      action: "webhooks.delete",
      source: "provider",
      success: true,
    });
  });

  test("tokens.create posts name, domain_id, and scopes", async () => {
    const { requests } = await invoke(
      "tokens.create",
      { name: "CI token", domain_id: "dom_123", scopes: ["email_full", "domains_read"] },
      () => jsonResponse({ data: { id: "tok_1", accessToken: "[redacted]" } }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/token");
    expect(await requests[0]!.json()).toEqual({
      name: "CI token",
      domain_id: "dom_123",
      scopes: ["email_full", "domains_read"],
    });
  });

  test("sms.activity.list repeats status[] query keys", async () => {
    const { requests } = await invoke(
      "sms.activity.list",
      { limit: 10, status: ["sent", "delivered"] },
      () => jsonResponse({ data: [] }),
    );
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/v1/sms-activity");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.getAll("status[]")).toEqual(["sent", "delivered"]);
    expect(url.searchParams.has("page")).toBe(false);
  });

  test("quota.get GET /v1/api-quota", async () => {
    const { requests, result } = await invoke("quota.get", {}, () =>
      jsonResponse({ quota: 1000, remaining: 752, reset: "2023-04-15T00:00:00Z" }),
    );
    expect(requests[0]!.url).toBe("https://api.mailersend.com/v1/api-quota");
    expect(requests[0]!.method).toBe("GET");
    expect(result).toMatchObject({
      action: "quota.get",
      data: { quota: 1000, remaining: 752, reset: "2023-04-15T00:00:00Z" },
    });
  });

  test("smtp_users.list scopes SMTP users to the domain path", async () => {
    const { requests } = await invoke("smtp_users.list", { domain_id: "dom_123", limit: 10 }, () =>
      jsonResponse({ data: [{ id: "smtp_1" }] }),
    );
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/v1/domains/dom_123/smtp-users");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.has("page")).toBe(false);
  });
});
