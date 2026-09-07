import { describe, expect, test } from "bun:test";
import productFixture from "../fixtures/product_single.json";
import orderFixture from "../fixtures/order_single.json";
import customerFixture from "../fixtures/customer_single.json";
import couponFixture from "../fixtures/coupon_single.json";
import {
  createProduct,
  getProduct,
  updateProduct,
  deleteProduct,
  createOrder,
  getOrder,
  updateOrder,
  deleteOrder,
  createCustomer,
  getCustomer,
  updateCustomer,
  createCoupon,
} from "../src/actions";

// ─── Constants ────────────────────────────────────────────────────────────────

const SITE_URL = "https://mystore.test";
const CONSUMER_KEY = "ck_test1234";
const CONSUMER_SECRET = "cs_test5678";
const EXPECTED_AUTH = `Basic ${btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`)}`;

function makeAuth() {
  return { consumerKey: CONSUMER_KEY, consumerSecret: CONSUMER_SECRET, siteUrl: SITE_URL };
}

function makeMockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  return async (url: string, init?: RequestInit) => {
    const responseBody = JSON.stringify(body);
    return new Response(responseBody, {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  };
}

// ─── products.create ─────────────────────────────────────────────────────────

describe("createProduct — static validation (no auth)", () => {
  test("returns validated object without auth", () => {
    const result = createProduct({ name: "Hoodie" });
    expect(result).toMatchObject({ connector: "woocommerce", action: "products.create", source: "connector" });
    if (typeof result === "object" && "validated" in result) {
      expect((result as Record<string, unknown>).validated).toMatchObject({ name: "Hoodie" });
    }
  });

  test("throws when name is missing", () => {
    expect(() => createProduct({})).toThrow("name is required");
  });
});

describe("createProduct — live (mocked fetch)", () => {
  test("POSTs to /wp-json/wc/v3/products with Basic auth and returns normalized product", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    const mockFetch = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "GET";
      capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
      return new Response(JSON.stringify(productFixture), { status: 201, headers: { "Content-Type": "application/json" } });
    };
    const result = await createProduct({ ...makeAuth(), name: "T-Shirt", fetch: mockFetch }) as Record<string, unknown>;
    expect(capturedUrl).toBe(`${SITE_URL}/wp-json/wc/v3/products`);
    expect(capturedMethod).toBe("POST");
    expect(capturedAuth).toBe(EXPECTED_AUTH);
    expect(result.connector).toBe("woocommerce");
    expect(result.action).toBe("products.create");
    expect(result.source).toBe("connector");
    const product = result.product as Record<string, unknown>;
    expect(product.id).toBe("wc-product:123");
    expect(product.name).toBe("T-Shirt");
    expect(product.providerProductId).toBe("123");
  });

  test("throws CONNECTOR_RATE_LIMITED on 429", async () => {
    const mockFetch = makeMockFetch(429, { message: "rate limited" }, { "retry-after": "30" });
    await expect(createProduct({ ...makeAuth(), name: "X", fetch: mockFetch })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 30,
    });
  });

  test("throws CONNECTOR_UPSTREAM_ERROR on 400", async () => {
    const mockFetch = makeMockFetch(400, { message: "bad request" });
    await expect(createProduct({ ...makeAuth(), name: "X", fetch: mockFetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

// ─── products.get ────────────────────────────────────────────────────────────

describe("getProduct — static validation (no auth)", () => {
  test("returns validated object without auth", () => {
    const result = getProduct({ productId: 123 });
    expect(result).toMatchObject({ connector: "woocommerce", action: "products.get", source: "connector" });
  });

  test("throws when productId is missing", () => {
    expect(() => getProduct({})).toThrow("productId must be a number");
  });
});

describe("getProduct — live (mocked fetch)", () => {
  test("GETs /wp-json/wc/v3/products/123 with Basic auth and returns normalized product", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    const mockFetch = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "GET";
      capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
      return new Response(JSON.stringify(productFixture), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const result = await getProduct({ ...makeAuth(), productId: 123, fetch: mockFetch }) as Record<string, unknown>;
    expect(capturedUrl).toBe(`${SITE_URL}/wp-json/wc/v3/products/123`);
    expect(capturedMethod).toBe("GET");
    expect(capturedAuth).toBe(EXPECTED_AUTH);
    const product = result.product as Record<string, unknown>;
    expect(product.id).toBe("wc-product:123");
    expect(product.sku).toBe("TSHIRT-001");
  });

  test("throws CONNECTOR_UPSTREAM_ERROR on 404", async () => {
    const mockFetch = makeMockFetch(404, { message: "not found" });
    await expect(getProduct({ ...makeAuth(), productId: 999, fetch: mockFetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Product not found.",
    });
  });

  test("throws CONNECTOR_RATE_LIMITED on 429", async () => {
    const mockFetch = makeMockFetch(429, { message: "rate limited" }, { "retry-after": "15" });
    await expect(getProduct({ ...makeAuth(), productId: 1, fetch: mockFetch })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
    });
  });
});

// ─── products.update ─────────────────────────────────────────────────────────

describe("updateProduct — static validation (no auth)", () => {
  test("returns validated object without auth", () => {
    const result = updateProduct({ productId: 123 });
    expect(result).toMatchObject({ connector: "woocommerce", action: "products.update", source: "connector" });
  });

  test("throws when productId is missing", () => {
    expect(() => updateProduct({ name: "X" })).toThrow("productId must be a number");
  });
});

describe("updateProduct — live (mocked fetch)", () => {
  test("PUTs /wp-json/wc/v3/products/123 and returns updated product", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    const mockFetch = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "GET";
      return new Response(JSON.stringify({ ...productFixture, name: "Updated Shirt" }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const result = await updateProduct({ ...makeAuth(), productId: 123, name: "Updated Shirt", fetch: mockFetch }) as Record<string, unknown>;
    expect(capturedUrl).toBe(`${SITE_URL}/wp-json/wc/v3/products/123`);
    expect(capturedMethod).toBe("PUT");
    const product = result.product as Record<string, unknown>;
    expect(product.name).toBe("Updated Shirt");
  });

  test("throws CONNECTOR_UPSTREAM_ERROR on 404", async () => {
    const mockFetch = makeMockFetch(404, {});
    await expect(updateProduct({ ...makeAuth(), productId: 999, fetch: mockFetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Product not found.",
    });
  });
});

// ─── products.delete ─────────────────────────────────────────────────────────

describe("deleteProduct — static validation (no auth)", () => {
  test("returns validated object without auth", () => {
    const result = deleteProduct({ productId: 123 });
    expect(result).toMatchObject({ connector: "woocommerce", action: "products.delete", source: "connector" });
  });
});

describe("deleteProduct — live (mocked fetch)", () => {
  test("DELETEs /wp-json/wc/v3/products/123 and returns deleted=true", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    const mockFetch = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "GET";
      return new Response(JSON.stringify(productFixture), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const result = await deleteProduct({ ...makeAuth(), productId: 123, fetch: mockFetch }) as Record<string, unknown>;
    expect(capturedUrl).toBe(`${SITE_URL}/wp-json/wc/v3/products/123`);
    expect(capturedMethod).toBe("DELETE");
    expect(result.deleted).toBe(true);
    expect(result.productId).toBe(123);
  });

  test("appends ?force=true when force is set", async () => {
    let capturedUrl = "";
    const mockFetch = async (url: string, _init?: RequestInit) => {
      capturedUrl = url;
      return new Response(JSON.stringify(productFixture), { status: 200 });
    };
    await deleteProduct({ ...makeAuth(), productId: 123, force: true, fetch: mockFetch });
    expect(capturedUrl).toBe(`${SITE_URL}/wp-json/wc/v3/products/123?force=true`);
  });
});

// ─── orders.create ───────────────────────────────────────────────────────────

describe("createOrder — static validation (no auth)", () => {
  test("returns validated object without auth", () => {
    const result = createOrder({ status: "pending" });
    expect(result).toMatchObject({ connector: "woocommerce", action: "orders.create", source: "connector" });
  });

  test("returns validated object even with empty input (no required fields for order body)", () => {
    const result = createOrder({});
    expect(result).toMatchObject({ connector: "woocommerce", action: "orders.create", source: "connector" });
  });
});

describe("createOrder — live (mocked fetch)", () => {
  test("POSTs to /wp-json/wc/v3/orders with Basic auth and returns normalized order", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    const mockFetch = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "GET";
      capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
      return new Response(JSON.stringify(orderFixture), { status: 201, headers: { "Content-Type": "application/json" } });
    };
    const result = await createOrder({ ...makeAuth(), status: "pending", fetch: mockFetch }) as Record<string, unknown>;
    expect(capturedUrl).toBe(`${SITE_URL}/wp-json/wc/v3/orders`);
    expect(capturedMethod).toBe("POST");
    expect(capturedAuth).toBe(EXPECTED_AUTH);
    const order = result.order as Record<string, unknown>;
    expect(order.id).toBe("wc-order:456");
    expect(order.status).toBe("completed");
  });

  test("throws CONNECTOR_RATE_LIMITED on 429", async () => {
    const mockFetch = makeMockFetch(429, {}, { "retry-after": "20" });
    await expect(createOrder({ ...makeAuth(), fetch: mockFetch })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── orders.get ──────────────────────────────────────────────────────────────

describe("getOrder — static validation (no auth)", () => {
  test("returns validated object without auth", () => {
    const result = getOrder({ orderId: 456 });
    expect(result).toMatchObject({ connector: "woocommerce", action: "orders.get", source: "connector" });
  });

  test("throws when orderId is not a number", () => {
    expect(() => getOrder({ orderId: "abc" })).toThrow("orderId must be a number");
  });
});

describe("getOrder — live (mocked fetch)", () => {
  test("GETs /wp-json/wc/v3/orders/456 and returns normalized order", async () => {
    let capturedUrl = "";
    const mockFetch = async (url: string, _init?: RequestInit) => {
      capturedUrl = url;
      return new Response(JSON.stringify(orderFixture), { status: 200 });
    };
    const result = await getOrder({ ...makeAuth(), orderId: 456, fetch: mockFetch }) as Record<string, unknown>;
    expect(capturedUrl).toBe(`${SITE_URL}/wp-json/wc/v3/orders/456`);
    const order = result.order as Record<string, unknown>;
    expect(order.id).toBe("wc-order:456");
    expect(order.billingEmail).toBe("buyer@example.com");
  });

  test("throws CONNECTOR_UPSTREAM_ERROR on 404", async () => {
    const mockFetch = makeMockFetch(404, {});
    await expect(getOrder({ ...makeAuth(), orderId: 999, fetch: mockFetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Order not found.",
    });
  });
});

// ─── orders.update ───────────────────────────────────────────────────────────

describe("updateOrder — static validation (no auth)", () => {
  test("returns validated object without auth", () => {
    const result = updateOrder({ orderId: 456 });
    expect(result).toMatchObject({ connector: "woocommerce", action: "orders.update", source: "connector" });
  });
});

describe("updateOrder — live (mocked fetch)", () => {
  test("PUTs /wp-json/wc/v3/orders/456 with new status", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    const mockFetch = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "GET";
      return new Response(JSON.stringify({ ...orderFixture, status: "processing" }), { status: 200 });
    };
    const result = await updateOrder({ ...makeAuth(), orderId: 456, status: "processing", fetch: mockFetch }) as Record<string, unknown>;
    expect(capturedUrl).toBe(`${SITE_URL}/wp-json/wc/v3/orders/456`);
    expect(capturedMethod).toBe("PUT");
    const order = result.order as Record<string, unknown>;
    expect(order.status).toBe("processing");
  });
});

// ─── orders.delete ───────────────────────────────────────────────────────────

describe("deleteOrder — static validation (no auth)", () => {
  test("returns validated object without auth", () => {
    const result = deleteOrder({ orderId: 456 });
    expect(result).toMatchObject({ connector: "woocommerce", action: "orders.delete", source: "connector" });
  });
});

describe("deleteOrder — live (mocked fetch)", () => {
  test("DELETEs /wp-json/wc/v3/orders/456 and returns deleted=true", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    const mockFetch = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "GET";
      return new Response(JSON.stringify(orderFixture), { status: 200 });
    };
    const result = await deleteOrder({ ...makeAuth(), orderId: 456, fetch: mockFetch }) as Record<string, unknown>;
    expect(capturedUrl).toBe(`${SITE_URL}/wp-json/wc/v3/orders/456`);
    expect(capturedMethod).toBe("DELETE");
    expect(result.deleted).toBe(true);
    expect(result.orderId).toBe(456);
  });

  test("appends ?force=true when force is set", async () => {
    let capturedUrl = "";
    const mockFetch = async (url: string, _init?: RequestInit) => {
      capturedUrl = url;
      return new Response(JSON.stringify(orderFixture), { status: 200 });
    };
    await deleteOrder({ ...makeAuth(), orderId: 456, force: true, fetch: mockFetch });
    expect(capturedUrl).toBe(`${SITE_URL}/wp-json/wc/v3/orders/456?force=true`);
  });
});

// ─── customers.create ────────────────────────────────────────────────────────

describe("createCustomer — static validation (no auth)", () => {
  test("returns validated object without auth", () => {
    const result = createCustomer({ email: "test@example.com" });
    expect(result).toMatchObject({ connector: "woocommerce", action: "customers.create", source: "connector" });
  });

  test("throws when email is missing", () => {
    expect(() => createCustomer({})).toThrow("email is required");
  });
});

describe("createCustomer — live (mocked fetch)", () => {
  test("POSTs to /wp-json/wc/v3/customers with Basic auth and returns normalized customer", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    const mockFetch = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "GET";
      capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
      return new Response(JSON.stringify(customerFixture), { status: 201 });
    };
    const result = await createCustomer({ ...makeAuth(), email: "customer@example.com", fetch: mockFetch }) as Record<string, unknown>;
    expect(capturedUrl).toBe(`${SITE_URL}/wp-json/wc/v3/customers`);
    expect(capturedMethod).toBe("POST");
    expect(capturedAuth).toBe(EXPECTED_AUTH);
    const customer = result.customer as Record<string, unknown>;
    expect(customer.id).toBe("wc-customer:789");
    expect(customer.email).toBe("customer@example.com");
  });

  test("throws CONNECTOR_UPSTREAM_ERROR on 400", async () => {
    const mockFetch = makeMockFetch(400, { message: "email already exists" });
    await expect(createCustomer({ ...makeAuth(), email: "dup@example.com", fetch: mockFetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

// ─── customers.get ───────────────────────────────────────────────────────────

describe("getCustomer — static validation (no auth)", () => {
  test("returns validated object without auth", () => {
    const result = getCustomer({ customerId: 789 });
    expect(result).toMatchObject({ connector: "woocommerce", action: "customers.get", source: "connector" });
  });

  test("throws when customerId is not a number", () => {
    expect(() => getCustomer({ customerId: "abc" })).toThrow("customerId must be a number");
  });
});

describe("getCustomer — live (mocked fetch)", () => {
  test("GETs /wp-json/wc/v3/customers/789 and returns normalized customer", async () => {
    let capturedUrl = "";
    const mockFetch = async (url: string, _init?: RequestInit) => {
      capturedUrl = url;
      return new Response(JSON.stringify(customerFixture), { status: 200 });
    };
    const result = await getCustomer({ ...makeAuth(), customerId: 789, fetch: mockFetch }) as Record<string, unknown>;
    expect(capturedUrl).toBe(`${SITE_URL}/wp-json/wc/v3/customers/789`);
    const customer = result.customer as Record<string, unknown>;
    expect(customer.id).toBe("wc-customer:789");
    expect(customer.firstName).toBe("Jane");
    expect(customer.ordersCount).toBe(5);
  });

  test("throws CONNECTOR_UPSTREAM_ERROR on 404", async () => {
    const mockFetch = makeMockFetch(404, {});
    await expect(getCustomer({ ...makeAuth(), customerId: 9999, fetch: mockFetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Customer not found.",
    });
  });
});

// ─── customers.update ────────────────────────────────────────────────────────

describe("updateCustomer — static validation (no auth)", () => {
  test("returns validated object without auth", () => {
    const result = updateCustomer({ customerId: 789 });
    expect(result).toMatchObject({ connector: "woocommerce", action: "customers.update", source: "connector" });
  });
});

describe("updateCustomer — live (mocked fetch)", () => {
  test("PUTs /wp-json/wc/v3/customers/789 and returns updated customer", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    const mockFetch = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "GET";
      return new Response(JSON.stringify({ ...customerFixture, first_name: "John" }), { status: 200 });
    };
    const result = await updateCustomer({ ...makeAuth(), customerId: 789, first_name: "John", fetch: mockFetch }) as Record<string, unknown>;
    expect(capturedUrl).toBe(`${SITE_URL}/wp-json/wc/v3/customers/789`);
    expect(capturedMethod).toBe("PUT");
    const customer = result.customer as Record<string, unknown>;
    expect(customer.firstName).toBe("John");
  });

  test("throws CONNECTOR_RATE_LIMITED on 429", async () => {
    const mockFetch = makeMockFetch(429, {}, { "retry-after": "60" });
    await expect(updateCustomer({ ...makeAuth(), customerId: 789, fetch: mockFetch })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 60,
    });
  });
});

// ─── coupons.create ──────────────────────────────────────────────────────────

describe("createCoupon — static validation (no auth)", () => {
  test("returns validated object without auth", () => {
    const result = createCoupon({ code: "SAVE10", discount_type: "percent", amount: "10" });
    expect(result).toMatchObject({ connector: "woocommerce", action: "coupons.create", source: "connector" });
  });

  test("throws when code is missing", () => {
    expect(() => createCoupon({ discount_type: "percent", amount: "10" })).toThrow("code is required");
  });

  test("throws when discount_type is missing", () => {
    expect(() => createCoupon({ code: "SAVE10", amount: "10" })).toThrow("discount_type is required");
  });

  test("throws when amount is missing", () => {
    expect(() => createCoupon({ code: "SAVE10", discount_type: "percent" })).toThrow("amount is required");
  });
});

describe("createCoupon — live (mocked fetch)", () => {
  test("POSTs to /wp-json/wc/v3/coupons with Basic auth and returns normalized coupon", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    const mockFetch = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "GET";
      capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
      return new Response(JSON.stringify(couponFixture), { status: 201 });
    };
    const result = await createCoupon({
      ...makeAuth(),
      code: "SAVE10",
      discount_type: "percent",
      amount: "10",
      fetch: mockFetch,
    }) as Record<string, unknown>;
    expect(capturedUrl).toBe(`${SITE_URL}/wp-json/wc/v3/coupons`);
    expect(capturedMethod).toBe("POST");
    expect(capturedAuth).toBe(EXPECTED_AUTH);
    const coupon = result.coupon as Record<string, unknown>;
    expect(coupon.id).toBe("wc-coupon:321");
    expect(coupon.code).toBe("SAVE10");
    expect(coupon.discountType).toBe("percent");
  });

  test("throws CONNECTOR_RATE_LIMITED on 429", async () => {
    const mockFetch = makeMockFetch(429, {}, { "retry-after": "10" });
    await expect(createCoupon({ ...makeAuth(), code: "X", discount_type: "percent", amount: "5", fetch: mockFetch })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
    });
  });

  test("throws CONNECTOR_UPSTREAM_ERROR on 500", async () => {
    const mockFetch = makeMockFetch(500, { message: "internal server error" });
    await expect(createCoupon({ ...makeAuth(), code: "X", discount_type: "percent", amount: "5", fetch: mockFetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});
