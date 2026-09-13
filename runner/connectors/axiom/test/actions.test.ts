import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import datasets from "../fixtures/datasets.json";
import dataset from "../fixtures/dataset.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const actions = compileDeclarativeConnector(manifest).actions;
const response = (body: unknown, status = 200, headers: Record<string,string> = {}) => new Response(JSON.stringify(body), { status, headers });

describe("axiom declarative connector", () => {
  test("healthcheck takes empty input and authenticates", async () => {
    let seen: Request | undefined;
    const result = await actions.healthcheck!({ apiKey: "token", fetch: async (url, init) => { seen = new Request(url, init); return response(datasets); } });
    expect(seen?.url).toBe("https://api.axiom.co/v2/datasets");
    expect(seen?.headers.get("authorization")).toBe("Bearer token");
    expect(result).toMatchObject({ source: "provider", status: "ok" });
  });
  test("gets encoded dataset IDs and maps response", async () => {
    let seen = "";
    const result = await actions["datasets.get"]!({ apiKey: "token", datasetId: "ds/123", fetch: async (url) => { seen = String(url); return response(dataset); } });
    expect(seen).toContain("/v2/datasets/ds%2F123");
    expect(result).toMatchObject({ dataset });
  });
  test("rejects malformed provider output under enforced schema", async () => {
    await expect(actions["datasets.list"]!({ apiKey: "token", fetch: async () => response(["not a dataset"]) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });
  test("rejects missing ID before fetch and maps 429 metadata", async () => {
    let called = false;
    expect(() => actions["datasets.get"]!({ apiKey: "token", fetch: async () => { called = true; return response({}); } })).toThrow();
    expect(called).toBe(false);
    await expect(actions["datasets.list"]!({ apiKey: "token", fetch: async () => response({ message: "slow" }, 429, { "retry-after": "17" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 17 });
  });
});
