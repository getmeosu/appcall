import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });
const empty = (status: number, headers?: HeadersInit) => new Response(null, { status, headers });
const page = { number: 1, size: 50, totalElements: 1, totalPages: 1 };

describe("Help Scout declarative read-only contract", () => {
  test("healthcheck uses OAuth bearer and maps users", async () => {
    const seen: Request[] = [];
    const result = await actions.healthcheck!({ accessToken: "secret", fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ _embedded: { users: [{ id: 1 }] }, page }); } });
    expect(seen[0].url).toBe("https://api.helpscout.net/v2/users?page=1&pageSize=50");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(result).toMatchObject({ status: "ok", users: [{ id: 1 }], page });
  });

  test("maps collections, fixed page sizes, query filters, and does not follow links", async () => {
    const seen: Request[] = [];
    const result = await actions["conversations.list"]!({ accessToken: "tok", page: 2, status: "open", mailbox: 7, sortField: "modifiedAt", sortOrder: "desc", fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ _embedded: { conversations: [{ id: 9 }] }, page: { ...page, number: 2, size: 25 }, _links: { next: { href: "https://evil.example" } } }); } });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/v2/conversations");
    expect(url.searchParams.get("pageSize")).toBe("25");
    expect(url.searchParams.get("status")).toBe("open");
    expect(result.conversations).toEqual([{ id: 9 }]);
    expect(seen).toHaveLength(1);
  });

  test("escapes conversation IDs and rejects invalid required inputs", async () => {
    const seen: Request[] = [];
    await actions["conversations.get"]!({ accessToken: "tok", conversationId: 42, fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ id: 42 }); } });
    expect(new URL(seen[0].url).pathname).toBe("/v2/conversations/42");
    for (const value of [undefined, "42", "   "]) await expect(actions["conversations.get"]!({ accessToken: "tok", conversationId: value, fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("maps upstream failures and Retry-After without exposing credentials", async () => {
    for (const status of [401, 403, 404, 500, 502, 503]) await expect(actions["users.list"]!({ accessToken: "secret", fetch: async () => response({ message: "provider detail", accessToken: "secret" }, status) })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["users.list"]!({ accessToken: "secret", fetch: async () => response({ message: "slow" }, 429, { "Retry-After": "5" }) })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 5 });
  });

  test("rejects malformed collection responses", async () => {
    await expect(actions["tags.list"]!({ accessToken: "tok", fetch: async () => response({ _embedded: { tags: {} }, page }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });
});

describe("Help Scout mailbox writes and customer reads", () => {
  test("lists mailboxes, gets one mailbox, and reads the current user", async () => {
    const listed = await actions["mailboxes.list"]!({
      accessToken: "tok",
      page: 1,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        expect(new URL(request.url).pathname).toBe("/v2/mailboxes");
        expect(request.headers.get("authorization")).toBe("Bearer tok");
        return response({ _embedded: { mailboxes: [{ id: 85, name: "Support" }] }, page });
      },
    });
    expect(listed).toMatchObject({ mailboxes: [{ id: 85, name: "Support" }], page });

    const mailbox = await actions["mailboxes.get"]!({
      accessToken: "tok",
      mailboxId: 85,
      fetch: async (input) => {
        expect(new URL(String(input)).pathname).toBe("/v2/mailboxes/85");
        return response({ id: 85, name: "Support" });
      },
    });
    expect(mailbox).toMatchObject({ mailbox: { id: 85 } });

    const me = await actions["users.me"]!({
      accessToken: "tok",
      fetch: async (input) => {
        expect(new URL(String(input)).pathname).toBe("/v2/users/me");
        return response({ id: 12, email: "agent@example.com" });
      },
    });
    expect(me).toMatchObject({ user: { id: 12 } });
  });

  test("gets, lists, and creates customers", async () => {
    const listed = await actions["customers.list"]!({
      accessToken: "tok",
      mailbox: 85,
      page: 2,
      query: "bear@acme.com",
      fetch: async (input) => {
        const url = new URL(String(input));
        expect(url.pathname).toBe("/v2/customers");
        expect(url.searchParams.get("mailbox")).toBe("85");
        expect(url.searchParams.get("query")).toBe("bear@acme.com");
        return response({ _embedded: { customers: [{ id: 100 }] }, page });
      },
    });
    expect(listed.customers).toEqual([{ id: 100 }]);

    const got = await actions["customers.get"]!({
      accessToken: "tok",
      customerId: 100,
      fetch: async (input) => {
        expect(new URL(String(input)).pathname).toBe("/v2/customers/100");
        return response({ id: 100, firstName: "Vernon" });
      },
    });
    expect(got).toMatchObject({ customer: { id: 100 } });

    let createInit: RequestInit | undefined;
    const created = await actions["customers.create"]!({
      accessToken: "tok",
      firstName: "Vernon",
      lastName: "Bear",
      email: "bear@acme.com",
      jobTitle: "CEO",
      fetch: async (input, init) => {
        expect(new URL(String(input)).pathname).toBe("/v2/customers");
        createInit = init;
        return empty(201, { "Resource-ID": "101", Location: "https://api.helpscout.net/v2/customers/101" });
      },
    });
    expect(createInit?.method).toBe("POST");
    expect(new Headers(createInit?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(createInit?.body))).toEqual({
      firstName: "Vernon",
      lastName: "Bear",
      jobTitle: "CEO",
      emails: [{ type: "work", value: "bear@acme.com" }],
    });
    expect(created).toMatchObject({ id: "101", location: "https://api.helpscout.net/v2/customers/101" });
  });

  test("creates and JSON-patches conversations, then posts reply and note threads", async () => {
    let createInit: RequestInit | undefined;
    const created = await actions["conversations.create"]!({
      accessToken: "tok",
      subject: "Need help",
      mailboxId: 85,
      type: "email",
      status: "active",
      customerEmail: "bear@acme.com",
      customerFirstName: "Vernon",
      text: "Hello, Help Scout.",
      threadType: "customer",
      tags: ["vip"],
      fetch: async (input, init) => {
        expect(new URL(String(input)).pathname).toBe("/v2/conversations");
        createInit = init;
        return empty(201, { "Resource-ID": "123", Location: "https://api.helpscout.net/v2/conversations/123" });
      },
    });
    expect(createInit?.method).toBe("POST");
    expect(JSON.parse(String(createInit?.body))).toEqual({
      subject: "Need help",
      mailboxId: 85,
      type: "email",
      status: "active",
      customer: { email: "bear@acme.com", firstName: "Vernon" },
      threads: [{ type: "customer", customer: { email: "bear@acme.com" }, text: "Hello, Help Scout." }],
      tags: ["vip"],
    });
    expect(created).toMatchObject({ id: "123" });

    let patchInit: RequestInit | undefined;
    const updated = await actions["conversations.update"]!({
      accessToken: "tok",
      conversationId: 123,
      op: "replace",
      path: "/status",
      value: "closed",
      fetch: async (input, init) => {
        expect(new URL(String(input)).pathname).toBe("/v2/conversations/123");
        patchInit = init;
        return empty(204);
      },
    });
    expect(patchInit?.method).toBe("PATCH");
    expect(JSON.parse(String(patchInit?.body))).toEqual({ op: "replace", path: "/status", value: "closed" });
    expect(updated).toMatchObject({ conversationId: 123 });

    const reply = await actions["threads.create"]!({
      accessToken: "tok",
      conversationId: 123,
      text: "How are you?",
      customerId: 100,
      status: "active",
      fetch: async (input, init) => {
        expect(new URL(String(input)).pathname).toBe("/v2/conversations/123/reply");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          text: "How are you?",
          customer: { id: 100 },
          status: "active",
        });
        return empty(201, { "Resource-ID": "567" });
      },
    });
    expect(reply).toMatchObject({ id: "567" });

    const note = await actions["threads.notes.create"]!({
      accessToken: "tok",
      conversationId: 123,
      text: "Buy more pens",
      fetch: async (input, init) => {
        expect(new URL(String(input)).pathname).toBe("/v2/conversations/123/notes");
        expect(JSON.parse(String(init?.body))).toEqual({ text: "Buy more pens" });
        return empty(201, { "Resource-ID": "568" });
      },
    });
    expect(note).toMatchObject({ id: "568" });
  });

  test("rejects missing write fields before fetch", async () => {
    let called = false;
    const fetch = async () => {
      called = true;
      return empty(201);
    };
    await expect(actions["conversations.create"]!({ accessToken: "tok", subject: "x", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["conversations.update"]!({ accessToken: "tok", op: "replace", path: "/status", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["customers.get"]!({ accessToken: "tok", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["threads.create"]!({ accessToken: "tok", conversationId: 1, fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
  });
});
