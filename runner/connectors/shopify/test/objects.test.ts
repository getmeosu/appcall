import { describe, expect, test } from "bun:test";
import productsFixture from "../fixtures/products_list.json";
import ordersFixture from "../fixtures/orders_list.json";
import customersFixture from "../fixtures/customers_list.json";
import {
  normalizeProduct, parseProductsResponse,
  normalizeOrder, parseOrdersResponse,
  normalizeCustomer, parseCustomersResponse,
  extractNextPageToken,
} from "../src/objects";

describe("normalizeProduct", () => {
  test("normalizes a full product from fixture", () => {
    const raw = productsFixture.products[0];
    const result = normalizeProduct(raw as any);

    expect(result).toEqual({
      id: "sp-product:123",
      provider: "shopify",
      providerProductId: 123,
      title: "T-Shirt",
      handle: "t-shirt",
      status: "active",
      productType: "Apparel",
      vendor: "Brand",
      variantsCount: 2,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-15T00:00:00Z",
      modelVersion: "2026-05-17",
      raw,
    });
  });

  test("normalizes a product with minimal fields", () => {
    const result = normalizeProduct({});
    expect(result.id).toBe("sp-product:0");
    expect(result.provider).toBe("shopify");
    expect(result.title).toBe("");
    expect(result.handle).toBe("");
    expect(result.status).toBe("");
    expect(result.productType).toBe("");
    expect(result.vendor).toBe("");
    expect(result.variantsCount).toBe(0);
    expect(result.createdAt).toBe("");
    expect(result.updatedAt).toBe("");
  });

  test("counts variants correctly", () => {
    const result = normalizeProduct({ id: 1, variants: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    expect(result.variantsCount).toBe(3);
  });

  test("defaults variants count to zero when variants is not an array", () => {
    const result = normalizeProduct({ id: 1, variants: "bad" });
    expect(result.variantsCount).toBe(0);
  });
});

describe("parseProductsResponse", () => {
  test("parses the products_list fixture", () => {
    const result = parseProductsResponse(productsFixture);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].id).toBe("sp-product:123");
    expect(result.products[0].title).toBe("T-Shirt");
  });

  test("returns empty products for null input", () => {
    const result = parseProductsResponse(null);
    expect(result.products).toEqual([]);
  });

  test("returns empty products for non-record input", () => {
    const result = parseProductsResponse("string");
    expect(result.products).toEqual([]);
  });

  test("returns empty products when products field is not an array", () => {
    const result = parseProductsResponse({ products: "bad" });
    expect(result.products).toEqual([]);
  });

  test("filters out non-record entries in products array", () => {
    const result = parseProductsResponse({ products: [null, { id: 1 }, "bad", { id: 2 }] });
    expect(result.products).toHaveLength(2);
  });
});

describe("normalizeOrder", () => {
  test("normalizes a full order from fixture", () => {
    const raw = ordersFixture.orders[0];
    const result = normalizeOrder(raw as any);

    expect(result).toEqual({
      id: "sp-order:456",
      provider: "shopify",
      providerOrderId: 456,
      orderNumber: 1001,
      email: "buyer@example.com",
      total: "99.99",
      currency: "USD",
      status: "paid",
      createdAt: "2025-02-01T00:00:00Z",
      modelVersion: "2026-05-17",
      raw,
    });
  });

  test("normalizes an order with minimal fields", () => {
    const result = normalizeOrder({});
    expect(result.id).toBe("sp-order:0");
    expect(result.provider).toBe("shopify");
    expect(result.orderNumber).toBe(0);
    expect(result.email).toBe("");
    expect(result.total).toBe("");
    expect(result.currency).toBe("");
    expect(result.status).toBe("");
    expect(result.createdAt).toBe("");
  });
});

describe("parseOrdersResponse", () => {
  test("parses the orders_list fixture", () => {
    const result = parseOrdersResponse(ordersFixture);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].id).toBe("sp-order:456");
    expect(result.orders[0].orderNumber).toBe(1001);
  });

  test("returns empty orders for null input", () => {
    const result = parseOrdersResponse(null);
    expect(result.orders).toEqual([]);
  });

  test("returns empty orders when orders field is not an array", () => {
    const result = parseOrdersResponse({ orders: "not-array" });
    expect(result.orders).toEqual([]);
  });

  test("filters out non-record entries in orders array", () => {
    const result = parseOrdersResponse({ orders: [null, { id: 1 }, 42] });
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].id).toBe("sp-order:1");
  });
});

describe("normalizeCustomer", () => {
  test("normalizes a full customer from fixture", () => {
    const raw = customersFixture.customers[0];
    const result = normalizeCustomer(raw as any);

    expect(result).toEqual({
      id: "sp-customer:789",
      provider: "shopify",
      providerCustomerId: 789,
      email: "customer@example.com",
      firstName: "Jane",
      lastName: "Doe",
      ordersCount: 5,
      createdAt: "2025-01-01T00:00:00Z",
      modelVersion: "2026-05-17",
      raw,
    });
  });

  test("normalizes a customer with minimal fields", () => {
    const result = normalizeCustomer({});
    expect(result.id).toBe("sp-customer:0");
    expect(result.provider).toBe("shopify");
    expect(result.email).toBe("");
    expect(result.firstName).toBe("");
    expect(result.lastName).toBe("");
    expect(result.ordersCount).toBe(0);
    expect(result.createdAt).toBe("");
  });
});

describe("parseCustomersResponse", () => {
  test("parses the customers_list fixture", () => {
    const result = parseCustomersResponse(customersFixture);
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0].id).toBe("sp-customer:789");
    expect(result.customers[0].email).toBe("customer@example.com");
  });

  test("returns empty customers for null input", () => {
    const result = parseCustomersResponse(null);
    expect(result.customers).toEqual([]);
  });

  test("returns empty customers when customers field is not an array", () => {
    const result = parseCustomersResponse({ customers: "not-array" });
    expect(result.customers).toEqual([]);
  });

  test("filters out non-record entries in customers array", () => {
    const result = parseCustomersResponse({ customers: [null, { id: 1 }, "bad"] });
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0].id).toBe("sp-customer:1");
  });
});

describe("extractNextPageToken", () => {
  test("extracts page_info from Link header", () => {
    const headers = { link: '<https://test.myshopify.com/admin/api/2025-01/products.json?page_info=abc123>; rel="next"' };
    expect(extractNextPageToken(headers)).toBe("abc123");
  });

  test("handles lowercase Link header", () => {
    const headers = { Link: '<https://test.myshopify.com/admin/api/2025-01/products.json?page_info=xyz789>; rel="next"' };
    expect(extractNextPageToken(headers)).toBe("xyz789");
  });

  test("returns null when no Link header is present", () => {
    expect(extractNextPageToken({})).toBeNull();
  });

  test("returns null when Link header has no page_info", () => {
    const headers = { link: '<https://test.myshopify.com/admin/api/2025-01/products.json>; rel="next"' };
    expect(extractNextPageToken(headers)).toBeNull();
  });
});
