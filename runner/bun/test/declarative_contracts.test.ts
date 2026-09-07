import { expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../src/declarative/compile";

const manifest = {
  key: "contracts", network: { allowedHosts: ["example.test"] },
  auth: { setup: { fields: [{ key: "tenant" }], routes: [{ fields: [{ key: "routeToken" }] }], derive: [{ field: "basicAuth" }] } },
  http: { baseUrl: "https://example.test", auth: { field: "token", in: "header", name: "Authorization" } },
  operations: { publish: {
    kind: "action", enforceOutputSchema: true,
    inputSchema: { type: "object", properties: { text: { type: "string" } }, additionalProperties: false },
    outputSchema: { type: "object", required: ["id", "items"], properties: {
      id: { type: "string", minLength: 1 }, optional: { type: "string" },
      items: { type: "array", items: { type: "object", required: ["state"], properties: { state: { type: "string", enum: ["published"] } } } },
    } },
    request: { method: "POST", path: "/publish", result: { id: "{{response.id}}", items: "{{response.items}}" } },
  } },
};

it("requires an object output schema when enforcement is enabled", () => {
  for (const outputSchema of [undefined, { type: "array" }]) {
    expect(() => compileDeclarativeConnector({ ...manifest, operations: { publish: { ...manifest.operations.publish, outputSchema } } })).toThrow();
  }
});

it("rejects missing IDs and malformed nested provider results without exposing values", async () => {
  const { actions } = compileDeclarativeConnector(manifest);
  for (const response of [{}, { id: "", items: [] }, { id: 42, items: [] }, { id: "id", items: {} }, { id: "id", items: [{}] }, { id: "id", items: [{ state: "private-value" }] }]) {
    await expect(actions.publish!({ token: "secret", fetch: async () => Response.json(response) })).rejects.toEqual({
      ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector response does not match its declared schema.",
    });
  }
  await expect(actions.publish!({ token: "secret", fetch: async () => Response.json({ id: "id", items: [{ state: "published" }] }) })).resolves.toMatchObject({ id: "id" });
});

it("rejects unsupported publish controls before dispatch and on fixture validation", async () => {
  const { actions } = compileDeclarativeConnector(manifest);
  for (const extra of [{ published: false }, { scheduledPublishTime: 123 }]) {
    let calls = 0;
    await expect(actions.publish!({ ...extra, token: "secret", fetch: async () => { calls++; return Response.json({}); } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(calls).toBe(0);
    expect(() => actions.publish!(extra)).toThrow();
  }
});

it("allows injected credential fields and preserves legacy permissive defaults", async () => {
  const { actions } = compileDeclarativeConnector(manifest);
  await expect(actions.publish!({ token: "secret", tenant: "tenant", routeToken: "route", basicAuth: "derived", fetch: async () => Response.json({ id: "id", items: [] }) })).resolves.toMatchObject({ id: "id" });
  const legacy = compileDeclarativeConnector({ ...manifest, operations: { publish: { ...manifest.operations.publish, enforceOutputSchema: false, inputSchema: { type: "object", properties: {} } } } });
  await expect(legacy.actions.publish!({ token: "secret", unknown: true, fetch: async () => Response.json({}) })).resolves.toMatchObject({ source: "provider" });
});
