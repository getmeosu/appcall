import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../src/declarative/compile";
const baseManifest = (headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" }) => ({ key: "form-fixture", name: "Form Fixture", network: { allowedHosts: ["api.form.test"] }, http: { baseUrl: "https://api.form.test", headers, auth: { field: "apiKey", name: "Authorization", value: "Bearer {{apiKey}}" } }, operations: { submit: { kind: "action", inputSchema: { type: "object" }, request: { method: "POST", path: "/submit", bodyEncoding: "form", body: { credential: "{{credential}}", enabled: "{{enabled}}", count: "{{count}}", optional: "{{optional}}" }, success: [200] } } } });
describe("declarative form bodies", () => {
  it("encodes scalar values with native URLSearchParams", async () => { let body = ""; const action = compileDeclarativeConnector(baseManifest() as never).actions.submit!; await action({ apiKey: "secret", credential: "a+b&c=d é", enabled: true, count: 2.5, fetch: async (_url, init) => { body = String(init?.body); return new Response("{}", { status: 200 }); } }); expect(body).toBe(new URLSearchParams({ credential: "a+b&c=d é", enabled: "true", count: "2.5" }).toString()); });
  it("supports literal scalar fields", async () => { const manifest = baseManifest() as any; manifest.operations.submit.request.body = { enabled: true, count: 2.5 }; let body = ""; await compileDeclarativeConnector(manifest).actions.submit!({ apiKey: "k", fetch: async (_url, init) => { body = String(init?.body); return new Response("{}", { status: 200 }); } }); expect(body).toBe("enabled=true&count=2.5"); });
  it("rejects nested, null, and non-finite form values before fetch", async () => { let calls = 0; const action = compileDeclarativeConnector(baseManifest() as never).actions.submit!; for (const value of [{ nested: { x: 1 } }, null, Number.NaN, Number.POSITIVE_INFINITY]) await expect(action({ apiKey: "k", credential: value, fetch: async () => { calls++; return new Response("{}", { status: 200 }); } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" }); expect(calls).toBe(0); });
  it("requires the exact form content type", () => { expect(() => compileDeclarativeConnector(baseManifest({ "Content-Type": "application/json" }) as never)).toThrow(/form body requires Content-Type/); });
  it("rejects effective header conflicts and parameter overrides before fetch", async () => {
    const manifest = baseManifest({ "Content-Type": "application/x-www-form-urlencoded", "content-type": "application/json" }) as any;
    manifest.operations.submit.request.parameters = [{ wireName: "Content-Type", inputName: "contentType", in: "header", style: "simple", explode: false, allowReserved: false }];
    expect(() => compileDeclarativeConnector(manifest)).toThrow(/form body requires/);
  });
  it("rejects a content-type header parameter override before fetch", async () => {
    const manifest = baseManifest() as any;
    manifest.operations.submit.request.parameters = [{ wireName: "Content-Type", inputName: "contentType", in: "header", style: "simple", explode: false, allowReserved: false }];
    const action = compileDeclarativeConnector(manifest).actions.submit!;
    await expect(action({ apiKey: "k", credential: "x", contentType: "application/json", fetch: async () => new Response("{}", { status: 200 }) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });
  it("keeps legacy bodies as JSON", async () => { const manifest = baseManifest() as any; delete manifest.operations.submit.request.bodyEncoding; let body = ""; await compileDeclarativeConnector(manifest).actions.submit!({ apiKey: "k", credential: "a+b", fetch: async (_url, init) => { body = String(init?.body); return new Response("{}", { status: 200 }); } }); expect(JSON.parse(body)).toEqual({ credential: "a+b" }); });
});
