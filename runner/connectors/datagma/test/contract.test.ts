import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../datagma.coverage.json";
import manifest from "../manifest.json";

const liveTools = [
  "DATAGMA_DETECT_JOB_CHANGE",
  "DATAGMA_ENRICH_PERSON_OR_COMPANY",
  "DATAGMA_FIND_WORK_EMAIL",
  "DATAGMA_GET_CREDITS",
  "DATAGMA_GET_TWITTER_BY_EMAIL",
  "DATAGMA_GET_TWITTER_BY_USERNAME",
  "DATAGMA_REVERSE_PHONE_LOOKUP",
  "DATAGMA_SEARCH_PHONE_NUMBERS",
] as const;

const routes = {
  "people.enrich": { method: "GET", path: "/v2/full" },
  "email.find": { method: "GET", path: "/v8/findEmail" },
  "phones.search": { method: "GET", path: "/v1/search" },
  "credits.get": { method: "GET", path: "/v1/mine" },
  "twitter.by-email": { method: "GET", path: "/v1/twitter/by_email" },
  "twitter.by-username": { method: "GET", path: "/v1/twitter/by_username" },
  "phones.reverse": { method: "GET", path: "/v1/reverse_phone_lookup" },
  "job-change.detect": { method: "GET", path: "/v4/update" },
} as const;

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

describe("Datagma contract", () => {
  test("uses the apiId query key on gateway.datagma.net", () => {
    expect(manifest.key).toBe("datagma");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.network.allowedHosts).toEqual(["gateway.datagma.net"]);
    expect(manifest.http.baseUrl).toBe("https://gateway.datagma.net/api/ingress");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "query",
      name: "apiId",
      value: "{{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
    expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(routes).sort());
  });

  test("maps each live tool to one body-less JSON GET", () => {
    const mapped = coverage.mapped.map((row) => row.tool);
    const missing = coverage.missing_still.map((row: { tool?: string } | string) =>
      typeof row === "string" ? row : row.tool,
    );
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.composio_tools).toBe(liveTools.length);
    expect([...mapped, ...missing].sort()).toEqual([...liveTools].sort());
    expect(mapped.length + missing.length).toBe(liveTools.length);
    const seen = new Set<string>();
    for (const row of coverage.mapped) {
      const operation = manifest.operations[row.operation as keyof typeof routes];
      const route = routes[row.operation as keyof typeof routes];
      expect(operation.kind, row.tool).toBe("action");
      expect(operation.sideEffect, row.tool).toBe("read");
      expect(operation.title.length, row.tool).toBeGreaterThan(0);
      expect(operation.description.length, row.tool).toBeGreaterThan(0);
      expect(operation.timeoutMs, row.tool).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, row.tool).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes, row.tool).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes, row.tool).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.inputSchema.type, row.tool).toBe("object");
      expect(operation.inputSchema.additionalProperties, row.tool).toBe(false);
      expect(operation.outputSchema.type, row.tool).toBe("object");
      expect(operation.enforceOutputSchema, row.tool).toBe(true);
      expect(operation.validationMode, row.tool).toBe("strict-generated");
      expect(operation.responseFormat, row.tool).toBe("json");
      expect(operation.request.method, row.tool).toBe(route.method);
      expect(operation.request.path, row.tool).toBe(route.path);
      expect(operation.request.method, row.tool).toBe(row.method);
      expect(operation.request.path, row.tool).toBe(row.path);
      expect(operation.request.success, row.tool).toEqual([200]);
      expect(operation.request.body, row.tool).toBeUndefined();
      expect(JSON.stringify(operation.request.headers ?? {}), row.tool).not.toContain("Content-Type");
      expect(JSON.stringify(operation.request.query), row.tool).not.toContain("://{{");
      seen.add(row.operation);
    }
    expect([...seen].sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(new Set(coverage.mapped.map((row) => `${row.method} ${row.path}`)).size).toBe(liveTools.length);
  });

  test("sends apiId on the query string and omits unset filters", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    const result = await actions["people.enrich"]!({
      apiKey: "secret-token",
      data: "algolia.com",
      companyPremium: true,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ person: { basic: { name: "Ada" } }, creditBurn: "2" });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    const url = new URL(seen[0].url);
    expect(url.origin).toBe("https://gateway.datagma.net");
    expect(url.pathname).toBe("/api/ingress/v2/full");
    expect(url.searchParams.get("apiId")).toBe("secret-token");
    expect(url.searchParams.get("data")).toBe("algolia.com");
    expect(url.searchParams.get("companyPremium")).toBe("true");
    expect(url.searchParams.has("whatsappCheck")).toBe(false);
    expect(url.searchParams.has("debug")).toBe(false);
    expect(result.data).toEqual({ person: { basic: { name: "Ada" } }, creditBurn: "2" });
  });

  test("sends phone search WhatsApp as whatsapp_check and strips echoed api keys", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    const credits = await actions["credits.get"]!({
      apiKey: "secret-token",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ id: 1, email: "owner@example.com", apiId: "secret-token", currentCredit: "3" });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/api/ingress/v1/mine");
    expect(new URL(seen[0].url).searchParams.has("email")).toBe(false);
    expect(credits.data).toEqual({ id: 1, email: "owner@example.com", currentCredit: "3" });

    const phoneSeen: Request[] = [];
    await actions["phones.search"]!({
      apiKey: "secret-token",
      email: "ada@example.com",
      whatsappCheck: false,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        phoneSeen.push(new Request(input, init));
        return response({ personsCount: 0, person: {} });
      },
    });
    const phoneUrl = new URL(phoneSeen[0].url);
    expect(phoneUrl.pathname).toBe("/api/ingress/v1/search");
    expect(phoneUrl.searchParams.get("whatsapp_check")).toBe("false");
    expect(phoneUrl.searchParams.has("whatsappCheck")).toBe(false);
    expect(phoneUrl.searchParams.has("apiId")).toBe(true);
    expect(phoneUrl.searchParams.has("username")).toBe(false);
  });

  test("rejects email-only job change, a free-form URL, bad input, arrays, 401, and 429", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    await expect(actions["job-change.detect"]!({
      apiKey: "secret-token",
      email: "ada@example.com",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["phones.reverse"]!({
      apiKey: "secret-token",
      phone: "+14155552671",
      url: "https://evil.example/lookup",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["people.enrich"]!({
      apiKey: "secret-token",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["twitter.by-username"]!({
      apiKey: "secret-token",
      username: "AdaLovelace",
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["credits.get"]!({
      apiKey: "secret-token",
      fetch: async () => response({ message: "unauthorized" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["email.find"]!({
      apiKey: "secret-token",
      fullName: "Ada Lovelace",
      company: "analytical.example",
      fetch: async () => response({ message: "slow down" }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
