import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cases from "../fixtures/deepen_cases.json";
import item from "../fixtures/item.json";
import list from "../fixtures/list.json";

const { actions } = compileDeclarativeConnector(manifest as never);

function renderPath(path: string, input: Record<string, unknown>): string {
  return path.replace(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g, (_m, name: string) => encodeURIComponent(String(input[name])));
}

describe("clockify Composio tools compile to real Clockify HTTP calls", () => {
  test("every case has a compiled handler", () => {
    expect(cases.length).toBe(76);
    for (const entry of cases as Array<{ key: string }>) {
      expect(actions[entry.key], entry.key).toBeTypeOf("function");
    }
  });

  for (const entry of cases as Array<{
    key: string;
    method: string;
    path: string;
    input: Record<string, unknown>;
    host: string;
    basePath: string;
    origin?: boolean;
  }>) {
    test(`${entry.key} ${entry.method} ${entry.path}`, async () => {
      const seen: Request[] = [];
      const body = entry.key === "healthcheck" || entry.key.endsWith(".get") || entry.method !== "GET"
        ? item
        : list;
      const payload = entry.key === "healthcheck" ? {} : (Array.isArray(list) && (entry.key.endsWith(".list") || entry.key === "workspaces.list" || entry.key === "projects.list" || entry.key === "tasks.list") ? list : item);
      const result = await actions[entry.key]!({
        apiKey: "secret",
        ...entry.input,
        fetch: async (input, init) => {
          seen.push(new Request(input, init));
          const status = entry.method === "POST" ? 201 : 200;
          return new Response(JSON.stringify(payload), { status });
        },
      });
      expect(seen).toHaveLength(1);
      const url = new URL(seen[0]!.url);
      expect(url.hostname).toBe(entry.host);
      expect(url.pathname).toBe(`${entry.basePath}${renderPath(entry.path, entry.input)}`);
      expect(seen[0]!.method).toBe(entry.method);
      expect(seen[0]!.headers.get("x-api-key")).toBe("secret");
      expect(result).toBeTruthy();
      expect((result as { connector: string }).connector).toBe("clockify");
    });
  }

  test("reports use reports.api.clockify.me and stay read", async () => {
    const seen: Request[] = [];
    await actions["reports.detailed"]!({
      apiKey: "k",
      workspaceId: "w1",
      dateRangeStart: "2024-01-01T00:00:00Z",
      dateRangeEnd: "2024-01-31T23:59:59Z",
      detailedFilter: { page: 1, pageSize: 50 },
      fetch: async (i, x) => { seen.push(new Request(i, x)); return new Response(JSON.stringify({ totals: [] }), { status: 200 }); },
    });
    expect(new URL(seen[0]!.url).hostname).toBe("reports.api.clockify.me");
    expect(seen[0]!.method).toBe("POST");
    expect((manifest.operations as Record<string, { sideEffect: string }>)["reports.detailed"].sideEffect).toBe("read");
  });

  test("create time entry posts Clockify start/end body", async () => {
    const seen: Request[] = [];
    await actions["time_entries.create"]!({
      apiKey: "k",
      workspaceId: "w1",
      start: "2024-01-15T09:00:00Z",
      description: "Work",
      customFieldValues: [{ customFieldId: "cf1", value: "x" }],
      fetch: async (i, x) => { seen.push(new Request(i, x)); return new Response(JSON.stringify({ id: "te1" }), { status: 201 }); },
    });
    expect(JSON.parse(await seen[0]!.text())).toEqual({
      start: "2024-01-15T09:00:00Z",
      description: "Work",
      customFields: [{ customFieldId: "cf1", value: "x" }],
    });
  });
});
