import { describe, expect, test } from "bun:test";
import { defaultConnectorRegistry } from "../../../bun/src/registry";

type Call = { method: string; path: string; body: string | null };

function stubFetch(status = 200, body: unknown = { type: "object", id: "1" }) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push({
      method: init?.method ?? "GET",
      path: `${url.pathname}${url.search}`,
      body: typeof init?.body === "string" ? init.body : null,
    });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

async function run(action: string, input: Record<string, unknown>, status = 200, body?: unknown) {
  const { calls, impl } = stubFetch(status, body);
  const result = defaultConnectorRegistry.executeAction("intercom", action, { ...input, accessToken: "token", fetch: impl });
  if (!result.ok) return { calls, failure: result as unknown as Record<string, unknown> };
  try {
    return { calls, output: (await Promise.resolve(result.output)) as Record<string, unknown> };
  } catch (error) {
    return { calls, error: error as Record<string, unknown> };
  }
}

describe("Intercom G2 Reconcile write observes conversations.get", () => {
  test("conversations.attach_contact writes then observes with only the id", async () => {
    const settled = await run("conversations.attach_contact", { id: "123", adminId: "991", contactId: "6512" }, 200, {
      type: "conversation",
      id: "123",
    });
    expect(settled.failure).toBeUndefined();
    expect(settled.error).toBeUndefined();
    expect(settled.calls).toEqual([
      { method: "POST", path: "/conversations/123/customers", body: '{"admin_id":"991","customer":{"intercom_user_id":"6512"}}' },
      { method: "GET", path: "/conversations/123", body: null },
    ]);
    expect(settled.output).toMatchObject({ connector: "intercom", action: "conversations.get", data: { id: "123" } });
  });

  test("conversations.attach_contact 403 never observes", async () => {
    const settled = await run("conversations.attach_contact", { id: "123", adminId: "991", contactId: "6512" }, 403, {
      type: "error.list",
      errors: [{ code: "action_forbidden", message: "Forbidden" }],
    });
    expect(settled.error).toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    expect(settled.calls.map((c) => c.method)).toEqual(["POST"]);
  });
});

describe("Intercom G2 ops without effect keys make exactly one call", () => {
  const cases: [string, Record<string, unknown>, Call][] = [
    [
      "notes.create",
      { id: "6512", body: "Called" },
      { method: "POST", path: "/contacts/6512/notes", body: '{"body":"Called"}' },
    ],
    [
      "contacts.merge",
      { fromContactId: "5d70", intoContactId: "6512" },
      { method: "POST", path: "/contacts/merge", body: '{"from":"5d70","into":"6512"}' },
    ],
    [
      "tickets.tag",
      { id: "494", tagId: "17", adminId: "991" },
      { method: "POST", path: "/tickets/494/tags", body: '{"id":"17","admin_id":"991"}' },
    ],
    [
      "tickets.untag",
      { id: "494", tagId: "17", adminId: "991" },
      { method: "DELETE", path: "/tickets/494/tags/17", body: '{"admin_id":"991"}' },
    ],
    ["notes.list", { id: "6512" }, { method: "GET", path: "/contacts/6512/notes", body: null }],
    ["notes.get", { id: "17495962" }, { method: "GET", path: "/notes/17495962", body: null }],
    ["teams.get", { id: "814" }, { method: "GET", path: "/teams/814", body: null }],
    ["contacts.list_companies", { id: "6512" }, { method: "GET", path: "/contacts/6512/companies", body: null }],
    ["companies.list_contacts", { id: "531" }, { method: "GET", path: "/companies/531/contacts", body: null }],
    ["contacts.list_tags", { id: "6512" }, { method: "GET", path: "/contacts/6512/tags", body: null }],
    ["tags.get", { id: "17" }, { method: "GET", path: "/tags/17", body: null }],
  ];

  for (const [action, input, call] of cases) {
    test(`${action} returns the provider response`, async () => {
      const settled = await run(action, input, 200, { type: "object", id: "r1" });
      expect(settled.failure).toBeUndefined();
      expect(settled.error).toBeUndefined();
      expect(settled.calls).toEqual([call]);
      expect(settled.output).toMatchObject({ connector: "intercom", action, data: { id: "r1" } });
    });
  }
});

describe("Intercom G2 input errors", () => {
  for (const [action, input] of [
    ["conversations.attach_contact", { id: "123", adminId: "991" }],
    ["conversations.attach_contact", { id: "123", adminId: "991", contactId: "6512", email: "a@b.c" }],
    ["tickets.untag", { id: "494", tagId: "17" }],
    ["contacts.merge", { fromContactId: "5d70" }],
    ["notes.list", { id: "6512", perPage: 10 }],
  ] as [string, Record<string, unknown>][]) {
    test(`${action} rejects ${JSON.stringify(Object.keys(input))} before any fetch`, async () => {
      const settled = await run(action, input);
      expect(settled.calls).toHaveLength(0);
      const code = (settled.failure?.error as { code?: string } | undefined)?.code ?? settled.error?.code;
      expect(code).toBe("INVALID_ACTION_INPUT");
    });
  }
});
