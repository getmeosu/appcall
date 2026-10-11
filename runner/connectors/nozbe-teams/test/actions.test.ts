import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cases from "../fixtures/deepen_cases.json";
import item from "../fixtures/item.json";
import list from "../fixtures/list.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const operations = manifest.operations as Record<string, { request: { method: string; path: string; body?: Record<string, unknown> }; sideEffect: string }>;

function renderPath(path: string, input: Record<string, unknown>): string {
  return path.replace(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g, (_m, name: string) => encodeURIComponent(String(input[name])));
}

describe("nozbe-teams origin contract", () => {
  test("auth header on origin operations", async () => {
    for (const n of ["healthcheck", "teams.list", "projects.list", "projects.get", "tasks.list"] as const) {
      const a: Record<string, unknown> = {
        apiKey: "secret",
        fetch: async (i: RequestInfo | URL, x?: RequestInit) => {
          expect(new Request(i, x).headers.get("authorization")).toBe("apikey secret");
          expect(new Request(i, x).headers.get("accept")).toBe("application/json");
          return new Response(JSON.stringify(n.endsWith(".get") ? item : []), { status: 200 });
        },
      };
      if (n === "projects.get") a.id = "p1q2r3s4t5u6v7w8";
      await actions[n]!(a);
    }
  });

  test("errors malformed", async () => {
    for (const s of [401, 429]) {
      await expect(actions["teams.list"]!({ apiKey: "x", fetch: async () => new Response(JSON.stringify({}), { status: s, headers: { "retry-after": "7" } }) })).rejects.toBeTruthy();
    }
  });

  test("healthcheck lists one team", async () => {
    const seen: Request[] = [];
    const teams = [{ id: "a1b2c3d4e5f6g7h8", name: "Acme" }];
    const result = await actions.healthcheck!({
      apiKey: "k",
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return new Response(JSON.stringify(teams), { status: 200 });
      },
    });
    expect(new URL(seen[0]!.url).pathname).toBe("/v1/api/teams");
    expect(new URL(seen[0]!.url).searchParams.get("limit")).toBe("1");
    expect(result).toMatchObject({ data: teams, source: "provider", connector: "nozbe-teams" });
  });

  test("projects.get requires id", async () => {
    await expect(actions["projects.get"]!({ apiKey: "k", fetch: async () => new Response("{}") })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });
});

describe("nozbe-teams Composio tools compile to real Nozbe HTTP calls", () => {
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
  }>) {
    test(`${entry.key} ${entry.method} ${entry.path}`, async () => {
      const seen: Request[] = [];
      const payload = entry.method === "GET" && (entry.key.endsWith(".list") || entry.key.includes("poll") || entry.key === "healthcheck")
        ? (entry.key === "healthcheck" || entry.key.endsWith(".list") || entry.key.includes("poll") ? list : item)
        : item;
      const listLike = entry.key === "healthcheck" || entry.key.endsWith(".list") || entry.key.includes("poll");
      const body = listLike ? list : item;
      const result = await actions[entry.key]!({
        apiKey: "secret",
        ...entry.input,
        fetch: async (input, init) => {
          seen.push(new Request(input, init));
          const status = entry.method === "POST" ? 201 : 200;
          return new Response(JSON.stringify(body), { status });
        },
      });
      expect(seen).toHaveLength(1);
      const url = new URL(seen[0]!.url);
      expect(url.hostname).toBe("api4.nozbe.com");
      expect(url.pathname).toBe(`/v1/api${renderPath(entry.path, entry.input)}`);
      expect(seen[0]!.method).toBe(entry.method);
      expect(seen[0]!.headers.get("authorization")).toBe("apikey secret");
      expect(result).toBeTruthy();
      expect((result as { connector: string }).connector).toBe("nozbe-teams");
      expect((result as { action: string }).action).toBe(entry.key);
      if (entry.method === "POST" || entry.method === "PUT") {
        expect(seen[0]!.headers.get("content-type")).toBe("application/json");
        const sent = JSON.parse(await seen[0]!.text()) as Record<string, unknown>;
        for (const [field, value] of Object.entries(entry.input)) {
          if (entry.path.includes(`{{${field}}}`)) continue;
          expect(sent[field], `${entry.key} body ${field}`).toEqual(value);
        }
      }
    });
  }
});
