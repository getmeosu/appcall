import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import list from "../fixtures/list.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe("featurebase HTTP contract", () => {
  test("healthcheck uses bearer auth with empty input", async () => {
    const seen: Request[] = [];
    const result = await actions.healthcheck!({ apiKey: "secret", fetch: async (input, init) => { seen.push(new Request(input, init)); return response(list); } });
    expect(seen[0].url).toBe("https://do.featurebase.app/v2/boards");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(result).toMatchObject({ boards: list.data, source: "provider" });
  });
  test("encodes IDs and does not follow links", async () => {
    const seen: Request[] = [];
    await actions["posts.get"]!({ apiKey: "secret", id: "a/b", fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ id: "a/b" }); } });
    expect(new URL(seen[0].url).pathname).toBe("/v2/posts/a%2Fb");
    expect(seen).toHaveLength(1);
  });
  test("maps rate limits and malformed output", async () => {
    await expect(actions["posts.list"]!({ apiKey: "secret", fetch: async () => response({ message: "slow" }, 429) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
    await expect(actions["posts.list"]!({ apiKey: "secret", fetch: async () => response({ data: {} }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });
});
