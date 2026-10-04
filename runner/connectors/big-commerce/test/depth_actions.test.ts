import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const { actions } = compileDeclarativeConnector(manifest as never);
const cred = { apiKey: "fixturekey", storeHash: "abc123" };
const response = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("big-commerce depth", () => {
  test("keeps the connector key and bumps to 0.2.0 with 16 HTTP actions", () => {
    expect(manifest.key).toBe("big-commerce");
    expect(manifest.version).toBe("0.2.0");
    const ops = Object.entries(manifest.operations);
    expect(ops.filter(([, spec]) => spec.kind === "action")).toHaveLength(16);
    expect(ops.filter(([, spec]) => spec.kind === "webhook")).toHaveLength(3);
    expect(actions["webhook.order_created"]).toBeUndefined();
  });

  test("sends X-Auth-Token on the store-hash catalog host", async () => {
    let seen: Request | undefined;
    const result = await actions["products.get"]!({
      ...cred,
      productId: 77,
      fetch: async (url: string, init?: RequestInit) => {
        seen = new Request(url, init);
        return response({ data: { id: 77, name: "Towel" }, meta: {} });
      },
    });
    expect(seen?.url).toBe("https://api.bigcommerce.com/stores/abc123/v3/catalog/products/77");
    expect(seen?.headers.get("x-auth-token")).toBe("fixturekey");
    expect(result).toMatchObject({ connector: "big-commerce", action: "products.get", source: "provider" });
  });

  test("reads v2 orders and looks up customers with id:in", async () => {
    let order: Request | undefined;
    await actions["orders.get"]!({
      ...cred,
      orderId: 173331,
      fetch: async (url: string, init?: RequestInit) => {
        order = new Request(url, init);
        return response({ id: 173331, status: "Awaiting Fulfillment" });
      },
    });
    expect(order?.url).toBe("https://api.bigcommerce.com/stores/abc123/v2/orders/173331");

    let customer: Request | undefined;
    await actions["customers.get"]!({
      ...cred,
      customerId: 1,
      fetch: async (url: string, init?: RequestInit) => {
        customer = new Request(url, init);
        return response({ data: [{ id: 1, email: "ada@example.com" }], meta: {} });
      },
    });
    expect(new URL(customer!.url).pathname).toBe("/stores/abc123/v3/customers");
    expect(new URL(customer!.url).searchParams.get("id:in")).toBe("1");
  });

  test("creates a customer as a one-element array body", async () => {
    let seen: Request | undefined;
    await actions["customers.create"]!({
      ...cred,
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      fetch: async (url: string, init?: RequestInit) => {
        seen = new Request(url, init);
        return response({ data: [{ id: 1 }], meta: {} });
      },
    });
    expect(seen?.method).toBe("POST");
    expect(seen?.headers.get("content-type")).toBe("application/json");
    expect(await seen!.clone().json()).toEqual([
      { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
    ]);
  });

  test("rejects missing product IDs before fetch", async () => {
    let called = false;
    await expect(
      actions["products.get"]!({ ...cred, fetch: async () => { called = true; return response({}); } }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
  });
});
