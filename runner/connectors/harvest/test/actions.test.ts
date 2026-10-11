import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import contracts from "../fixtures/contracts.json";

const { actions } = compileDeclarativeConnector(manifest);
const mock = (body: unknown, status = 200, headers?: HeadersInit) => {
  const calls: Request[] = [];
  const fetch = async (u: RequestInfo | URL, i?: RequestInit) => {
    calls.push(new Request(u, i));
    return new Response(JSON.stringify(body), { status, headers });
  };
  return { calls, fetch };
};

describe("Harvest declarative contract", () => {
  test("compiles every action and sends bearer plus account", async () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
    const m = mock({ id: 1 });
    await actions.healthcheck!({ apiKey: "harvest-secret", accountId: "123", fetch: m.fetch });
    expect(m.calls[0].url).toBe("https://api.harvestapp.com/v2/users/me");
    expect(m.calls[0].headers.get("authorization")).toBe("Bearer harvest-secret");
    expect(m.calls[0].headers.get("harvest-account-id")).toBe("123");
  });

  test("renders list queries and rejects invalid IDs", async () => {
    const m = mock({ clients: [], page: 1 });
    await actions["clients.list"]!({ apiKey: "x", accountId: "1", fetch: m.fetch });
    expect(new URL(m.calls[0].url).search).toBe("");
    await expect(actions["projects.list"]!({ apiKey: "x", accountId: "1", clientId: "bad", fetch: m.fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["timeEntries.list"]!({ apiKey: "x", accountId: "1", userId: "bad", fetch: m.fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["clients.get"]!({ apiKey: "x", accountId: "1", clientId: "bad", fetch: m.fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("maps 429 and redacts token from upstream errors", async () => {
    await expect(actions.healthcheck!({ apiKey: "harvest-secret", accountId: "1", fetch: async () => new Response(JSON.stringify({ message: "harvest-secret" }), { status: 429, headers: { "Retry-After": "4" } }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
    await expect(actions.healthcheck!({ apiKey: "harvest-secret", accountId: "1", fetch: async () => new Response(JSON.stringify({ message: "harvest-secret" }), { status: 401 }) })).rejects.not.toThrow("harvest-secret");
  });

  test("omits unresolved write fields", async () => {
    const m = mock({ id: 123, name: "Demo Client" }, 201);
    await actions["clients.create"]!({ apiKey: "x", accountId: "1", name: "Demo Client", fetch: m.fetch });
    expect(JSON.parse(String(await m.calls[0].text()))).toEqual({ name: "Demo Client" });
    expect(m.calls[0].headers.get("content-type")).toBe("application/json");
  });
});

for (const c of contracts as Array<{ op: string; input: Record<string, unknown>; method: string; path: string; body: unknown; status: number; response: unknown; output: Record<string, unknown> }>) {
  describe(c.op, () => {
    test("sends the documented request and maps its response", async () => {
      expect(actions[c.op]).toBeFunction();
      let calls = 0;
      const result = await actions[c.op]!({
        ...c.input,
        apiKey: "harvest-secret",
        accountId: "123",
        fetch: async (url: unknown, init?: RequestInit) => {
          calls++;
          expect(String(url)).toBe("https://api.harvestapp.com" + c.path);
          expect(String(init?.method ?? "GET").toUpperCase()).toBe(c.method);
          const headers = new Headers(init?.headers);
          expect(headers.get("authorization")).toBe("Bearer harvest-secret");
          expect(headers.get("harvest-account-id")).toBe("123");
          expect(init?.body == null ? null : JSON.parse(String(init.body))).toEqual(c.body);
          return new Response(JSON.stringify(c.response), { status: c.status });
        },
      });
      expect(calls).toBe(1);
      expect(result).toMatchObject(c.output);
    });
  });
}
