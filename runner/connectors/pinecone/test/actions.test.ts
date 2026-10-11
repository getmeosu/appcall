import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { pineconeActions } from "../src/actions";
import manifest from "../manifest.json";

const { actions: compiled } = compileDeclarativeConnector(manifest as never);
const actions = pineconeActions(compiled);
const fixtureRoot = join(import.meta.dir, "../fixtures");

type Fixture = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: Record<string, string>;
  exchanges: Array<{
    request: { method: string; url: string };
    response: { status: number; bodyFile?: string | null };
  }>;
  expected: { kind: string; code?: string; resultFile?: string | null; result?: unknown };
};

function loadCases(): Fixture[] {
  const dir = join(fixtureRoot, "cases");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as Fixture);
}

function comparable(url: string): { host: string; path: string; query: string[] } {
  const parsed = new URL(url);
  const query = [...parsed.searchParams.entries()].map(([key, value]) => `${key}=${value}`).sort();
  return { host: parsed.host, path: parsed.pathname, query };
}

describe("pinecone actions", () => {
  const cases = loadCases();
  const success = cases.filter((fixture) => fixture.expected.kind === "success");

  test("has a positive fixture for every operation", () => {
    const covered = new Set(success.map((fixture) => fixture.operation));
    expect([...covered].sort()).toEqual(Object.keys(manifest.operations).sort());
  });

  test.each(success)("executes $id against the documented endpoint", async (fixture) => {
    const exchange = fixture.exchanges[0]!;
    const calls: Request[] = [];
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(url, init);
      calls.push(request);
      if (!exchange.response.bodyFile) return new Response("", { status: exchange.response.status });
      const body = readFileSync(join(fixtureRoot, "cases", exchange.response.bodyFile));
      return new Response(body, {
        status: exchange.response.status,
        headers: { "content-type": "application/json" },
      });
    };
    const result = await actions[fixture.operation]!({
      ...fixture.input,
      ...fixture.credentials,
      fetch: fetchFn,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe(exchange.request.method);
    expect(comparable(calls[0]!.url)).toEqual(comparable(exchange.request.url));
    expect(calls[0]!.headers.get("api-key")).toBe(fixture.credentials.apiKey);
    expect(calls[0]!.headers.get("x-pinecone-api-version")).toBe("2026-04");
    const expected = fixture.expected.resultFile
      ? JSON.parse(readFileSync(join(fixtureRoot, "cases", fixture.expected.resultFile), "utf8"))
      : fixture.expected.result;
    expect(result).toEqual(expected);
  });

  test("rejects missing index name on the origin get operation", async () => {
    await expect(actions["indexes.get"]!({ apiKey: "pcsk_fixture" })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
  });

  test("maps unauthorized healthcheck to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(
      actions.healthcheck!({
        apiKey: "bad",
        fetch: async () => new Response("Invalid API key", { status: 401 }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("sends NDJSON records on namespace upsert", async () => {
    const records = [{ _id: "rec-1", chunk_text: "A space odyssey" }];
    let body = "";
    let contentType = "";
    await actions["namespaces.records.upsert"]!({
      apiKey: "pcsk_fixture",
      namespace: "movies",
      index_host: "docs-example-govk0nt.svc.aped-4627-b74a.pinecone.io",
      records,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        body = await request.text();
        contentType = request.headers.get("content-type") ?? "";
        return new Response(JSON.stringify({ upsertedCount: 1 }), { status: 201 });
      },
    });
    expect(contentType).toBe("application/x-ndjson");
    expect(body).toBe(JSON.stringify(records[0]));
  });
});
