import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cases from "../fixtures/contracts.json";
const actions = compileDeclarativeConnector(manifest as never).actions;
describe("float declarative fixture contracts", () => {
  it("compiles every operation and uses bearer auth", () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(manifest.provenance.source).toEqual({ url: "https://github.com/oomol-lab/open-connector", revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a" });
    expect(manifest.evidence).toEqual({ fixture: { status: "supplied" }, live: { status: "unverified" } });
  });
  for (const c of cases) it(`${c.operation} sends exact request and maps fixture`, async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const result = await actions[c.operation]!({ ...c.input, apiKey: "secret", fetch: async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify(c.response)); } });
    expect(seen!.url).toBe(`https://api.float.com/v3${c.path}`);
    expect(new Headers(seen!.init.headers).get("authorization")).toBe("Bearer secret");
    expect(result).toMatchObject({ connector: "float", action: c.operation, source: "provider" });
  });
  it("rejects invalid page before fetch, maps 401/429, and rejects malformed output", async () => {
    let calls = 0; const fetch = async () => { calls++; return new Response("[]"); };
    expect(() => actions["people.list"]!({ apiKey: "x", page: 0 })).toThrow(); expect(calls).toBe(0);
    await expect(actions.healthcheck!({ apiKey: "x", fetch: async () => new Response('{"error":"bad"}', { status: 401 }) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions.healthcheck!({ apiKey: "x", fetch: async () => new Response("[]", { status: 429, headers: { "retry-after": "7" } }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 7 });
    await expect(actions["clients.list"]!({ apiKey: "x", fetch: async () => new Response("null") })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });
  it("omits absent query fields and never follows arbitrary links", async () => {
    const urls: string[] = []; await actions["projects.list"]!({ apiKey: "x", fetch: async (url: string) => { urls.push(url); return new Response("[]"); } });
    expect(urls[0]).toBe("https://api.float.com/v3/projects"); expect(urls).toHaveLength(1);
  });
});
