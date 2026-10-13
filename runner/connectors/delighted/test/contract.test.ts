import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../delighted.coverage.json";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
const basic = (apiKey: string) => `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;

describe("Delighted contract", () => {
  test("maps every live tool to one JSON route on api.delighted.com", () => {
    const operations = manifest.operations as Record<string, {
      kind: string;
      sideEffect: string;
      title: string;
      description: string;
      timeoutMs: number;
      maxInputBytes: number;
      maxResponseBytes: number;
      responseFormat: string;
      inputSchema: { type: string };
      outputSchema: { type: string };
      request: { method: string; path: string; body?: unknown; baseUrl?: string; headers?: Record<string, string>; success: number[] };
    }>;
    expect(Object.keys(operations).sort()).toEqual(coverage.mapped.map((row) => row.operation).sort());
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.missing_still).toEqual([]);
    expect(coverage.mapped.length + coverage.missing_still.length).toBe(coverage.composio_tools);
    expect(coverage.composio_tools).toBe(13);
    expect(coverage.full_depth).toBe(true);
    expect(manifest.network.allowedHosts).toEqual(["api.delighted.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.delighted.com/v1");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      basic: { username: "{{apiKey}}", password: "" },
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    for (const row of coverage.mapped) {
      const operation = operations[row.operation];
      expect(operation.request.method).toBe(row.method);
      expect(operation.request.path).toBe(row.path);
    }
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind).toBe("action");
      expect(operation.request.path.startsWith("/")).toBe(true);
      expect(operation.request.baseUrl).toBeUndefined();
      expect(operation.responseFormat).toBe("json");
      expect(operation.outputSchema.type).toBe("object");
      expect(operation.inputSchema.type).toBe("object");
      expect(operation.title.length).toBeGreaterThan(0);
      expect(operation.description.length).toBeGreaterThan(0);
      expect(operation.maxResponseBytes).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxInputBytes).toBeLessThanOrEqual(26214400);
      expect(operation.timeoutMs).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs).toBeLessThanOrEqual(300000);
      expect(operation.request.success).not.toContain(204);
      const writesBody = operation.request.method === "POST";
      expect(operation.sideEffect).toBe(writesBody || operation.request.method === "DELETE" ? "write" : "read");
      expect(operation.request.body === undefined).toBe(!writesBody);
      expect(operation.request.headers?.["Content-Type"]).toBe(writesBody ? "application/json" : undefined);
      expect(actions[key]).toBeFunction();
    }
  });

  test("sends basic auth and omits Content-Type on body-less reads and deletes", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return json({ platform_id: "email", active: true, frequency: 7776000 });
    };
    const result = await actions["autopilot.email.configuration.get"]!({ apiKey: "secret-token", fetch });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("authorization")).toBe(basic("secret-token"));
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    expect(new URL(seen[0].url).hostname).toBe("api.delighted.com");
    expect(new URL(seen[0].url).pathname).toBe("/v1/autopilot/email.json");
    expect(result.data).toEqual({ platform_id: "email", active: true, frequency: 7776000 });

    const deleted: Request[] = [];
    await actions["survey-requests.pending.delete"]!({
      apiKey: "secret-token",
      person_email: "jony@appleseed.com",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        deleted.push(new Request(input, init));
        return json({ ok: true });
      },
    });
    expect(deleted[0].method).toBe("DELETE");
    expect(deleted[0].headers.get("content-type")).toBeNull();
    expect(await deleted[0].text()).toBe("");
    expect(new URL(deleted[0].url).pathname).toBe("/v1/people/jony%40appleseed.com/survey_requests/pending.json");
  });

  test("encodes person identifiers and does not follow the next link", async () => {
    const seen: Request[] = [];
    await actions["people.delete"]!({
      apiKey: "secret-token",
      person_identifier: "email:jony@appleseed.com",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ ok: true }, 202, { Link: '<https://evil.example/next>; rel="next"' });
      },
    });
    expect(seen).toHaveLength(1);
    expect(new URL(seen[0].url).pathname).toBe("/v1/people/email%3Ajony%40appleseed.com");
    const phone: Request[] = [];
    await actions["people.delete"]!({
      apiKey: "secret-token",
      person_identifier: "phone_number:+17132746524",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        phone.push(new Request(input, init));
        return json({ ok: true }, 202);
      },
    });
    expect(new URL(phone[0].url).pathname).toBe("/v1/people/phone_number%3A%2B17132746524");
  });

  test("posts compact JSON and drops unset fields", async () => {
    const seen: Request[] = [];
    await actions["people.create"]!({
      apiKey: "secret-token",
      phone_number: "+15556667777",
      channel: "sms",
      send: false,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ id: "9", phone_number: "+15556667777" }, 201);
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe('{"phone_number":"+15556667777","channel":"sms","send":false}');
    expect(new URL(seen[0].url).pathname).toBe("/v1/people.json");
  });

  test("omits unset filters and repeats expand[]", async () => {
    const seen: Request[] = [];
    await actions["survey-responses.list"]!({
      apiKey: "secret-token",
      order: "asc:updated_at",
      expand: ["person", "notes"],
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json([]);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/v1/survey_responses.json");
    expect(url.searchParams.get("order")).toBe("asc:updated_at");
    expect(url.searchParams.get("per_page")).toBeNull();
    expect(url.searchParams.get("person_email")).toBeNull();
    expect(url.searchParams.getAll("expand[]")).toEqual(["person", "notes"]);
    expect(seen[0].headers.get("content-type")).toBeNull();
  });

  test("wraps a JSON array without treating 204 as success", async () => {
    const result = await actions["bounces.list"]!({
      apiKey: "secret-token",
      fetch: async () => json([{ person_id: "1", email: "a@example.com", name: "A", bounced_at: 1 }]),
    });
    expect(result.data).toEqual([{ person_id: "1", email: "a@example.com", name: "A", bounced_at: 1 }]);
    await expect(actions["bounces.list"]!({ apiKey: "secret-token", fetch: async () => new Response("", { status: 204 }) })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(actions["people.list"]!({ apiKey: "secret-token", fetch: async () => new Response("", { status: 200 }) })).rejects.toMatchObject({
      code: "CONNECTOR_RESPONSE_INVALID",
    });
    await expect(actions["people.list"]!({ apiKey: "secret-token", fetch: async () => json({ id: "1" }) })).rejects.toMatchObject({
      code: "CONNECTOR_RESPONSE_INVALID",
    });
    await expect(
      actions["people.delete"]!({ apiKey: "secret-token", person_identifier: "1", fetch: async () => json({ ok: true }, 200) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("rejects bad input, upstream failures, and rate limits", async () => {
    const fetch = async () => json({});
    let calls = 0;
    const counting = async () => {
      calls += 1;
      return json({});
    };
    await expect(actions["people.create"]!({ apiKey: "secret-token", name: "Ada", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["unsubscribes.create"]!({ apiKey: "secret-token", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["bounces.list"]!({ apiKey: "secret-token", per_page: 101, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["bounces.list"]!({ apiKey: "secret-token", page: 0, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["people.create"]!({ apiKey: "secret-token", email: "a@b.co", delay: 1.5, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["people.create"]!({ apiKey: "secret-token", email: "a@b.co", channel: "push", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["survey-responses.list"]!({ apiKey: "secret-token", order: "newest", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["survey-responses.list"]!({ apiKey: "secret-token", expand: ["html"], fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["people.list"]!({ apiKey: "secret-token", extra: true, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["people.list"]!({ apiKey: "bad:key", fetch: counting })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    expect(calls).toBe(0);
    await expect(actions["people.list"]!({ apiKey: "secret-token", fetch: async () => new Response("{", { status: 200 }) })).rejects.toMatchObject({
      code: "CONNECTOR_RESPONSE_INVALID",
    });
    await expect(
      actions["people.list"]!({
        apiKey: "secret-token",
        fetch: async () => json({ message: "rejected secret-token" }, 401),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: expect.not.stringContaining("secret-token") });
    await expect(
      actions["people.list"]!({
        apiKey: "secret-token",
        fetch: async () => json({ message: "slow down" }, 429, { "Retry-After": "4" }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
