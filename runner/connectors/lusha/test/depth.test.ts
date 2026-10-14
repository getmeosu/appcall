import { describe, expect, test } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

// The 13 Composio LUSHA_* tools implemented by the L2 depth pass as
// declarative operations. Every entry must keep a concrete request in the
// manifest and replay a documented success fixture.
const l2Operations = [
  "account.usage",
  "audit_logs.list",
  "audit_logs.stats",
  "companies.filters.values",
  "contacts.enrich",
  "contacts.prospecting",
  "contacts.search",
  "contacts.search_and_enrich",
  "subscriptions.create",
  "subscriptions.delete",
  "subscriptions.get",
  "subscriptions.list",
  "subscriptions.update",
];

const { actions } = compileDeclarativeConnector(manifest as never);

function mockFetch(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  };
  return { calls, fetchFn };
}

describe("lusha L2 depth contract", () => {
  test("every L2 tool maps to a declarative operation with a method and path", () => {
    const operations = manifest.operations as Record<string, { request?: { method?: string; path?: string } }>;
    for (const key of l2Operations) {
      expect(operations[key]?.request?.method, key).toBeTruthy();
      expect(operations[key]?.request?.path, key).toBeTruthy();
      expect(typeof actions[key], key).toBe("function");
    }
  });

  test("replays the documented L2 fixture cases", async () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    expect(runs.length).toBe(l2Operations.length);
    for (const run of runs) {
      if (run.status !== "passed") throw new Error(`${run.caseId}: ${run.error}`);
    }
  });

  test("covers every L2 operation with a positive fixture", () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const positive = new Set(cases.filter((c) => c.expected.kind === "success").map((c) => c.operation));
    expect([...positive].sort()).toEqual([...l2Operations].sort());
  });
});

describe("lusha L2 behavior", () => {
  test("rejects missing required input before any network call", () => {
    expect(() => actions["contacts.search"]!({})).toThrow("contacts is required");
    expect(() => actions["subscriptions.get"]!({})).toThrow("id is required");
  });

  test("rejects unknown input fields declared closed by the manifest", () => {
    expect(() => actions["account.usage"]!({ surprise: true })).toThrow("Unsupported input field");
  });

  test("percent-encodes the filter type path segment and passes the query text", async () => {
    const { calls, fetchFn } = mockFetch({ values: ["51-200"] });
    await actions["companies.filters.values"]!({ apiKey: "k", filterType: "sizes / odd", query: "51", fetch: fetchFn });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v3/companies/prospecting/filters/sizes%20%2F%20odd");
    expect(url.searchParams.get("query")).toBe("51");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED with the documented default backoff", async () => {
    const { fetchFn } = mockFetch({}, 429);
    await expect(actions["audit_logs.list"]!({ apiKey: "k", fetch: fetchFn })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 10,
    });
  });

  test("surfaces the provider message on an upstream failure", async () => {
    const { fetchFn } = mockFetch({ statusCode: 401, message: "Invalid API key" }, 401);
    await expect(actions["account.usage"]!({ apiKey: "bad", fetch: fetchFn })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Invalid API key",
    });
  });

  test("keeps outbound traffic inside the declared host allowlist", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.lusha.com"]);
  });
});
