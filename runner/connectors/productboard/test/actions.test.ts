import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import list from "../fixtures/list.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe("productboard HTTP contract", () => {
  test("healthcheck uses bearer auth and accepts empty input", async () => {
    const seen: Request[] = [];
    const result = await actions.healthcheck!({ accessToken: "secret", fetch: async (input, init) => { seen.push(new Request(input, init)); return response(list); } });
    expect(seen[0].url).toBe("https://api.productboard.com/v2/members");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(result).toMatchObject({ members: list.data, source: "provider" });
  });
  test("encodes IDs and does not follow provider links", async () => {
    const seen: Request[] = [];
    await actions["entities.get"]!({ accessToken: "secret", id: "a/b", fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ data: list.data[0] }); } });
    expect(new URL(seen[0].url).pathname).toBe("/v2/entities/a%2Fb");
    expect(seen).toHaveLength(1);
  });
  test("maps rate limits and malformed output safely", async () => {
    await expect(actions["notes.list"]!({ accessToken: "secret", fetch: async () => response({ message: "slow" }, 429) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
    await expect(actions["notes.list"]!({ accessToken: "secret", fetch: async () => response({ data: {} }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });
});
