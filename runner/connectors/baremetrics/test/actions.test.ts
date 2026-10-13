import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "./recipe-fixtures";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, {
  kind?: string;
  sideEffect?: string;
  responseFormat?: string;
  validationMode?: string;
  enforceOutputSchema?: boolean;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  inputSchema?: { type?: string; additionalProperties?: boolean; required?: string[] };
  outputSchema?: { type?: string; properties?: Record<string, { type?: string }> };
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, string>; query?: Record<string, string> };
}>;

const actionKeys = Object.entries(operations)
  .filter(([, operation]) => operation.kind === "action")
  .map(([key]) => key);
const { actions } = compileDeclarativeConnector(manifest as never);

const added = {
  BAREMETRICS_GET_ACCOUNT: { method: "GET", path: "/v1/account" },
  BAREMETRICS_GET_COHORTS: { method: "GET", path: "/v1/metrics/cohorts" },
  BAREMETRICS_GET_METRIC_TREND: { method: "GET", path: "/v1/metrics/{{metric}}" },
} as const;

function headersOf(init?: RequestInit): Headers {
  return new Headers(init?.headers);
}

describe("Baremetrics depth fixtures", () => {
  it("keeps the pinned host and the existing metrics and sources reads", () => {
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.http.baseUrl).toBe("https://api.baremetrics.com");
    expect(manifest.http.auth).toEqual({ field: "apiKey", name: "Authorization", value: "Bearer {{apiKey}}" });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.network.allowedHosts).toEqual(["api.baremetrics.com"]);
    expect(Object.keys(operations)).toHaveLength(23);
    expect(operations["metrics.summary"]?.request).toEqual({
      method: "GET",
      path: "/v1/metrics",
      success: [200],
      query: { start_date: "{{startDate}}", end_date: "{{endDate}}" },
    });
    expect(operations["sources.list"]?.request).toEqual({
      method: "GET",
      path: "/v1/sources",
      success: [200],
    });
    expect(operations["healthcheck"]?.request?.path).toBe("/v1/sources");
  });

  it("adds only the three documented JSON GET routes", () => {
    for (const [name, spec] of Object.entries(added)) {
      const operation = operations[name];
      expect(operation, name).toBeDefined();
      expect(operation?.kind, name).toBe("action");
      expect(operation?.sideEffect, name).toBe("read");
      expect(operation?.responseFormat, name).toBe("json");
      expect(operation?.validationMode, name).toBe("strict-generated");
      expect(operation?.enforceOutputSchema, name).toBe(true);
      expect(operation?.outputSchema?.type, name).toBe("object");
      expect(operation?.inputSchema?.type, name).toBe("object");
      expect(operation?.inputSchema?.additionalProperties, name).toBe(false);
      expect(operation?.request?.method, name).toBe(spec.method);
      expect(operation?.request?.path, name).toBe(spec.path);
      expect(operation?.request?.body, name).toBeUndefined();
      expect(operation?.request?.headers, name).toBeUndefined();
      expect(operation?.timeoutMs ?? 0, name).toBeGreaterThanOrEqual(1);
      expect(operation?.timeoutMs ?? 0, name).toBeLessThanOrEqual(300000);
      expect(operation?.maxInputBytes ?? 0, name).toBeLessThanOrEqual(26214400);
      expect(operation?.maxResponseBytes ?? 0, name).toBeGreaterThanOrEqual(operation?.maxInputBytes ?? 0);
      expect(actions[name], name).toBeTypeOf("function");
    }
    expect(operations.BAREMETRICS_GET_COHORTS?.outputSchema?.properties?.data?.type).toBe("array");
    expect(operations.BAREMETRICS_GET_METRIC_TREND?.request?.query).toEqual({
      start_date: "{{startDate}}",
      end_date: "{{endDate}}",
      compare_to: "{{compareTo}}",
    });
    const placeholders = [...String(operations.BAREMETRICS_GET_METRIC_TREND?.request?.path).matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
    expect(placeholders).toEqual(["metric"]);
    expect(String(operations.BAREMETRICS_GET_COHORTS?.request?.path)).not.toContain("{{");
  });

  it("sends body-less GETs with no Content-Type", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      const path = new URL(String(url)).pathname;
      const body = path.endsWith("/cohorts") ? [] : { ok: true };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    };
    await actions.BAREMETRICS_GET_ACCOUNT!({ apiKey: "token", fetch: fetchFn });
    await actions.BAREMETRICS_GET_COHORTS!({ apiKey: "token", fetch: fetchFn });
    await actions.BAREMETRICS_GET_METRIC_TREND!({
      apiKey: "token",
      metric: "mrr",
      startDate: "2016-11-01",
      endDate: "2016-11-26",
      fetch: fetchFn,
    });
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/v1/account",
      "/v1/metrics/cohorts",
      "/v1/metrics/mrr",
    ]);
    expect(new URL(calls[2]!.url).search).toBe("?start_date=2016-11-01&end_date=2016-11-26");
    for (const call of calls) {
      expect(new URL(call.url).protocol).toBe("https:");
      expect(new URL(call.url).host).toBe("api.baremetrics.com");
      expect(call.init?.method).toBe("GET");
      expect(call.init?.body ?? null).toBeNull();
      expect(headersOf(call.init).get("content-type")).toBeNull();
      expect(headersOf(call.init).get("accept")).toBe("application/json");
      expect(headersOf(call.init).get("authorization")).toBe("Bearer token");
    }
  });

  it("replays authenticated fixture cases", async () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      if (run.status !== "passed") {
        throw new Error(`${run.caseId}: ${run.error}`);
      }
    }
  });

  it("covers every declared action with a positive fixture and skips EventOnly webhooks", () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const positive = new Set(cases.filter((c) => c.expected.kind === "success").map((c) => c.operation));
    expect([...positive].sort()).toEqual([...actionKeys].sort());
    for (const key of Object.keys(operations)) {
      if (key.startsWith("webhook.")) {
        expect(positive.has(key)).toBe(false);
      }
    }
  });
});
