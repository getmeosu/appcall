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
      provider: "woocommerce",
      operation: "products.list",
      items: [
        expect.objectContaining({
          id: "wc-product:123",
          name: "T-Shirt",
          price: 29.99,
          salePrice: 19.99,
          sku: "TSHIRT-001",
        }),
      ],
      totalPages: 1,
    });
    expect(result.items).toHaveLength(1);
  });

  test("parses x-wp-totalpages from headers into sync result", () => {
    const result = executeProductsListSync({ response: productsFixture, headers: { "x-wp-totalpages": "4" } });
    expect(result.totalPages).toBe(4);
  });

  test("handles null response gracefully", () => {
    const result = executeProductsListSync({ response: null });
    expect(result).toEqual({
      provider: "woocommerce",
      operation: "products.list",
      items: [],
      totalPages: 1,
    });
  });
});

describe("executeOrdersListSync", () => {
  test("parses orders_list fixture into sync result", () => {
    const result = executeOrdersListSync({ response: ordersFixture });

    expect(result).toEqual({
      provider: "woocommerce",
      operation: "orders.list",
      items: [
        expect.objectContaining({
          id: "wc-order:456",
          number: "1001",
          status: "completed",
          total: 99.99,
          currency: "USD",
          billingEmail: "buyer@example.com",
        }),
      ],
      totalPages: 1,
    });
    expect(result.items).toHaveLength(1);
  });

  test("parses x-wp-totalpages from headers into sync result", () => {
    const result = executeOrdersListSync({ response: ordersFixture, headers: { "x-wp-totalpages": "7" } });
    expect(result.totalPages).toBe(7);
  });

  test("handles null response gracefully", () => {
    const result = executeOrdersListSync({ response: null });
    expect(result).toEqual({
      provider: "woocommerce",
      operation: "orders.list",
      items: [],
      totalPages: 1,
    });
  });
});

describe("executeCustomersListSync", () => {
  test("parses customers_list fixture into sync result", () => {
    const result = executeCustomersListSync({ response: customersFixture });

    expect(result).toEqual({
      provider: "woocommerce",
      operation: "customers.list",
      items: [
        expect.objectContaining({
          id: "wc-customer:789",
          email: "customer@example.com",
          firstName: "Jane",
          lastName: "Doe",
          ordersCount: 5,
          totalSpent: 500,
        }),
      ],
      totalPages: 1,
    });
    expect(result.items).toHaveLength(1);
  });

  test("parses x-wp-totalpages from headers into sync result", () => {
    const result = executeCustomersListSync({ response: customersFixture, headers: { "x-wp-totalpages": "2" } });
    expect(result.totalPages).toBe(2);
  });

  test("handles null response gracefully", () => {
    const result = executeCustomersListSync({ response: null });
    expect(result).toEqual({
      provider: "woocommerce",
      operation: "customers.list",
      items: [],
      totalPages: 1,
    });
  });
});
