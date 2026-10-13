import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import coverage from "../../botster.coverage.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const operations = manifest.operations as Record<string, {
  kind?: string;
  sideEffect?: string;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  title?: string;
  description?: string;
  responseFormat?: string;
  validationMode?: string;
  enforceOutputSchema?: boolean;
  inputSchema?: { type?: string; additionalProperties?: boolean; required?: string[] };
  outputSchema?: { type?: string; additionalProperties?: boolean };
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, string>; query?: Record<string, unknown>; success?: number[] };
}>;

const LIVE = [
  "BOTSTER_CALCULATE_BOT_COST",
  "BOTSTER_DELETE_JOB",
  "BOTSTER_DELETE_RUN",
  "BOTSTER_GET_CREDITS",
  "BOTSTER_GET_JOB",
  "BOTSTER_GET_RUN_RESULTS",
  "BOTSTER_LAUNCH_BOT",
  "BOTSTER_LIST_BOTS",
  "BOTSTER_LIST_JOBS",
  "BOTSTER_RESTART_JOB",
  "BOTSTER_SET_JOB_ARCHIVED",
] as const;

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

type Seen = { method: string; url: string; body: string | null; headers: Headers };

function capture(seen: Seen[]) {
  return async (input: string | URL, init?: RequestInit) => {
    seen.push({
      method: String(init?.method ?? "GET"),
      url: String(input),
      body: init?.body == null ? null : String(init.body),
      headers: new Headers(init?.headers),
    });
    return response({ id: "6e9c-4e8e-a75a" });
  };
}

describe("Botster contract", () => {
  test("uses bearer auth on the documented host", () => {
    expect(manifest.key).toBe("botster");
    expect(manifest.network.allowedHosts).toEqual(["botster.io"]);
    expect(manifest.http.baseUrl).toBe("https://botster.io/api/v2");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
  });

  test("maps each live tool once and leaves only the two-route archive tool unmapped", () => {
    expect(coverage.composio_tools).toBe(11);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.mapped).toHaveLength(10);
    expect(coverage.missing_still).toEqual([
      {
        tool: "BOTSTER_SET_JOB_ARCHIVED",
        why: "archived true is POST /jobs/{id}/archive and false is POST /jobs/{id}/unarchive, so the tool selects more than one route.",
      },
    ]);
    const tools = [
      ...coverage.mapped.map((entry: { tool: string }) => entry.tool),
      ...coverage.missing_still.map((entry: { tool: string }) => entry.tool),
    ].sort();
    expect(tools).toEqual([...LIVE].sort());
    expect(Object.keys(manifest.operations).sort()).toEqual(
      coverage.mapped.map((entry: { operation: string }) => entry.operation).sort(),
    );
    for (const entry of coverage.mapped as Array<{ tool: string; operation: string; method: string; path: string }>) {
      const request = operations[entry.operation]?.request;
      expect(request?.method, entry.tool).toBe(entry.method);
      expect(request?.path, entry.tool).toBe(entry.path);
      expect(request?.path, entry.tool).not.toContain("archive");
    }
  });

  test("keeps one JSON route, object output, and budgets inside the contract", () => {
    const httpHeaders = (manifest.http.headers ?? {}) as Record<string, string>;
    expect(httpHeaders["Content-Type"] ?? httpHeaders["content-type"]).toBeUndefined();
    for (const [name, operation] of Object.entries(operations)) {
      expect(operation.kind, name).toBe("action");
      expect(operation.title, name).toBeString();
      expect(operation.description, name).toBeString();
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.validationMode, name).toBe("strict-generated");
      expect(operation.enforceOutputSchema, name).toBe(true);
      expect(operation.outputSchema?.type, name).toBe("object");
      expect(operation.inputSchema?.type, name).toBe("object");
      expect(operation.inputSchema?.additionalProperties, name).toBe(false);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
      const request = operation.request;
      expect(request?.success, name).toEqual([200]);
      expect(String(request?.path ?? "").startsWith("/"), name).toBe(true);
      if (request?.method === "GET" || request?.method === "DELETE") {
        expect(request.body, name).toBeUndefined();
        expect(request.headers?.["Content-Type"] ?? request.headers?.["content-type"], name).toBeUndefined();
      }
      if (request?.body !== undefined) {
        expect(request.headers?.["Content-Type"], name).toBe("application/json");
      }
      if (name.startsWith("webhook.")) expect(operation.sideEffect, name).toBe("read");
    }
    expect(operations["jobs.delete"]?.sideEffect).toBe("destructive");
    expect(operations["runs.delete"]?.sideEffect).toBe("destructive");
    expect(operations["bots.calculate"]?.sideEffect).toBe("read");
    expect(operations["bots.launch"]?.sideEffect).toBe("write");
    expect(operations["jobs.restart"]?.request?.body).toBeUndefined();
  });

  test("sends launch options as sibling keys and does not follow another host", async () => {
    const seen: Seen[] = [];
    const result = await actions["bots.launch"]!({
      apiKey: "secret",
      botSlug: "a/b",
      body: {
        input: ["https://example.com"],
        max_pages: "100",
        contact_filter: { filter: ["email"] },
        webhook: "https://example.com/output",
      },
      fetch: capture(seen),
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(new URL(seen[0].url).hostname).toBe("botster.io");
    expect(new URL(seen[0].url).pathname).toBe("/api/v2/bots/a%2Fb");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(seen[0].body ?? "")).toEqual({
      input: ["https://example.com"],
      max_pages: "100",
      contact_filter: { filter: ["email"] },
      webhook: "https://example.com/output",
    });
    expect(seen[0].body).not.toContain("secret");
    expect(result.data).toEqual({ id: "6e9c-4e8e-a75a" });
  });

  test("prices the same flat body and keeps an array run result under data", async () => {
    const priced: Seen[] = [];
    await actions["bots.calculate"]!({
      apiKey: "secret",
      botSlug: "linkedin-profile-scraper",
      body: { input: "https://www.linkedin.com/in/example", scrape_experience: 0 },
      fetch: capture(priced),
    });
    expect(priced[0].url).toBe("https://botster.io/api/v2/bots/linkedin-profile-scraper/calculate");
    expect(JSON.parse(priced[0].body ?? "")).toEqual({
      input: "https://www.linkedin.com/in/example",
      scrape_experience: 0,
    });
    const runs = await actions["runs.get"]!({
      apiKey: "secret",
      runId: "74f1f559-aeea-4b96-9742-81e1d14d16d5",
      fetch: async () => response([{ url: "https://www.example.com" }]),
    });
    expect(runs.data).toEqual([{ url: "https://www.example.com" }]);
  });

  test("lists with documented query params and omits unset cursors", async () => {
    const seen: Seen[] = [];
    await actions["bots.list"]!({
      apiKey: "secret",
      search: "scraping",
      fetch: capture(seen),
    });
    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe("https://botster.io/api/v2/bots?search=scraping");
    expect(seen[0].body).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    const paged: Seen[] = [];
    await actions["jobs.list"]!({
      apiKey: "secret",
      page: 1,
      per: 50,
      nextCursor: "cursor-2",
      fetch: capture(paged),
    });
    expect(paged[0].url).toBe("https://botster.io/api/v2/jobs?page=1&per=50&next_cursor=cursor-2");
    expect(paged[0].body).toBeNull();
  });

  test("restarts and deletes without a body", async () => {
    const restarted: Seen[] = [];
    await actions["jobs.restart"]!({
      apiKey: "secret",
      jobId: "6e9c-4e8e-a75a",
      fetch: capture(restarted),
    });
    expect(restarted[0].method).toBe("POST");
    expect(restarted[0].url).toBe("https://botster.io/api/v2/jobs/6e9c-4e8e-a75a/restart");
    expect(restarted[0].body).toBeNull();
    expect(restarted[0].headers.get("content-type")).toBeNull();
    const deleted: Seen[] = [];
    await actions["jobs.delete"]!({
      apiKey: "secret",
      jobId: "6e9c-4e8e-a75a",
      fetch: capture(deleted),
    });
    expect(deleted[0].method).toBe("DELETE");
    expect(deleted[0].body).toBeNull();
    expect(deleted[0].headers.get("authorization")).toBe("Bearer secret");
  });

  test("rejects a second route, empty JSON, text, and 204", async () => {
    await expect(actions["jobs.delete"]!({
      apiKey: "secret",
      jobId: "6e9c-4e8e-a75a",
      fetch: async () => new Response(null, { status: 204 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["credits.get"]!({
      apiKey: "secret",
      fetch: async () => new Response("", { status: 200 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["credits.get"]!({
      apiKey: "secret",
      fetch: async () => new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    const seen: number[] = [];
    await expect(actions["credits.get"]!({
      apiKey: "secret",
      fetch: async () => {
        seen.push(1);
        return new Response("", { status: 302, headers: { location: "https://evil.example/credits" } });
      },
    })).rejects.toMatchObject({ code: "OUTBOUND_REDIRECT_BLOCKED" });
    expect(seen).toEqual([1]);
  });

  test("validates input and classifies 401 and 429", async () => {
    await expect(actions["bots.launch"]!({
      apiKey: "secret",
      botSlug: "",
      body: { input: "https://example.com" },
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["bots.launch"]!({
      apiKey: "secret",
      botSlug: "..",
      body: { input: "https://example.com" },
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["bots.launch"]!({
      apiKey: "secret",
      botSlug: "contact-data-scraper",
      options: { limit: 1 },
      body: { input: "https://example.com" },
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["bots.calculate"]!({
      apiKey: "secret",
      botSlug: "linkedin-profile-scraper",
      body: {},
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["bots.list"]!({
      apiKey: "secret",
      per: 0,
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["credits.get"]!({
      apiKey: "fixture-api-token",
      fetch: async () => response({ message: "bad fixture-api-token" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "bad [REDACTED]" });
    await expect(actions["jobs.list"]!({
      apiKey: "secret",
      fetch: async () => response({ message: "slow down" }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("does not call the network without the API token", async () => {
    let called = false;
    const result = await actions["credits.get"]!({
      fetch: async () => {
        called = true;
        return response({});
      },
    });
    expect(called).toBe(false);
    expect(result.source).toBe("connector");
  });
});
