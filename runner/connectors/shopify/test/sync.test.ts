import { describe, expect, test } from "bun:test";
import productsFixture from "../fixtures/products_list.json";
import ordersFixture from "../fixtures/orders_list.json";
import customersFixture from "../fixtures/customers_list.json";
import {
  executeProductsListSync,
  executeOrdersListSync,
  executeCustomersListSync,
} from "../src/sync";

describe("executeProductsListSync", () => {
  test("parses products_list fixture into sync result", () => {
    const result = executeProductsListSync({ response: productsFixture });

    expect(result).toEqual({
      provider: "shopify",
      operation: "products.list",
      items: [
        expect.objectContaining({
          id: "sp-product:123",
          title: "T-Shirt",
          handle: "t-shirt",
          status: "active",
        }),
      ],
    });
    expect(result.items).toHaveLength(1);
  });

  test("handles null response gracefully", () => {
    const result = executeProductsListSync({ response: null });
    expect(result).toEqual({
      provider: "shopify",
      operation: "products.list",
      items: [],
    });
  });
});

describe("executeOrdersListSync", () => {
  test("parses orders_list fixture into sync result", () => {
    const result = executeOrdersListSync({ response: ordersFixture });

    expect(result).toEqual({
      provider: "shopify",
      operation: "orders.list",
      items: [
        expect.objectContaining({
          id: "sp-order:456",
          orderNumber: 1001,
          email: "buyer@example.com",
        }),
      ],
    });
    expect(result.items).toHaveLength(1);
  });

  test("handles null response gracefully", () => {
    const result = executeOrdersListSync({ response: null });
    expect(result).toEqual({
      provider: "shopify",
      operation: "orders.list",
      items: [],
    });
  });
});

describe("executeCustomersListSync", () => {
  test("parses customers_list fixture into sync result", () => {
    const result = executeCustomersListSync({ response: customersFixture });

    expect(result).toEqual({
      provider: "shopify",
      operation: "customers.list",
      items: [
        expect.objectContaining({
          id: "sp-customer:789",
          email: "customer@example.com",
          firstName: "Jane",
          lastName: "Doe",
        }),
      ],
    });
    expect(result.items).toHaveLength(1);
  });

  test("handles null response gracefully", () => {
    const result = executeCustomersListSync({ response: null });
    expect(result).toEqual({
      provider: "shopify",
      operation: "customers.list",
      items: [],
    });
  });
});
