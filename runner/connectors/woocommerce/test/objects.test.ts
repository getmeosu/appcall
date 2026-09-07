import { describe, expect, test } from "bun:test";
import productsFixture from "../fixtures/products_list.json";
import ordersFixture from "../fixtures/orders_list.json";
import customersFixture from "../fixtures/customers_list.json";
import {
  normalizeProduct, parseProductsResponse,
  normalizeOrder, parseOrdersResponse,
  normalizeCustomer, parseCustomersResponse,
} from "../src/objects";

describe("normalizeProduct", () => {
  test("normalizes a full product from fixture", () => {
    const raw = productsFixture[0];
    const result = normalizeProduct(raw as Record<string, unknown>);

    expect(result).toEqual({
      id: "wc-product:123",
      provider: "woocommerce",
      providerProductId: "123",
      name: "T-Shirt",
      slug: "t-shirt",
      status: "publish",
      type: "simple",
      price: 29.99,
      salePrice: 19.99,
      stockQuantity: 100,
      sku: "TSHIRT-001",
      createdAt: "2025-01-01T00:00:00Z",
      modelVersion: "2026-05-16",
      raw,
    });
  });

  test("normalizes a product with minimal fields", () => {
    const result = normalizeProduct({ id: "50" });
    expect(result.id).toBe("wc-product:50");
    expect(result.providerProductId).toBe("50");
    expect(result.name).toBe("");
    expect(result.slug).toBe("");
    expect(result.status).toBe("");
    expect(result.type).toBe("");
    expect(result.price).toBe(0);
    expect(result.salePrice).toBe(0);
    expect(result.stockQuantity).toBe(0);
    expect(result.sku).toBe("");
    expect(result.createdAt).toBe("");
  });

  test("handles missing sale_price gracefully", () => {
    const result = normalizeProduct({ id: "1", price: "10" });
    expect(result.price).toBe(10);
    expect(result.salePrice).toBe(0);
  });
});

describe("parseProductsResponse", () => {
  test("parses the products_list fixture", () => {
    const result = parseProductsResponse(productsFixture);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].id).toBe("wc-product:123");
    expect(result.products[0].name).toBe("T-Shirt");
    expect(result.products[0].price).toBe(29.99);
    expect(result.totalPages).toBe(1);
  });

  test("parses x-wp-totalpages from headers", () => {
    const result = parseProductsResponse(productsFixture, { "x-wp-totalpages": "5" });
    expect(result.totalPages).toBe(5);
  });

  test("returns empty products for null input", () => {
    const result = parseProductsResponse(null);
    expect(result.products).toEqual([]);
    expect(result.totalPages).toBe(1);
  });

  test("returns empty products for non-array input", () => {
    const result = parseProductsResponse("string");
    expect(result.products).toEqual([]);
  });

  test("filters out non-record entries in array", () => {
    const result = parseProductsResponse([null, { id: "1" }, "bad", { id: "2" }]);
    expect(result.products).toHaveLength(2);
    expect(result.products[0].id).toBe("wc-product:1");
    expect(result.products[1].id).toBe("wc-product:2");
  });
});

describe("normalizeOrder", () => {
  test("normalizes a full order from fixture", () => {
    const raw = ordersFixture[0];
    const result = normalizeOrder(raw as unknown as Record<string, unknown>);

    expect(result).toEqual({
      id: "wc-order:456",
      provider: "woocommerce",
      providerOrderId: "456",
      number: "1001",
      status: "completed",
      total: 99.99,
      currency: "USD",
      billingEmail: "buyer@example.com",
      billingFirstName: "Jane",
      billingLastName: "Doe",
      createdAt: "2025-02-01T00:00:00Z",
      modelVersion: "2026-05-16",
      raw,
    });
  });

  test("normalizes an order with minimal fields", () => {
    const result = normalizeOrder({ id: "50" });
    expect(result.id).toBe("wc-order:50");
    expect(result.providerOrderId).toBe("50");
    expect(result.number).toBe("");
    expect(result.status).toBe("");
    expect(result.total).toBe(0);
    expect(result.currency).toBe("");
    expect(result.billingEmail).toBe("");
    expect(result.billingFirstName).toBe("");
    expect(result.billingLastName).toBe("");
    expect(result.createdAt).toBe("");
  });

  test("defaults billing fields when billing is missing", () => {
    const result = normalizeOrder({ id: "1" });
    expect(result.billingEmail).toBe("");
    expect(result.billingFirstName).toBe("");
    expect(result.billingLastName).toBe("");
  });

  test("defaults billing fields when billing is not a record", () => {
    const result = normalizeOrder({ id: "1", billing: "bad" });
    expect(result.billingEmail).toBe("");
    expect(result.billingFirstName).toBe("");
    expect(result.billingLastName).toBe("");
  });
});

describe("parseOrdersResponse", () => {
  test("parses the orders_list fixture", () => {
    const result = parseOrdersResponse(ordersFixture);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].id).toBe("wc-order:456");
    expect(result.orders[0].number).toBe("1001");
    expect(result.orders[0].total).toBe(99.99);
    expect(result.totalPages).toBe(1);
  });

  test("parses x-wp-totalpages from headers", () => {
    const result = parseOrdersResponse(ordersFixture, { "x-wp-totalpages": "3" });
    expect(result.totalPages).toBe(3);
  });

  test("returns empty orders for null input", () => {
    const result = parseOrdersResponse(null);
    expect(result.orders).toEqual([]);
    expect(result.totalPages).toBe(1);
  });

  test("returns empty orders for non-array input", () => {
    const result = parseOrdersResponse({ orders: [] });
    expect(result.orders).toEqual([]);
  });

  test("filters out non-record entries in array", () => {
    const result = parseOrdersResponse([null, { id: "10" }, 42]);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].id).toBe("wc-order:10");
  });
});

describe("normalizeCustomer", () => {
  test("normalizes a full customer from fixture", () => {
    const raw = customersFixture[0];
    const result = normalizeCustomer(raw as Record<string, unknown>);

    expect(result).toEqual({
      id: "wc-customer:789",
      provider: "woocommerce",
      providerCustomerId: "789",
      email: "customer@example.com",
      firstName: "Jane",
      lastName: "Doe",
      username: "janedoe",
      ordersCount: 5,
      totalSpent: 500,
      createdAt: "2025-01-01T00:00:00Z",
      modelVersion: "2026-05-16",
      raw,
    });
  });

  test("normalizes a customer with minimal fields", () => {
    const result = normalizeCustomer({ id: "50" });
    expect(result.id).toBe("wc-customer:50");
    expect(result.providerCustomerId).toBe("50");
    expect(result.email).toBe("");
    expect(result.firstName).toBe("");
    expect(result.lastName).toBe("");
    expect(result.username).toBe("");
    expect(result.ordersCount).toBe(0);
    expect(result.totalSpent).toBe(0);
    expect(result.createdAt).toBe("");
  });
});

describe("parseCustomersResponse", () => {
  test("parses the customers_list fixture", () => {
    const result = parseCustomersResponse(customersFixture);
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0].id).toBe("wc-customer:789");
    expect(result.customers[0].email).toBe("customer@example.com");
    expect(result.customers[0].ordersCount).toBe(5);
    expect(result.customers[0].totalSpent).toBe(500);
    expect(result.totalPages).toBe(1);
  });

  test("parses x-wp-totalpages from headers", () => {
    const result = parseCustomersResponse(customersFixture, { "x-wp-totalpages": "8" });
    expect(result.totalPages).toBe(8);
  });

  test("returns empty customers for null input", () => {
    const result = parseCustomersResponse(null);
    expect(result.customers).toEqual([]);
    expect(result.totalPages).toBe(1);
  });

  test("returns empty customers for non-array input", () => {
    const result = parseCustomersResponse("string");
    expect(result.customers).toEqual([]);
  });

  test("filters out non-record entries in array", () => {
    const result = parseCustomersResponse([null, { id: "1" }, "bad", { id: "2" }]);
    expect(result.customers).toHaveLength(2);
    expect(result.customers[0].id).toBe("wc-customer:1");
    expect(result.customers[1].id).toBe("wc-customer:2");
  });
});
