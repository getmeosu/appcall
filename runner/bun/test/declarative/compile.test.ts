import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector, isDeclarativeManifest } from "../../src/declarative/compile";

const manifest = {
  key: "demo",
  name: "Demo",
  version: "0.1.0",
  runtime: "bun",
  auth: { type: "api_key", scopes: [] },
  network: { allowedHosts: ["api.demo.test"] },
  http: {
    baseUrl: "https://api.demo.test",
    auth: { field: "apiKey", in: "header", name: "Authorization", value: "Bearer {{apiKey}}" },
    headers: { "Content-Type": "application/json" },
    errors: { messagePaths: ["error.message", "message"] },
  },
  operations: {
    "contacts.create": {
      kind: "action",
      timeoutMs: 10000,
      maxInputBytes: 65536,
      maxResponseBytes: 1048576,
      title: "Create Contact",
      description: "Create a contact.",
      inputSchema: {
        type: "object",
        properties: { email: { type: "string" }, firstName: { type: "string" }, tags: { type: "array" } },
        required: ["email"],
      },
      request: {
        method: "POST",
        path: "/v1/contacts",
        body: { email: "{{email}}", first_name: "{{firstName}}", tags: "{{tags}}" },
        success: [200, 201],
        result: { contact: { id: "{{response.id}}", email: "{{response.email}}" } },
      },
    },
    "contacts.get": {
      kind: "action",
      timeoutMs: 10000,
      maxInputBytes: 4096,
      maxResponseBytes: 1048576,
      title: "Get Contact",
      description: "Fetch a contact.",
      inputSchema: { type: "object", properties: { contactId: { type: "string" }, expand: { type: "string" } }, required: ["contactId"] },
      request: {
        method: "GET",
        path: "/v1/contacts/{{contactId}}",
        query: { expand: "{{expand}}" },
      },
    },
    "contacts.list": {
      kind: "sync",
      timeoutMs: 10000,
      maxInputBytes: 4096,
      maxResponseBytes: 1048576,
      request: { method: "GET", path: "/v1/contacts" },
    },
  },
  models: ["contact"],
};

const objectHeaderManifest = {
  key: "object-header",
  name: "Object Header",
  runtime: "bun",
  auth: { type: "api_key", scopes: [] },
  network: { allowedHosts: ["api.object-header.test"] },
  http: {
    baseUrl: "https://api.object-header.test",
    auth: { field: "apiKey", in: "header", name: "Authorization", value: "Bearer {{apiKey}}" },
  },
  operations: {
    "reports.get": {
      kind: "action",
      inputSchema: { type: "object", properties: { filter: { type: "object" } } },
      request: { method: "GET", path: "/reports", headers: { "X-Filter": "{{filter}}" }, success: [200] },
    },
  },
};

const reservedQueryManifest = {
  key: "reserved-query",
  name: "Reserved Query",
  runtime: "bun",
  auth: { type: "api_key", scopes: [] },
  network: { allowedHosts: ["api.reserved-query.test"] },
  http: {
    baseUrl: "https://api.reserved-query.test",
    auth: { field: "apiKey", in: "header", name: "Authorization", value: "Bearer {{apiKey}}" },
  },
  operations: {
    "search.get": {
      kind: "action",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      request: {
        method: "GET",
        path: "/search",
        parameters: [
          { wireName: "q", inputName: "query", in: "query", style: "form", explode: true, allowReserved: true },
        ],
        success: [200],
      },
    },
  },
};

const structuredPathManifest = {
  key: "structured-path",
  name: "Structured Path",
  runtime: "bun",
  auth: { type: "api_key", scopes: [] },
  network: { allowedHosts: ["api.structured-path.test"] },
  http: {
    baseUrl: "https://api.structured-path.test",
    auth: { field: "apiKey", in: "header", name: "Authorization", value: "Bearer {{apiKey}}" },
  },
  operations: {
    "records.get": {
      kind: "action",
      inputSchema: { type: "object", properties: { recordId: { type: "string" } }, required: ["recordId"] },
      request: {
        method: "GET",
        path: "/records/{{recordId}}",
        parameters: [{ wireName: "recordId", inputName: "recordId", in: "path", style: "simple", explode: false }],
        success: [200],
      },
    },
  },
};

function okResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

describe("isDeclarativeManifest", () => {
  it("is true when at least one operation declares a request", () => {
    expect(isDeclarativeManifest(manifest)).toBe(true);
  });

  it("is false for a manifest whose operations are all hand-written", () => {
    expect(isDeclarativeManifest({ key: "x", operations: { a: { kind: "action" } } })).toBe(false);
  });
});

describe("compileDeclarativeConnector", () => {
  it("compiles only action operations that declare a request", () => {
    const compiled = compileDeclarativeConnector(manifest);
    expect(Object.keys(compiled.actions).sort()).toEqual(["contacts.create", "contacts.get"]);
  });

  it("does not compile sync operations, whose handler contract differs", () => {
    const compiled = compileDeclarativeConnector(manifest);
    expect(compiled.syncs).toEqual({});
    expect(compiled.actions["contacts.list"]).toBeUndefined();
  });

  it("returns a validated echo when the credential field is absent", () => {
    const compiled = compileDeclarativeConnector(manifest);
    const result = compiled.actions["contacts.create"]!({ email: "a@x.com", firstName: "Ada" }) as Record<string, unknown>;
    expect(result).toEqual({
      connector: "demo",
      action: "contacts.create",
      source: "connector",
      validated: { email: "a@x.com", firstName: "Ada" },
    });
  });

  it("throws the schema validation error when the echo input is invalid", () => {
    const compiled = compileDeclarativeConnector(manifest);
    expect(() => compiled.actions["contacts.create"]!({ firstName: "Ada" })).toThrow("email is required");
  });

  it("issues the live request with auth header, base URL, and rendered body", async () => {
    let seenUrl = "";
    let seenInit: RequestInit | undefined;
    const mockFetch = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      seenUrl = String(url);
      seenInit = init;
      return okResponse({ id: "c_1", email: "a@x.com" }, 201);
    };

    const compiled = compileDeclarativeConnector(manifest);
    const result = await compiled.actions["contacts.create"]!({
      apiKey: "k_live",
      email: "a@x.com",
      firstName: "Ada",
      tags: ["vip"],
      fetch: mockFetch,
    }) as Record<string, unknown>;

    expect(seenUrl).toBe("https://api.demo.test/v1/contacts");
    expect(seenInit?.method).toBe("POST");
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer k_live");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(seenInit?.body))).toEqual({ email: "a@x.com", first_name: "Ada", tags: ["vip"] });
    expect(result).toEqual({
      connector: "demo",
      action: "contacts.create",
      source: "provider",
      contact: { id: "c_1", email: "a@x.com" },
    });
  });

  it("omits body keys whose optional input is absent", async () => {
    let seenBody = "";
    const mockFetch = async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      seenBody = String(init?.body);
      return okResponse({ id: "c_2", email: "a@x.com" }, 201);
    };
    const compiled = compileDeclarativeConnector(manifest);
    await compiled.actions["contacts.create"]!({ apiKey: "k", email: "a@x.com", fetch: mockFetch });
    expect(JSON.parse(seenBody)).toEqual({ email: "a@x.com" });
  });

  it("interpolates path parameters and appends only the query params present", async () => {
    let seenUrl = "";
    const mockFetch = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      seenUrl = String(url);
      expect(init?.body).toBeUndefined();
      return okResponse({ id: "c_9" });
    };
    const compiled = compileDeclarativeConnector(manifest);
    await compiled.actions["contacts.get"]!({ apiKey: "k", contactId: "c 9", fetch: mockFetch });
    expect(seenUrl).toBe("https://api.demo.test/v1/contacts/c%209");

    await compiled.actions["contacts.get"]!({ apiKey: "k", contactId: "c1", expand: "company", fetch: mockFetch });
    expect(seenUrl).toBe("https://api.demo.test/v1/contacts/c1?expand=company");
  });

  it("serializes object-valued header templates as JSON", async () => {
    let seenHeader = "";
    const compiled = compileDeclarativeConnector(objectHeaderManifest as never);
    const filter = { status: "open" };
    await compiled.actions["reports.get"]!({
      apiKey: "k",
      filter,
      fetch: async (_url: RequestInfo | URL, init?: RequestInit) => {
        seenHeader = new Headers(init?.headers).get("X-Filter") ?? "";
        return okResponse({});
      },
    });
    expect(seenHeader).toBe(JSON.stringify(filter));
  });

  it("preserves reserved query characters when allowReserved is true", async () => {
    let seenUrl = "";
    const compiled = compileDeclarativeConnector(reservedQueryManifest as never);
    await compiled.actions["search.get"]!({
      apiKey: "k",
      query: "a&b[]",
      fetch: async (url: RequestInfo | URL) => {
        seenUrl = String(url);
        return okResponse({});
      },
    });

    expect(seenUrl).toBe("https://api.reserved-query.test/search?q=a&b[]");
  });

  it("keeps a reserved hash encoded so it remains part of the query value", async () => {
    let seenUrl = "";
    const compiled = compileDeclarativeConnector(reservedQueryManifest as never);
    await compiled.actions["search.get"]!({
      apiKey: "k",
      query: "a#b",
      fetch: async (url: RequestInfo | URL) => {
        seenUrl = String(url);
        return okResponse({});
      },
    });

    expect(seenUrl).toBe("https://api.reserved-query.test/search?q=a%23b");
    expect(new URL(seenUrl).searchParams.get("q")).toBe("a#b");
  });

  it("rejects dot path segments from structured path serialization", async () => {
    const compiled = compileDeclarativeConnector(structuredPathManifest as never);
    let fetchCalls = 0;
    await expect(compiled.actions["records.get"]!({
      apiKey: "k",
      recordId: "..",
      fetch: async () => {
        fetchCalls += 1;
        return okResponse({});
      },
    })).rejects.toMatchObject({ ok: false, code: "INVALID_ACTION_INPUT" });
    expect(fetchCalls).toBe(0);
  });

  it("rejects composed dot segments from structured path serialization", async () => {
    const composedManifest = {
      ...structuredPathManifest,
      operations: {
        "records.get": {
          ...structuredPathManifest.operations["records.get"],
          request: {
            ...structuredPathManifest.operations["records.get"].request,
            path: "/parent/.{{recordId}}",
          },
        },
      },
    };
    const compiled = compileDeclarativeConnector(composedManifest as never);
    let fetchCalls = 0;
    await expect(compiled.actions["records.get"]!({
      apiKey: "k",
      recordId: ".",
      fetch: async () => {
        fetchCalls += 1;
        return okResponse({});
      },
    })).rejects.toMatchObject({ ok: false, code: "INVALID_ACTION_INPUT" });
    expect(fetchCalls).toBe(0);
  });

  it("rejects static dot path segments while compiling a manifest", () => {
    const unsafeManifest = {
      ...structuredPathManifest,
      operations: {
        "records.get": {
          ...structuredPathManifest.operations["records.get"],
          request: {
            ...structuredPathManifest.operations["records.get"].request,
            path: "/records/../child",
          },
        },
      },
    };
    expect(() => compileDeclarativeConnector(unsafeManifest as never)).toThrow(/dot path segment/);
  });

  it("returns the raw body under data when the operation declares no result mapping", async () => {
    const mockFetch = async (): Promise<Response> => okResponse({ id: "c_9", name: "Ada" });
    const compiled = compileDeclarativeConnector(manifest);
    const result = await compiled.actions["contacts.get"]!({ apiKey: "k", contactId: "c9", fetch: mockFetch }) as Record<string, unknown>;
    expect(result.data).toEqual({ id: "c_9", name: "Ada" });
    expect(result.source).toBe("provider");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED with the Retry-After header", async () => {
    const mockFetch = async (): Promise<Response> => okResponse({ message: "slow down" }, 429, { "retry-after": "42" });
    const compiled = compileDeclarativeConnector(manifest);
    await expect(
      compiled.actions["contacts.get"]!({ apiKey: "k", contactId: "c9", fetch: mockFetch }),
    ).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 42,
    });
  });

  it("defaults the retry-after when the header is missing or unusable", async () => {
    const mockFetch = async (): Promise<Response> => okResponse({}, 429);
    const compiled = compileDeclarativeConnector(manifest);
    await expect(
      compiled.actions["contacts.get"]!({ apiKey: "k", contactId: "c9", fetch: mockFetch }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 10 });
  });

  it("maps any other non-success status to CONNECTOR_UPSTREAM_ERROR carrying the provider detail", async () => {
    const mockFetch = async (): Promise<Response> => okResponse({ error: { message: "record not found" } }, 404);
    const compiled = compileDeclarativeConnector(manifest);
    await expect(
      compiled.actions["contacts.get"]!({ apiKey: "k", contactId: "c9", fetch: mockFetch }),
    ).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "record not found",
    });
  });

  it("falls back to a generic message when the provider body carries no detail", async () => {
    const mockFetch = async (): Promise<Response> => new Response("<html>502</html>", { status: 502 });
    const compiled = compileDeclarativeConnector(manifest);
    await expect(
      compiled.actions["contacts.get"]!({ apiKey: "k", contactId: "c9", fetch: mockFetch }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Demo rejected the contacts.get request." });
  });

  it("rejects an outbound host that the manifest does not allow", async () => {
    const offManifest = {
      ...manifest,
      network: { allowedHosts: ["other.test"] },
    };
    const compiled = compileDeclarativeConnector(offManifest);
    await expect(
      compiled.actions["contacts.get"]!({ apiKey: "k", contactId: "c9", fetch: async () => okResponse({}) }),
    ).rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
  });

  it("validates the live input against the schema before calling the provider", async () => {
    let called = false;
    const mockFetch = async (): Promise<Response> => {
      called = true;
      return okResponse({});
    };
    const compiled = compileDeclarativeConnector(manifest);
    await expect(
      compiled.actions["contacts.create"]!({ apiKey: "k", firstName: "Ada", fetch: mockFetch }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT", message: "email is required" });
    expect(called).toBe(false);
  });

  it("supports a query-parameter credential", async () => {
    let seenUrl = "";
    const queryAuth = {
      ...manifest,
      http: { ...manifest.http, auth: { field: "token", in: "query", name: "access_token", value: "{{token}}" } },
    };
    const compiled = compileDeclarativeConnector(queryAuth);
    await compiled.actions["contacts.get"]!({
      token: "t_1",
      contactId: "c1",
      fetch: async (url: RequestInfo | URL) => {
        seenUrl = String(url);
        return okResponse({});
      },
    });
    expect(seenUrl).toBe("https://api.demo.test/v1/contacts/c1?access_token=t_1");
  });
});

describe("compileDeclarativeConnector (healthcheck echo)", () => {
  const healthManifest = {
    key: "demo",
    name: "Demo",
    network: { allowedHosts: ["api.demo.test"] },
    http: {
      baseUrl: "https://api.demo.test",
      auth: { field: "apiKey", in: "header", name: "Authorization", value: "Bearer {{apiKey}}" },
    },
    operations: {
      healthcheck: {
        kind: "action",
        timeoutMs: 5000,
        maxInputBytes: 4096,
        maxResponseBytes: 65536,
        inputSchema: { type: "object", properties: {} },
        request: { method: "GET", path: "/whoami", echo: { status: "ok" }, result: { status: "ok" } },
      },
    },
  };

  it("returns the declared echo instead of a validated payload without a credential", () => {
    const compiled = compileDeclarativeConnector(healthManifest);
    expect(compiled.actions.healthcheck!({})).toEqual({
      connector: "demo",
      action: "healthcheck",
      source: "connector",
      status: "ok",
    });
  });

  it("performs a real authenticated call when the credential is present", async () => {
    let seenAuth = "";
    const compiled = compileDeclarativeConnector(healthManifest);
    const result = await compiled.actions.healthcheck!({
      apiKey: "k",
      fetch: async (_url: RequestInfo | URL, init?: RequestInit) => {
        seenAuth = (init?.headers as Record<string, string>).Authorization ?? "";
        return new Response(JSON.stringify({ id: "u1" }), { status: 200 });
      },
    }) as Record<string, unknown>;
    expect(seenAuth).toBe("Bearer k");
    expect(result).toEqual({ connector: "demo", action: "healthcheck", source: "provider", status: "ok" });
  });

  it("surfaces a rejected credential as an upstream error", async () => {
    const compiled = compileDeclarativeConnector(healthManifest);
    await expect(
      compiled.actions.healthcheck!({
        apiKey: "bad",
        fetch: async () => new Response(JSON.stringify({ error: { message: "invalid token" } }), { status: 401 }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "invalid token" });
  });
});

describe("compileDeclarativeConnector (unix reset header)", () => {
  const unixManifest = {
    key: "demo",
    name: "Demo",
    network: { allowedHosts: ["api.demo.test"] },
    http: {
      baseUrl: "https://api.demo.test",
      auth: { field: "apiKey", in: "header", name: "Authorization", value: "{{apiKey}}" },
      errors: { retryAfterHeader: "x-ratelimit-reset", retryAfterKind: "unix", defaultRetryAfterSeconds: 60 },
    },
    operations: {
      "things.list": {
        kind: "action",
        timeoutMs: 5000,
        maxInputBytes: 4096,
        maxResponseBytes: 65536,
        inputSchema: { type: "object", properties: {} },
        request: { method: "GET", path: "/things", success: [200] },
      },
    },
  };

  function rateLimited(resetHeader: string) {
    const compiled = compileDeclarativeConnector(unixManifest);
    return compiled.actions["things.list"]!({
      apiKey: "k",
      fetch: async () => new Response("{}", { status: 429, headers: { "x-ratelimit-reset": resetHeader } }),
    });
  }

  it("converts an absolute reset time into a wait in seconds", async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 45;
    await expect(rateLimited(String(resetAt))).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 45,
    });
  });

  it("falls back to the declared default when the reset time has already passed", async () => {
    const resetAt = Math.floor(Date.now() / 1000) - 30;
    await expect(rateLimited(String(resetAt))).rejects.toMatchObject({ retryAfterSeconds: 60 });
  });

  it("falls back rather than asking a caller to wait years", async () => {
    await expect(rateLimited("99999999999")).rejects.toMatchObject({ retryAfterSeconds: 60 });
  });

  it("falls back when the header is missing or unparseable", async () => {
    await expect(rateLimited("not-a-number")).rejects.toMatchObject({ retryAfterSeconds: 60 });
  });

  it("still reads a plain seconds delta when the kind is not unix", async () => {
    const secondsManifest = {
      ...unixManifest,
      http: { ...unixManifest.http, errors: { retryAfterHeader: "retry-after", defaultRetryAfterSeconds: 60 } },
    };
    const compiled = compileDeclarativeConnector(secondsManifest);
    await expect(
      compiled.actions["things.list"]!({
        apiKey: "k",
        fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "12" } }),
      }),
    ).rejects.toMatchObject({ retryAfterSeconds: 12 });
  });
});

// --- Body-level failure detection -------------------------------------------
//
// A success status is not proof of success. GraphQL providers answer HTTP 200
// with a populated `errors` array, so a status-only check reports success on
// every error — the one failure mode a connector must never have.

function graphqlManifest(errors: Record<string, unknown>) {
  return {
    key: "gql",
    name: "GQL",
    network: { allowedHosts: ["api.example.com"] },
    http: {
      baseUrl: "https://api.example.com",
      auth: { field: "apiKey", in: "header", name: "Authorization", value: "{{apiKey}}" },
      errors,
    },
    operations: {
      "issues.create": {
        kind: "action",
        inputSchema: { type: "object", properties: { apiKey: { type: "string" } } },
        request: {
          method: "POST",
          path: "/graphql",
          success: [200],
          result: { id: "{{response.data.issueCreate.issue.id}}" },
        },
      },
    },
  } as never;
}

function respondWith(status: number, body: unknown, headers: Record<string, string> = {}) {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
}

describe("declarative body-level failures", () => {
  it("treats a 200 carrying a non-empty errors array as a failure", async () => {
    const connector = compileDeclarativeConnector(graphqlManifest({ bodyErrorPaths: ["errors"] }));
    const call = connector.actions["issues.create"]!({
      apiKey: "k",
      fetch: respondWith(200, {
        data: null,
        errors: [{ message: "Team not found", extensions: { code: "NOT_FOUND" } }],
      }),
    });
    await expect(call).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Team not found",
    });
  });

  it("lets a 200 with an empty errors array succeed", async () => {
    const connector = compileDeclarativeConnector(graphqlManifest({ bodyErrorPaths: ["errors"] }));
    const result = (await connector.actions["issues.create"]!({
      apiKey: "k",
      fetch: respondWith(200, { data: { issueCreate: { issue: { id: "iss_1" } } }, errors: [] }),
    })) as Record<string, unknown>;
    expect(result.id).toBe("iss_1");
    expect(result.source).toBe("provider");
  });

  it("does not treat a false boolean as an error, which Figma sends on success", async () => {
    const connector = compileDeclarativeConnector(graphqlManifest({ bodyErrorPaths: ["error"] }));
    const result = (await connector.actions["issues.create"]!({
      apiKey: "k",
      fetch: respondWith(200, { error: false, data: { issueCreate: { issue: { id: "iss_2" } } } }),
    })) as Record<string, unknown>;
    expect(result.id).toBe("iss_2");
  });

  it("classifies Linear's HTTP 400 RATELIMITED as a rate limit, not a generic failure", async () => {
    const connector = compileDeclarativeConnector(
      graphqlManifest({
        bodyErrorPaths: ["errors"],
        rateLimitCodePaths: ["errors.0.extensions.code"],
        rateLimitCodes: ["RATELIMITED"],
        defaultRetryAfterSeconds: 60,
      }),
    );
    const call = connector.actions["issues.create"]!({
      apiKey: "k",
      fetch: respondWith(400, {
        errors: [{ message: "rate limited", extensions: { code: "RATELIMITED" } }],
      }),
    });
    await expect(call).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 60,
    });
  });

  it("reads the retry delay from the body when the provider sends no header", async () => {
    const connector = compileDeclarativeConnector(
      graphqlManifest({
        bodyErrorPaths: ["errors"],
        rateLimitCodePaths: ["errors.0.extensions.code"],
        rateLimitCodes: ["ComplexityException"],
        retryAfterPaths: ["errors.0.extensions.retry_in_seconds"],
        defaultRetryAfterSeconds: 10,
      }),
    );
    const call = connector.actions["issues.create"]!({
      apiKey: "k",
      fetch: respondWith(200, {
        errors: [
          {
            message: "Complexity budget exhausted",
            extensions: { code: "ComplexityException", retry_in_seconds: 42 },
          },
        ],
      }),
    });
    await expect(call).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 42,
    });
  });

  it("leaves a manifest that declares no bodyErrorPaths completely unchanged", async () => {
    const connector = compileDeclarativeConnector(graphqlManifest({}));
    const result = (await connector.actions["issues.create"]!({
      apiKey: "k",
      fetch: respondWith(200, {
        data: { issueCreate: { issue: { id: "iss_3" } } },
        errors: [{ message: "ignored without opt-in" }],
      }),
    })) as Record<string, unknown>;
    expect(result.id).toBe("iss_3");
  });
});

// --- Per-tenant base URLs ----------------------------------------------------
//
// A provider whose host carries the tenant (self-managed GitLab, a Confluence
// site) cannot state its base URL statically. The setup field holds a BARE
// hostname and the manifest fixes the scheme, so the allowlist entry and
// url.hostname compare directly and no tenant value can downgrade to http.

const tenantManifest = {
  key: "tenant",
  name: "Tenant",
  network: { allowedHosts: ["{{host}}"] },
  auth: { setup: { fields: [{ key: "host", required: true }, { key: "apiKey", required: true }] } },
  http: {
    baseUrl: "https://{{host}}/api/v4",
    auth: { field: "apiKey", in: "header", name: "Authorization", value: "Bearer {{apiKey}}" },
  },
  operations: {
    "projects.get": {
      kind: "action",
      inputSchema: {
        type: "object",
        properties: { host: { type: "string" }, apiKey: { type: "string" }, id: { type: "string" } },
        required: ["id"],
      },
      request: { method: "GET", path: "/projects/{{id}}", success: [200], result: { id: "{{response.id}}" } },
    },
  },
} as never;

function recordingFetch(box: { url: string }) {
  return async (url: string) => {
    box.url = String(url);
    return new Response(JSON.stringify({ id: 42 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

describe("declarative per-tenant base URLs", () => {
  it("resolves the tenant host into the request URL", async () => {
    const box = { url: "" };
    const connector = compileDeclarativeConnector(tenantManifest);
    const result = (await connector.actions["projects.get"]!({
      host: "gitlab.acme.example",
      apiKey: "k",
      id: "42",
      fetch: recordingFetch(box),
    })) as Record<string, unknown>;
    expect(box.url).toBe("https://gitlab.acme.example/api/v4/projects/42");
    expect(result.id).toBe(42);
  });

  it("percent-encodes a namespaced project path", async () => {
    const box = { url: "" };
    const connector = compileDeclarativeConnector(tenantManifest);
    await connector.actions["projects.get"]!({
      host: "gitlab.acme.example",
      apiKey: "k",
      id: "diaspora/diaspora",
      fetch: recordingFetch(box),
    });
    expect(box.url).toContain("/projects/diaspora%2Fdiaspora");
  });

  it("refuses a host the tenant did not configure", async () => {
    const connector = compileDeclarativeConnector({
      ...(tenantManifest as Record<string, unknown>),
      network: { allowedHosts: ["gitlab.com"] },
    } as never);
    const call = connector.actions["projects.get"]!({
      host: "evil.example",
      apiKey: "k",
      id: "1",
      fetch: async () => new Response("{}", { status: 200 }),
    });
    await expect(call).rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
  });

  it("still honours a wildcard allowlist entry alongside a templated one", async () => {
    const box = { url: "" };
    const connector = compileDeclarativeConnector({
      ...(tenantManifest as Record<string, unknown>),
      network: { allowedHosts: ["*.atlassian.net"] },
    } as never);
    await connector.actions["projects.get"]!({
      host: "acme.atlassian.net",
      apiKey: "k",
      id: "1",
      fetch: recordingFetch(box),
    });
    expect(box.url).toBe("https://acme.atlassian.net/api/v4/projects/1");
  });

  it("refuses at compile time to template a base URL from an undeclared field", () => {
    expect(() =>
      compileDeclarativeConnector({
        ...(tenantManifest as Record<string, unknown>),
        auth: { setup: { fields: [{ key: "apiKey", required: true }] } },
      } as never),
    ).toThrow(/not a declared setup field/);
  });

  it("refuses to template a base URL from an OPTIONAL field, which the bundle may omit", () => {
    // connectorsetup writes a field into the bundle only when its value is
    // non-empty, so a blank optional field leaves the CALLER's host in the
    // runner input. Declared is not enough; it has to be required.
    expect(() =>
      compileDeclarativeConnector({
        ...(tenantManifest as Record<string, unknown>),
        auth: { setup: { fields: [{ key: "host" }, { key: "apiKey", required: true }] } },
      } as never),
    ).toThrow(/optional setup field/);
  });

  it("leaves a static base URL untouched", async () => {
    const box = { url: "" };
    const connector = compileDeclarativeConnector({
      ...(tenantManifest as Record<string, unknown>),
      network: { allowedHosts: ["api.static.test"] },
      http: { ...(tenantManifest as never as Record<string, never>).http, baseUrl: "https://api.static.test" },
    } as never);
    await connector.actions["projects.get"]!({ apiKey: "k", id: "7", fetch: recordingFetch(box) });
    expect(box.url).toBe("https://api.static.test/projects/7");
  });
});
