import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import routes from "./deepened-routes.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("coda composio deepening", () => {
  test("compiles every declared action including origin/main reads", () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
  });

  test.each(routes)("$key ($slug) hits $method $path", async (route) => {
    const seen: Request[] = [];
    const body = route.method === "GET"
      ? { id: "resource-1", name: "Demo", type: "resource" }
      : { requestId: "abc-123-def-456", id: "resource-1" };
    const result = await actions[route.key]!({
      apiKey: "tok",
      ...route.input,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response(body, route.method === "GET" ? 200 : 202);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe(route.method);
    expect(new URL(seen[0].url).pathname).toBe(`/apis/v1${route.path}`);
    expect(seen[0].headers.get("authorization")).toBe("Bearer tok");
    if (route.hasBody) expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(result).toMatchObject({ connector: "coda", action: route.key, source: "provider", data: body });
  });

  test("rejects missing required path input on a write", async () => {
    await expect(
      actions["docs.delete"]!({ apiKey: "tok", fetch: async () => response({}) }),
    ).rejects.toMatchObject({ ok: false, code: "INVALID_ACTION_INPUT" });
  });
});
