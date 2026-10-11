import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = [
  "healthcheck",
  "messages.outbound.list",
  "bounces.list",
  "templates.list",
] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  POSTMARK_ARCHIVE_MESSAGE_STREAM: "streams.archive",
  POSTMARK_CHECK_SPAM_SCORE: "spam.score",
  POSTMARK_CREATE_INBOUND_RULE: "inbound_rules.create",
  POSTMARK_CREATE_MESSAGE_STREAM: "streams.create",
  POSTMARK_CREATE_SUPPRESSIONS: "suppressions.create",
  POSTMARK_CREATE_TEMPLATE: "templates.create",
  POSTMARK_CREATE_WEBHOOK: "webhooks.create",
  POSTMARK_DELETE_INBOUND_RULE: "inbound_rules.delete",
  POSTMARK_DELETE_SUPPRESSIONS: "suppressions.delete",
  POSTMARK_DELETE_TEMPLATE: "templates.delete",
  POSTMARK_DELETE_WEBHOOK: "webhooks.delete",
  POSTMARK_EDIT_SERVER: "server.edit",
  POSTMARK_EDIT_TEMPLATE: "templates.edit",
  POSTMARK_EDIT_WEBHOOK: "webhooks.edit",
  POSTMARK_GET_BOUNCE_COUNTS: "stats.outbound.bounces",
  POSTMARK_GET_BOUNCES: "bounces.list",
  POSTMARK_GET_BROWSER_PLATFORM_USAGE: "stats.outbound.clicks.platforms",
  POSTMARK_GET_BROWSER_USAGE: "stats.outbound.clicks.browsers",
  POSTMARK_GET_CLICK_COUNTS: "stats.outbound.clicks",
  POSTMARK_GET_CLICKS_BY_BROWSER_FAMILY: "stats.outbound.clicks.browser_families",
  POSTMARK_GET_CLICKS_BY_LOCATION: "stats.outbound.clicks.location",
  POSTMARK_GET_DELIVERY_STATS: "bounces.delivery_stats",
  POSTMARK_GET_EMAIL_CLIENT_USAGE: "stats.outbound.opens.clients",
  POSTMARK_GET_EMAIL_OPEN_COUNTS: "stats.outbound.opens",
  POSTMARK_GET_MESSAGE_STREAM: "streams.get",
  POSTMARK_GET_OPENS_BY_PLATFORM: "stats.outbound.opens.platforms",
  POSTMARK_GET_OUTBOUND_OVERVIEW: "stats.outbound.overview",
  POSTMARK_GET_SENT_COUNTS: "stats.outbound.sends",
  POSTMARK_GET_SERVER: "server.get",
  POSTMARK_GET_SPAM_COMPLAINTS: "stats.outbound.spam",
  POSTMARK_GET_TEMPLATE: "templates.get",
  POSTMARK_GET_TRACKED_EMAIL_COUNTS: "stats.outbound.tracked",
  POSTMARK_GET_WEBHOOK: "webhooks.get",
  POSTMARK_LIST_INBOUND_RULES: "inbound_rules.list",
  POSTMARK_LIST_MESSAGE_STREAMS: "streams.list",
  POSTMARK_LIST_OUTBOUND_MESSAGE_CLICKS: "messages.outbound.clicks.list",
  POSTMARK_LIST_OUTBOUND_MESSAGE_OPENS: "messages.outbound.opens.list",
  POSTMARK_LIST_SUPPRESSIONS: "suppressions.list",
  POSTMARK_LIST_TEMPLATES: "templates.list",
  POSTMARK_LIST_WEBHOOKS: "webhooks.list",
  POSTMARK_SEARCH_INBOUND_MESSAGES: "messages.inbound.list",
  POSTMARK_SEARCH_OUTBOUND_MESSAGES: "messages.outbound.list",
  POSTMARK_SEND_BATCH_WITH_TEMPLATES: "emails.batch_templates.send",
  POSTMARK_UNARCHIVE_MESSAGE_STREAM: "streams.unarchive",
  POSTMARK_UPDATE_MESSAGE_STREAM: "streams.update",
  POSTMARK_VALIDATE_TEMPLATE: "templates.validate",
};

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("postmark manifest", () => {
  test("has bounded hosts, origin auth, and compiles", () => {
    expect(manifest.key).toBe("postmark");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.network.allowedHosts).toEqual(["api.postmarkapp.com", "spamcheck.postmarkapp.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.postmarkapp.com");
    expect(manifest.http.auth.name).toBe("X-Postmark-Server-Token");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin four operations and pagination contract", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/server" });
    expect(requestOf("messages.outbound.list")).toMatchObject({
      method: "GET",
      path: "/messages/outbound",
    });
    expect(requestOf("bounces.list")).toMatchObject({ method: "GET", path: "/bounces" });
    expect(requestOf("templates.list")).toMatchObject({ method: "GET", path: "/templates" });
    expect((operations["messages.outbound.list"]!.inputSchema as { required: string[] }).required).toEqual(
      expect.arrayContaining(["count", "offset"]),
    );
    expect((operations["bounces.list"]!.inputSchema as { required: string[] }).required).toEqual(
      expect.arrayContaining(["count", "offset"]),
    );
    expect((operations["templates.list"]!.inputSchema as { required: string[] }).required).toEqual(
      expect.arrayContaining(["count", "offset"]),
    );
  });

  test("covers every Composio Postmark tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(46);
    expect(Object.keys(operations).length).toBe(47);
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

  test("puts Content-Type only on JSON bodies", () => {
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
    }
  });

  test("maps documented Postmark family paths", () => {
    expect(requestOf("server.get")).toMatchObject({ method: "GET", path: "/server" });
    expect(requestOf("server.edit")).toMatchObject({ method: "PUT", path: "/server" });
    expect(requestOf("templates.get").path).toBe("/templates/{{templateID}}");
    expect(requestOf("templates.create")).toMatchObject({ method: "POST", path: "/templates" });
    expect(requestOf("templates.edit")).toMatchObject({ method: "PUT", path: "/templates/{{templateID}}" });
    expect(requestOf("templates.delete")).toMatchObject({
      method: "DELETE",
      path: "/templates/{{templateIdOrAlias}}",
    });
    expect(requestOf("templates.validate")).toMatchObject({ method: "POST", path: "/templates/validate" });
    expect(requestOf("emails.batch_templates.send")).toMatchObject({
      method: "POST",
      path: "/email/batchWithTemplates",
    });
    expect(requestOf("streams.list").path).toBe("/message-streams");
    expect(requestOf("streams.get").path).toBe("/message-streams/{{streamID}}");
    expect(requestOf("streams.create")).toMatchObject({ method: "POST", path: "/message-streams" });
    expect(requestOf("streams.update")).toMatchObject({
      method: "PATCH",
      path: "/message-streams/{{stream_ID}}",
    });
    expect(requestOf("streams.archive")).toMatchObject({
      method: "POST",
      path: "/message-streams/{{stream_id}}/archive",
    });
    expect(requestOf("streams.unarchive").path).toBe("/message-streams/{{stream_id}}/unarchive");
    expect(requestOf("suppressions.list").path).toBe("/message-streams/{{stream_id}}/suppressions/dump");
    expect(requestOf("suppressions.create").path).toBe("/message-streams/{{stream_id}}/suppressions");
    expect(requestOf("suppressions.delete")).toMatchObject({
      method: "POST",
      path: "/message-streams/{{stream_id}}/suppressions/delete",
    });
    expect(requestOf("webhooks.list").path).toBe("/webhooks");
    expect(requestOf("webhooks.get").path).toBe("/webhooks/{{webhook_id}}");
    expect(requestOf("webhooks.create")).toMatchObject({ method: "POST", path: "/webhooks" });
    expect(requestOf("webhooks.edit")).toMatchObject({ method: "PUT", path: "/webhooks/{{webhookID}}" });
    expect(requestOf("webhooks.delete")).toMatchObject({ method: "DELETE", path: "/webhooks/{{webhookID}}" });
    expect(requestOf("inbound_rules.list").path).toBe("/triggers/inboundrules");
    expect(requestOf("inbound_rules.create")).toMatchObject({ method: "POST", path: "/triggers/inboundrules" });
    expect(requestOf("inbound_rules.delete").path).toBe("/triggers/inboundrules/{{triggerid}}");
    expect(requestOf("bounces.delivery_stats").path).toBe("/deliverystats");
    expect(requestOf("stats.outbound.overview").path).toBe("/stats/outbound");
    expect(requestOf("stats.outbound.sends").path).toBe("/stats/outbound/sends");
    expect(requestOf("stats.outbound.bounces").path).toBe("/stats/outbound/bounces");
    expect(requestOf("stats.outbound.spam").path).toBe("/stats/outbound/spam");
    expect(requestOf("stats.outbound.tracked").path).toBe("/stats/outbound/tracked");
    expect(requestOf("stats.outbound.opens").path).toBe("/stats/outbound/opens");
    expect(requestOf("stats.outbound.opens.platforms").path).toBe("/stats/outbound/opens/platforms");
    expect(requestOf("stats.outbound.opens.clients").path).toBe("/stats/outbound/opens/emailclients");
    expect(requestOf("stats.outbound.clicks").path).toBe("/stats/outbound/clicks");
    expect(requestOf("stats.outbound.clicks.browsers").path).toBe("/stats/outbound/clicks/browserfamilies");
    expect(requestOf("stats.outbound.clicks.browser_families").path).toBe(
      "/stats/outbound/clicks/browserfamilies",
    );
    expect(requestOf("stats.outbound.clicks.platforms").path).toBe("/stats/outbound/clicks/platforms");
    expect(requestOf("stats.outbound.clicks.location").path).toBe("/stats/outbound/clicks/location");
    expect(requestOf("messages.inbound.list").path).toBe("/messages/inbound");
    expect(requestOf("messages.outbound.opens.list").path).toBe("/messages/outbound/opens");
    expect(requestOf("messages.outbound.clicks.list").path).toBe("/messages/outbound/clicks");
    expect(requestOf("spam.score")).toMatchObject({
      method: "POST",
      path: "/filter",
      baseUrl: "https://spamcheck.postmarkapp.com",
    });
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/postmark/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.selection.operations.sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("postmark compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function invoke(
    key: string,
    input: Record<string, unknown>,
    respond: (request: Request) => Promise<Response> | Response,
  ) {
    const requests: Request[] = [];
    const result = await compiled.actions[key]!({
      apiKey: "token",
      ...input,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        requests.push(request);
        return respond(request);
      },
    });
    return { requests, result };
  }

  test("healthcheck and server.get GET /server", async () => {
    for (const key of ["healthcheck", "server.get"] as const) {
      const { requests, result } = await invoke(key, {}, () => jsonResponse({ ID: 1, Name: "Demo" }));
      expect(requests).toHaveLength(1);
      expect(requests[0]!.method).toBe("GET");
      expect(requests[0]!.url).toBe("https://api.postmarkapp.com/server");
      expect(requests[0]!.headers.get("x-postmark-server-token")).toBe("token");
      expect(result).toMatchObject({
        connector: "postmark",
        action: key,
        source: "provider",
        data: { ID: 1, Name: "Demo" },
      });
    }
  });

  test("messages.outbound.list drops unset filters and keeps pagination", async () => {
    const { requests } = await invoke(
      "messages.outbound.list",
      { count: 100, offset: 0, recipient: "ada@example.com" },
      () => jsonResponse({ TotalCount: 0, Messages: [] }),
    );
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/messages/outbound");
    expect(url.searchParams.get("count")).toBe("100");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(url.searchParams.get("recipient")).toBe("ada@example.com");
    expect(url.searchParams.has("tag")).toBe(false);
  });

  test("templates.create posts JSON to /templates", async () => {
    const { requests, result } = await invoke(
      "templates.create",
      {
        Name: "Welcome",
        Subject: "Hi {{name}}",
        HtmlBody: "<p>Hi</p>",
        TextBody: "Hi",
        TemplateType: "Standard",
      },
      () => jsonResponse({ TemplateId: 12, Name: "Welcome", Active: true }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/templates");
    expect(requests[0]!.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]!.json()).toEqual({
      Name: "Welcome",
      Subject: "Hi {{name}}",
      HtmlBody: "<p>Hi</p>",
      TextBody: "Hi",
      TemplateType: "Standard",
    });
    expect(result).toMatchObject({
      connector: "postmark",
      action: "templates.create",
      data: { TemplateId: 12, Name: "Welcome", Active: true },
    });
  });

  test("streams.archive POSTs without a JSON body", async () => {
    const { requests } = await invoke("streams.archive", { stream_id: "outbound-dev" }, () =>
      jsonResponse({ ID: "outbound-dev", ExpectedPurgeDate: "2026-11-01" }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/message-streams/outbound-dev/archive");
    expect(requests[0]!.headers.get("content-type")).toBeNull();
    expect(await requests[0]!.text()).toBe("");
  });

  test("suppressions.create wraps EmailAddress objects", async () => {
    const { requests } = await invoke(
      "suppressions.create",
      { stream_id: "outbound", Suppressions: [{ EmailAddress: "bounce@example.com" }] },
      () => jsonResponse({ Suppressions: [{ EmailAddress: "bounce@example.com", Status: "Suppressed" }] }),
    );
    expect(new URL(requests[0]!.url).pathname).toBe("/message-streams/outbound/suppressions");
    expect(await requests[0]!.json()).toEqual({
      Suppressions: [{ EmailAddress: "bounce@example.com" }],
    });
  });

  test("spam.score posts to spamcheck.postmarkapp.com", async () => {
    const { requests, result } = await invoke(
      "spam.score",
      { email: "Subject: Hi\n\nHello", options: "short" },
      () => jsonResponse({ success: true, score: 1.2 }),
    );
    expect(requests[0]!.url).toBe("https://spamcheck.postmarkapp.com/filter");
    expect(requests[0]!.method).toBe("POST");
    expect(await requests[0]!.json()).toEqual({ email: "Subject: Hi\n\nHello", options: "short" });
    expect(result).toMatchObject({ action: "spam.score", data: { success: true, score: 1.2 } });
  });

  test("emails.batch_templates.send posts Messages", async () => {
    const messages = [
      { From: "a@example.com", To: "b@example.com", TemplateAlias: "welcome", TemplateModel: { name: "Ada" } },
    ];
    const { requests } = await invoke("emails.batch_templates.send", { Messages: messages }, () =>
      jsonResponse([{ ErrorCode: 0, Message: "OK" }]),
    );
    expect(new URL(requests[0]!.url).pathname).toBe("/email/batchWithTemplates");
    expect(await requests[0]!.json()).toEqual({ Messages: messages });
  });

  test("stats.outbound.spam maps from_date/to_date onto official query names", async () => {
    const { requests } = await invoke(
      "stats.outbound.spam",
      { from_date: "2024-01-01", to_date: "2024-02-01", tag: "welcome" },
      () => jsonResponse({ SpamComplaint: 1, Days: [] }),
    );
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/stats/outbound/spam");
    expect(url.searchParams.get("fromdate")).toBe("2024-01-01");
    expect(url.searchParams.get("todate")).toBe("2024-02-01");
    expect(url.searchParams.get("tag")).toBe("welcome");
  });
});
