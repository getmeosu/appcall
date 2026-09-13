import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import self from "../fixtures/self.json";
import list from "../fixtures/list.json";
const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe("attio HTTP contract", () => {
  test("healthcheck uses bearer auth and validates output", async () => {
    const seen: Request[] = [];
    const result = await actions.healthcheck!({ accessToken: "secret", fetch: async (input, init) => { seen.push(new Request(input, init)); return response(self); } });
    expect(seen[0].url).toBe("https://api.attio.com/v2/self");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(result).toMatchObject({ self, source: "provider" });
  });
  test("maps list and encodes IDs without following links", async () => {
    const seen: Request[] = [];
    const result = await actions["objects.get"]!({ accessToken: "secret", object: "people/a", fetch: async (input, init) => { seen.push(new Request(input, init)); return response({data:list.data[0]}); } });
    expect(new URL(seen[0].url).pathname).toBe("/v2/objects/people%2Fa");
    expect(result).toMatchObject({ object: list.data[0], source: "provider" });
    expect(seen).toHaveLength(1);
  });
  test("maps rate limits and malformed output safely", async () => {
    await expect(actions["objects.list"]!({ accessToken: "secret", fetch: async () => response({message:"slow"},429) })).rejects.toMatchObject({code:"CONNECTOR_RATE_LIMITED"});
    await expect(actions["objects.list"]!({ accessToken: "secret", fetch: async () => response({data:{}}) })).rejects.toMatchObject({code:"CONNECTOR_RESPONSE_INVALID"});
  });
});
