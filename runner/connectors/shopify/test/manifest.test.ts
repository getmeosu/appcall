import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("shopify connector manifest", () => {
  test("declares key, runtime, auth, network, operations, and models", () => {
    expect(manifest.key).toBe("shopify");
    expect(manifest.name).toBe("Shopify");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  test("auth is oauth2 with read scopes", () => {
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("read_products");
    expect(manifest.auth.scopes).toContain("read_orders");
    expect(manifest.auth.scopes).toContain("read_customers");
    expect(manifest.auth.setup.mode).toBe("oauth2");
    expect(manifest.auth.setup.fields).toEqual([]);
  });

  test("network allows *.myshopify.com", () => {
    expect(manifest.network.allowedHosts).toEqual(["*.myshopify.com"]);
  });

  test("operations include sync kinds and healthcheck action", () => {
    expect(manifest.operations["products.list"].kind).toBe("sync");
    expect(manifest.operations["orders.list"].kind).toBe("sync");
    expect(manifest.operations["customers.list"].kind).toBe("sync");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
  });

  test("new action operations are declared with correct kind", () => {
    const actionOps = ["products.get", "products.create", "products.update", "products.delete",
      "orders.get", "orders.update", "orders.close", "orders.cancel",
      "customers.get", "customers.create", "customers.update"];
    for (const op of actionOps) {
      expect((manifest.operations as Record<string, { kind: string }>)[op].kind).toBe("action");
    }
  });

  test("new action operations have required fields", () => {
    const actionOps = ["products.get", "products.create", "products.update", "products.delete",
      "orders.get", "orders.update", "orders.close", "orders.cancel",
      "customers.get", "customers.create", "customers.update"];
    for (const op of actionOps) {
      const o = (manifest.operations as Record<string, Record<string, unknown>>)[op];
      expect(typeof o.title).toBe("string");
      expect(typeof o.description).toBe("string");
      expect(typeof o.timeoutMs).toBe("number");
      expect(typeof o.maxInputBytes).toBe("number");
      expect(typeof o.maxResponseBytes).toBe("number");
      expect(o.inputSchema).toBeDefined();
    }
  });

  test("operations declare timeout and size bounds", () => {
    const products = manifest.operations["products.list"];
    expect(products.timeoutMs).toBe(30000);
    expect(products.maxInputBytes).toBe(65536);
    expect(products.maxResponseBytes).toBe(5242880);

    const healthcheck = manifest.operations["healthcheck"];
    expect(healthcheck.timeoutMs).toBe(5000);
    expect(healthcheck.maxResponseBytes).toBe(65536);
  });

  test("models include product, order, and customer", () => {
    expect(manifest.models).toContain("product");
    expect(manifest.models).toContain("order");
    expect(manifest.models).toContain("customer");
    expect(manifest.models).toHaveLength(3);
  });
});
