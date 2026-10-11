import { describe, expect, test } from "bun:test";
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

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("omnisend manifest", () => {
  test("has bounded host, origin auth, and compiles", () => {
    expect(manifest.key).toBe("omnisend");
    expect(manifest.version).toBe("0.3.0");
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
    expect(Object.keys(operations).length).toBe(47);
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

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/omnisend/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.selection.operations.sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.3.0");
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
});
