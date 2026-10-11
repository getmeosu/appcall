import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = [
  "healthcheck",
  "subscribers.list",
  "subscribers.get",
  "groups.list",
  "fields.list",
] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  MAILERLITE_ADD_PRODUCT_TO_CATEGORY: "ecommerce.categories.products.add",
  MAILERLITE_ADD_SUBSCRIBER_TO_GROUP: "groups.assign",
  MAILERLITE_CREATE_AUTOMATION: "automations.create",
  MAILERLITE_CREATE_CAMPAIGN: "campaigns.create",
  MAILERLITE_CREATE_ECOMMERCE_CART_ITEM: "ecommerce.carts.items.create",
  MAILERLITE_CREATE_ECOMMERCE_CATEGORY: "ecommerce.categories.create",
  MAILERLITE_CREATE_ECOMMERCE_CUSTOMER: "ecommerce.customers.create",
  MAILERLITE_CREATE_ECOMMERCE_ORDER: "ecommerce.orders.create",
  MAILERLITE_CREATE_ECOMMERCE_PRODUCT: "ecommerce.products.create",
  MAILERLITE_CREATE_ECOMMERCE_SHOP: "ecommerce.shops.create",
  MAILERLITE_CREATE_FIELD: "fields.create",
  MAILERLITE_CREATE_GROUP: "groups.create",
  MAILERLITE_CREATE_SEGMENT: "segments.create",
  MAILERLITE_CREATE_SUBSCRIBER: "subscribers.create",
  MAILERLITE_CREATE_WEBHOOK: "webhooks.create",
  MAILERLITE_DELETE_AUTOMATION: "automations.delete",
  MAILERLITE_DELETE_ECOMMERCE_CART_ITEM: "ecommerce.carts.items.delete",
  MAILERLITE_DELETE_ECOMMERCE_CATEGORY: "ecommerce.categories.delete",
  MAILERLITE_DELETE_ECOMMERCE_CUSTOMER: "ecommerce.customers.delete",
  MAILERLITE_DELETE_ECOMMERCE_ORDER: "ecommerce.orders.delete",
  MAILERLITE_DELETE_ECOMMERCE_PRODUCT: "ecommerce.products.delete",
  MAILERLITE_DELETE_ECOMMERCE_SHOP: "ecommerce.shops.delete",
  MAILERLITE_DELETE_FIELD: "fields.delete",
  MAILERLITE_DELETE_GROUP: "groups.delete",
  MAILERLITE_DELETE_SEGMENT: "segments.delete",
  MAILERLITE_DELETE_SUBSCRIBER: "subscribers.delete",
  MAILERLITE_DELETE_WEBHOOK: "webhooks.delete",
  MAILERLITE_EXECUTE_BATCH_REQUEST: "batch.execute",
  MAILERLITE_FORGET_SUBSCRIBER: "subscribers.forget",
  MAILERLITE_GET_ACCOUNT_INFO: "account.info",
  MAILERLITE_GET_ACCOUNT_STATS: "account.stats",
  MAILERLITE_GET_AUTOMATION: "automations.get",
  MAILERLITE_GET_AUTOMATION_ACTIVITY: "automations.activity",
  MAILERLITE_GET_CAMPAIGN_LANGUAGES: "campaigns.languages",
  MAILERLITE_GET_CAMPAIGNS: "campaigns.list",
  MAILERLITE_GET_ECOMMERCE_CART: "ecommerce.carts.get",
  MAILERLITE_GET_ECOMMERCE_CART_ITEM: "ecommerce.carts.items.get",
  MAILERLITE_GET_ECOMMERCE_CATEGORY: "ecommerce.categories.get",
  MAILERLITE_GET_ECOMMERCE_CUSTOMER: "ecommerce.customers.get",
  MAILERLITE_GET_ECOMMERCE_CUSTOMERS: "ecommerce.customers.list",
  MAILERLITE_GET_ECOMMERCE_ORDER: "ecommerce.orders.get",
  MAILERLITE_GET_ECOMMERCE_PRODUCT: "ecommerce.products.get",
  MAILERLITE_GET_ECOMMERCE_SHOP: "ecommerce.shops.get",
  MAILERLITE_GET_ECOMMERCE_SHOPS: "ecommerce.shops.list",
  MAILERLITE_GET_FIELDS: "fields.list",
  MAILERLITE_GET_GROUP: "groups.get",
  MAILERLITE_GET_GROUPS: "groups.list",
  MAILERLITE_GET_GROUP_SUBSCRIBERS: "groups.subscribers",
  MAILERLITE_GET_IMPORT_STATUS: "imports.get",
  MAILERLITE_GET_SEGMENT: "segments.get",
  MAILERLITE_GET_SEGMENTS: "segments.list",
  MAILERLITE_GET_SEGMENT_SUBSCRIBERS: "segments.subscribers",
  MAILERLITE_GET_SUBSCRIBER: "subscribers.get",
  MAILERLITE_GET_SUBSCRIBER_ACTIVITY: "subscribers.activity",
  MAILERLITE_GET_SUBSCRIBERS: "subscribers.list",
  MAILERLITE_GET_SUBSCRIBERS_STATS: "subscribers.stats",
  MAILERLITE_GET_WEBHOOK: "webhooks.get",
  MAILERLITE_GET_WEBHOOKS: "webhooks.list",
  MAILERLITE_IMPORT_ECOMMERCE_CATEGORIES: "ecommerce.categories.import",
  MAILERLITE_IMPORT_ECOMMERCE_ORDERS: "ecommerce.orders.import",
  MAILERLITE_IMPORT_ECOMMERCE_PRODUCTS: "ecommerce.products.import",
  MAILERLITE_IMPORT_SUBSCRIBERS_TO_GROUP: "groups.import",
  MAILERLITE_LIST_AUTOMATIONS: "automations.list",
  MAILERLITE_LIST_ECOMMERCE_CART_ITEMS: "ecommerce.carts.items.list",
  MAILERLITE_LIST_ECOMMERCE_CARTS: "ecommerce.carts.list",
  MAILERLITE_LIST_ECOMMERCE_CATEGORIES: "ecommerce.categories.list",
  MAILERLITE_LIST_ECOMMERCE_CATEGORY_PRODUCTS: "ecommerce.categories.products.list",
  MAILERLITE_LIST_ECOMMERCE_ORDERS: "ecommerce.orders.list",
  MAILERLITE_LIST_ECOMMERCE_PRODUCTS: "ecommerce.products.list",
  MAILERLITE_LIST_FORMS: "forms.list",
  MAILERLITE_LIST_TIMEZONES: "timezones.list",
  MAILERLITE_REMOVE_PRODUCT_FROM_CATEGORY: "ecommerce.categories.products.remove",
  MAILERLITE_REMOVE_SUBSCRIBER_FROM_GROUP: "groups.unassign",
  MAILERLITE_SET_DOUBLE_OPTIN: "account.double_optin",
  MAILERLITE_UPDATE_ECOMMERCE_CART: "ecommerce.carts.update",
  MAILERLITE_UPDATE_ECOMMERCE_CART_ITEM: "ecommerce.carts.items.update",
  MAILERLITE_UPDATE_ECOMMERCE_CATEGORY: "ecommerce.categories.update",
  MAILERLITE_UPDATE_ECOMMERCE_CUSTOMER: "ecommerce.customers.update",
  MAILERLITE_UPDATE_ECOMMERCE_ORDER: "ecommerce.orders.update",
  MAILERLITE_UPDATE_ECOMMERCE_PRODUCT: "ecommerce.products.update",
  MAILERLITE_UPDATE_ECOMMERCE_SHOP: "ecommerce.shops.update",
  MAILERLITE_UPDATE_FIELD: "fields.update",
  MAILERLITE_UPDATE_GROUP: "groups.update",
  MAILERLITE_UPDATE_SEGMENT: "segments.update",
  MAILERLITE_UPDATE_SUBSCRIBER: "subscribers.update",
  MAILERLITE_UPDATE_WEBHOOK: "webhooks.update",
};

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("mailerlite manifest", () => {
  test("has bounded host, origin auth, and compiles", () => {
    expect(manifest.key).toBe("mailerlite");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.network.allowedHosts).toEqual(["connect.mailerlite.com"]);
    expect(manifest.http.baseUrl).toBe("https://connect.mailerlite.com");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations and /api paths", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(String(requestOf(key).path).startsWith("/api/"), key).toBe(true);
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/api/groups", query: { limit: "1" } });
    expect(requestOf("subscribers.list").path).toBe("/api/subscribers");
    expect(requestOf("subscribers.get").path).toBe("/api/subscribers/{{subscriber_id_or_email}}");
    expect(requestOf("groups.list").query).toMatchObject({ "filter[name]": "{{name}}" });
    expect(requestOf("fields.list").query).toMatchObject({
      "filter[keyword]": "{{keyword}}",
      "filter[type]": "{{type}}",
    });
    expect((operations["subscribers.get"]!.inputSchema as { required: string[] }).required).toEqual([
      "subscriber_id_or_email",
    ]);
  });

  test("covers every Composio MailerLite tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(86);
    expect(Object.keys(operations).length).toBe(87);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations["healthcheck"]).toBeDefined();
  });

  test("does not add inbound Composio trigger stubs", () => {
    for (const key of Object.keys(operations)) {
      expect(operations[key]!.kind, key).toBe("action");
      expect(key.includes("CAMPAIGN_") || key.includes("SUBSCRIBER_"), key).toBe(false);
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
      expect(String(request.path).startsWith("/api/"), key).toBe(true);
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

  test("puts Content-Type only on JSON bodies and result envelopes on empty 204s", () => {
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

  test("sends import arrays as the JSON body and maps documented family paths", () => {
    expect(requestOf("ecommerce.products.import")).toMatchObject({
      method: "POST",
      path: "/api/ecommerce/shops/{{shop_id}}/products/import",
      body: "{{products}}",
    });
    expect(requestOf("ecommerce.categories.import").body).toBe("{{categories}}");
    expect(requestOf("ecommerce.orders.import").body).toBe("{{orders}}");
    expect(requestOf("batch.execute")).toMatchObject({
      method: "POST",
      path: "/api/batch",
      body: { requests: "{{requests}}" },
    });
    expect(requestOf("forms.list").path).toBe("/api/forms/{{type}}");
    expect(requestOf("subscribers.activity").path).toBe("/api/subscribers/{{subscriber_id}}/activity-log");
    expect(requestOf("subscribers.stats").query).toEqual({ limit: "0" });
    expect(requestOf("subscribers.forget").path).toBe("/api/subscribers/{{subscriber_id}}/forget");
    expect(requestOf("groups.assign").path).toBe("/api/subscribers/{{subscriber_id}}/groups/{{group_id}}");
    expect(requestOf("groups.import").path).toBe("/api/groups/{{group_id}}/import-subscribers");
    expect(requestOf("campaigns.languages").path).toBe("/api/campaigns/languages");
    expect(requestOf("automations.activity").path).toBe("/api/automations/{{automation_id}}/activity");
    expect(requestOf("account.double_optin").path).toBe("/api/settings/double_optin");
    expect(requestOf("imports.get").path).toBe("/api/subscribers/import/{{import_id}}");
    expect(requestOf("ecommerce.carts.list").path).toBe("/api/ecommerce/shops/{{shop_id}}/carts");
    expect(requestOf("ecommerce.categories.products.add")).toMatchObject({
      method: "PUT",
      path: "/api/ecommerce/shops/{{shop_id}}/categories/{{category_id}}/products/{{product_id}}",
    });
    expect(requestOf("account.info")).toMatchObject({ method: "GET", path: "/api/groups", query: { limit: "1" } });
    expect(requestOf("account.stats").path).toBe("/api/campaigns");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/mailerlite/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.selection.operations.sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("mailerlite compiled handlers", () => {
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

  test("subscribers.create posts JSON to /api/subscribers", async () => {
    const { requests, result } = await invoke(
      "subscribers.create",
      { email: "person@example.com", fields: { name: "Ada" } },
      () => jsonResponse({ data: { id: "s1", email: "person@example.com" } }, 201),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/subscribers");
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer dummy");
    expect(requests[0]!.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]!.json()).toEqual({ email: "person@example.com", fields: { name: "Ada" } });
    expect(result).toMatchObject({
      connector: "mailerlite",
      action: "subscribers.create",
      source: "provider",
      data: { data: { id: "s1", email: "person@example.com" } },
    });
  });

  test("subscribers.delete returns the static 204 envelope", async () => {
    const { requests, result } = await invoke("subscribers.delete", { subscriber_id: "s1" }, () => new Response("", { status: 204 }));
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/subscribers/s1");
    expect(requests[0]!.headers.get("content-type")).toBeNull();
    expect(result).toEqual({
      connector: "mailerlite",
      action: "subscribers.delete",
      source: "provider",
      success: true,
    });
  });

  test("ecommerce.products.import sends a JSON array body", async () => {
    const products = [{ name: "Mug", price: 12.5 }];
    const { requests } = await invoke(
      "ecommerce.products.import",
      { shop_id: "shop1", products },
      () => jsonResponse({ imported: 1 }),
    );
    expect(new URL(requests[0]!.url).pathname).toBe("/api/ecommerce/shops/shop1/products/import");
    expect(await requests[0]!.json()).toEqual(products);
  });

  test("groups.assign posts without a body", async () => {
    const { requests } = await invoke(
      "groups.assign",
      { subscriber_id: "s1", group_id: "g1" },
      () => jsonResponse({ data: { id: "g1" } }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/subscribers/s1/groups/g1");
    expect(await requests[0]!.text()).toBe("");
  });

  test("forms.list requires type in the path", async () => {
    const { requests } = await invoke("forms.list", { type: "popup", limit: 1 }, () => jsonResponse({ data: [] }));
    expect(new URL(requests[0]!.url).pathname).toBe("/api/forms/popup");
    expect(new URL(requests[0]!.url).searchParams.get("limit")).toBe("1");
    await expect(compiled.actions["forms.list"]!({ apiKey: "dummy" })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
  });

  test("origin healthcheck still probes /api/groups?limit=1", async () => {
    const { requests } = await invoke("healthcheck", {}, () =>
      jsonResponse({ data: [{ id: "g1" }], links: { next: null }, meta: { total: 1 } }),
    );
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/api/groups");
    expect(url.search).toBe("?limit=1");
    expect(requests[0]!.headers.get("accept")).toBe("application/json");
  });
});
