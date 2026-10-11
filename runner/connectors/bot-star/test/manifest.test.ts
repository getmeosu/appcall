import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import {
  bootLivechat,
  createBotAttribute,
  createCmsEntityItem,
  updateBotAttribute,
  updateCmsEntityItem,
  updateUser,
} from "../src/actions";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = [
  "healthcheck",
  "bots.list",
  "bots.get",
  "bot-attributes.list",
  "cms-entities.list",
] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  BOTSTAR_CREATE_BOT: "bots.create",
  BOTSTAR_CREATE_BOT_ATTRIBUTE: "bot-attributes.create",
  BOTSTAR_CREATE_CMS_ENTITY: "cms-entities.create",
  BOTSTAR_CREATE_ENTITY_FIELDS: "cms-entity-fields.create",
  BOTSTAR_CREATE_ENTITY_ITEM: "cms-entity-items.create",
  BOTSTAR_CREATE_USER_ATTRIBUTES: "user-attributes.create",
  BOTSTAR_DELETE_BOT_ATTRIBUTE: "bot-attributes.delete",
  BOTSTAR_DELETE_CMS_ENTITY: "cms-entities.delete",
  BOTSTAR_DELETE_ENTITY_FIELDS: "cms-entity-fields.delete",
  BOTSTAR_DELETE_ENTITY_ITEM: "cms-entity-items.delete",
  BOTSTAR_GET_BOT: "bots.get",
  BOTSTAR_GET_BOT_APP_ID: "bots.list",
  BOTSTAR_GET_CMS_ENTITY: "cms-entities.get",
  BOTSTAR_GET_ENTITY_ITEM: "cms-entity-items.get",
  BOTSTAR_LIST_BOT_ATTRIBUTES: "bot-attributes.list",
  BOTSTAR_LIST_BOTS: "bots.list",
  BOTSTAR_LIST_CMS_ENTITIES: "cms-entities.list",
  BOTSTAR_LIST_ENTITY_ITEMS: "cms-entity-items.list",
  BOTSTAR_LIVECHAT_BOOT: "livechat.boot",
  BOTSTAR_LIVECHAT_UPDATE: "users.update",
  BOTSTAR_PUBLISH_BOT: "bots.publish",
  BOTSTAR_UPDATE_BOT_ATTRIBUTE: "bot-attributes.update",
  BOTSTAR_UPDATE_CMS_ENTITY: "cms-entities.update",
  BOTSTAR_UPDATE_ENTITY_FIELDS: "cms-entity-fields.update",
  BOTSTAR_UPDATE_ENTITY_ITEM: "cms-entity-items.update",
  BOTSTAR_WEBVIEW_SEND_RESPONSE: "webview.send-response",
};

const CLIENT_SIDE = [
  "BOTSTAR_LIVECHAT_CLOSE",
  "BOTSTAR_LIVECHAT_ON_CLOSE",
  "BOTSTAR_LIVECHAT_ON_OPEN",
  "BOTSTAR_LIVECHAT_OPEN",
  "BOTSTAR_WEBVIEW_GET_PARAMETER",
] as const;

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("bot-star manifest", () => {
  test("has bounded host, origin auth, and compiles", () => {
    expect(manifest.key).toBe("bot-star");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.network.allowedHosts).toEqual(["apis.botstar.com", "graph.botstar.com"]);
    expect(manifest.http.baseUrl).toBe("https://apis.botstar.com/v1");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/bots/" });
    expect(requestOf("bots.list")).toMatchObject({ method: "GET", path: "/bots/" });
    expect(requestOf("bots.get").path).toBe("/bots/{{botId}}");
    expect(requestOf("bot-attributes.list").path).toBe("/bots/{{botId}}/attributes");
    expect(requestOf("cms-entities.list").path).toBe("/bots/{{botId}}/cms_entities");
    expect((operations["bots.get"]!.inputSchema as { required: string[] }).required).toEqual(["botId"]);
  });

  test("covers every HTTP Composio BotStar tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(26);
    expect(Object.keys(operations).length).toBe(27);
    expect(CLIENT_SIDE).toHaveLength(5);
    expect(Object.keys(COMPOSIO_TOOLS).length + CLIENT_SIDE.length).toBe(31);
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

  test("maps documented BotStar family paths", () => {
    expect(requestOf("bots.create")).toMatchObject({ method: "POST", path: "/bots/" });
    expect(requestOf("bots.publish")).toMatchObject({
      method: "POST",
      path: "/bots/{{botId}}/publish",
    });
    expect(requestOf("bot-attributes.create")).toMatchObject({
      method: "POST",
      path: "/bots/{{botId}}/attributes",
    });
    expect(requestOf("bot-attributes.update")).toMatchObject({
      method: "PATCH",
      path: "/bots/{{botId}}/attributes/{{attributeId}}",
    });
    expect(requestOf("cms-entity-fields.create")).toMatchObject({
      method: "POST",
      path: "/bots/{{botId}}/cms_entities/{{entityId}}/fields",
    });
    expect(requestOf("cms-entity-fields.update").body).toBe("{{fields}}");
    expect(requestOf("cms-entity-items.list").path).toBe(
      "/bots/{{botId}}/cms_entities/{{entityId}}/items",
    );
    expect(requestOf("user-attributes.create")).toMatchObject({
      method: "POST",
      path: "/bots/{{botId}}/users/attributes",
    });
    expect(requestOf("livechat.boot")).toMatchObject({ method: "GET", path: "/bots/{{appId}}" });
    expect(requestOf("users.get")).toMatchObject({
      method: "GET",
      path: "/bots/{{botId}}/users/{{userId}}",
    });
    expect(requestOf("users.update")).toMatchObject({
      method: "PATCH",
      path: "/bots/{{botId}}/users/{{userId}}",
    });
    expect(requestOf("webview.send-response")).toMatchObject({
      method: "POST",
      baseUrl: "https://graph.botstar.com",
      path: "/webview",
    });
  });

  test("prepared recipe operations remain a subset of runner operations", () => {
    const recipe = JSON.parse(
      readFileSync(join(import.meta.dir, "../../recipes/bot_star/recipe.json"), "utf8"),
    ) as {
      selection: { operations: string[] };
      manifest: { operations: Record<string, unknown>; version: string };
    };
    const runnerOps = Object.keys(operations);
    for (const key of Object.keys(recipe.manifest.operations)) {
      expect(runnerOps, key).toContain(key);
    }
    for (const key of recipe.selection.operations) {
      expect(runnerOps, key).toContain(key);
    }
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("bot-star compiled handlers", () => {
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
      ...input,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        requests.push(request);
        return respond(request);
      },
    });
    return { requests, result };
  }

  test("bots.create posts name to /bots/", async () => {
    const { requests, result } = await invoke("bots.create", { name: "Support" }, () =>
      jsonResponse({ id: "bot_3", name: "Support" }, 201),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("https://apis.botstar.com/v1/bots/");
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer dummy");
    expect(await requests[0]!.json()).toEqual({ name: "Support" });
    expect(result).toMatchObject({
      connector: "bot-star",
      action: "bots.create",
      source: "provider",
      data: { id: "bot_3", name: "Support" },
    });
  });

  test("cms-entity-fields.create sends a JSON array body", async () => {
    const { requests } = await invoke(
      "cms-entity-fields.create",
      {
        botId: "bot_1",
        entityId: "ent_1",
        fields: [{ unique_name: "title", name: "Title", data_type: "text" }],
      },
      () => jsonResponse({ status: "success" }, 201),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("https://apis.botstar.com/v1/bots/bot_1/cms_entities/ent_1/fields");
    expect(await requests[0]!.json()).toEqual([
      { unique_name: "title", name: "Title", data_type: "text" },
    ]);
  });

  test("cms-entity-items.list forwards pagination query params", async () => {
    const { requests } = await invoke(
      "cms-entity-items.list",
      { botId: "bot_1", entityId: "ent_1", page: 2, limit: 50, status: "enabled" },
      () => jsonResponse([]),
    );
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/v1/bots/bot_1/cms_entities/ent_1/items");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("status")).toBe("enabled");
  });

  test("bots.publish posts to /bots/{id}/publish", async () => {
    const { requests } = await invoke("bots.publish", { botId: "bot_1" }, () =>
      jsonResponse({ status: "success" }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("https://apis.botstar.com/v1/bots/bot_1/publish");
  });

  test("origin bots.get still hits GET /bots/{id}", async () => {
    const { requests, result } = await invoke("bots.get", { botId: "bot_1" }, () =>
      jsonResponse({ id: "bot_1", name: "Support" }),
    );
    expect(requests[0]!.url).toBe("https://apis.botstar.com/v1/bots/bot_1");
    expect(result).toMatchObject({ action: "bots.get", data: { id: "bot_1", name: "Support" } });
  });

  test("livechat.boot gets the bot by appId", async () => {
    const { requests, result } = await invoke("livechat.boot", { appId: "bot_1" }, () =>
      jsonResponse({ id: "bot_1", name: "Support" }),
    );
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe("https://apis.botstar.com/v1/bots/bot_1");
    expect(result).toMatchObject({ action: "livechat.boot", data: { id: "bot_1", name: "Support" } });
  });

  test("users.get reads GET /bots/{botId}/users/{userId}", async () => {
    const { requests, result } = await invoke(
      "users.get",
      { botId: "bot_1", userId: "user_1", parameter_name: "email" },
      () => jsonResponse({ id: "user_1", email: "foo@example.com" }),
    );
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe("https://apis.botstar.com/v1/bots/bot_1/users/user_1");
    expect(result).toMatchObject({
      action: "users.get",
      data: { id: "user_1", email: "foo@example.com" },
    });
  });

  test("users.update patches audience user fields", async () => {
    const { requests } = await invoke(
      "users.update",
      { botId: "bot_1", userId: "user_1", first_name: "Foo", email: "foo@example.com" },
      () => jsonResponse({ id: "user_1", first_name: "Foo" }),
    );
    expect(requests[0]!.method).toBe("PATCH");
    expect(requests[0]!.url).toBe("https://apis.botstar.com/v1/bots/bot_1/users/user_1");
    expect(await requests[0]!.json()).toEqual({ first_name: "Foo", email: "foo@example.com" });
  });

  test("webview.send-response posts to graph.botstar.com/webview", async () => {
    const { requests, result } = await invoke(
      "webview.send-response",
      {
        senderId: "sender_1",
        elementId: "el_1",
        webviewMessageId: "msg_1",
        response: "done",
        outputs: { currentSeconds: 12 },
        outlet_name: "Button Clicked",
      },
      () => jsonResponse({ status: "success" }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("https://graph.botstar.com/webview");
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer dummy");
    expect(await requests[0]!.json()).toEqual({
      senderId: "sender_1",
      elementId: "el_1",
      webviewMessageId: "msg_1",
      value: "done",
      outletName: "Button Clicked",
      outputs: { currentSeconds: 12 },
    });
    expect(result).toMatchObject({ action: "webview.send-response", data: { status: "success" } });
  });
});

describe("bot-star handwritten flatten handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function invoke(
    handler: (input: unknown) => unknown,
    input: Record<string, unknown>,
    respond: (request: Request) => Promise<Response> | Response,
  ) {
    const requests: Request[] = [];
    const result = await handler({
      apiKey: "dummy",
      ...input,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        requests.push(request);
        return respond(request);
      },
    });
    return { requests, result };
  }

  test("createBotAttribute flattens additional_values into the body", async () => {
    const { requests, result } = await invoke(
      createBotAttribute,
      {
        botId: "bot_1",
        name: "greeting",
        data_type: "string",
        value: "Hello",
        additional_values: { value_es: "Hola" },
      },
      () => jsonResponse({ id: "attr_1" }, 201),
    );
    expect(await requests[0]!.json()).toEqual({
      name: "greeting",
      data_type: "string",
      value_es: "Hola",
      value: "Hello",
    });
    expect(result).toMatchObject({ action: "bot-attributes.create", data: { id: "attr_1" } });
  });

  test("updateBotAttribute accepts attribute_id alias", async () => {
    const { requests } = await invoke(
      updateBotAttribute,
      { bot_id: "bot_1", attribute_id: "attr_1", desc: "Updated" },
      () => jsonResponse({ id: "attr_1" }),
    );
    expect(requests[0]!.method).toBe("PATCH");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/bots/bot_1/attributes/attr_1");
    expect(await requests[0]!.json()).toEqual({ desc: "Updated" });
  });

  test("createCmsEntityItem flattens additional_fields onto the item body", async () => {
    const { requests } = await invoke(
      createCmsEntityItem,
      {
        botId: "bot_1",
        entityId: "ent_1",
        name: "Widget",
        status: "enabled",
        additional_fields: { price: "9.00", tags: ["new"] },
      },
      () => jsonResponse({ id: "item_1" }, 201),
    );
    expect(await requests[0]!.json()).toEqual({
      price: "9.00",
      tags: ["new"],
      name: "Widget",
      status: "enabled",
    });
  });

  test("updateCmsEntityItem flattens custom_fields", async () => {
    const { requests } = await invoke(
      updateCmsEntityItem,
      {
        botId: "bot_1",
        entityId: "ent_1",
        entityItemId: "item_1",
        custom_fields: { price: "12.00" },
      },
      () => jsonResponse({ status: "success" }),
    );
    expect(requests[0]!.method).toBe("PATCH");
    expect(await requests[0]!.json()).toEqual({ price: "12.00" });
  });

  test("updateUser flattens additional_attributes and maps avatar to picture", async () => {
    const { requests, result } = await invoke(
      updateUser,
      {
        bot_id: "bot_1",
        user_id: "user_1",
        first_name: "Foo",
        avatar: "https://cdn.example/a.png",
        additional_attributes: { vip: true },
      },
      () => jsonResponse({ id: "user_1" }),
    );
    expect(requests[0]!.method).toBe("PATCH");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/bots/bot_1/users/user_1");
    expect(await requests[0]!.json()).toEqual({
      vip: true,
      first_name: "Foo",
      picture: "https://cdn.example/a.png",
    });
    expect(result).toMatchObject({ action: "users.update", data: { id: "user_1" } });
  });

  test("bootLivechat patches the audience user when user_id is present", async () => {
    const { requests } = await invoke(
      bootLivechat,
      {
        appId: "bot_1",
        user: { user_id: "user_1", first_name: "Foo", email: "foo@example.com" },
        variables: { product_name: "Widget" },
      },
      async (request) => {
        if (request.method === "GET") return jsonResponse({ id: "bot_1", name: "Support" });
        return jsonResponse({ id: "user_1", first_name: "Foo" });
      },
    );
    expect(requests).toHaveLength(2);
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe("https://apis.botstar.com/v1/bots/bot_1");
    expect(requests[1]!.method).toBe("PATCH");
    expect(new URL(requests[1]!.url).pathname).toBe("/v1/bots/bot_1/users/user_1");
    expect(await requests[1]!.json()).toEqual({
      first_name: "Foo",
      email: "foo@example.com",
      product_name: "Widget",
    });
  });
});
