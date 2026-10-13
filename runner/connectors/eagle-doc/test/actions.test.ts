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

describe("eagle-doc actions", () => {
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
      expect(seen[0]!.headers.get("api-key"), item.id).toBe(exchange.request.headers["api-key"]);
      expect(seen[0]!.headers.get("authorization"), item.id).toBeNull();
      const sentBody = seen[0]!.body === "" ? null : seen[0]!.body;
      expect(sentBody, item.id).toBe(exchange.request.body);
      expect(seen[0]!.headers.get("content-type"), item.id).toBeNull();
      expect(result, item.id).toEqual(expected);
    }
  });

  test("keeps usage reads on the documented host with no query", async () => {
    const seen: Request[] = [];
    const result = await actions["usage.logs"]!({
      apiKey: "tok",
      fetch: async (url: string | URL, init?: RequestInit) => {
        seen.push(new Request(url, init));
        return jsonResponse([{ pages: 1, time: "2025-02-28T09:59:16.621Z", timeRequested: "2025-02-28T09:59:08.292Z" }]);
      },
    });
    const url = new URL(seen[0]!.url);
    expect(url.hostname).toBe("de.eagle-doc.com");
    expect(url.pathname).toBe("/api/usage/v1/logs");
    expect(url.search).toBe("");
    expect(seen[0]!.headers.get("api-key")).toBe("tok");
    expect(seen).toHaveLength(1);
    expect(result.data).toHaveLength(1);
  });

  test("rejects extra input, a non-object quota body, a non-array history, 403, and 429", async () => {
    let called = false;
    await expect(actions["usage.current"]!({
      apiKey: "tok",
      file_url: "https://example.invalid/doc.pdf",
      fetch: async () => {
        called = true;
        return jsonResponse({});
      },
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
    await expect(actions["quota.management"]!({
      apiKey: "tok",
      fetch: async () => jsonResponse([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["usage.monthly"]!({
      apiKey: "tok",
      fetch: async () => jsonResponse({ quotaUsed: 1 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["quota.receipt"]!({
      apiKey: "tok",
      fetch: async () => jsonResponse({ message: "BadCredentialException" }, 403),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["usage.current"]!({
      apiKey: "tok",
      fetch: async () => jsonResponse({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
