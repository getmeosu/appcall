import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const casesDir = new URL("../fixtures/cases/", import.meta.url);

type FixtureCase = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: { apiKey: string };
  exchanges: Array<{
    request: { method: string; url: string; headers: Record<string, string>; body: string | null };
    response: { status: number; headers?: Record<string, string>; bodyFile: string };
  }>;
  expected: { kind: string; resultFile: string };
};

function loadCases(): FixtureCase[] {
  return readdirSync(casesDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(readFileSync(new URL(file, casesDir), "utf8")) as FixtureCase);
}

const jsonResponse = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const progressBody = {
  transcript: { id: 42, filename: "report.pdf", status: "analyzed" },
  analysis: { entities: [], facts: [] },
};

describe("brain-graph actions", () => {
  test("replays one success fixture for every action", async () => {
    const cases = loadCases();
    const actionKeys = Object.entries(manifest.operations)
      .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
      .map(([key]) => key);
    const positive = cases.filter((item) => item.expected.kind === "success");
    expect(positive.map((item) => item.operation).sort()).toEqual([...actionKeys].sort());

    for (const item of positive) {
      const exchange = item.exchanges[0]!;
      const responseBody = readFileSync(new URL(exchange.response.bodyFile, new URL(`${item.id}.json`, casesDir)), "utf8");
      const expected = JSON.parse(readFileSync(new URL(item.expected.resultFile, new URL(`${item.id}.json`, casesDir)), "utf8"));
      const seen: { url: string; method: string; headers: Headers; body: string }[] = [];
      const result = await actions[item.operation]!({
        ...item.input,
        apiKey: item.credentials.apiKey,
        fetch: async (url: string | URL, init?: RequestInit) => {
          const request = new Request(url, init);
          seen.push({ url: request.url, method: request.method, headers: request.headers, body: await request.text() });
          return new Response(responseBody, { status: exchange.response.status, headers: exchange.response.headers });
        },
      });
      expect(seen, item.id).toHaveLength(1);
      expect(seen[0]!.method, item.id).toBe(exchange.request.method);
      expect(seen[0]!.url, item.id).toBe(exchange.request.url);
      expect(seen[0]!.headers.get("accept"), item.id).toBe("application/json");
      expect(seen[0]!.headers.get("x-api-key"), item.id).toBe(exchange.request.headers["X-API-Key"]);
      expect(seen[0]!.headers.get("authorization"), item.id).toBeNull();
      const sentBody = seen[0]!.body === "" ? null : seen[0]!.body;
      expect(sentBody, item.id).toBe(exchange.request.body);
      if (exchange.request.body === null) expect(seen[0]!.headers.get("content-type"), item.id).toBeNull();
      else expect(seen[0]!.headers.get("content-type"), item.id).toBe("application/json");
      expect(result, item.id).toEqual(expected);
    }
  });

  test("encodes the entity name and omits unset document filters", async () => {
    const listSeen: Request[] = [];
    await actions["documents.list"]!({
      apiKey: "tok",
      fetch: async (url: string | URL, init?: RequestInit) => {
        listSeen.push(new Request(url, init));
        return jsonResponse({ documents: [], totalCount: 0, limit: 20, offset: 0, hasMore: false });
      },
    });
    const listUrl = new URL(listSeen[0]!.url);
    expect(listUrl.pathname).toBe("/api/brain/documents");
    expect(listUrl.search).toBe("");
    expect(listSeen[0]!.method).toBe("GET");
    expect(listSeen[0]!.body).toBeNull();
    expect(listSeen[0]!.headers.get("content-type")).toBeNull();

    const resolveSeen: Request[] = [];
    await actions["entities.resolve"]!({
      apiKey: "tok",
      name: "A/B C",
      fetch: async (url: string | URL, init?: RequestInit) => {
        resolveSeen.push(new Request(url, init));
        return jsonResponse({ found: false, reason: "not_found", message: "No entity named \"A/B C\" found." });
      },
    });
    const resolveUrl = new URL(resolveSeen[0]!.url);
    expect(resolveUrl.pathname).toBe("/api/brain/entity/resolve");
    expect(resolveUrl.searchParams.get("name")).toBe("A/B C");
    expect(resolveSeen[0]!.headers.get("x-api-key")).toBe("tok");
    expect(resolveSeen).toHaveLength(1);
    expect(listSeen).toHaveLength(1);
  });

  test("sends search as one JSON object and does not follow a second route", async () => {
    const seen: Request[] = [];
    const result = await actions["brain.search"]!({
      apiKey: "tok",
      query: "pricing",
      fetch: async (url: string | URL, init?: RequestInit) => {
        seen.push(new Request(url, init));
        return jsonResponse({ results: [], totalResults: 0, query: "pricing" });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe("POST");
    expect(seen[0]!.url).toBe("https://itsbraingraph.ai/api/brain/search");
    expect(seen[0]!.headers.get("content-type")).toBe("application/json");
    expect(await seen[0]!.text()).toBe("{\"query\":\"pricing\"}");
    expect(result).toMatchObject({
      connector: "brain-graph",
      action: "brain.search",
      source: "provider",
      data: { results: [], totalResults: 0, query: "pricing" },
    });
  });

  test("rejects invalid input, a non-object body, 401, and 429", async () => {
    await expect(actions["documents.ingest-url"]!({
      apiKey: "tok",
      url: "",
      fetch: async () => jsonResponse({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["documents.progress"]!({
      apiKey: "tok",
      documentId: 0,
      fetch: async () => jsonResponse(progressBody),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["brain.search"]!({
      apiKey: "tok",
      query: "pricing",
      extra: true,
      fetch: async () => jsonResponse({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["brains.list"]!({
      apiKey: "tok",
      fetch: async () => jsonResponse([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["brains.list"]!({
      apiKey: "tok",
      fetch: async () => new Response("OK", { status: 200, headers: { "content-type": "text/plain" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["documents.progress"]!({
      apiKey: "tok",
      documentId: 42,
      fetch: async () => jsonResponse({ error: "Document not found" }, 404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["brains.list"]!({
      apiKey: "tok",
      fetch: async () => jsonResponse({ message: "Invalid API key" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["brain.search"]!({
      apiKey: "tok",
      query: "pricing",
      fetch: async () => jsonResponse({ message: "Rate limit exceeded" }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
