import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("woocommerce connector manifest", () => {
  test("declares key, runtime, auth, network, operations, and models", () => {
    expect(manifest.key).toBe("woocommerce");
    expect(manifest.name).toBe("WooCommerce");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  test("auth is oauth2 with empty scopes", () => {
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.scopes).toEqual([]);
    expect(manifest.auth.setup.mode).toBe("oauth2");
    expect(manifest.auth.setup.fields).toEqual([]);
  });

  test("network allows *.wp-json.com and mystore.test", () => {
    expect(manifest.network.allowedHosts).toContain("*.wp-json.com");
    expect(manifest.network.allowedHosts).toContain("mystore.test");
  });

  test("operations include sync and healthcheck kinds", () => {
    expect(manifest.operations["products.list"].kind).toBe("sync");
    expect(manifest.operations["orders.list"].kind).toBe("sync");
    expect(manifest.operations["customers.list"].kind).toBe("sync");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
  });

  test("operations declare timeout and size bounds", () => {
    const products = manifest.operations["products.list"];
    expect(products.timeoutMs).toBe(30000);
    expect(products.maxResponseBytes).toBe(5242880);

    const healthcheck = manifest.operations["healthcheck"];
    expect(healthcheck.timeoutMs).toBe(5000);
    expect(healthcheck.maxResponseBytes).toBe(65536);
  });

  test("new action operations exist and are kind=action", () => {
    const newActions = [
      "products.create", "products.get", "products.update", "products.delete",
      "orders.create", "orders.get", "orders.update", "orders.delete",
      "customers.create", "customers.get", "customers.update",
      "coupons.create",
    ];
    for (const op of newActions) {
      expect(manifest.operations[op].kind).toBe("action");
    }
  });

  test("new action operations have required manifest fields", () => {
    const newActions = [
      "products.create", "products.get", "products.update", "products.delete",
      "orders.create", "orders.get", "orders.update", "orders.delete",
      "customers.create", "customers.get", "customers.update",
      "coupons.create",
    ];
    for (const op of newActions) {
      const operation = manifest.operations[op] as Record<string, unknown>;
      expect(typeof operation.title).toBe("string");
      expect(typeof operation.description).toBe("string");
      expect(typeof operation.timeoutMs).toBe("number");
      expect(typeof operation.maxInputBytes).toBe("number");
      expect(typeof operation.maxResponseBytes).toBe("number");
      const inputSchema = operation.inputSchema as Record<string, unknown>;
      expect(inputSchema.type).toBe("object");
      expect(typeof inputSchema.properties).toBe("object");
    }
  });

  test("models include product, order, and customer", () => {
    expect(manifest.models).toContain("product");
    expect(manifest.models).toContain("order");
    expect(manifest.models).toContain("customer");
    expect(manifest.models).toHaveLength(3);
  });
});
