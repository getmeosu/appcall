import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import coverage from "../../appcircle.coverage.json";

const { actions } = compileDeclarativeConnector(manifest);
const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

describe("appcircle contract", () => {
  test("maps every covered operation to one JSON request on api.appcircle.io", () => {
    const operations = manifest.operations;
    expect(Object.keys(operations).sort()).toEqual(coverage.mapped.map((row) => row.operation).sort());
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.mapped.length + coverage.missing_still.length).toBe(coverage.composio_tools);
    expect(manifest.network.allowedHosts).toEqual(["api.appcircle.io"]);
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.request.method === "GET" || operation.request.method === "PATCH").toBe(true);
      expect(operation.request.path.startsWith("/")).toBe(true);
      expect(operation.responseFormat).toBe("json");
      expect(operation.request.body).toBeUndefined();
      expect(operation.outputSchema.type).toBe("object");
      expect(operation.maxResponseBytes).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxInputBytes).toBeLessThanOrEqual(26214400);
      expect(operation.timeoutMs).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs).toBeLessThanOrEqual(300000);
      expect(actions[key]).toBeFunction();
    }
  });

  test("sends the bearer token and omits Content-Type on a body-less GET", async () => {
    const seen: Request[] = [];
    const result = await actions["bundle-identifiers.list"]!({
      apiKey: "secret-token",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json([{ id: "bundle-1", identifier: "io.example.app" }]);
      },
    });
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret-token");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(new URL(seen[0].url).pathname).toBe("/signing-identity/v2/bundle-identifier");
    expect(result.data).toEqual([{ id: "bundle-1", identifier: "io.example.app" }]);
  });

  test("renames with a query parameter and encodes the path segment", async () => {
    const seen: Request[] = [];
    await actions["build.variable-groups.rename"]!({
      apiKey: "secret-token",
      variableGroupId: "group/id",
      name: "Release",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ id: "group/id", name: "Release" });
      },
    });
    const url = new URL(seen[0].url);
    expect(seen[0].method).toBe("PATCH");
    expect(url.pathname).toBe("/build/v2/variable-groups/group%2Fid");
    expect(url.searchParams.get("name")).toBe("Release");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
  });

  test("omits the rename query when name is absent", async () => {
    const seen: Request[] = [];
    await actions["build.variable-groups.rename"]!({
      apiKey: "secret-token",
      variableGroupId: "123e4567-e89b-12d3-a456-426614174111",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ id: "123e4567-e89b-12d3-a456-426614174111" });
      },
    });
    expect(new URL(seen[0].url).search).toBe("");
  });

  test("rejects bad input, malformed JSON, upstream failure, and rate limits", async () => {
    const fetch = async () => json({});
    await expect(actions["store.app-versions.list"]!({ apiKey: "tok", profileId: "", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["distribution.profiles.list"]!({ apiKey: "tok", page: 0, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["report.publish-activity.list"]!({ apiKey: "tok", action: "NotAnAction", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["build.profiles.list"]!({ apiKey: "tok", extra: true, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["store.profiles.list"]!({ apiKey: "tok", fetch: async () => json("not-json") })).rejects.toMatchObject({
      code: "CONNECTOR_RESPONSE_INVALID",
    });
    await expect(actions["store.profiles.list"]!({ apiKey: "tok", fetch: async () => json({}, 401) })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      actions["store.profiles.list"]!({
        apiKey: "tok",
        fetch: async () => json({}, 429, { "Retry-After": "4" }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
