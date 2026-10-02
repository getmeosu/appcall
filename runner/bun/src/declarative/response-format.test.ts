import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "./compile";

const base = () => ({
  key: "no-content-demo",
  network: { allowedHosts: ["api.demo.test"] },
  auth: { setup: { fields: [{ key: "token", required: true, secret: true }] } },
  http: {
    baseUrl: "https://api.demo.test",
    auth: { field: "token", in: "header" as const, name: "Authorization", value: "Bearer {{token}}" },
  },
});

describe("declarative responseFormat json", () => {
  it("allows empty 204 when result is a static envelope", async () => {
    const manifest = {
      ...base(),
      operations: {
        purge: {
          kind: "action",
          sideEffect: "write",
          effectPolicy: "Idempotent",
          responseFormat: "json",
          enforceOutputSchema: true,
          outputSchema: {
            type: "object",
            additionalProperties: false,
            required: ["purged"],
            properties: { purged: { type: "boolean" } },
          },
          request: {
            method: "POST",
            path: "/purge",
            success: [204],
            result: { purged: true },
          },
        },
      },
    };
    const action = compileDeclarativeConnector(manifest as never).actions.purge!;
    const result = await action({
      token: "t",
      fetch: async () => new Response("", { status: 204 }),
    });
    expect(result).toEqual({
      connector: "no-content-demo",
      action: "purge",
      source: "provider",
      purged: true,
    });
  });

  it("still rejects empty non-204 JSON when there is no static result", async () => {
    const manifest = {
      ...base(),
      operations: {
        check: {
          kind: "action",
          responseFormat: "json",
          request: { method: "GET", path: "/check", success: [200] },
        },
      },
    };
    const action = compileDeclarativeConnector(manifest as never).actions.check!;
    await expect(
      action({ token: "t", fetch: async () => new Response("", { status: 200 }) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });
});
