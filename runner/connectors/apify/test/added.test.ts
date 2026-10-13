import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const ORIGIN_OPS_SHA256 = "8b180ce1e886653b630177b692e0e94837a8b8dd27839fa38dc1fc5a635cd6ed";
const NEW_OPS = ["task.run_sync_get_dataset_items_get"] as const;
const CASES = ["task-run-sync-get-dataset-items-get-success.json"] as const;

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]?.request as Record<string, unknown>;
}

describe("apify origin plus documented task dataset route", () => {
  test("bumps the patch version and leaves auth and hosts unchanged", () => {
    expect(manifest.key).toBe("apify");
    expect(manifest.version).toBe("0.3.1");
    expect(manifest.http.baseUrl).toBe("https://api.apify.com");
    expect(manifest.network.allowedHosts).toEqual(["api.apify.com"]);
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.full_depth).toBeUndefined();
  });

  test("keeps every origin operation unchanged", () => {
    const originOps = { ...operations };
    for (const key of NEW_OPS) delete originOps[key];
    expect(Object.keys(originOps)).toHaveLength(186);
    expect(createHash("sha256").update(JSON.stringify(originOps)).digest("hex")).toBe(ORIGIN_OPS_SHA256);
    expect(Object.keys(operations)).toHaveLength(187);
    expect(requestOf("task.run_sync_get_dataset_items_post").path).toBe(
      "/v2/actor-tasks/{{actorTaskId}}/run-sync-get-dataset-items",
    );
    expect(requestOf("actor.run_sync_get_dataset_items_get").method).toBe("GET");
  });

  test("adds the documented task GET and not the plain-text log route", () => {
    expect(requestOf("task.run_sync_get_dataset_items_get")).toEqual({
      method: "GET",
      path: "/v2/actor-tasks/{{actorTaskId}}/run-sync-get-dataset-items",
      success: [201],
      query: requestOf("task.run_sync_get_dataset_items_get").query,
    });
    const request = requestOf("task.run_sync_get_dataset_items_get");
    expect(request.body).toBeUndefined();
    expect(request.headers).toBeUndefined();
    expect(request.baseUrl).toBeUndefined();
    expect(operations["task.run_sync_get_dataset_items_get"]?.sideEffect).toBe("write");
    expect(operations["task.run_sync_get_dataset_items_get"]?.outputSchema).toEqual({ type: "object" });
    expect(operations["task.run_sync_get_dataset_items_get"]?.inputSchema).toMatchObject({
      type: "object",
      required: ["actorTaskId"],
      additionalProperties: false,
    });
    expect(compiled.actions["task.run_sync_get_dataset_items_get"]).toBeTypeOf("function");
    for (const operation of Object.values(operations)) {
      const path = (operation.request as { path?: string } | undefined)?.path;
      expect(path).not.toBe("/v2/logs/{{buildOrRunId}}");
    }
  });
});

describe("apify new operation fixtures", () => {
  const jsonResponse = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  test("replays one success fixture per new operation", async () => {
    const seen = new Set<string>();
    for (const name of CASES) {
      const fixtureUrl = new URL(`../fixtures/cases/${name}`, import.meta.url);
      const fixture = await Bun.file(fixtureUrl).json();
      seen.add(fixture.operation);
      const exchange = fixture.exchanges[0];
      const responseBody = await Bun.file(new URL(exchange.response.bodyFile, fixtureUrl)).json();
      const expected = await Bun.file(new URL(fixture.expected.resultFile, fixtureUrl)).json();
      const requests: Request[] = [];
      const result = await compiled.actions[fixture.operation]!({
        ...fixture.credentials,
        ...fixture.input,
        fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
          requests.push(new Request(url, init));
          return jsonResponse(responseBody, exchange.response.status);
        },
      });
      expect(requests, name).toHaveLength(1);
      expect(requests[0]!.method, name).toBe(exchange.request.method);
      expect(requests[0]!.url, name).toBe(exchange.request.url);
      expect(requests[0]!.headers.get("authorization"), name).toBe(exchange.request.headers.Authorization);
      expect(requests[0]!.headers.get("accept"), name).toBe(exchange.request.headers.Accept);
      expect(requests[0]!.headers.get("content-type"), name).toBeNull();
      expect(await requests[0]!.clone().text(), name).toBe("");
      expect(result, name).toEqual(expected);
    }
    expect([...seen].sort()).toEqual([...NEW_OPS].sort());
  });
});
