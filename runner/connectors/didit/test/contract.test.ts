import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
const balance = {
  balance: "1.0000",
  auto_refill_enabled: false,
  auto_refill_amount: null,
  auto_refill_threshold: null,
};

describe("Didit contract", () => {
  test("uses the documented host and x-api-key header", async () => {
    const seen: Request[] = [];
    await actions.healthcheck!({
      apiKey: "secret",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(balance);
      },
    });
    expect(seen[0].headers.get("x-api-key")).toBe("secret");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(new URL(seen[0].url).hostname).toBe("verification.didit.me");
    expect(new URL(seen[0].url).pathname).toBe("/v3/billing/balance/");
    expect(manifest.network.allowedHosts).toEqual(["verification.didit.me"]);
    expect(manifest.http.baseUrl).toBe("https://verification.didit.me");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "x-api-key",
      value: "{{apiKey}}",
    });
  });

  test("encodes vendor data and does not follow provider URLs", async () => {
    const seen: Request[] = [];
    const result = await actions["users.get"]!({
      apiKey: "secret",
      vendorData: "user/42",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({
          vendor_data: "user/42",
          status: "ACTIVE",
          portrait_image_url: "https://media.example/portrait.jpg",
        });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/v3/users/user%2F42/");
    expect(result.data.vendor_data).toBe("user/42");
    expect(seen).toHaveLength(1);

    const listed: Request[] = [];
    await actions["sessions.list"]!({
      apiKey: "secret",
      sessionKind: "business",
      limit: 2,
      fetch: async (input, init) => {
        listed.push(new Request(input, init));
        return response({
          count: 0,
          next: "https://evil.example/v3/sessions/?offset=2",
          previous: null,
          results: [],
        });
      },
    });
    const url = new URL(listed[0].url);
    expect(url.pathname).toBe("/v3/sessions/");
    expect(url.searchParams.get("session_kind")).toBe("business");
    expect(url.searchParams.get("limit")).toBe("2");
    expect(url.searchParams.has("offset")).toBe(false);
    expect(url.searchParams.has("next")).toBe(false);
    expect(listed).toHaveLength(1);
  });

  test("sends one JSON session create and keeps the callback off the request URL", async () => {
    const seen: Request[] = [];
    await actions["sessions.create"]!({
      apiKey: "secret",
      workflowId: "11111111-2222-3333-4444-555555555555",
      callback: "https://example.com/verification/callback",
      portraitImage: "aGVsbG8=",
      contactDetails: { email: "ada@example.com", send_notification_emails: false },
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ session_id: "11111111-2222-3333-4444-555555555555", status: "Not Started" }, 201);
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(new URL(seen[0].url).hostname).toBe("verification.didit.me");
    expect(new URL(seen[0].url).pathname).toBe("/v3/session/");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe(
      '{"workflow_id":"11111111-2222-3333-4444-555555555555","callback":"https://example.com/verification/callback","contact_details":{"email":"ada@example.com","send_notification_emails":false},"portrait_image":"aGVsbG8="}',
    );
  });

  test("rejects bad input, binary shortcuts, and classifies 401, 429, and redirects", async () => {
    await expect(actions["users.get"]!({
      apiKey: "secret",
      vendorData: "",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["users.get"]!({
      apiKey: "secret",
      vendorData: "..",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["billing.balance.get"]!({
      apiKey: "secret",
      baseUrl: "https://evil.example",
      fetch: async () => response(balance),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["sessions.decision.get"]!({
      apiKey: "secret",
      sessionId: "11111111-2222-3333-4444-555555555555",
      includeEvents: true,
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["billing.balance.get"]!({
      apiKey: "secret",
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["billing.balance.get"]!({
      apiKey: "secret",
      fetch: async () => response({ detail: "You do not have permission to perform this action." }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["billing.balance.get"]!({
      apiKey: "secret",
      fetch: async () => response({ detail: "Too Many Requests" }, 429, { "Retry-After": "44" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 44 });
    await expect(actions.healthcheck!({
      apiKey: "secret",
      fetch: async () => response({}, 302, { Location: "https://evil.example" }),
    })).rejects.toMatchObject({ code: "OUTBOUND_REDIRECT_BLOCKED" });
  });

  test("bounds every operation and maps the live JSON tools", () => {
    const mapped: Record<string, { method: string; path: string }> = {
      "sessions.create": { method: "POST", path: "/v3/session/" },
      "billing.balance.get": { method: "GET", path: "/v3/billing/balance/" },
      "businesses.get": { method: "GET", path: "/v3/businesses/{{vendorData}}/" },
      "users.get": { method: "GET", path: "/v3/users/{{vendorData}}/" },
      "sessions.decision.get": { method: "GET", path: "/v3/session/{{sessionId}}/decision/" },
      "workflows.get": { method: "GET", path: "/v3/workflows/{{workflowVersionId}}/" },
      "businesses.list": { method: "GET", path: "/v3/businesses/" },
      "users.list": { method: "GET", path: "/v3/users/" },
      "sessions.list": { method: "GET", path: "/v3/sessions/" },
      "workflows.list": { method: "GET", path: "/v3/workflows/" },
    };
    expect(Object.keys(mapped)).toHaveLength(10);
    for (const [key, operation] of Object.entries(manifest.operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.title.length, key).toBeGreaterThan(0);
      expect(operation.description.length, key).toBeGreaterThan(0);
      expect(operation.inputSchema.type, key).toBe("object");
      expect(operation.outputSchema.type, key).toBe("object");
      expect(operation.responseFormat, key).toBe("json");
      expect(operation.validationMode, key).toBe("strict-generated");
      expect(operation.enforceOutputSchema, key).toBe(true);
      expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
      expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
      expect(operation.request.success, key).not.toContain(204);
      expect(operation.request.path.startsWith("/"), key).toBe(true);
      expect(operation.request.path.includes("://"), key).toBe(false);
      const properties = operation.inputSchema.properties ?? {};
      for (const name of Object.keys(properties)) {
        expect(["url", "baseUrl", "next", "nextCursor", "callbackUrl"], `${key} ${name}`).not.toContain(name);
      }
      if (operation.request.method === "GET" || operation.request.method === "DELETE") {
        expect(operation.request.body, key).toBeUndefined();
        expect(operation.request.headers?.["Content-Type"], key).toBeUndefined();
      }
      const live = mapped[key];
      if (live) {
        expect(operation.request.method, key).toBe(live.method);
        expect(operation.request.path, key).toBe(live.path);
      }
    }
    expect(Object.keys(manifest.operations).sort()).toEqual(
      ["billing.balance.get", "businesses.get", "businesses.list", "healthcheck", "sessions.create", "sessions.decision.get", "sessions.list", "users.get", "users.list", "workflows.get", "workflows.list"],
    );
  });
});
