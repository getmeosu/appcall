import { describe, expect, test } from "bun:test";
import productGetFixture from "../fixtures/product_get.json";
import productCreateFixture from "../fixtures/product_create.json";
import orderGetFixture from "../fixtures/order_get.json";
import customerGetFixture from "../fixtures/customer_get.json";
import customerCreateFixture from "../fixtures/customer_create.json";
import {
  getProduct, createProduct, updateProduct, deleteProduct,
  getOrder, updateOrder, closeOrder, cancelOrder,
  getCustomer, createCustomer, updateCustomer,
} from "../src/actions";

const TOKEN = "shpat_test-token";
const SHOP = "my-test-store";

// ─── products.get ─────────────────────────────────────────────────────────────

describe("products.get", () => {
  test("validates input without credentials", () => {
    const result = getProduct({ productId: 123 });
    expect(result).toMatchObject({ connector: "shopify", action: "products.get", source: "connector" });
    expect((result as Record<string, unknown>).validated).toMatchObject({ productId: 123 });
  });

  test("fetches product via Shopify Admin API", async () => {
    const requests: Request[] = [];
    const result = await getProduct({
      accessToken: TOKEN, shopDomain: SHOP, productId: 123,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(productGetFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain(`${SHOP}.myshopify.com/admin/api/2025-01/products/123.json`);
    expect(requests[0].headers.get("X-Shopify-Access-Token")).toBe(TOKEN);
    expect(result).toMatchObject({ connector: "shopify", action: "products.get", source: "connector" });
    expect((result as Record<string, unknown>).product).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getProduct({
      accessToken: TOKEN, shopDomain: SHOP, productId: 123,
      fetch: async () => new Response(JSON.stringify({ errors: "rate limited" }), { status: 429, headers: { "Retry-After": "5" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 5 });
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getProduct({
      accessToken: TOKEN, shopDomain: SHOP, productId: 9999,
      fetch: async () => new Response(JSON.stringify({ errors: "Not Found" }), { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── products.create ──────────────────────────────────────────────────────────

describe("products.create", () => {
  test("validates input without credentials", () => {
    const result = createProduct({ title: "My Product" });
    expect(result).toMatchObject({ connector: "shopify", action: "products.create", source: "connector" });
    expect((result as Record<string, unknown>).validated).toMatchObject({ title: "My Product" });
  });

  test("posts new product to Shopify Admin API", async () => {
    const requests: Request[] = [];
    const result = await createProduct({
      accessToken: TOKEN, shopDomain: SHOP, title: "New Hoodie", status: "draft",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(productCreateFixture), { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain(`${SHOP}.myshopify.com/admin/api/2025-01/products.json`);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("X-Shopify-Access-Token")).toBe(TOKEN);
    expect(result).toMatchObject({ connector: "shopify", action: "products.create", source: "connector" });
    expect((result as Record<string, unknown>).product).toBeDefined();
  });

  test("throws when title is missing", () => {
    expect(() => createProduct({ accessToken: TOKEN, shopDomain: SHOP })).toThrow("title is required");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createProduct({
      accessToken: TOKEN, shopDomain: SHOP, title: "Test",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "10" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 10 });
  });
});

// ─── products.update ──────────────────────────────────────────────────────────

describe("products.update", () => {
  test("validates input without credentials", () => {
    const result = updateProduct({ productId: 123, title: "New Title" });
    expect(result).toMatchObject({ connector: "shopify", action: "products.update", source: "connector" });
    expect((result as Record<string, unknown>).validated).toMatchObject({ productId: 123, title: "New Title" });
  });

  test("puts updated product to Shopify Admin API", async () => {
    const requests: Request[] = [];
    const result = await updateProduct({
      accessToken: TOKEN, shopDomain: SHOP, productId: 123, title: "Updated Title",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(productGetFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toContain("/products/123.json");
    expect(result).toMatchObject({ connector: "shopify", action: "products.update", source: "connector" });
  });

  test("maps upstream error", async () => {
    await expect(updateProduct({
      accessToken: TOKEN, shopDomain: SHOP, productId: 123,
      fetch: async () => new Response("{}", { status: 500 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── products.delete ──────────────────────────────────────────────────────────

describe("products.delete", () => {
  test("validates input without credentials", () => {
    const result = deleteProduct({ productId: 123 });
    expect(result).toMatchObject({ connector: "shopify", action: "products.delete", source: "connector" });
    expect((result as Record<string, unknown>).validated).toMatchObject({ productId: 123 });
  });

  test("sends DELETE to Shopify Admin API", async () => {
    const requests: Request[] = [];
    const result = await deleteProduct({
      accessToken: TOKEN, shopDomain: SHOP, productId: 123,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("{}", { status: 200 });
      },
    });
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].url).toContain("/products/123.json");
    expect(result).toMatchObject({ connector: "shopify", action: "products.delete", source: "connector", deleted: true });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(deleteProduct({
      accessToken: TOKEN, shopDomain: SHOP, productId: 123,
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "3" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── orders.get ───────────────────────────────────────────────────────────────

describe("orders.get", () => {
  test("validates input without credentials", () => {
    const result = getOrder({ orderId: 456 });
    expect(result).toMatchObject({ connector: "shopify", action: "orders.get", source: "connector" });
    expect((result as Record<string, unknown>).validated).toMatchObject({ orderId: 456 });
  });

  test("fetches order via Shopify Admin API", async () => {
    const requests: Request[] = [];
    const result = await getOrder({
      accessToken: TOKEN, shopDomain: SHOP, orderId: 456,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(orderGetFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toContain("/orders/456.json");
    expect(requests[0].headers.get("X-Shopify-Access-Token")).toBe(TOKEN);
    expect(result).toMatchObject({ connector: "shopify", action: "orders.get", source: "connector" });
    expect((result as Record<string, unknown>).order).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getOrder({
      accessToken: TOKEN, shopDomain: SHOP, orderId: 456,
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "2" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── orders.update ────────────────────────────────────────────────────────────

describe("orders.update", () => {
  test("validates input without credentials", () => {
    const result = updateOrder({ orderId: 456, note: "priority" });
    expect(result).toMatchObject({ connector: "shopify", action: "orders.update", source: "connector" });
    expect((result as Record<string, unknown>).validated).toMatchObject({ orderId: 456, note: "priority" });
  });

  test("puts updated order", async () => {
    const requests: Request[] = [];
    const result = await updateOrder({
      accessToken: TOKEN, shopDomain: SHOP, orderId: 456, note: "urgent",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(orderGetFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toContain("/orders/456.json");
    expect(result).toMatchObject({ connector: "shopify", action: "orders.update", source: "connector" });
  });
});

// ─── orders.close ─────────────────────────────────────────────────────────────

describe("orders.close", () => {
  test("validates input without credentials", () => {
    const result = closeOrder({ orderId: 456 });
    expect(result).toMatchObject({ connector: "shopify", action: "orders.close", source: "connector" });
  });

  test("posts to close endpoint", async () => {
    const requests: Request[] = [];
    const result = await closeOrder({
      accessToken: TOKEN, shopDomain: SHOP, orderId: 456,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(orderGetFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toContain("/orders/456/close.json");
    expect(result).toMatchObject({ connector: "shopify", action: "orders.close", source: "connector" });
  });

  test("maps upstream error", async () => {
    await expect(closeOrder({
      accessToken: TOKEN, shopDomain: SHOP, orderId: 456,
      fetch: async () => new Response("{}", { status: 422 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── orders.cancel ────────────────────────────────────────────────────────────

describe("orders.cancel", () => {
  test("validates input without credentials", () => {
    const result = cancelOrder({ orderId: 456, reason: "customer" });
    expect(result).toMatchObject({ connector: "shopify", action: "orders.cancel", source: "connector" });
  });

  test("posts to cancel endpoint with reason", async () => {
    const requests: Request[] = [];
    const result = await cancelOrder({
      accessToken: TOKEN, shopDomain: SHOP, orderId: 456, reason: "fraud",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(orderGetFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toContain("/orders/456/cancel.json");
    expect(result).toMatchObject({ connector: "shopify", action: "orders.cancel", source: "connector" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(cancelOrder({
      accessToken: TOKEN, shopDomain: SHOP, orderId: 456,
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "7" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 7 });
  });
});

// ─── customers.get ────────────────────────────────────────────────────────────

describe("customers.get", () => {
  test("validates input without credentials", () => {
    const result = getCustomer({ customerId: 999 });
    expect(result).toMatchObject({ connector: "shopify", action: "customers.get", source: "connector" });
    expect((result as Record<string, unknown>).validated).toMatchObject({ customerId: 999 });
  });

  test("fetches customer via Shopify Admin API", async () => {
    const requests: Request[] = [];
    const result = await getCustomer({
      accessToken: TOKEN, shopDomain: SHOP, customerId: 999,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(customerGetFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toContain("/customers/999.json");
    expect(requests[0].headers.get("X-Shopify-Access-Token")).toBe(TOKEN);
    expect(result).toMatchObject({ connector: "shopify", action: "customers.get", source: "connector" });
    expect((result as Record<string, unknown>).customer).toBeDefined();
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getCustomer({
      accessToken: TOKEN, shopDomain: SHOP, customerId: 9999,
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── customers.create ─────────────────────────────────────────────────────────

describe("customers.create", () => {
  test("validates input without credentials", () => {
    const result = createCustomer({ email: "bob@example.com" });
    expect(result).toMatchObject({ connector: "shopify", action: "customers.create", source: "connector" });
    expect((result as Record<string, unknown>).validated).toMatchObject({ email: "bob@example.com" });
  });

  test("posts new customer to Shopify Admin API", async () => {
    const requests: Request[] = [];
    const result = await createCustomer({
      accessToken: TOKEN, shopDomain: SHOP, email: "bob@example.com", firstName: "Bob",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(customerCreateFixture), { status: 201 });
      },
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toContain("/customers.json");
    expect(requests[0].headers.get("X-Shopify-Access-Token")).toBe(TOKEN);
    expect(result).toMatchObject({ connector: "shopify", action: "customers.create", source: "connector" });
    expect((result as Record<string, unknown>).customer).toBeDefined();
  });

  test("throws when email is missing", () => {
    expect(() => createCustomer({ accessToken: TOKEN, shopDomain: SHOP })).toThrow("email is required");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createCustomer({
      accessToken: TOKEN, shopDomain: SHOP, email: "test@example.com",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "4" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});

// ─── customers.update ─────────────────────────────────────────────────────────

describe("customers.update", () => {
  test("validates input without credentials", () => {
    const result = updateCustomer({ customerId: 999, firstName: "Alice" });
    expect(result).toMatchObject({ connector: "shopify", action: "customers.update", source: "connector" });
    expect((result as Record<string, unknown>).validated).toMatchObject({ customerId: 999, firstName: "Alice" });
  });

  test("puts updated customer", async () => {
    const requests: Request[] = [];
    const result = await updateCustomer({
      accessToken: TOKEN, shopDomain: SHOP, customerId: 999, note: "VIP",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(customerGetFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toContain("/customers/999.json");
    expect(result).toMatchObject({ connector: "shopify", action: "customers.update", source: "connector" });
  });

  test("maps upstream error", async () => {
    await expect(updateCustomer({
      accessToken: TOKEN, shopDomain: SHOP, customerId: 999,
      fetch: async () => new Response("{}", { status: 500 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
