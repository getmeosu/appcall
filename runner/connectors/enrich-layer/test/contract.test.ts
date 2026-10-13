import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../enrich-layer.coverage.json";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
const credentials = { apiKey: "fixture-api-key" };
const liveTools = [
  "ENRICH_LAYER_CHECK_EMAIL_TYPE",
  "ENRICH_LAYER_ENRICH_COMPANY",
  "ENRICH_LAYER_ENRICH_PERSON",
  "ENRICH_LAYER_FIND_PERSON_BY_EMAIL",
  "ENRICH_LAYER_FIND_PERSON_BY_ROLE",
  "ENRICH_LAYER_FIND_SOCIAL_PROFILES_BY_PHONE",
  "ENRICH_LAYER_GET_CREDIT_BALANCE",
  "ENRICH_LAYER_RESOLVE_COMPANY",
  "ENRICH_LAYER_RESOLVE_PERSON",
];

describe("Enrich Layer declarative contract", () => {
  test("uses bearer auth on the documented host", () => {
    expect(manifest.key).toBe("enrich-layer");
    expect(manifest.http.baseUrl).toBe("https://enrichlayer.com/api/v2");
    expect(manifest.network.allowedHosts).toEqual(["enrichlayer.com"]);
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
    expect(Object.keys(manifest.operations)).toHaveLength(9);
  });

  test("maps each live tool to one JSON route inside the budget", () => {
    expect(coverage.composio_tools).toBe(9);
    expect(coverage.index_tools).toBe(9);
    expect(coverage.full_depth).toBe(true);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.missing_still).toEqual([]);
    expect(coverage.mapped.map((entry: { tool: string }) => entry.tool)).toEqual(liveTools);
    const seen = new Set<string>();
    for (const entry of coverage.mapped) {
      const operation = manifest.operations[entry.operation];
      expect(operation?.request?.method, entry.tool).toBe(entry.method);
      expect(operation?.request?.path, entry.tool).toBe(entry.path);
      expect(operation.request.body, entry.tool).toBeUndefined();
      expect(operation.request.headers?.["Content-Type"], entry.tool).toBeUndefined();
      expect(operation.outputSchema.type, entry.tool).toBe("object");
      expect(operation.inputSchema.type, entry.tool).toBe("object");
      expect(operation.inputSchema.additionalProperties, entry.tool).toBe(false);
      expect(JSON.stringify(operation.inputSchema), entry.tool).not.toContain("://");
      expect(operation.sideEffect, entry.tool).toBe("read");
      expect(operation.responseFormat, entry.tool).toBe("json");
      seen.add(entry.operation);
    }
    expect([...seen].sort()).toEqual(Object.keys(manifest.operations).sort());
  });

  test("keeps profile URLs in the query and omits unset filters", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response({ name: "Example" });
    };
    await actions["company.enrich"]!({
      ...credentials,
      url: "https://www.linkedin.com/company/example",
      fetch,
    });
    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe("https://enrichlayer.com/api/v2/company?url=https%3A%2F%2Fwww.linkedin.com%2Fcompany%2Fexample");
    expect(new URL(seen[0].url).host).toBe("enrichlayer.com");
    expect(seen[0].headers.get("authorization")).toBe("Bearer fixture-api-key");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");

    await actions["person.enrich"]!({
      ...credentials,
      twitter_profile_url: "https://x.com/example",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ full_name: "Ada Example" });
      },
    });
    const person = new URL(seen[1].url);
    expect(person.pathname).toBe("/api/v2/profile");
    expect(person.searchParams.get("twitter_profile_url")).toBe("https://x.com/example");
    expect(person.searchParams.has("profile_url")).toBe(false);
    expect(person.searchParams.has("facebook_profile_url")).toBe(false);
    expect(person.searchParams.has("skills")).toBe(false);

    await actions["person.findByEmail"]!({
      ...credentials,
      email: "ada@example.com",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ linkedin_profile_url: null });
      },
    });
    expect(new URL(seen[2].url).searchParams.has("lookup_depth")).toBe(false);

    await actions["credits.balance"]!({
      ...credentials,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ credit_balance: 4 });
      },
    });
    expect(seen[3].url).toBe("https://enrichlayer.com/api/v2/credit-balance");
  });

  test("rejects bad input, malformed JSON objects, 401, and 429", async () => {
    await expect(actions["email.checkType"]!({
      ...credentials,
      email: "",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["person.findByEmail"]!({
      ...credentials,
      email: "ada@example.com",
      lookup_depth: "medium",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["person.enrich"]!({
      ...credentials,
      skills: "include",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["person.enrich"]!({
      ...credentials,
      profile_url: "https://www.linkedin.com/in/example",
      twitter_profile_url: "https://x.com/example",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["company.resolve"]!({
      ...credentials,
      company_location: "US",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["credits.balance"]!({
      ...credentials,
      extra: true,
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["credits.balance"]!({
      ...credentials,
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["email.checkType"]!({
      ...credentials,
      email: "ada@example.com",
      fetch: async () => response({ is_disposable_email: false }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["company.enrich"]!({
      ...credentials,
      url: "https://www.linkedin.com/company/example",
      fetch: async () => response({ message: "bad fixture-api-key" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "bad [REDACTED]" });
    await expect(actions["credits.balance"]!({
      ...credentials,
      fetch: async () => response({ error: "slow down" }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("does not call the network without the API key", async () => {
    let called = false;
    const result = await actions["credits.balance"]!({
      fetch: async () => {
        called = true;
        return response({});
      },
    });
    expect(called).toBe(false);
    expect(result.source).toBe("connector");
  });
});
