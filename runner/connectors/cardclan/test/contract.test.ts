import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const routes = {
  "workspaces.list": { method: "GET", path: "/integration/workspaces", body: false, success: [200] },
  "cards.list": { method: "POST", path: "/integration/cards", body: false, success: [200] },
  "email-accounts.list": { method: "GET", path: "/integration/email-accounts", body: false, success: [200] },
  "workflow-cards.list": { method: "GET", path: "/integration/workflow-cards", body: false, success: [200] },
  "cards.get": { method: "GET", path: "/integration/card-details/{{cardId}}", body: false, success: [200] },
  "integration-configs.create": { method: "POST", path: "/integration/config", body: true, success: [201] },
  "cards.generate-url": { method: "POST", path: "/integration/get-card-url", body: true, success: [201] },
  "cards.send": { method: "POST", path: "/integration/send-card", body: true, success: [201] },
} as const;

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const recipient = { name: "Ada Lovelace", email: "ada@example.com", company: "Analytical Engines", role: "Engineer" };
const workspaceRow = [{ key: "workspace", choices: [{ id: "ws_1", name: "Marketing" }] }];
const objectBody = { data: { id: "cfg_1" }, message: "ok" };

type Seen = { url: string; method: string; headers: Headers; body: string | null };

async function call(action: string, input: Record<string, unknown>, body: unknown = objectBody, status = 200) {
  const seen: Seen[] = [];
  const { actions } = compileDeclarativeConnector(manifest as never);
  const result = await actions[action]!({
    apiKey: "secret-token",
    ...input,
    fetch: async (inputInit: RequestInfo | URL, init?: RequestInit) => {
      seen.push({
        url: String(inputInit),
        method: String(init?.method ?? "GET"),
        headers: new Headers(init?.headers),
        body: init?.body == null ? null : String(init.body),
      });
      return response(body, status);
    },
  });
  return { seen, result };
}

describe("CardClan contract", () => {
  test("uses bearer auth on the OpenAPI host only", () => {
    expect(manifest.key).toBe("cardclan");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.network.allowedHosts).toEqual(["app.cardclan.io"]);
    expect(manifest.http.baseUrl).toBe("https://app.cardclan.io/api");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(JSON.stringify(manifest.http.headers)).not.toContain("Content-Type");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
    expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(routes).sort());
  });

  test("maps each action to one JSON route with a bounded budget", () => {
    for (const [name, operation] of Object.entries(manifest.operations)) {
      const route = routes[name as keyof typeof routes];
      expect(operation.kind, name).toBe("action");
      expect(operation.title.length, name).toBeGreaterThan(0);
      expect(operation.description.length, name).toBeGreaterThan(0);
      expect(operation.timeoutMs, name).toBeGreaterThan(0);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.inputSchema.type, name).toBe("object");
      expect(operation.inputSchema.additionalProperties, name).toBe(false);
      expect(operation.outputSchema.type, name).toBe("object");
      expect(operation.enforceOutputSchema, name).toBe(true);
      expect(operation.validationMode, name).toBe("strict-generated");
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.request?.method, name).toBe(route.method);
      expect(operation.request?.path, name).toBe(route.path);
      expect(operation.request?.success, name).toEqual(route.success);
      expect(operation.request?.baseUrl, name).toBeUndefined();
      if (route.body) {
        expect(operation.request?.headers, name).toEqual({ "Content-Type": "application/json" });
        expect(operation.request?.body, name).toBeDefined();
      } else {
        expect(operation.request?.body, name).toBeUndefined();
        expect(operation.request?.headers, name).toBeUndefined();
      }
    }
  });

  test("lists workspaces with bearer auth and wraps the JSON array", async () => {
    const { seen, result } = await call("workspaces.list", {}, workspaceRow);
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret-token");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].body).toBeNull();
    const url = new URL(seen[0].url);
    expect(url.origin).toBe("https://app.cardclan.io");
    expect(url.pathname).toBe("/api/integration/workspaces");
    expect(result.data).toEqual(workspaceRow);
  });

  test("lists cards as one body-less POST with the workspace query", async () => {
    const { seen, result } = await call("cards.list", { workspace: "ws/1" }, workspaceRow);
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].body).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/api/integration/cards");
    expect(url.searchParams.get("workspace")).toBe("ws/1");
    expect(result.data).toEqual(workspaceRow);
  });

  test("encodes the card id and does not follow a URL in the JSON body", async () => {
    const { seen, result } = await call("cards.get", { cardId: "card/a" }, {
      data: { card: { title: "Welcome" } },
      message: "Card details",
      view_card_url: "https://evil.example/card",
    });
    expect(seen).toHaveLength(1);
    expect(new URL(seen[0].url).pathname).toBe("/api/integration/card-details/card%2Fa");
    expect(seen[0].body).toBeNull();
    expect(result.data.message).toBe("Card details");
  });

  test("sends one JSON body and keeps confirmSend off the wire", async () => {
    const { seen } = await call("cards.send", {
      card: "card_1",
      integrationId: "int_1",
      emailAccount: "CardClan",
      confirmSend: true,
      mergeTags: [recipient],
    }, objectBody, 201);
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(new URL(seen[0].url).pathname).toBe("/api/integration/send-card");
    expect(JSON.parse(seen[0].body ?? "")).toEqual({
      card: "card_1",
      integrationId: "int_1",
      mergeTags: [recipient],
      emailAccount: "CardClan",
    });
  });

  test("omits emailAccount when the sender is unset", async () => {
    const { seen } = await call("cards.send", {
      card: "card_1",
      integrationId: "int_1",
      confirmSend: true,
      mergeTags: [recipient],
    }, objectBody, 201);
    const body = JSON.parse(seen[0].body ?? "");
    expect(body).toEqual({ card: "card_1", integrationId: "int_1", mergeTags: [recipient] });
    expect(body.confirmSend).toBeUndefined();
    expect(body.emailAccount).toBeUndefined();
  });

  test("creates a config with the official user, workspace, and card fields", async () => {
    const { seen } = await call("integration-configs.create", {
      userId: "user_1",
      workspaceId: "ws_1",
      cardId: "card_1",
    }, objectBody, 201);
    expect(seen[0].method).toBe("POST");
    expect(new URL(seen[0].url).pathname).toBe("/api/integration/config");
    expect(JSON.parse(seen[0].body ?? "")).toEqual({
      userId: "user_1",
      workspaceId: "ws_1",
      cardId: "card_1",
    });
  });

  test("rejects a free-form URL, a false send confirmation, bad output, 401, and 429", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    await expect(actions["cards.get"]!({
      apiKey: "secret-token",
      cardId: "card_1",
      url: "https://evil.example",
      fetch: async () => response(objectBody),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["cards.send"]!({
      apiKey: "secret-token",
      card: "card_1",
      integrationId: "int_1",
      confirmSend: false,
      mergeTags: [recipient],
      fetch: async () => response(objectBody, 201),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["workspaces.list"]!({
      apiKey: "secret-token",
      fetch: async () => response({ data: {} }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["workspaces.list"]!({
      apiKey: "secret-token",
      fetch: async () => response({}, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["workspaces.list"]!({
      apiKey: "secret-token",
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
