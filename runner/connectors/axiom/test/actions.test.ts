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

  test("keeps the connector key and compiles 16 HTTP actions at 0.2.0", () => {
    expect(manifest.key).toBe("axiom");
    expect(manifest.version).toBe("0.2.0");
    const ops = Object.entries(manifest.operations as Record<string, { kind?: string; request?: unknown }>);
    expect(ops.filter(([, spec]) => spec.kind === "action")).toHaveLength(16);
    expect(ops.filter(([, spec]) => spec.kind === "webhook")).toEqual([]);
    expect(ops.every(([, spec]) => spec.kind === "webhook" || Boolean(spec.request))).toBe(true);
    expect(actions["webhook.monitor_triggered"]).toBeUndefined();
  });

  test("lists monitors and runs an APL query on the management host", async () => {
    let monitor: Request | undefined;
    const listed = await actions["monitors.list"]!({
      apiKey: "token",
      fetch: async (url: string, init?: RequestInit) => {
        monitor = new Request(url, init);
        return response([{ id: "mon1", name: "errors" }]);
      },
    });
    expect(monitor?.url).toBe("https://api.axiom.co/v2/monitors");
    expect(monitor?.headers.get("authorization")).toBe("Bearer token");
    expect(listed).toMatchObject({ monitors: [{ id: "mon1", name: "errors" }] });

    let query: Request | undefined;
    const ran = await actions["query.run"]!({
      apiKey: "token",
      apl: "['events'] | take 1",
      fetch: async (url: string, init?: RequestInit) => {
        query = new Request(url, init);
        return response({ tables: [] });
      },
    });
    expect(query?.url).toBe("https://api.axiom.co/v1/datasets/_apl?format=tabular");
    expect(query?.method).toBe("POST");
    expect(await query!.clone().json()).toEqual({ apl: "['events'] | take 1" });
    expect(ran).toMatchObject({ result: { tables: [] } });
  });

  test("creates a dataset and an annotation", async () => {
    let created: Request | undefined;
    const dataset = await actions["datasets.create"]!({
      apiKey: "token",
      name: "events",
      description: "app events",
      fetch: async (url: string, init?: RequestInit) => {
        created = new Request(url, init);
        return response({ id: "ds_123", name: "events" }, 201);
      },
    });
    expect(created?.url).toBe("https://api.axiom.co/v2/datasets");
    expect(created?.headers.get("content-type")).toBe("application/json");
    expect(dataset).toMatchObject({ dataset: { id: "ds_123", name: "events" } });

    const annotation = await actions["annotations.create"]!({
      apiKey: "token",
      datasets: ["events"],
      type: "deploy",
      title: "release",
      fetch: async () => response({ id: "ann1", type: "deploy" }, 201),
    });
    expect(annotation).toMatchObject({ annotation: { id: "ann1", type: "deploy" } });
  });
});
