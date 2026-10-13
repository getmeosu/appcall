import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../docsautomator.coverage.json";
import manifest from "../manifest.json";

const liveTools = [
  "DOCSAUTOMATOR_CREATE_AUTOMATION",
  "DOCSAUTOMATOR_DELETE_AUTOMATION",
  "DOCSAUTOMATOR_DUPLICATE_AUTOMATION",
  "DOCSAUTOMATOR_GET_AUTOMATION",
  "DOCSAUTOMATOR_GET_QUEUE_STATS",
  "DOCSAUTOMATOR_LIST_AUTOMATIONS",
  "DOCSAUTOMATOR_LIST_SIGNING_SESSIONS",
  "DOCSAUTOMATOR_SEND_TEST_EMAIL",
  "DOCSAUTOMATOR_UPDATE_AUTOMATION",
];

const routes = {
  "automations.create": { method: "POST", path: "/createAutomation", sideEffect: "write", success: [201], body: true },
  "automations.delete": { method: "DELETE", path: "/deleteAutomation", sideEffect: "destructive", success: [200], body: false },
  "automations.duplicate": { method: "POST", path: "/duplicateAutomation", sideEffect: "write", success: [200], body: false },
  "automations.get": { method: "GET", path: "/automation", sideEffect: "read", success: [200], body: false },
  "automations.list": { method: "GET", path: "/automations", sideEffect: "read", success: [200], body: false },
  "automations.update": { method: "PUT", path: "/updateAutomation", sideEffect: "write", success: [200], body: true },
  "email.send-test": { method: "POST", path: "/sendTestEmail", sideEffect: "write", success: [200], body: true },
  "queue.stats": { method: "GET", path: "/queue/stats", sideEffect: "read", success: [200], body: false },
  "signing-sessions.list": { method: "GET", path: "/esign/sessions", sideEffect: "read", success: [200], body: false },
} as const;

const operations = manifest.operations as Record<string, Record<string, any>>;
const { actions } = compileDeclarativeConnector(manifest as never);

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...Object(headers) } });

const automation = {
  _id: "auto_1",
  title: "Invoice Generator",
  dataSourceName: "API",
  isActive: true,
};

const queue = { waiting: 1, active: 0, completed: 4, failed: 0, delayed: 0 };

describe("DocsAutomator contract", () => {
  test("maps every live tool onto one JSON route", () => {
    const mapped = coverage.mapped.map((row) => row.tool);
    const missing = coverage.missing_still.map((row) => row.tool);
    expect(coverage.composio_tools).toBe(liveTools.length);
    expect(coverage.index_tools).toBe(9);
    expect(coverage.missing_http).toEqual([]);
    expect([...mapped, ...missing].sort()).toEqual([...liveTools].sort());
    expect(mapped.length + missing.length).toBe(liveTools.length);
    expect(Object.keys(operations).sort()).toEqual(Object.keys(routes).sort());
    for (const row of coverage.mapped) {
      const operation = operations[row.operation];
      expect(operation?.request?.method, row.tool).toBe(row.method);
      expect(operation?.request?.path, row.tool).toBe(row.path);
      expect(typeof actions[row.operation], row.tool).toBe("function");
    }
  });

  test("uses Bearer auth only on api.docsautomator.co", () => {
    expect(manifest.key).toBe("docsautomator");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.network.allowedHosts).toEqual(["api.docsautomator.co"]);
    expect(manifest.http.baseUrl).toBe("https://api.docsautomator.co");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(JSON.stringify(manifest.http.baseUrl)).not.toContain("{{");
    expect(JSON.stringify(manifest.network.allowedHosts)).not.toContain("{{");
  });

  test("keeps JSON bounds and body-less GET and DELETE", () => {
    for (const [name, operation] of Object.entries(operations)) {
      const route = routes[name as keyof typeof routes];
      expect(operation.kind, name).toBe("action");
      expect(operation.sideEffect, name).toBe(route.sideEffect);
      expect(operation.title.length, name).toBeGreaterThan(0);
      expect(operation.description.length, name).toBeGreaterThan(0);
      expect(operation.inputSchema.type, name).toBe("object");
      expect(operation.inputSchema.additionalProperties, name).toBe(false);
      expect(operation.outputSchema.type, name).toBe("object");
      expect(operation.enforceOutputSchema, name).toBe(true);
      expect(operation.validationMode, name).toBe("strict-generated");
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.request.method, name).toBe(route.method);
      expect(operation.request.path, name).toBe(route.path);
      expect(operation.request.success, name).toEqual(route.success);
      expect(operation.request.baseUrl, name).toBeUndefined();
      if (route.body) {
        expect(operation.request.headers?.["Content-Type"], name).toBe("application/json");
        expect(typeof operation.request.body, name).toBe("object");
      } else {
        expect(operation.request.body, name).toBeUndefined();
        expect(operation.request.headers?.["Content-Type"], name).toBeUndefined();
      }
      if (route.method === "GET" || route.method === "DELETE") {
        expect(operation.request.body, name).toBeUndefined();
      }
    }
  });

  test("lists automations with bearer auth and no body", async () => {
    const seen: Request[] = [];
    const result = await actions["automations.list"]!({
      apiKey: "secret-token",
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ automations: [automation] });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret-token");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    const url = new URL(seen[0].url);
    expect(url.origin).toBe("https://api.docsautomator.co");
    expect(url.pathname).toBe("/automations");
    expect(url.search).toBe("");
    expect(result.data).toEqual({ automations: [automation] });
  });

  test("gets one automation by automationId or docId on the same path", async () => {
    const seen: Request[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return json({ automation });
    };
    await actions["automations.get"]!({ apiKey: "secret-token", automationId: "auto/1", fetch });
    expect(new URL(seen[0].url).pathname).toBe("/automation");
    expect(new URL(seen[0].url).search).toBe("?automationId=auto%2F1");
    expect(seen[0].headers.get("content-type")).toBeNull();

    seen.length = 0;
    await actions["automations.get"]!({ apiKey: "secret-token", docId: "doc_1", fetch });
    expect(new URL(seen[0].url).search).toBe("?docId=doc_1");

    await expect(actions["automations.get"]!({ apiKey: "secret-token", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
  });

  test("filters signing sessions and omits unset query fields", async () => {
    const seen: Request[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return json({ sessions: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
    };
    await actions["signing-sessions.list"]!({ apiKey: "secret-token", fetch });
    expect(new URL(seen[0].url).pathname).toBe("/esign/sessions");
    expect(new URL(seen[0].url).search).toBe("");

    seen.length = 0;
    await actions["signing-sessions.list"]!({
      apiKey: "secret-token",
      status: "pending",
      email: "ada@example.com",
      page: 2,
      limit: 20,
      fetch,
    });
    expect(new URL(seen[0].url).search).toBe("?status=pending&email=ada%40example.com&page=2&limit=20");
    await expect(actions["signing-sessions.list"]!({
      apiKey: "secret-token",
      status: "expired",
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("creates an automation as JSON and does not fetch the template link", async () => {
    const seen: Request[] = [];
    const result = await actions["automations.create"]!({
      apiKey: "secret-token",
      title: "Invoice Generator",
      dataSourceName: "API",
      docTemplateLink: "https://docs.google.com/document/d/1abc/edit",
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ message: "success", newAutomation: automation }, 201);
      },
    });
    const url = new URL(seen[0].url);
    expect(seen[0].method).toBe("POST");
    expect(url.origin).toBe("https://api.docsautomator.co");
    expect(url.pathname).toBe("/createAutomation");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe(
      '{"title":"Invoice Generator","dataSourceName":"API","docTemplateLink":"https://docs.google.com/document/d/1abc/edit"}',
    );
    expect(result.data.newAutomation._id).toBe("auto_1");

    seen.length = 0;
    await actions["automations.create"]!({
      apiKey: "secret-token",
      title: "Sheets",
      dataSourceName: "Google Sheets",
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ message: "success", newAutomation: automation }, 201);
      },
    });
    expect(await seen[0].text()).toBe('{"title":"Sheets","dataSourceName":"Google Sheets"}');
    await expect(actions["automations.create"]!({
      apiKey: "secret-token",
      title: "Notion",
      dataSourceName: "Notion",
      fetch: async () => json({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("updates only included fields and uses the documented expiration enum", async () => {
    const seen: Request[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return json({ message: "Success", updatedAutomation: automation });
    };
    await actions["automations.update"]!({ apiKey: "secret-token", docId: "auto_1", fetch });
    expect(new URL(seen[0].url).pathname).toBe("/updateAutomation");
    expect(new URL(seen[0].url).search).toBe("?docId=auto_1");
    expect(seen[0].method).toBe("PUT");
    expect(await seen[0].text()).toBe("{}");

    seen.length = 0;
    await actions["automations.update"]!({
      apiKey: "secret-token",
      docId: "auto_1",
      title: "Updated Invoice Generator",
      isActive: true,
      locale: "en-us",
      pdfExpiration: "onemonth",
      imageOptions: { quality: 80, maxWidth: 1200 },
      fetch,
    });
    expect(await seen[0].text()).toBe(
      '{"title":"Updated Invoice Generator","isActive":true,"locale":"en-us","pdfExpiration":"onemonth","imageOptions":{"quality":80,"maxWidth":1200}}',
    );
    await expect(actions["automations.update"]!({
      apiKey: "secret-token",
      docId: "auto_1",
      pdfExpiration: "7d",
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("deletes and duplicates without a JSON body", async () => {
    const seen: Request[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return json({ message: "Success" });
    };
    await actions["automations.delete"]!({ apiKey: "secret-token", docId: "auto/1", fetch });
    expect(seen[0].method).toBe("DELETE");
    expect(new URL(seen[0].url).pathname).toBe("/deleteAutomation");
    expect(new URL(seen[0].url).search).toBe("?docId=auto%2F1");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");

    seen.length = 0;
    const duplicated = await actions["automations.duplicate"]!({
      apiKey: "secret-token",
      automationId: "auto_1",
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ newAutomationId: "auto_2" });
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(new URL(seen[0].url).pathname).toBe("/duplicateAutomation");
    expect(new URL(seen[0].url).search).toBe("?automationId=auto_1");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    expect(duplicated.data.newAutomationId).toBe("auto_2");
  });

  test("sends a test email as JSON and reads queue stats", async () => {
    const seen: Request[] = [];
    const emailed = await actions["email.send-test"]!({
      apiKey: "secret-token",
      automationId: "auto_1",
      recipient: "test@example.com",
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({
          success: true,
          message: "Test email sent successfully to test@example.com",
          rateLimit: { remaining: 24, resetAt: "2026-01-15T11:00:00Z" },
        });
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(new URL(seen[0].url).pathname).toBe("/sendTestEmail");
    expect(await seen[0].text()).toBe('{"automationId":"auto_1","recipient":"test@example.com"}');
    expect(emailed.data.success).toBe(true);

    seen.length = 0;
    const stats = await actions["queue.stats"]!({
      apiKey: "secret-token",
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json(queue);
      },
    });
    expect(seen[0].method).toBe("GET");
    expect(new URL(seen[0].url).pathname).toBe("/queue/stats");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(stats.data).toEqual(queue);
  });

  test("rejects bad input, malformed JSON, 401, and 429", async () => {
    await expect(actions["automations.list"]!({
      apiKey: "secret-token",
      extra: true,
      fetch: async () => json({ automations: [] }),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["queue.stats"]!({
      apiKey: "secret-token",
      fetch: async () => new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["queue.stats"]!({
      apiKey: "secret-token",
      fetch: async () => json({ waiting: 1 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["automations.list"]!({
      apiKey: "secret-token",
      fetch: async () => json({ error: "Incorrect or missing API key" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["automations.list"]!({
      apiKey: "secret-token",
      fetch: async () => json({ error: "Too many requests" }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
