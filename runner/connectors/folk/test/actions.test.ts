import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import user from "../fixtures/user.json";
import list from "../fixtures/list.json";
const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe("folk HTTP contract", () => {
  test("healthcheck uses bearer auth", async () => {
    const seen: Request[] = [];
    const result = await actions.healthcheck!({ apiKey: "secret", fetch: async (input, init) => { seen.push(new Request(input, init)); return response(user); } });
    expect(seen[0].url).toBe("https://api.folk.app/v1/users/me");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(result).toMatchObject({ user: user.data, source: "provider" });
  });
  test("preserves pagination metadata and never follows nextLink", async () => {
    const seen: Request[] = [];
    const result = await actions["people.list"]!({ apiKey: "secret", limit: 10, cursor: "a b", fetch: async (input, init) => { seen.push(new Request(input, init)); return response(list); } });
    const url = new URL(seen[0].url);
    expect(url.searchParams.get("cursor")).toBe("a b");
    expect(result).toMatchObject({ people: list.data, pagination: { nextLink: list.pagination.nextLink }, source: "provider" });
    expect(seen).toHaveLength(1);
  });
  test("maps 401 and malformed output safely", async () => {
    await expect(actions["users.list"]!({ apiKey: "secret", fetch: async () => response({message:"no"},401) })).rejects.toMatchObject({code:"CONNECTOR_UPSTREAM_ERROR"});
    await expect(actions["users.list"]!({ apiKey: "secret", fetch: async () => response({data:{}}) })).rejects.toMatchObject({code:"CONNECTOR_RESPONSE_INVALID"});
  });
});
