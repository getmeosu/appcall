import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const mock = (body: unknown, status = 200, headers?: HeadersInit) => { const calls: Request[] = []; const fetch = async (u: RequestInfo | URL, i?: RequestInit) => { calls.push(new Request(u, i)); return new Response(JSON.stringify(body), { status, headers }); }; return { calls, fetch }; };
describe("Toggl Track declarative contract", () => {
  test("compiles all reads and uses Basic token auth", async () => {
    expect(Object.keys(actions).sort()).toEqual(["healthcheck", "projects.list", "tasks.list", "timeEntries.list", "users.me", "workspaces.list"]);
    const m = mock({ id: 1 }); await actions.healthcheck!({ apiKey: "tok-secret", fetch: m.fetch });
    expect(m.calls[0].url).toBe("https://api.track.toggl.com/api/v9/me");
    expect(m.calls[0].headers.get("authorization")).toBe(`Basic ${Buffer.from("tok-secret:api_token").toString("base64")}`);
  });
  test("renders paths, queries, and rejects invalid IDs", async () => {
    const m = mock([]); await actions["projects.list"]!({ apiKey: "x", workspaceId: 12, fetch: m.fetch });
    expect(m.calls[0].url).toBe("https://api.track.toggl.com/api/v9/workspaces/12/projects");
    await expect(actions["projects.list"]!({ apiKey: "x", workspaceId: null, fetch: m.fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["tasks.list"]!({ apiKey: "x", workspaceId: "bad", projectId: 2, fetch: m.fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });
  test("maps rate limits and redacts secrets", async () => {
    const m = mock({ message: "bad tok-secret" }, 429, { "retry-after": "9" });
    await expect(actions.healthcheck!({ apiKey: "tok-secret", fetch: m.fetch })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });
    await expect(actions.healthcheck!({ apiKey: "tok-secret", fetch: async () => new Response(JSON.stringify({ message: "tok-secret" }), { status: 401 }) })).rejects.not.toThrow("tok-secret");
  });
});
