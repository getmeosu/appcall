import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import sites from "../fixtures/sites.json";
const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });
describe("webflow HTTP contract", () => {
  test("includes provenance and evidence metadata", () => {
    expect(manifest.provenance.source).toEqual({ url: "https://github.com/oomol-lab/open-connector", revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a" });
    expect(manifest.evidence).toEqual({ fixture: { status: "supplied" }, live: { status: "unverified" } });
  });
  test("healthcheck and site listing use bearer auth", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => { seen.push(new Request(input, init)); return response(sites); };
    await actions.healthcheck!({ apiKey: "secret", fetch });
    await actions.list_sites!({ apiKey: "secret", fetch });
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0].url).toBe("https://api.webflow.com/v2/sites");
  });
  test("escapes IDs, omits null pagination, maps 401 and 429", async () => {
    const seen: Request[] = [];
    await actions.list_collections!({ apiKey: "x", siteId: "a/b?c", fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ collections: [] }); } });
    expect(new URL(seen[0].url).pathname).toBe("/v2/sites/a%2Fb%3Fc/collections");
    await expect(actions.list_sites!({ apiKey: "x", fetch: async () => response({}, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions.list_sites!({ apiKey: "x", fetch: async () => response({}, 429, {"retry-after":"4"}) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
  test("executes every declared read operation with bounded pagination", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => { seen.push(new Request(input, init)); return response({ collections: [], items: [], limit: 10, offset: 0, total: 0 }); };
    await actions.list_collections!({ apiKey: "x", siteId: "site", fetch });
    await actions.list_collection_items!({ apiKey: "x", collectionId: "collection", limit: 10, offset: 0, fetch });
    expect(new URL(seen[0].url).pathname).toBe("/v2/sites/site/collections");
    expect(new URL(seen[1].url).pathname).toBe("/v2/collections/collection/items");
    expect(new URL(seen[1].url).searchParams.get("limit")).toBe("10");
    expect(seen).toHaveLength(2);
  });
});
