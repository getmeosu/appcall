import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import fixture from "../fixtures/search_photos.json";
const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });
describe("pexels HTTP contract", () => {
  test("includes provenance and evidence metadata", () => {
    expect(manifest.provenance.source).toEqual({ url: "https://github.com/oomol-lab/open-connector", revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a" });
    expect(manifest.evidence).toEqual({ fixture: { status: "supplied" }, live: { status: "unverified" } });
  });
  test("healthcheck and search use API key and bounded query", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => { seen.push(new Request(input, init)); return response(fixture); };
    await actions.healthcheck!({ apiKey: "secret", fetch });
    await actions.search_photos!({ apiKey: "secret", query: "cats", perPage: 2, fetch });
    expect(seen[0].headers.get("authorization")).toBe("secret");
    expect(new URL(seen[1].url).searchParams.get("query")).toBe("cats");
  });
  test("rejects bad required values, maps rate limits, and validates output", async () => {
    await expect(actions.search_photos!({ apiKey: "x", query: "", fetch: async () => response(fixture) })).rejects.toBeDefined();
    await expect(actions.search_photos!({ apiKey: "x", query: "x", fetch: async () => response({}, 429, {"retry-after":"9"}) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });
    await expect(actions.search_photos!({ apiKey: "x", query: "x", fetch: async () => response({ photos: {} }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });
  test("executes every declared read operation and encodes photo IDs", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => { seen.push(new Request(input, init)); return response(fixture); };
    await actions.curated_photos!({ apiKey: "x", page: 2, perPage: 3, fetch });
    await actions.get_photo!({ apiKey: "x", photoId: 7, fetch });
    expect(new URL(seen[0].url).pathname).toBe("/v1/curated");
    expect(new URL(seen[1].url).pathname).toBe("/v1/photos/7");
    expect(seen).toHaveLength(2);
  });
});
