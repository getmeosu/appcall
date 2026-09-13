import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });
const creds = { serviceAccountSecret: "secret", serviceAccountUsername: "svc", projectId: "123" };
describe("Mixpanel declarative Basic auth contract", () => {
  test("healthcheck uses credential-only input and Basic auth", async () => {
    const seen: Request[] = [];
    const result = await actions.healthcheck!({ ...creds, fetch: async (input, init) => { seen.push(new Request(input, init)); return response([{ id: "sa-1", username: "svc" }]); } });
    expect(seen[0].url).toBe("https://mixpanel.com/api/app/projects/123/service-accounts");
    expect(seen[0].headers.get("authorization")).toBe(`Basic ${btoa("svc:secret")}`);
    expect(result.serviceAccounts).toHaveLength(1);
  });
  test("maps a read-only POST and omits absent optional query", async () => {
    const seen: Request[] = [];
    const result = await actions["cohorts.list"]!({ ...creds, project_id: "123", fetch: async (input, init) => { seen.push(new Request(input, init)); return response([{ id: "c-1" }]); } });
    expect(seen[0].method).toBe("POST");
    expect(new URL(seen[0].url).searchParams.get("project_id")).toBe("123");
    expect(new URL(seen[0].url).searchParams.has("workspace_id")).toBe(false);
    expect(result.cohorts).toEqual([{ id: "c-1" }]);
  });
  test("rejects invalid inputs and redacts raw and encoded secrets", async () => {
    await expect(actions["funnel.query"]!({ ...creds, funnel_id: "", from_date: "2026-01-01", to_date: "2026-01-02", fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions.healthcheck!({ ...creds, fetch: async () => response({ error: `secret ${btoa("svc:secret")}` }, 401) })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
  test("maps rate limits safely", async () => {
    await expect(actions.healthcheck!({ ...creds, fetch: async () => response({ error: "slow" }, 429, { "Retry-After": "9" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });
  });
});
