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

describe("Extracta.ai fixtures", () => {
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
      expect(new URL(seen[0]!.url).host, item.id).toBe("api.extracta.ai");
      expect(seen[0]!.headers.get("accept"), item.id).toBe("application/json");
      expect(seen[0]!.headers.get("authorization"), item.id).toBe(exchange.request.headers.Authorization);
      const sentBody = seen[0]!.body === "" ? null : seen[0]!.body;
      expect(sentBody, item.id).toBe(exchange.request.body);
      if (exchange.request.body === null) expect(seen[0]!.headers.get("content-type"), item.id).toBeNull();
      else expect(seen[0]!.headers.get("content-type"), item.id).toBe("application/json");
      expect(result, item.id).toEqual(expected);
    }
  });

  test("sends fileId only when the same getBatchResults call includes it", async () => {
    const seen: string[] = [];
    const fetch = async (url: string | URL, init?: RequestInit) => {
      const request = new Request(url, init);
      seen.push(await request.text());
      return jsonResponse({ extractionId: "ext_1", batchId: "batch_1", status: "waiting" });
    };
    await actions["batches.results"]!({ apiKey: "tok", extractionId: "ext_1", batchId: "batch_1", fetch });
    await actions["batches.results"]!({ apiKey: "tok", extractionId: "ext_1", batchId: "batch_1", fileId: "file_1", fetch });
    expect(seen[0]).toBe('{"extractionId":"ext_1","batchId":"batch_1"}');
    expect(seen[1]).toBe('{"extractionId":"ext_1","batchId":"batch_1","fileId":"file_1"}');
  });

  test("rejects a free-form url, empty ids, a bad language, a non-object body, 401, and 429", async () => {
    await expect(actions["extractions.create"]!({
      apiKey: "tok",
      extractionDetails: { url: "https://evil.example/hook" },
      fetch: async () => jsonResponse({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["extractions.view"]!({
      apiKey: "tok",
      extractionId: "",
      fetch: async () => jsonResponse({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["extractions.create"]!({
      apiKey: "tok",
      extractionDetails: {
        name: "CVs",
        language: "Klingon",
        fields: [{ key: "name" }],
      },
      fetch: async () => jsonResponse({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["extractions.create"]!({
      apiKey: "tok",
      extractionDetails: {
        name: "CVs",
        language: "English",
        fields: [{ key: "name", url: "https://evil.example/file" }],
      },
      fetch: async () => jsonResponse({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["credits.get"]!({
      apiKey: "tok",
      baseUrl: "https://evil.example",
      fetch: async () => jsonResponse({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["credits.get"]!({
      apiKey: "tok",
      fetch: async () => jsonResponse([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["credits.get"]!({
      apiKey: "tok",
      fetch: async () => jsonResponse({ message: "no" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["credits.get"]!({
      apiKey: "tok",
      fetch: async () => jsonResponse({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
