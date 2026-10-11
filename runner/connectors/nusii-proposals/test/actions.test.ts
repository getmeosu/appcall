import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cases from "../fixtures/deepen_cases.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const operations = manifest.operations as Record<string, { request: { method: string; path: string } }>;

describe("nusii-proposals origin contract", () => {
  test("auth header on origin operations", async () => {
    for (const n of ["healthcheck", "account.get", "clients.list", "clients.get", "proposals.list", "templates.list"] as const) {
      const a: Record<string, unknown> = {
        apiKey: "secret",
        fetch: async (i: RequestInfo | URL, x?: RequestInit) => {
          expect(new Request(i, x).headers.get("authorization")).toBe("Token token=secret");
          expect(new Request(i, x).headers.get("accept")).toBe("application/json");
          return new Response(JSON.stringify({ data: {} }), { status: 200 });
        },
      };
      if (n === "clients.get") a.id = "12";
      await actions[n]!(a);
    }
  });

  test("errors malformed", async () => {
    for (const s of [401, 429]) {
      await expect(
        actions["clients.list"]!({
          apiKey: "x",
          fetch: async () => new Response(JSON.stringify({}), { status: s, headers: { "retry-after": "7" } }),
        }),
      ).rejects.toBeTruthy();
    }
  });

  test("healthcheck hits /account/me", async () => {
    const seen: Request[] = [];
    const payload = { data: { id: "3", type: "accounts" } };
    const result = await actions.healthcheck!({
      apiKey: "k",
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return new Response(JSON.stringify(payload), { status: 200 });
      },
    });
    expect(new URL(seen[0]!.url).pathname).toBe("/api/v2/account/me");
    expect(result).toMatchObject({ data: payload, source: "provider", connector: "nusii-proposals" });
  });

  test("clients.get requires id", async () => {
    await expect(actions["clients.get"]!({ apiKey: "k", fetch: async () => new Response("{}") })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
  });
});

describe("nusii-proposals Composio tools compile to real Nusii HTTP calls", () => {
  test("every case has a compiled handler", () => {
    expect(cases.length).toBe(Object.keys(operations).length);
    for (const entry of cases as Array<{ key: string }>) {
      expect(actions[entry.key], entry.key).toBeTypeOf("function");
    }
  });

  for (const entry of cases as Array<{
    key: string;
    method: string;
    path: string;
    input: Record<string, unknown>;
    url: string;
    body: string | null;
    status: number;
  }>) {
    test(`${entry.key} ${entry.method} ${entry.path}`, async () => {
      const seen: Request[] = [];
      const payload = entry.key === "themes.list" ? [{ id: "clean", name: "Modern Theme" }] : { data: { id: "1" } };
      const result = await actions[entry.key]!({
        apiKey: "secret",
        ...entry.input,
        fetch: async (input, init) => {
          seen.push(new Request(input, init));
          return new Response(JSON.stringify(payload), { status: entry.status });
        },
      });
      expect(seen).toHaveLength(1);
      expect(seen[0]!.url).toBe(entry.url.replace("fixture-nusii-token", "secret").replace("https://app.nusii.com", "https://app.nusii.com"));
      const url = new URL(seen[0]!.url);
      expect(url.hostname).toBe("app.nusii.com");
      expect(seen[0]!.method).toBe(entry.method);
      expect(seen[0]!.headers.get("authorization")).toBe("Token token=secret");
      expect(seen[0]!.headers.get("accept")).toBe("application/json");
      expect(result).toBeTruthy();
      expect((result as { connector: string }).connector).toBe("nusii-proposals");
      expect((result as { action: string }).action).toBe(entry.key);
      const sent = await seen[0]!.text();
      if (entry.body == null) {
        expect(sent).toBe("");
      } else {
        expect(seen[0]!.headers.get("content-type")).toBe("application/json");
        expect(sent).toBe(entry.body);
      }
    });
  }
});
