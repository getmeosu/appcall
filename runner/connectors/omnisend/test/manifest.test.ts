import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = [
  "healthcheck",
  "contacts.list",
  "contacts.get",
  "contacts.create",
  "contacts.update",
  "products.list",
  "products.get",
  "products.create",
  "products.delete",
  "productCategories.list",
  "productCategories.get",
  "campaigns.list",
  "campaigns.get",
  "segments.list",
  "segments.get",
  "events.create",
  "brands.current",
] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  OMNISEND_ADD_CART_PRODUCT: "carts.products.add",
  OMNISEND_CREATE_BATCH: "batches.create",
  OMNISEND_CREATE_CART: "carts.create",
  OMNISEND_CREATE_CATEGORY: "categories.create",
  OMNISEND_CREATE_ORDER: "orders.create",
  OMNISEND_CREATE_OR_UPDATE_CONTACT: "contacts.create",
  OMNISEND_CREATE_PRODUCT: "products.create",
  OMNISEND_CREATE_PRODUCT_CATEGORY: "productCategories.create",
  OMNISEND_DELETE_CART: "carts.delete",
  OMNISEND_DELETE_CATEGORY: "categories.delete",
  OMNISEND_DELETE_ORDER: "orders.delete",
  OMNISEND_DELETE_PRODUCT: "products.delete",
  OMNISEND_DELETE_PRODUCT_CATEGORY: "productCategories.delete",
  OMNISEND_GET_BATCHES: "batches.list",
  OMNISEND_GET_BATCH_INFORMATION: "batches.get",
  OMNISEND_GET_BATCH_ITEM: "batches.items.get",
  OMNISEND_GET_BATCH_ITEMS: "batches.items.list",
  OMNISEND_GET_BRAND: "brands.current",
  OMNISEND_GET_CART: "carts.get",
  OMNISEND_GET_CATEGORY: "categories.get",
  OMNISEND_GET_CONTACT: "contacts.get",
  OMNISEND_GET_ORDER: "orders.get",
  OMNISEND_GET_PRODUCT: "products.get",
  OMNISEND_GET_PRODUCT_CATEGORY: "productCategories.get",
  OMNISEND_LIST_CAMPAIGNS: "campaigns.list",
  OMNISEND_LIST_CARTS: "carts.list",
  OMNISEND_LIST_CATEGORIES: "categories.list",
  OMNISEND_LIST_CONTACTS: "contacts.list",
  OMNISEND_LIST_EVENTS: "events.list",
  OMNISEND_LIST_PRODUCT_CATEGORIES: "productCategories.list",
  OMNISEND_LIST_PRODUCTS: "products.list",
  OMNISEND_REMOVE_CART_PRODUCT: "carts.products.remove",
  OMNISEND_REPLACE_CART: "carts.replace",
  OMNISEND_REPLACE_CART_PRODUCT: "carts.products.replace",
  OMNISEND_REPLACE_CATEGORY: "categories.replace",
  OMNISEND_REPLACE_ORDER: "orders.replace",
  OMNISEND_REPLACE_PRODUCT: "products.replace",
  OMNISEND_SEND_EVENT: "events.create",
  OMNISEND_UPDATE_CART: "carts.update",
  OMNISEND_UPDATE_CART_PRODUCT: "carts.products.update",
  OMNISEND_UPDATE_CONTACT: "contacts.update",
  OMNISEND_UPDATE_ORDER_STATUS: "orders.update",
  OMNISEND_UPDATE_PRODUCT_CATEGORY: "productCategories.update",
};

const V3_ROUTES = [
  "batches.create.v3",
  "batches.get.v3",
  "batches.items.list.v3",
  "batches.list.v3",
  "campaigns.list.v3",
  "contacts.update.v3",
  "events.definitions.list",
] as const;

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("omnisend manifest", () => {
  test("has bounded host, origin auth, and compiles", () => {
    expect(manifest.key).toBe("omnisend");
    expect(manifest.version).toBe("0.3.1");
    expect(manifest.network.allowedHosts).toEqual(["api.omnisend.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.omnisend.com/api");
    expect(manifest.http.auth.value).toBe("Omnisend-API-Key {{apiKey}}");
    expect(manifest.http.headers).toEqual({ "Omnisend-Version": "2026-03-15" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin seventeen operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/contacts" });
    expect(requestOf("contacts.list").path).toBe("/contacts");
    expect(requestOf("contacts.get").path).toBe("/contacts/{{contactId}}");
    expect(requestOf("contacts.create")).toMatchObject({ method: "POST", path: "/contacts" });
    expect(requestOf("contacts.update")).toMatchObject({ method: "PATCH", path: "/contacts/{{contactId}}" });
    expect(requestOf("products.list").path).toBe("/products");
    expect(requestOf("products.get").path).toBe("/products/{{productId}}");
    expect(requestOf("products.create").method).toBe("POST");
    expect(requestOf("products.delete")).toMatchObject({ method: "DELETE", path: "/products/{{productId}}" });
    expect(requestOf("productCategories.list").path).toBe("/product-categories");
    expect(requestOf("productCategories.get").path).toBe("/product-categories/{{categoryId}}");
    expect(requestOf("campaigns.list").path).toBe("/campaigns");
    expect(requestOf("campaigns.get").path).toBe("/campaigns/{{campaignId}}");
    expect(requestOf("segments.list").path).toBe("/segments");
    expect(requestOf("segments.get").path).toBe("/segments/{{segmentId}}");
    expect(requestOf("events.create")).toMatchObject({ method: "POST", path: "/events" });
    expect(requestOf("brands.current").path).toBe("/brands/current");
  });

  test("covers every Composio Omnisend tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(43);
    expect(Object.keys(operations).length).toBe(54);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations["healthcheck"]).toBeDefined();
    expect(operations["campaigns.get"]).toBeDefined();
    expect(operations["segments.list"]).toBeDefined();
    expect(operations["segments.get"]).toBeDefined();
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
      else if (key === "events.list") expect(operation.sideEffect, key).toBe("read");
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

  test("maps documented Omnisend family paths", () => {
    expect(requestOf("categories.create")).toMatchObject({
      method: "POST",
      path: "/categories",
      baseUrl: "https://api.omnisend.com/v3",
    });
    expect(requestOf("categories.list").path).toBe("/categories");
    expect(requestOf("categories.get").path).toBe("/categories/{{categoryID}}");
    expect(requestOf("categories.replace")).toMatchObject({ method: "PUT", path: "/categories/{{categoryID}}" });
    expect(requestOf("categories.delete")).toMatchObject({ method: "DELETE", path: "/categories/{{categoryID}}" });
    expect(requestOf("productCategories.create")).toMatchObject({
      method: "POST",
      path: "/product-categories",
    });
    expect(requestOf("productCategories.delete").path).toBe("/product-categories/{{categoryId}}");
    expect(requestOf("productCategories.update")).toMatchObject({
      method: "PATCH",
      path: "/product-categories/{{categoryID}}",
    });
    expect(requestOf("products.replace")).toMatchObject({ method: "PUT", path: "/products/{{product_id}}" });
    expect(requestOf("events.list")).toMatchObject({ method: "POST", path: "/event-metadata/query" });
    expect(requestOf("batches.create")).toMatchObject({ method: "POST", path: "/batches" });
    expect(requestOf("batches.list").query).toMatchObject({ endpoint: "{{endpoint}}" });
    expect(requestOf("batches.get").path).toBe("/batches/{{batchId}}");
    expect(requestOf("batches.items.list").path).toBe("/batches/{{batchId}}/items");
    expect(requestOf("batches.items.get")).toMatchObject({
      method: "GET",
      path: "/batches/{{batchID}}/items/{{itemID}}",
      baseUrl: "https://api.omnisend.com/v3",
    });
    expect(requestOf("carts.create")).toMatchObject({
      method: "POST",
      path: "/carts",
      baseUrl: "https://api.omnisend.com/v3",
    });
    expect(requestOf("carts.list").path).toBe("/carts");
    expect(requestOf("carts.get").path).toBe("/carts/{{cartID}}");
    expect(requestOf("carts.replace").method).toBe("PUT");
    expect(requestOf("carts.update").method).toBe("PATCH");
    expect(requestOf("carts.delete").method).toBe("DELETE");
    expect(requestOf("carts.products.add").path).toBe("/carts/{{cart_id}}/products");
    expect(requestOf("carts.products.replace").path).toBe("/carts/{{cartID}}/products/{{cartProductID}}");
    expect(requestOf("carts.products.update").path).toBe("/carts/{{cart_id}}/products/{{cart_product_id}}");
    expect(requestOf("carts.products.remove").path).toBe("/carts/{{cart_id}}/products/{{cart_product_id}}");
    expect(requestOf("orders.create")).toMatchObject({ method: "POST", path: "/orders" });
    expect(requestOf("orders.get").path).toBe("/orders/{{orderID}}");
    expect(requestOf("orders.replace").method).toBe("PUT");
    expect(requestOf("orders.update").method).toBe("PATCH");
    expect(requestOf("orders.delete").method).toBe("DELETE");
    expect((requestOf("campaigns.list").query as Record<string, string>).offset).toBeUndefined();
  });

  test("keeps the unchanged 0.3.0 recipe and leaves the v3 routes as the only gap", () => {
    const recipePath = "scripts/connector-gen/openconnector/recipes/omnisend/recipe.json";
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
      selection: { operations: string[] };
      operationSources: Record<string, unknown>;
      manifest: { operations: Record<string, unknown>; version: string };
    };
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipe.manifest.version).toBe("0.3.0");
    expect(recipeOps).toHaveLength(47);
    expect([...recipe.selection.operations].sort()).toEqual(recipeOps);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(recipeOps);
    const absentFromRecipe = runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key));
    expect(absentFromRecipe).toEqual([...V3_ROUTES]);
    expect(runnerOps).toEqual([...recipeOps, ...V3_ROUTES].sort());
    for (const key of recipeOps) {
      expect(operations[key], key).toEqual(recipe.manifest.operations[key]);
    }
  });

  test("adds documented v3 JSON routes without moving the /api operations", () => {
    const limits = operations["batches.items.get"]!;
    for (const key of V3_ROUTES) {
      const operation = operations[key]!;
      expect(operation.timeoutMs, key).toBe(limits.timeoutMs);
      expect(operation.maxInputBytes, key).toBe(limits.maxInputBytes);
      expect(operation.maxResponseBytes, key).toBe(limits.maxResponseBytes);
      expect(operation.responseFormat, key).toBe("json");
      expect(operation.validationMode, key).toBe("strict-generated");
      expect(operation.enforceOutputSchema, key).toBe(true);
      expect((operation.outputSchema as { type?: string }).type, key).toBe("object");
      const request = requestOf(key);
      expect(request.baseUrl, key).toBe("https://api.omnisend.com/v3");
      expect(request.success, key).toEqual([200]);
      expect((request.headers as Record<string, string>)["X-API-KEY"], key).toBe("{{apiKey}}");
      expect(String(request.path).includes("/v3"), key).toBe(false);
      if (request.method === "GET") {
        expect(request.body, key).toBeUndefined();
        expect((request.headers as Record<string, string>)["Content-Type"], key).toBeUndefined();
      } else {
        expect((request.headers as Record<string, string>)["Content-Type"], key).toBe("application/json");
      }
    }

    expect(requestOf("batches.create")).toMatchObject({ method: "POST", path: "/batches", success: [200, 201] });
    expect(requestOf("batches.create").baseUrl).toBeUndefined();
    expect(requestOf("batches.list").baseUrl).toBeUndefined();
    expect(requestOf("batches.get").baseUrl).toBeUndefined();
    expect(requestOf("batches.items.list").baseUrl).toBeUndefined();
    expect(requestOf("campaigns.list").baseUrl).toBeUndefined();
    expect(requestOf("contacts.update").baseUrl).toBeUndefined();
    expect(requestOf("events.list")).toMatchObject({ method: "POST", path: "/event-metadata/query" });
    expect(requestOf("events.list").baseUrl).toBeUndefined();

    expect(requestOf("batches.create.v3")).toEqual({
      method: "POST",
      path: "/batches",
      success: [200],
      baseUrl: "https://api.omnisend.com/v3",
      headers: { "Content-Type": "application/json", "X-API-KEY": "{{apiKey}}" },
      body: {
        method: "{{method}}",
        endpoint: "{{endpoint}}",
        eventID: "{{eventID}}",
        items: "{{items}}",
      },
    });
    const createSchema = operations["batches.create.v3"]!.inputSchema as {
      required?: string[];
      properties: {
        method: { type: string; enum?: string[] };
        endpoint: { enum: string[] };
        items: { type: string; items: { type: string; additionalProperties: boolean; properties?: Record<string, unknown> } };
      };
    };
    expect(createSchema.required).toBeUndefined();
    expect(createSchema.properties.method).toEqual({ type: "string" });
    expect(createSchema.properties.endpoint.enum).toEqual(["contacts", "orders", "products", "events", "categories"]);
    expect(createSchema.properties.items.items).toEqual({ type: "object", additionalProperties: true });

    expect(requestOf("batches.list.v3")).toEqual({
      method: "GET",
      path: "/batches",
      success: [200],
      baseUrl: "https://api.omnisend.com/v3",
      headers: { "X-API-KEY": "{{apiKey}}" },
      query: {
        offset: "{{offset}}",
        limit: "{{limit}}",
        status: "{{status}}",
        dateFrom: "{{dateFrom}}",
        dateTo: "{{dateTo}}",
        endpoint: "{{endpoint}}",
      },
    });
    expect((operations["batches.list.v3"]!.inputSchema as { required: string[] }).required).toEqual(["endpoint"]);

    expect(requestOf("batches.get.v3")).toEqual({
      method: "GET",
      path: "/batches/{{batchID}}",
      success: [200],
      baseUrl: "https://api.omnisend.com/v3",
      headers: { "X-API-KEY": "{{apiKey}}" },
    });
    expect(requestOf("batches.items.list.v3")).toEqual({
      method: "GET",
      path: "/batches/{{batchID}}/items",
      success: [200],
      baseUrl: "https://api.omnisend.com/v3",
      headers: { "X-API-KEY": "{{apiKey}}" },
    });
    expect(requestOf("campaigns.list.v3")).toEqual({
      method: "GET",
      path: "/campaigns",
      success: [200],
      baseUrl: "https://api.omnisend.com/v3",
      headers: { "X-API-KEY": "{{apiKey}}" },
      query: {
        status: "{{status}}",
        type: "{{type}}",
        offset: "{{offset}}",
        limit: "{{limit}}",
      },
    });
    const campaignSchema = operations["campaigns.list.v3"]!.inputSchema as {
      required?: string[];
      properties: { status: { enum: string[] }; limit: { minimum: number; maximum: number } };
    };
    expect(campaignSchema.required).toBeUndefined();
    expect(campaignSchema.properties.status.enum).toEqual(["draft", "paused", "scheduled", "inProgress", "sent"]);
    expect(campaignSchema.properties.limit).toMatchObject({ type: "integer", minimum: 1, maximum: 5000 });

    expect(requestOf("events.definitions.list")).toEqual({
      method: "GET",
      path: "/events",
      success: [200],
      baseUrl: "https://api.omnisend.com/v3",
      headers: { "X-API-KEY": "{{apiKey}}" },
    });
    const eventsOutput = operations["events.definitions.list"]!.outputSchema as {
      properties: { data: { type: string; items: { type: string; additionalProperties: boolean } } };
    };
    expect(eventsOutput.properties.data.type).toBe("array");
    expect(eventsOutput.properties.data.items).toEqual({ type: "object", additionalProperties: true });

    expect(requestOf("contacts.update.v3")).toEqual({
      method: "PATCH",
      path: "/contacts/{{contactID}}",
      success: [200],
      baseUrl: "https://api.omnisend.com/v3",
      headers: { "Content-Type": "application/json", "X-API-KEY": "{{apiKey}}" },
      body: {
        identifiers: "{{identifiers}}",
        firstName: "{{firstName}}",
        lastName: "{{lastName}}",
        tags: "{{tags}}",
        country: "{{country}}",
        countryCode: "{{countryCode}}",
        state: "{{state}}",
        city: "{{city}}",
        address: "{{address}}",
        postalCode: "{{postalCode}}",
        gender: "{{gender}}",
        birthdate: "{{birthdate}}",
        customProperties: "{{customProperties}}",
      },
    });
    const contactSchema = operations["contacts.update.v3"]!.inputSchema as {
      required: string[];
      properties: Record<string, { type?: string; enum?: string[]; minLength?: number; maxLength?: number; items?: { required?: string[]; properties?: Record<string, { enum?: string[] }> } }>;
    };
    expect(contactSchema.required).toEqual(["contactID", "identifiers"]);
    expect(Object.keys(contactSchema.properties).sort()).toEqual([
      "address",
      "birthdate",
      "city",
      "contactID",
      "country",
      "countryCode",
      "customProperties",
      "firstName",
      "gender",
      "identifiers",
      "lastName",
      "postalCode",
      "state",
      "tags",
    ]);
    expect(contactSchema.properties.countryCode).toMatchObject({ type: "string", minLength: 2, maxLength: 2 });
    expect(contactSchema.properties.gender?.enum).toEqual(["m", "f"]);
    expect(contactSchema.properties.identifiers?.items?.required).toEqual(["id", "type", "channels"]);
    expect(contactSchema.properties.identifiers?.items?.properties?.type?.enum).toEqual(["email", "phone"]);
  });

  test("ships one success fixture for each new v3 route", () => {
    const cases = new URL("../fixtures/cases/", import.meta.url);
    const files: Record<string, string> = {
      "batches.create.v3": "batches-create-v3-success.json",
      "batches.list.v3": "batches-list-v3-success.json",
      "batches.get.v3": "batches-get-v3-success.json",
      "batches.items.list.v3": "batches-items-list-v3-success.json",
      "campaigns.list.v3": "campaigns-list-v3-success.json",
      "events.definitions.list": "events-definitions-list-success.json",
      "contacts.update.v3": "contacts-update-v3-success.json",
    };
    expect(Object.keys(files).sort()).toEqual([...V3_ROUTES]);
    for (const [operation, file] of Object.entries(files)) {
      const fixture = JSON.parse(readFileSync(new URL(file, cases), "utf8")) as {
        operation: string;
        exchanges: Array<{ request: { method: string; body: unknown }; response: { status: number } }>;
      };
      expect(fixture.operation, file).toBe(operation);
      expect(fixture.exchanges).toHaveLength(1);
      expect(fixture.exchanges[0]!.response.status, file).toBe(200);
      if (fixture.exchanges[0]!.request.method === "GET") expect(fixture.exchanges[0]!.request.body, file).toBeNull();
      else expect(typeof fixture.exchanges[0]!.request.body, file).toBe("string");
    }
  });
});

describe("omnisend compiled handlers", () => {
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

  test("healthcheck GET /api/contacts?limit=1", async () => {
    const { requests, result } = await invoke("healthcheck", {}, () => jsonResponse({ contacts: [] }));
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe("https://api.omnisend.com/api/contacts?limit=1");
    expect(requests[0]!.headers.get("authorization")).toBe("Omnisend-API-Key token");
    expect(requests[0]!.headers.get("omnisend-version")).toBe("2026-03-15");
    expect(result).toMatchObject({
      connector: "omnisend",
      action: "healthcheck",
      source: "provider",
      data: { contacts: [] },
    });
  });

  test("contacts.list drops unset filters and keeps pagination", async () => {
    const { requests } = await invoke(
      "contacts.list",
      { limit: 25, after: "opaque", email: "ada@example.com" },
      () => jsonResponse({ contacts: [], paging: { hasMore: false } }),
    );
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/api/contacts");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("after")).toBe("opaque");
    expect(url.searchParams.get("email")).toBe("ada@example.com");
    expect(url.searchParams.has("tag")).toBe(false);
    expect(url.searchParams.has("before")).toBe(false);
  });

  test("contacts.create posts identifiers to /api/contacts", async () => {
    const { requests, result } = await invoke(
      "contacts.create",
      {
        identifiers: [{ id: "ada@example.com", type: "email" }],
        firstName: "Ada",
        city: "London",
      },
      () => jsonResponse({ id: "c1", email: "ada@example.com" }, 201),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/contacts");
    expect(await requests[0]!.json()).toEqual({
      identifiers: [{ id: "ada@example.com", type: "email" }],
      firstName: "Ada",
      city: "London",
    });
    expect(result).toMatchObject({ action: "contacts.create", data: { id: "c1" } });
  });

  test("events.list POSTs event-metadata query with category events", async () => {
    const { requests } = await invoke("events.list", {}, () => jsonResponse({ events: [] }));
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("https://api.omnisend.com/api/event-metadata/query");
    expect(await requests[0]!.json()).toEqual({ category: "events" });
  });

  test("productCategories.create posts title and categoryID", async () => {
    const { requests } = await invoke(
      "productCategories.create",
      { title: "Shoes", categoryID: "cat-1" },
      () => jsonResponse({ categoryID: "cat-1" }, 201),
    );
    expect(requests[0]!.url).toBe("https://api.omnisend.com/api/product-categories");
    expect(await requests[0]!.json()).toEqual({ title: "Shoes", categoryID: "cat-1" });
  });

  test("carts.create posts v3 carts with X-API-KEY", async () => {
    const { requests, result } = await invoke(
      "carts.create",
      { cartID: "cart-1", email: "ada@example.com", currency: "USD", cartSum: 1999 },
      () => jsonResponse({ cartID: "cart-1", email: "ada@example.com" }),
    );
    expect(requests[0]!.url).toBe("https://api.omnisend.com/v3/carts");
    expect(requests[0]!.headers.get("x-api-key")).toBe("token");
    expect(requests[0]!.headers.get("authorization")).toBe("Omnisend-API-Key token");
    expect(await requests[0]!.json()).toEqual({
      email: "ada@example.com",
      cartID: "cart-1",
      cartSum: 1999,
      currency: "USD",
    });
    expect(result).toMatchObject({ action: "carts.create", data: { cartID: "cart-1" } });
  });

  test("carts.products.add maps snake_case fields onto the v3 body", async () => {
    const { requests } = await invoke(
      "carts.products.add",
      {
        cart_id: "cart-1",
        cart_product_id: "line-1",
        product_id: "sku-100",
        variant_id: "var-1",
        title: "Demo Book",
        quantity: 2,
        price: 1999,
        currency: "USD",
        image_url: "https://example.com/p.jpg",
      },
      () => jsonResponse({ cartProductID: "line-1" }),
    );
    expect(new URL(requests[0]!.url).pathname).toBe("/v3/carts/cart-1/products");
    expect(await requests[0]!.json()).toEqual({
      cartProductID: "line-1",
      productID: "sku-100",
      variantID: "var-1",
      title: "Demo Book",
      quantity: 2,
      price: 1999,
      imageUrl: "https://example.com/p.jpg",
      currency: "USD",
    });
  });

  test("orders.update PATCHes v3 order status fields", async () => {
    const { requests } = await invoke(
      "orders.update",
      { orderID: "ord-1", paymentStatus: "paid", fulfillmentStatus: "fulfilled" },
      () => jsonResponse({ orderID: "ord-1" }),
    );
    expect(requests[0]!.method).toBe("PATCH");
    expect(requests[0]!.url).toBe("https://api.omnisend.com/v3/orders/ord-1");
    expect(await requests[0]!.json()).toEqual({
      paymentStatus: "paid",
      fulfillmentStatus: "fulfilled",
    });
  });

  test("batches.items.get uses the v3 item path", async () => {
    const { requests } = await invoke(
      "batches.items.get",
      { batchID: "batch-1", itemID: "item-1" },
      () => jsonResponse({ itemID: "item-1", status: "finished" }),
    );
    expect(requests[0]!.url).toBe("https://api.omnisend.com/v3/batches/batch-1/items/item-1");
    expect(requests[0]!.headers.get("x-api-key")).toBe("token");
  });

  test("campaigns.list does not send unused offset", async () => {
    const { requests } = await invoke(
      "campaigns.list",
      { limit: 10, type: "regular", offset: 20 },
      () => jsonResponse({ campaigns: [] }),
    );
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/api/campaigns");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("type")).toBe("regular");
    expect(url.searchParams.has("offset")).toBe(false);
  });

  test("products.replace PUTs catalog fields to /api/products/{id}", async () => {
    const { requests } = await invoke(
      "products.replace",
      {
        product_id: "sku-100",
        id: "sku-100",
        title: "Demo Book",
        currency: "USD",
        url: "https://example.com/p",
        status: "inStock",
        variants: [{ id: "v1", title: "Default", url: "https://example.com/p", price: 9.99 }],
      },
      () => jsonResponse({ id: "sku-100" }),
    );
    expect(requests[0]!.method).toBe("PUT");
    expect(requests[0]!.url).toBe("https://api.omnisend.com/api/products/sku-100");
    const body = await requests[0]!.json();
    expect(body).toMatchObject({
      id: "sku-100",
      title: "Demo Book",
      currency: "USD",
      url: "https://example.com/p",
      status: "inStock",
    });
  });

  test("batches.create.v3 posts free-form items to v3 and omits unset fields", async () => {
    const items = [
      {
        identifiers: [
          {
            type: "email",
            id: "ada@example.com",
            channels: { email: { status: "subscribed" } },
          },
        ],
        firstName: "Ada",
      },
    ];
    const { requests, result } = await invoke(
      "batches.create.v3",
      { method: "POST", endpoint: "contacts", items },
      () => jsonResponse({ batchID: "batch-v3", totalCount: 1 }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("https://api.omnisend.com/v3/batches");
    expect(requests[0]!.headers.get("x-api-key")).toBe("token");
    expect(requests[0]!.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]!.json()).toEqual({ method: "POST", endpoint: "contacts", items });
    expect(result).toMatchObject({ action: "batches.create.v3", data: { batchID: "batch-v3", totalCount: 1 } });

    const empty = await invoke("batches.create.v3", {}, () => jsonResponse({ batchID: "batch-empty", totalCount: 0 }));
    expect(empty.requests[0]!.url).toBe("https://api.omnisend.com/v3/batches");
    expect(await empty.requests[0]!.json()).toEqual({});
  });

  test("batches.list.v3 requires endpoint and drops unset filters", async () => {
    const { requests } = await invoke("batches.list.v3", { endpoint: "products" }, () => jsonResponse({ batches: [] }));
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe("https://api.omnisend.com/v3/batches?endpoint=products");
    expect(requests[0]!.headers.get("content-type")).toBeNull();
    expect(requests[0]!.headers.get("x-api-key")).toBe("token");

    const filtered = await invoke(
      "batches.list.v3",
      { endpoint: "contacts", offset: 0, limit: 2, status: "finished", dateFrom: "2017-05-01", dateTo: "2017-05-16" },
      () => jsonResponse({ batches: [], paging: { offset: 0, limit: 2 } }),
    );
    expect(filtered.requests[0]!.url).toBe(
      "https://api.omnisend.com/v3/batches?offset=0&limit=2&status=finished&dateFrom=2017-05-01&dateTo=2017-05-16&endpoint=contacts",
    );
  });

  test("batches.get.v3 and batches.items.list.v3 read JSON by batchID", async () => {
    const batch = await invoke("batches.get.v3", { batchID: "batch-1" }, () =>
      jsonResponse({ batchID: "batch-1", status: "finished" }),
    );
    expect(batch.requests[0]!.url).toBe("https://api.omnisend.com/v3/batches/batch-1");
    expect(batch.requests[0]!.headers.get("x-api-key")).toBe("token");
    expect(batch.result).toMatchObject({ action: "batches.get.v3", data: { batchID: "batch-1" } });

    const items = await invoke("batches.items.list.v3", { batchID: "batch-1" }, () =>
      jsonResponse({ batchID: "batch-1", status: "finished", responses: [] }),
    );
    expect(items.requests[0]!.url).toBe("https://api.omnisend.com/v3/batches/batch-1/items");
    expect(items.result).toMatchObject({ data: { batchID: "batch-1", responses: [] } });
  });

  test("campaigns.list.v3 sends only documented query fields", async () => {
    const { requests } = await invoke("campaigns.list.v3", {}, () => jsonResponse({ campaigns: [] }));
    expect(requests[0]!.url).toBe("https://api.omnisend.com/v3/campaigns");
    const filtered = await invoke(
      "campaigns.list.v3",
      { status: "sent", type: "abTest", offset: 0, limit: 2 },
      () => jsonResponse({ campaigns: [] }),
    );
    expect(filtered.requests[0]!.url).toBe("https://api.omnisend.com/v3/campaigns?status=sent&type=abTest&offset=0&limit=2");
  });

  test("events.definitions.list returns the v3 event array as data", async () => {
    const events = [{ eventID: "evt-1", name: "Custom Event Test", enabled: false }];
    const { requests, result } = await invoke("events.definitions.list", {}, () => jsonResponse(events));
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe("https://api.omnisend.com/v3/events");
    expect(requests[0]!.headers.get("content-type")).toBeNull();
    expect(requests[0]!.headers.get("x-api-key")).toBe("token");
    expect(result).toMatchObject({ action: "events.definitions.list", source: "provider", data: events });
  });

  test("contacts.update.v3 patches documented fields and rejects stale keys", async () => {
    const identifiers = [
      {
        id: "ada@example.com",
        type: "email",
        channels: { email: { status: "subscribed", statusDate: "2016-02-01T10:07:28Z" } },
      },
    ];
    const { requests, result } = await invoke(
      "contacts.update.v3",
      { contactID: "696969", identifiers, firstName: "Ada", countryCode: "GB", gender: "f" },
      () => jsonResponse({ email: "ada@example.com", contactID: "696969" }),
    );
    expect(requests[0]!.method).toBe("PATCH");
    expect(requests[0]!.url).toBe("https://api.omnisend.com/v3/contacts/696969");
    expect(requests[0]!.headers.get("x-api-key")).toBe("token");
    expect(requests[0]!.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]!.json()).toEqual({
      identifiers,
      firstName: "Ada",
      countryCode: "GB",
      gender: "f",
    });
    expect(result).toMatchObject({ action: "contacts.update.v3", data: { contactID: "696969" } });

    await expect(
      compiled.actions["contacts.update.v3"]!({
        apiKey: "token",
        contactID: "696969",
        identifiers,
        status: "subscribed",
        fetch: async () => jsonResponse({}),
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });
});
