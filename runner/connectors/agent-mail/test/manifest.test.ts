import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const expectedOperations = [
  "healthcheck",
  "inboxes.list",
  "inboxes.get",
  "messages.list",
  "messages.get",
  "inboxes.create",
  "inboxes.update",
  "inboxes.delete",
  "messages.send",
  "messages.reply",
  "messages.delete",
  "threads.list",
  "threads.get",
  "drafts.list",
  "drafts.create",
  "drafts.send",
  "domains.list",
  "domains.get",
  "pods.list",
  "webhooks.list",
  "inboxes.api_keys.create",
  "inboxes.api_keys.list",
  "inboxes.events.list",
  "inboxes.metrics.events.query",
  "drafts.update",
] as const;

const addedRoutes = [
  ["inboxes.api_keys.create", "POST", "/v0/inboxes/{{inbox_id}}/api-keys", true],
  ["inboxes.api_keys.list", "GET", "/v0/inboxes/{{inbox_id}}/api-keys", false],
  ["inboxes.events.list", "GET", "/v0/inboxes/{{inbox_id}}/events", false],
  ["inboxes.metrics.events.query", "GET", "/v0/inboxes/{{inbox_id}}/metrics/events", false],
  ["drafts.update", "PATCH", "/v0/inboxes/{{inbox_id}}/drafts/{{draft_id}}", true],
] as const;

const operations = manifest.operations as Record<string, Record<string, any>>;
const compiled = compileDeclarativeConnector(manifest as never);
const casesDir = new URL("../fixtures/cases/", import.meta.url);

function loadCases(): Record<string, any>[] {
  return readdirSync(casesDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(new URL(name, casesDir), "utf8")));
}

test("Agent Mail retains all original request-backed operations", () => {
  expect(manifest.key).toBe("agent-mail");
  expect(manifest.version).toBe("0.2.1");
  expect(manifest.http.baseUrl).toBe("https://api.agentmail.to");
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "Authorization",
    value: "Bearer {{apiKey}}",
  });
  expect(manifest.network.allowedHosts).toEqual(["api.agentmail.to"]);
  expect("full_depth" in manifest).toBe(false);
  expect(Object.keys(operations).sort()).toEqual([...expectedOperations].sort());
  for (const [name, operation] of Object.entries(operations)) {
    expect(operation.kind, name).toBe("action");
    expect(operation.title?.trim(), name).toBeTruthy();
    expect(operation.description?.trim(), name).toBeTruthy();
    expect(operation.inputSchema?.type, name).toBe("object");
    expect(operation.inputSchema?.additionalProperties, name).toBe(false);
    expect(operation.outputSchema?.type, name).toBe("object");
    expect(operation.request?.path, name).toMatch(/^\//);
    expect(operation.request?.method, name).toMatch(/^(GET|POST|PUT|PATCH|DELETE)$/);
    expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
    expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
    expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
    expect(operation.request.path.startsWith("http://"), name).toBe(false);

    const method = operation.request.method.toUpperCase();
    if (method === "GET" || method === "DELETE") {
      expect(operation.request.body, name).toBeUndefined();
      expect(operation.request.headers?.["Content-Type"], name).toBeUndefined();
      expect(operation.request.headers?.["content-type"], name).toBeUndefined();
    }
    if (method === "GET") expect(operation.sideEffect, name).toBe("read");
    else if (method === "DELETE") expect(operation.sideEffect, name).toBe("destructive");
    else expect(operation.sideEffect, name).toMatch(/^(write|destructive)$/);
  }
});

test("Agent Mail compiles a callable handler for every operation", () => {
  for (const name of expectedOperations) expect(compiled.actions[name], name).toBeTypeOf("function");
});

test("added routes match the documented JSON endpoints", () => {
  expect(operations["messages.delete"].request).toEqual({
    method: "DELETE",
    path: "/v0/inboxes/{{inbox_id}}/messages/{{message_id}}",
    success: [200, 204],
  });
  for (const [name, method, path, hasBody] of addedRoutes) {
    const request = operations[name].request;
    expect(request.method, name).toBe(method);
    expect(request.path, name).toBe(path);
    expect(request.success, name).toEqual([200]);
    const segments = String(request.path).split("/").filter((segment) => segment.length > 0);
    for (const segment of segments) {
      if (segment.includes("{{")) expect(segment, name).toMatch(/^\{\{[A-Za-z0-9_]+\}\}$/);
    }
    if (hasBody) {
      expect(request.body, name).toBeTypeOf("object");
      expect(request.headers, name).toEqual({ "Content-Type": "application/json" });
    } else {
      expect(request.body, name).toBeUndefined();
      expect(request.headers, name).toBeUndefined();
    }
  }
});

test("every non-webhook operation has one success fixture", () => {
  const cases = loadCases();
  for (const name of Object.keys(operations)) {
    const success = cases.filter((entry) => entry.operation === name && entry.expected?.kind === "success");
    expect(success.length, name).toBeGreaterThanOrEqual(1);
  }
});

test("new routes and messages.delete replay their success fixtures", async () => {
  const files = [
    "inboxes.api_keys.create-success.json",
    "inboxes.api_keys.list-success.json",
    "inboxes.events.list-success.json",
    "inboxes.metrics.events.query-success.json",
    "drafts.update-success.json",
    "messages.delete-success.json",
  ];
  for (const file of files) {
    const fixtureUrl = new URL(file, casesDir);
    const fixture = await Bun.file(fixtureUrl).json();
    const exchange = fixture.exchanges[0];
    const responseText = await Bun.file(new URL(exchange.response.bodyFile, fixtureUrl)).text();
    const expected = await Bun.file(new URL(fixture.expected.resultFile, fixtureUrl)).json();
    const seen: { url: string; method: string; headers: Headers; body: string }[] = [];
    const result = await compiled.actions[fixture.operation]!({
      ...fixture.credentials,
      ...fixture.input,
      fetch: async (url: string | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        const rawBody = init?.body;
        seen.push({
          url: typeof url === "string" ? url : url.toString(),
          method: init?.method ?? "GET",
          headers,
          body: typeof rawBody === "string" ? rawBody : "",
        });
        return new Response(responseText, {
          status: exchange.response.status,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(seen, file).toHaveLength(1);
    expect(seen[0]!.method, file).toBe(exchange.request.method);
    expect(seen[0]!.url, file).toBe(exchange.request.url);
    expect(seen[0]!.headers.get("authorization"), file).toBe("Bearer token");
    expect(seen[0]!.headers.get("accept"), file).toBe("application/json");
    if (exchange.request.body == null) {
      expect(seen[0]!.headers.get("content-type"), file).toBeNull();
      expect(seen[0]!.body, file).toBe("");
    } else {
      expect(seen[0]!.headers.get("content-type"), file).toBe("application/json");
      expect(seen[0]!.body, file).toBe(exchange.request.body);
    }
    expect(result, file).toEqual(expected);
  }
});
