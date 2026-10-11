import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "workspaces.list", "bots.list", "bots.get"] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  BOTPRESS_BREAK_DOWN_WORKSPACE_USAGE_BY_BOT: "workspaces.usage.by_bot",
  BOTPRESS_CHARGE_WORKSPACE_UNPAID_INVOICES: "workspaces.invoices.charge",
  BOTPRESS_CHECK_HANDLE_AVAILABILITY: "workspaces.handle.availability",
  BOTPRESS_CREATE_ADMIN_INTEGRATION: "integrations.create",
  BOTPRESS_CREATE_ADMIN_WORKSPACE: "workspaces.create",
  BOTPRESS_CREATE_BOT: "bots.create",
  BOTPRESS_CREATE_CONVERSATION: "conversations.create",
  BOTPRESS_DELETE_ADMIN_WORKSPACE: "workspaces.delete",
  BOTPRESS_DELETE_FILE: "files.delete",
  BOTPRESS_DELETE_INTEGRATION_SHAREABLE_ID: "bots.integrations.shareable_id.delete",
  BOTPRESS_DELETE_KNOWLEDGE_BASE: "knowledge_bases.delete",
  BOTPRESS_GET_ACCOUNT: "account.get",
  BOTPRESS_GET_ACCOUNT_PREFERENCE: "account.preferences.get",
  BOTPRESS_GET_ALL_WORKSPACE_QUOTA_COMPLETION: "workspaces.quota.completion",
  BOTPRESS_GET_DEREFERENCED_PUBLIC_PLUGIN_BY_ID: "hub.plugins.dereferenced.get",
  BOTPRESS_GET_INTEGRATION: "integrations.get",
  BOTPRESS_GET_PUBLIC_INTEGRATION: "hub.integrations.get",
  BOTPRESS_GET_PUBLIC_INTEGRATION_BY_ID: "hub.integrations.get_by_id",
  BOTPRESS_GET_PUBLIC_INTERFACE: "hub.interfaces.get",
  BOTPRESS_GET_PUBLIC_INTERFACE_BY_ID: "hub.interfaces.get_by_id",
  BOTPRESS_GET_PUBLIC_PLUGIN: "hub.plugins.get",
  BOTPRESS_GET_PUBLIC_PLUGIN_BY_ID: "hub.plugins.get_by_id",
  BOTPRESS_GET_PUBLIC_PLUGIN_CODE: "hub.plugins.code.get",
  BOTPRESS_GET_TABLE_ROW: "tables.rows.get",
  BOTPRESS_GET_UPCOMING_INVOICE: "workspaces.invoices.upcoming",
  BOTPRESS_GET_WORKSPACE: "workspaces.get",
  BOTPRESS_GET_WORKSPACE_QUOTA: "workspaces.quota.get",
  BOTPRESS_LIST_ACTION_RUNS: "bots.action_runs.list",
  BOTPRESS_LIST_BOT_ISSUES: "bots.issues.list",
  BOTPRESS_LIST_CONVERSATIONS: "conversations.list",
  BOTPRESS_LIST_FILE_TAGS: "files.tags.list",
  BOTPRESS_LIST_FILE_TAG_VALUES: "files.tags.values.list",
  BOTPRESS_LIST_HUB_INTEGRATIONS: "hub.integrations.list",
  BOTPRESS_LIST_INTEGRATION_API_KEYS: "integrations.api_keys.list",
  BOTPRESS_LIST_INTEGRATIONS: "integrations.list",
  BOTPRESS_LIST_KNOWLEDGE_BASES: "knowledge_bases.list",
  BOTPRESS_LIST_PLUGINS: "plugins.list",
  BOTPRESS_LIST_PUBLIC_INTERFACES: "hub.interfaces.list",
  BOTPRESS_LIST_PUBLIC_PLUGINS: "hub.plugins.list",
  BOTPRESS_LIST_PUBLIC_WORKSPACES: "workspaces.public.list",
  BOTPRESS_LIST_USAGE_HISTORY: "usages.history.list",
  BOTPRESS_LIST_WORKSPACE_INVOICES: "workspaces.invoices.list",
  BOTPRESS_LIST_WORKSPACES: "workspaces.list",
  BOTPRESS_REQUEST_INTEGRATION_VERIFICATION: "integrations.verification.request",
  BOTPRESS_RUN_VRL: "helper.vrl.run",
  BOTPRESS_SEND_MESSAGE: "messages.create",
  BOTPRESS_SET_ACCOUNT_PREFERENCE: "account.preferences.set",
  BOTPRESS_SET_WORKSPACE_PREFERENCE: "workspaces.preferences.set",
  BOTPRESS_UPDATE_ACCOUNT: "account.update",
  BOTPRESS_UPDATE_ADMIN_BOTS: "bots.update",
  BOTPRESS_UPDATE_ADMIN_WORKSPACE: "workspaces.update",
  BOTPRESS_UPDATE_WORKFLOW: "workflows.update",
  BOTPRESS_VALIDATE_INTEGRATION_UPDATE: "integrations.validate_update",
};

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("botpress manifest", () => {
  test("has bounded host, origin auth, and compiles", () => {
    expect(manifest.key).toBe("botpress");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.network.allowedHosts).toEqual(["api.botpress.cloud"]);
    expect(manifest.http.baseUrl).toBe("https://api.botpress.cloud/v1/admin");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({
      Accept: "application/json",
      "x-workspace-id": "{{workspaceId}}",
    });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin four operations and admin paths", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/bots" });
    expect(requestOf("workspaces.list")).toMatchObject({
      method: "GET",
      path: "/workspaces",
      query: { handle: "{{handle}}", nextToken: "{{nextToken}}" },
    });
    expect(requestOf("bots.list").path).toBe("/bots");
    expect(requestOf("bots.get").path).toBe("/bots/{{botId}}");
    expect((operations["bots.get"]!.inputSchema as { required: string[] }).required).toEqual(["botId"]);
    expect(requestOf("healthcheck").baseUrl).toBeUndefined();
    expect(requestOf("bots.get").baseUrl).toBeUndefined();
  });

  test("covers every Composio Botpress tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(53);
    expect(Object.keys(operations).length).toBe(56);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
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

  test("puts Content-Type only on JSON bodies and envelopes empty deletes", () => {
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
      if (method === "DELETE") {
        expect(request.result, key).toEqual({ success: true });
        expect(request.success, key).toEqual([200, 204]);
      }
    }
  });

  test("overrides baseUrl for chat, files, and tables", () => {
    expect(requestOf("conversations.create").baseUrl).toBe("https://api.botpress.cloud/v1/chat");
    expect(requestOf("conversations.list").baseUrl).toBe("https://api.botpress.cloud/v1/chat");
    expect(requestOf("messages.create").baseUrl).toBe("https://api.botpress.cloud/v1/chat");
    expect(requestOf("workflows.update").baseUrl).toBe("https://api.botpress.cloud/v1/chat");
    expect(requestOf("files.delete").baseUrl).toBe("https://api.botpress.cloud/v1/files");
    expect(requestOf("files.tags.list").path).toBe("/tags");
    expect(requestOf("knowledge_bases.delete").path).toBe("/knowledge-bases/{{id}}");
    expect(requestOf("tables.rows.get")).toMatchObject({
      method: "GET",
      path: "/{{table}}/row",
      baseUrl: "https://api.botpress.cloud/v1/tables",
      query: { id: "{{id}}" },
    });
    expect(requestOf("workspaces.handle.availability")).toMatchObject({
      method: "PUT",
      path: "/workspaces/handle-availability",
      body: { handle: "{{handle}}" },
    });
    expect(requestOf("helper.vrl.run")).toMatchObject({
      method: "POST",
      path: "/helper/vrl",
      body: { data: "{{data}}", script: "{{script}}" },
    });
    expect(requestOf("integrations.get").path).toBe("/integrations/{{name}}/{{version}}");
    expect(requestOf("bots.integrations.shareable_id.delete").path).toBe(
      "/bots/{{botId}}/integrations/{{integrationId}}/shareable-id",
    );
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/botpress/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.selection.operations.sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("botpress compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function invoke(
    key: string,
    input: Record<string, unknown>,
    respond: (request: Request) => Promise<Response> | Response,
  ) {
    const requests: Request[] = [];
    const result = await compiled.actions[key]!({
      apiKey: "dummy",
      workspaceId: "wkspace_demo",
      ...input,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        requests.push(request);
        return respond(request);
      },
    });
    return { requests, result };
  }

  test("conversations.create posts to the chat API with x-bot-id", async () => {
    const { requests, result } = await invoke(
      "conversations.create",
      { botId: "bot-uuid", channel: "channel", tags: { userId: "u1" } },
      () => jsonResponse({ conversation: { id: "conv_1" } }, 201),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("https://api.botpress.cloud/v1/chat/conversations");
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer dummy");
    expect(requests[0]!.headers.get("x-workspace-id")).toBe("wkspace_demo");
    expect(requests[0]!.headers.get("x-bot-id")).toBe("bot-uuid");
    expect(requests[0]!.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]!.json()).toEqual({ channel: "channel", tags: { userId: "u1" } });
    expect(result).toMatchObject({
      connector: "botpress",
      action: "conversations.create",
      source: "provider",
      data: { conversation: { id: "conv_1" } },
    });
  });

  test("workspaces.handle.availability sends PUT with handle body", async () => {
    const { requests, result } = await invoke(
      "workspaces.handle.availability",
      { handle: "demo-bot" },
      () => jsonResponse({ available: true }),
    );
    expect(requests[0]!.method).toBe("PUT");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/admin/workspaces/handle-availability");
    expect(await requests[0]!.json()).toEqual({ handle: "demo-bot" });
    expect(result).toMatchObject({ data: { available: true } });
  });

  test("files.delete uses the files host and a static envelope", async () => {
    const { requests, result } = await invoke(
      "files.delete",
      { id: "file_1", botId: "bot-uuid" },
      () => new Response("", { status: 204 }),
    );
    expect(requests[0]!.method).toBe("DELETE");
    expect(requests[0]!.url).toBe("https://api.botpress.cloud/v1/files/file_1");
    expect(requests[0]!.headers.get("x-bot-id")).toBe("bot-uuid");
    expect(requests[0]!.headers.get("content-type")).toBeNull();
    expect(result).toEqual({
      connector: "botpress",
      action: "files.delete",
      source: "provider",
      success: true,
    });
  });

  test("tables.rows.get queries id on the tables host", async () => {
    const { requests, result } = await invoke(
      "tables.rows.get",
      { table: "customers", id: 42, botId: "bot-uuid" },
      () => jsonResponse({ row: { id: 42 } }),
    );
    const url = new URL(requests[0]!.url);
    expect(url.origin + url.pathname).toBe("https://api.botpress.cloud/v1/tables/customers/row");
    expect(url.searchParams.get("id")).toBe("42");
    expect(requests[0]!.headers.get("x-bot-id")).toBe("bot-uuid");
    expect(result).toMatchObject({ data: { row: { id: 42 } } });
  });

  test("integrations.get encodes slashes in the integration name", async () => {
    const { requests } = await invoke(
      "integrations.get",
      { name: "composio-test/my-integration", version: "latest" },
      () => jsonResponse({ integration: { name: "composio-test/my-integration" } }),
    );
    expect(new URL(requests[0]!.url).pathname).toBe(
      "/v1/admin/integrations/composio-test%2Fmy-integration/latest",
    );
  });

  test("helper.vrl.run posts data and script", async () => {
    const { requests, result } = await invoke(
      "helper.vrl.run",
      { data: { name: "Ada" }, script: ".name" },
      () => jsonResponse({ value: "Ada" }),
    );
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/admin/helper/vrl");
    expect(await requests[0]!.json()).toEqual({ data: { name: "Ada" }, script: ".name" });
    expect(result).toMatchObject({ data: { value: "Ada" } });
  });

  test("messages.create posts to chat /messages", async () => {
    const { requests } = await invoke(
      "messages.create",
      {
        type: "text",
        botId: "bot-uuid",
        userId: "user_1",
        conversationId: "conv_1",
        payload: { text: "hello" },
      },
      () => jsonResponse({ message: { id: "msg_1" } }, 201),
    );
    expect(requests[0]!.url).toBe("https://api.botpress.cloud/v1/chat/messages");
    expect(requests[0]!.headers.get("x-bot-id")).toBe("bot-uuid");
    expect(await requests[0]!.json()).toEqual({
      payload: { text: "hello" },
      userId: "user_1",
      conversationId: "conv_1",
      type: "text",
    });
  });

  test("origin bots.get still hits admin /bots/{id}", async () => {
    const { requests, result } = await invoke("bots.get", { botId: "bot_1" }, () =>
      jsonResponse({ bot: { id: "bot_1" } }),
    );
    expect(requests[0]!.url).toBe("https://api.botpress.cloud/v1/admin/bots/bot_1");
    expect(result).toMatchObject({ action: "bots.get", data: { bot: { id: "bot_1" } } });
  });
});
