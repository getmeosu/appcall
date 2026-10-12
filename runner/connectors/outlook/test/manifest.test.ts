import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const compiled = compileDeclarativeConnector(manifest as never);
const ACTION_OPS = Object.fromEntries(Object.entries(operations).filter(([, op]) => op.kind === "action")) as typeof operations;
const WEBHOOK_OPS = Object.fromEntries(Object.entries(operations).filter(([, op]) => op.kind === "webhook")) as typeof operations;
const READ_POSTS = new Set(["events.findMeetingTimes", "calendar.getSchedule", "calendarGroups.calendars.getSchedule", "users.calendar.getSchedule", "mailTips.get", "users.translateExchangeIds"]);

function requestOf(key: string): Record<string, unknown> {
  return ACTION_OPS[key]!.request as Record<string, unknown>;
}

function dummyInput(schema: { properties?: Record<string, any>; required?: string[] }): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of schema.required ?? []) {
    const prop = schema.properties?.[key] ?? {};
    if (Array.isArray(prop.enum) && prop.enum.length > 0) input[key] = prop.enum[0];
    else if (prop.type === "integer" || prop.type === "number") input[key] = 1;
    else if (prop.type === "boolean") input[key] = true;
    else if (prop.type === "array") {
      const items = prop.items ?? {};
      if (items.type === "integer" || items.type === "number") input[key] = [1];
      else if (items.type === "object") input[key] = [{ emailAddress: { address: "alex@contoso.com" } }];
      else input[key] = ["x"];
    } else if (prop.type === "object") input[key] = { id: 1 };
    else input[key] = key.includes("url") ? "https://example.com/hook" : "x";
  }
  return input;
}

function sameUrl(a: string, b: string): boolean {
  const x = new URL(a);
  const y = new URL(b);
  if (x.protocol !== y.protocol || x.host !== y.host || x.pathname !== y.pathname) return false;
  const q = (u: URL) => [...u.searchParams.entries()].sort((l, r) => l[0].localeCompare(r[0]) || l[1].localeCompare(r[1]));
  return JSON.stringify(q(x)) === JSON.stringify(q(y));
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    return ak.length === bk.length && ak.every((k) => Object.hasOwn(b as object, k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

describe("outlook manifest", () => {
  test("has bounded host, oauth, version, and compiles", () => {
    expect(manifest.key).toBe("outlook");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["email", "calendar"]);
    expect(manifest.network.allowedHosts).toEqual(["graph.microsoft.com", "login.microsoftonline.com"]);
    expect(manifest.http.baseUrl).toBe("https://graph.microsoft.com");
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.http.auth.field).toBe("accessToken");
    expect(manifest.http.auth.value).toBe("Bearer {{accessToken}}");
    expect(manifest.auth.oauth.authorizeUrl).toContain("login.microsoftonline.com");
    expect(manifest.provenance.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(manifest.auth.scopes).toContain("Calendars.ReadWrite");
    expect(manifest.auth.scopes).toContain("Contacts.ReadWrite");
    expect(manifest.auth.scopes).toContain("Tasks.ReadWrite");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("covers Graph mail plus calendar, contacts, and To Do", () => {
    expect(ACTION_OPS.healthcheck).toBeDefined();
    expect(Object.keys(ACTION_OPS).length).toBeGreaterThanOrEqual(300);
    expect(Object.keys(WEBHOOK_OPS)).toHaveLength(5);
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/v1.0/me" });
  });

  test("covers Composio Outlook tools with a real request", () => {
    const mapped = new Set(Object.values(COMPOSIO_TOOLS));
    expect(mapped.size).toBeGreaterThanOrEqual(300);
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(316);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(ACTION_OPS[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
  });

  test("gives every action a real Graph request, title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(ACTION_OPS)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect(operation.maxResponseBytes as number, key).toBeGreaterThanOrEqual(operation.maxInputBytes as number);
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect(String(request.path).startsWith("/v1.0/"), key).toBe(true);
    }
  });

  test("classifies mutating HTTP methods as write or destructive; schedule POSTs are read", () => {
    for (const [key, operation] of Object.entries(ACTION_OPS)) {
      const method = String((operation.request as Record<string, unknown>).method);
      const path = String((operation.request as Record<string, unknown>).path);
      if (method === "DELETE" || path.endsWith("/permanentDelete")) expect(operation.sideEffect, key).toBe("destructive");
      else if (READ_POSTS.has(key)) expect(operation.sideEffect, key).toBe("read");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
  });

  test("webhook operations use sideEffect read", () => {
    expect(Object.keys(WEBHOOK_OPS).sort()).toEqual([
      "webhook.contact.created",
      "webhook.event.created",
      "webhook.event.updated",
      "webhook.message.created",
      "webhook.message.sent",
    ]);
    for (const [key, operation] of Object.entries(WEBHOOK_OPS)) {
      expect(operation.kind, key).toBe("webhook");
      expect(operation.sideEffect, key).toBe("read");
      expect(operation.request, key).toBeUndefined();
      expect(operation.maxResponseBytes as number, key).toBeGreaterThanOrEqual(operation.maxInputBytes as number);
    }
  });

  test("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(ACTION_OPS)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const ph = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of ph) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("puts JSON Content-Type only on bodies and keeps GET/DELETE body-less", () => {
    for (const [key, operation] of Object.entries(ACTION_OPS)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body !== undefined) {
        expect(headers["Content-Type"], key).toBe("application/json");
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET" || method === "DELETE") expect(request.body, key).toBeUndefined();
    }
  });

  test("maps documented Graph paths", () => {
    
    expect(requestOf("messages.list").path).toBe("/v1.0/me/messages");
    expect(requestOf("messages.get").path).toBe("/v1.0/me/messages/{{messageId}}");
    expect(requestOf("messages.send").path).toBe("/v1.0/me/sendMail");
    expect(requestOf("events.list").path).toBe("/v1.0/me/events");
    expect(requestOf("calendars.list").path).toBe("/v1.0/me/calendars");
    expect(requestOf("contacts.list").path).toBe("/v1.0/me/contacts");
    expect(requestOf("todo.lists.list").path).toBe("/v1.0/me/todo/lists");
    expect(requestOf("mailboxSettings.get").path).toBe("/v1.0/me/mailboxSettings");
    expect(requestOf("messages.batchUpdate").path).toBe("/v1.0/$batch");
    expect(requestOf("events.findMeetingTimes").path).toBe("/v1.0/me/findMeetingTimes");
    expect(requestOf("messages.permanentDelete").path).toBe("/v1.0/me/messages/{{messageId}}/permanentDelete");
    expect(requestOf("messages.count").path).toBe("/v1.0/users/{{userId}}/messages/$count");
    expect(requestOf("messages.replyAll").path).toBe("/v1.0/users/{{userId}}/messages/{{messageId}}/replyAll");
    expect(requestOf("users.translateExchangeIds").path).toBe("/v1.0/users/{{userId}}/translateExchangeIds");
    expect(requestOf("groups.get").path).toBe("/v1.0/groups/{{groupId}}");
    expect(requestOf("groups.conversations.list").path).toBe("/v1.0/groups/{{groupId}}/conversations");
    expect(requestOf("groups.threads.list").path).toBe("/v1.0/groups/{{groupId}}/threads");
    expect(requestOf("groups.threads.posts.attachments.get").path).toBe("/v1.0/groups/{{groupId}}/threads/{{threadId}}/posts/{{postId}}/attachments/{{attachmentId}}");
    expect(requestOf("people.list").path).toBe("/v1.0/me/people");
    expect(requestOf("subscriptions.list").path).toBe("/v1.0/subscriptions");
    expect(requestOf("organization.list").path).toBe("/v1.0/organization");

  });

  test("recipe operations equal runner operations and auth matches manifest.json (RECIPE-DRIFT-ALL)", async () => {
    const recipe = await Bun.file(new URL("../../recipes/outlook/recipe.json", import.meta.url)).json() as {
      source: { revision: string };
      selection: { operations: string[]; upstreamSha: string };
      manifest: { operations: Record<string, { kind?: string; sideEffect?: string }>; auth: { type: string; scopes: unknown; setup: unknown; oauth: unknown } };
    };
    const runnerKeys = Object.keys(manifest.operations).sort();
    expect(recipe.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(recipe.selection.upstreamSha).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(runnerKeys);
    expect([...recipe.selection.operations].sort()).toEqual(runnerKeys);
    expect(Object.keys(recipe.manifest.auth).sort()).toEqual(["oauth", "scopes", "setup", "type"]);
    for (const [key, operation] of Object.entries(recipe.manifest.operations)) {
      if (operation.kind === "webhook") expect(operation.sideEffect, key).toBe("read");
    }
  });
});

describe("outlook compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
    const requests: Request[] = [];
    const result = await compiled.actions[key]!({
      accessToken: "dummy",
      ...input,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        requests.push(request);
        return respond(request);
      },
    });
    return { requests, result };
  }

  test("every action dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(ACTION_OPS)) {
      const request = operation.request as { method: string; path: string; success?: number[]; result?: unknown };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse({ id: "1", value: [] }, request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("graph.microsoft.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "outlook", action: key, source: "provider" });
    }
  });

  test("healthcheck probes GET /v1.0/me", async () => {
    const { requests, result } = await invoke("healthcheck", {}, () =>
      jsonResponse({ id: "user-1", userPrincipalName: "alex@contoso.com" }),
    );
    expect(new URL(requests[0]!.url).pathname).toBe("/v1.0/me");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).search).toBe("");
    expect(result).toEqual({
      connector: "outlook",
      action: "healthcheck",
      source: "provider",
      status: "ok",
      id: "user-1",
      userPrincipalName: "alex@contoso.com",
    });
  });

  test("optional list query params are omitted when unset", async () => {
    const bare = await invoke("messages.list", {}, () => jsonResponse({ value: [] }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://graph.microsoft.com/v1.0/me/messages");
    const filtered = await invoke("messages.list", { top: 5, filter: "isRead eq false" }, () => jsonResponse({ value: [] }));
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("$top")).toBe("5");
    expect(url.searchParams.get("$filter")).toBe("isRead eq false");
  });

  test("messages.send posts Graph sendMail JSON and maps 202", async () => {
    const toRecipients = [{ emailAddress: { address: "alex@contoso.com" } }];
    const { requests, result } = await invoke(
      "messages.send",
      { toRecipients, subject: "Hello", content: "Hi", contentType: "Text" },
      () => new Response(null, { status: 202 }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1.0/me/sendMail");
    expect(requests[0]!.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]!.json()).toEqual({
      message: {
        subject: "Hello",
        body: { contentType: "Text", content: "Hi" },
        toRecipients,
      },
    });
    expect(result).toEqual({ connector: "outlook", action: "messages.send", source: "provider", sent: true });
  });

  test("messages.delete 204 maps to success envelope", async () => {
    const { requests, result } = await invoke("messages.delete", { messageId: "AAMkAGI2TAAA=" }, () => new Response(null, { status: 204 }));
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1.0/me/messages/AAMkAGI2TAAA%3D");
    expect(result).toEqual({ connector: "outlook", action: "messages.delete", source: "provider", success: true });
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ error: { message: "nope" } }, 401))).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      invoke("healthcheck", {}, () => new Response("{}", { status: 429, headers: { "retry-after": "4", "content-type": "application/json" } })),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("every action has a success fixture", () => {
    const caseDir = join(import.meta.dir, "../fixtures/cases");
    const covered = new Set<string>();
    for (const file of readdirSync(caseDir).filter((name) => name.endsWith(".json"))) {
      const raw = JSON.parse(readFileSync(join(caseDir, file), "utf8")) as {
        operation: string;
        expected: { kind: string };
      };
      if (raw.expected.kind === "success") covered.add(raw.operation);
    }
    for (const key of Object.keys(ACTION_OPS)) {
      expect(covered.has(key), key).toBe(true);
    }
  });

  test("runs fixtures against compiled handlers", async () => {
    const caseDir = join(import.meta.dir, "../fixtures/cases");
    const files = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();
    expect(files.length).toBeGreaterThan(15);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(caseDir, file), "utf8")) as {
        id: string;
        operation: string;
        input: Record<string, unknown>;
        credentials: Record<string, string>;
        exchanges: Array<{
          request: { method: string; url: string; headers?: Record<string, string>; body: unknown };
          response: { status: number; headers?: Record<string, string>; bodyFile?: string };
        }>;
        expected: { kind: "success"; resultFile: string } | { kind: "error"; code: string };
      };
      const action = compiled.actions[raw.operation];
      expect(action, raw.id).toBeTypeOf("function");
      let index = 0;
      const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
        const expected = raw.exchanges[index++];
        if (!expected) throw new Error(`${raw.id}: extra request`);
        const url = String(input instanceof Request ? input.url : input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== expected.request.method.toUpperCase() || !sameUrl(url, expected.request.url)) {
          throw new Error(`${raw.id}: ${method} ${url} != ${expected.request.method} ${expected.request.url}`);
        }
        const rawBody = init?.body == null ? null : String(init.body);
        if (expected.request.body === null) {
          if (rawBody !== null && rawBody !== "") throw new Error(`${raw.id}: unexpected body ${rawBody}`);
        } else if (typeof expected.request.body === "object") {
          if (!deepEqual(rawBody ? JSON.parse(rawBody) : null, expected.request.body)) {
            throw new Error(`${raw.id}: body mismatch ${rawBody}`);
          }
        } else if (rawBody !== expected.request.body) {
          throw new Error(`${raw.id}: body mismatch ${rawBody}`);
        }
        const got = new Headers(init?.headers);
        for (const [headerKey, value] of Object.entries(expected.request.headers ?? {})) {
          if (got.get(headerKey) !== value) throw new Error(`${raw.id}: header ${headerKey}=${got.get(headerKey)}!=${value}`);
        }
        const status = expected.response.status;
        if (status === 204) return new Response(null, { status, headers: expected.response.headers });
        if (status === 202 && !expected.response.bodyFile) return new Response(null, { status, headers: expected.response.headers });
        const encoded = (expected.response as { bodyBase64?: string }).bodyBase64;
        const bodyBytes = typeof encoded === "string"
          ? Buffer.from(encoded, "base64")
          : expected.response.bodyFile
            ? readFileSync(join(dirname(join(caseDir, file)), expected.response.bodyFile))
            : Buffer.from("{}");
        return new Response(bodyBytes, { status, headers: expected.response.headers });
      };
      const input = { ...raw.input, ...raw.credentials, fetch: fetchStub };
      if (raw.expected.kind === "error") {
        let rejected: { code?: string } | undefined;
        try {
          await action!(input);
        } catch (error) {
          rejected = error as { code?: string };
        }
        expect(index, raw.id).toBe(raw.exchanges.length);
        expect(rejected?.code, raw.id).toBe(raw.expected.code);
        continue;
      }
      const result = await action!(input);
      expect(index, raw.id).toBe(raw.exchanges.length);
      const expected = JSON.parse(readFileSync(join(dirname(join(caseDir, file)), raw.expected.resultFile), "utf8"));
      expect(deepEqual(result, expected), `${raw.id} ${JSON.stringify(result)}`).toBe(true);
    }
  });
});
