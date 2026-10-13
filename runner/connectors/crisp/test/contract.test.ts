import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const creds = {
  tokenIdentifier: "fixture-token-id",
  tokenKey: "fixture-token-key",
  tier: "plugin",
  websiteId: "8c842203-7ed8-4e29-a608-7cf78a7d2fcc",
};
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
const ok = { error: false, reason: "listed", data: [] as unknown[] };

describe("Crisp contract", () => {
  test("sends basic auth and the plugin tier, and does not follow links", async () => {
    const seen: Request[] = [];
    const result = await actions["operators.list"]!({
      ...creds,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ error: false, reason: "listed", data: [{ type: "operator" }], next: "https://evil.example/next" });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].headers.get("authorization")).toBe("Basic Zml4dHVyZS10b2tlbi1pZDpmaXh0dXJlLXRva2VuLWtleQ==");
    expect(seen[0].headers.get("x-crisp-tier")).toBe("plugin");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].method).toBe("GET");
    expect(seen[0].body).toBeNull();
    const url = new URL(seen[0].url);
    expect(url.host).toBe("api.crisp.chat");
    expect(url.pathname).toBe("/v1/website/8c842203-7ed8-4e29-a608-7cf78a7d2fcc/operators/list");
    expect(url.search).toBe("");
    expect(result.data).toHaveLength(1);
  });

  test("sends a website tier and encodes an email people id on the one profile route", async () => {
    const seen: Request[] = [];
    await actions["people.get"]!({
      ...creds,
      tier: "website",
      peopleId: "ada@example.com",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ error: false, reason: "resolved", data: { people_id: "ada@example.com" } });
      },
    });
    expect(seen[0].headers.get("x-crisp-tier")).toBe("website");
    expect(new URL(seen[0].url).pathname).toBe("/v1/website/8c842203-7ed8-4e29-a608-7cf78a7d2fcc/people/profile/ada%40example.com");
  });

  test("clears an inbox with JSON null and blanks an assignment", async () => {
    const seen: Request[] = [];
    const fetch = async (input: unknown, init: { method?: string; headers?: HeadersInit; body?: unknown }) => {
      seen.push(new Request(input, init));
      return response({ error: false, reason: "updated", data: {} });
    };
    await actions["conversations.inbox.move"]!({
      ...creds,
      sessionId: "session_1",
      inbox: { inbox_id: null },
      fetch,
    });
    expect(seen[0].method).toBe("PATCH");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe('{"inbox_id":null}');
    await actions["conversations.assign"]!({
      ...creds,
      sessionId: "session_1",
      operation: "unassign",
      operatorId: "",
      fetch,
    });
    expect(await seen[1].text()).toBe('{"assigned":{"user_id":""}}');
  });

  test("clears a subject with JSON null and keeps omitted meta fields off the body", async () => {
    const seen: Request[] = [];
    await actions["conversations.meta.update"]!({
      ...creds,
      sessionId: "session_1",
      meta: { subject: null },
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ error: false, reason: "updated", data: {} });
      },
    });
    expect(await seen[0].text()).toBe('{"subject":null}');
  });

  test("accepts a 206 JSON page and rejects a Crisp error envelope", async () => {
    const page = await actions["conversations.list"]!({
      ...creds,
      pageNumber: 1,
      fetch: async () => response({ error: false, reason: "listed", data: [{ session_id: "session_1" }] }, 206),
    });
    expect(page.data).toHaveLength(1);
    await expect(actions["operators.list"]!({
      ...creds,
      fetch: async () => response({ error: true, reason: "not_allowed", data: {} }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("rejects a free-form URL, a bad page, a dot segment, a colon in the token id, malformed JSON, 401, and 429", async () => {
    await expect(actions["operators.list"]!({
      ...creds,
      url: "https://evil.example",
      fetch: async () => response(ok),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["inboxes.list"]!({
      ...creds,
      pageNumber: 0,
      fetch: async () => response(ok),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["people.get"]!({
      ...creds,
      peopleId: "..",
      fetch: async () => response(ok),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["conversations.assign"]!({
      ...creds,
      sessionId: "session_1",
      operation: "assign",
      operatorId: "",
      fetch: async () => response(ok),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    let calls = 0;
    await expect(actions["operators.list"]!({
      ...creds,
      tokenIdentifier: "bad:id",
      fetch: async () => {
        calls += 1;
        return response(ok);
      },
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(calls).toBe(0);
    await expect(actions["operators.list"]!({
      ...creds,
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["operators.list"]!({
      ...creds,
      fetch: async () => response({ reason: "invalid_session" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["operators.list"]!({
      ...creds,
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
