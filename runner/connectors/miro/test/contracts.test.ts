import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cases from "../fixtures/contracts.json";

const actions = compileDeclarativeConnector(manifest as never).actions;
const fixture = { data: [{ id: "b/1", name: "Board" }], limit: 1, offset: 0, size: 1, cursor: "next" };

describe("miro declarative fixture contracts", () => {
  it("compiles every operation and uses official OAuth metadata", () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(manifest.auth.scopes).toEqual(["boards:read"]);
    expect(manifest.auth.oauth.supportsRefresh).toBe(true);
    expect(manifest.provenance.source).toEqual({ url: "https://github.com/oomol-lab/open-connector", revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a" });
    expect(manifest.evidence).toEqual({ fixture: { status: "supplied" }, live: { status: "unverified" } });
  });
  for (const c of cases) {
    it(`${c.operation} sends auth, exact path and maps fixture`, async () => {
      let seen: { url: string; init: RequestInit } | undefined;
      const result = await actions[c.operation]!({ ...c.input, accessToken: "secret", fetch: async (url: string, init: RequestInit) => {
        seen = { url, init }; return new Response(JSON.stringify(c.response), { status: 200, headers: { "content-type": "application/json" } });
      }});
      expect(seen!.url).toBe(`https://api.miro.com/v2${c.path}`);
      expect(new Headers(seen!.init.headers).get("authorization")).toBe("Bearer secret");
      expect(result).toMatchObject({ connector: "miro", action: c.operation, source: "provider" });
    });
  }
  it("rejects missing and encoded identifiers before fetch", async () => {
    let calls = 0;
    const fetch = async () => { calls++; return new Response(JSON.stringify(fixture)); };
    expect(() => actions["items.get"]!({ accessToken: "x", boardId: "b" })).toThrow();
    await actions["items.get"]!({ accessToken: "x", boardId: "board/1", itemId: "item/2", fetch });
    expect(calls).toBe(1);
  });
  it("maps 401 and 429 with retry metadata and rejects malformed output", async () => {
    await expect(actions.healthcheck!({ accessToken: "x", fetch: async () => new Response('{"message":"bad"}', { status: 401 }) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions.healthcheck!({ accessToken: "x", fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "12" } }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
    await expect(actions["boards.list"]!({ accessToken: "x", fetch: async () => new Response("null") })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });
  it("does not follow provider next URLs", async () => {
    const urls: string[] = [];
    await actions["boards.list"]!({ accessToken: "x", fetch: async (url: string) => { urls.push(url); return new Response(JSON.stringify({ ...fixture, next: "https://evil.example/steal" })); } });
    expect(urls).toHaveLength(1);
  });
});
