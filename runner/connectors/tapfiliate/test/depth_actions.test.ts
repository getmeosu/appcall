import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const { actions } = compileDeclarativeConnector(manifest as never);
const cred = { apiKey: "fixture-tapfiliate-key" };
const response = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: status === 204 ? {} : { "content-type": "application/json" },
  });

describe("tapfiliate depth", () => {
  test("keeps the connector key and bumps to 0.2.0 with 20 HTTP actions", () => {
    expect(manifest.key).toBe("tapfiliate");
    expect(manifest.version).toBe("0.2.0");
    const ops = Object.entries(manifest.operations);
    expect(ops.filter(([, spec]) => spec.kind === "action")).toHaveLength(20);
    expect(ops.filter(([, spec]) => spec.kind === "webhook")).toEqual([]);
    expect(actions["webhook.conversion_created"]).toBeUndefined();
    expect(Object.keys(actions).sort()).toEqual(
      ops.filter(([, spec]) => spec.kind === "action").map(([key]) => key).sort(),
    );
  });

  test("creates a conversion with JSON body and deletes a customer with 204", async () => {
    let created: Request | undefined;
    const result = await actions["conversions.create"]!({
      ...cred,
      customer_id: "USER001",
      external_id: "ORDER001",
      amount: 10,
      fetch: async (url: string, init?: RequestInit) => {
        created = new Request(url, init);
        return response({ id: 1, amount: 10 });
      },
    });
    expect(created?.method).toBe("POST");
    expect(created?.headers.get("content-type")).toBe("application/json");
    expect(created?.headers.get("x-api-key")).toBe("fixture-tapfiliate-key");
    expect(await created!.clone().json()).toEqual({ customer_id: "USER001", external_id: "ORDER001", amount: 10 });
    expect(result).toMatchObject({ data: { id: 1 } });

    const deleted = await actions["customers.delete"]!({
      ...cred,
      customerId: "cu-example-1",
      fetch: async () => response(null, 204),
    });
    expect(deleted).toMatchObject({ connector: "tapfiliate", action: "customers.delete", data: null });
  });

  test("rejects missing affiliate id before fetch", async () => {
    let called = false;
    await expect(
      actions["affiliates.get"]!({
        ...cred,
        fetch: async () => {
          called = true;
          return response({});
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
  });
});
