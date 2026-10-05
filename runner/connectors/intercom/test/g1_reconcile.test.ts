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

describe("Intercom G1 Reconcile writes observe their exact read", () => {
  const cases: [string, Record<string, unknown>, Call, string, string][] = [
    [
      "conversations.reopen",
      { id: "123", adminId: "991" },
      { method: "POST", path: "/conversations/123/parts", body: '{"message_type":"open","admin_id":"991"}' },
      "conversations.get",
      "/conversations/123",
    ],
    [
      "conversations.untag",
      { id: "123", tagId: "17", adminId: "991" },
      { method: "DELETE", path: "/conversations/123/tags/17", body: '{"admin_id":"991"}' },
      "conversations.get",
      "/conversations/123",
    ],
    [
      "contacts.untag",
      { id: "6512", tagId: "17" },
      { method: "DELETE", path: "/contacts/6512/tags/17", body: null },
      "contacts.get",
      "/contacts/6512",
    ],
    [
      "companies.update",
      { id: "531", name: "Acme", size: 120, customAttributes: { tier: "gold" } },
      { method: "PUT", path: "/companies/531", body: '{"name":"Acme","size":120,"custom_attributes":{"tier":"gold"}}' },
      "companies.get",
      "/companies/531",
    ],
    [
      "tickets.update",
      { id: "494", ticketStateId: "7", open: false, assignment: { admin_id: "991", assignee_id: "0" } },
      {
        method: "PUT",
        path: "/tickets/494",
        body: '{"ticket_state_id":"7","open":false,"assignment":{"admin_id":"991","assignee_id":"0"}}',
      },
      "tickets.get",
      "/tickets/494",
    ],
  ];

  for (const [action, input, write, observe, observePath] of cases) {
    test(`${action} writes then observes ${observe} with only the id`, async () => {
      const settled = await run(action, input, 200, { type: "object", id: String(input.id) });
      expect(settled.failure).toBeUndefined();
      expect(settled.error).toBeUndefined();
      expect(settled.calls).toEqual([write, { method: "GET", path: observePath, body: null }]);
      expect(settled.output).toMatchObject({ connector: "intercom", action: observe, data: { id: String(input.id) } });
    });
  }
});

describe("Intercom G1 ops without effect keys make exactly one call", () => {
  const cases: [string, Record<string, unknown>, Call][] = [
    [
      "conversations.create",
      { fromType: "lead", fromContactId: "6512", body: "Hi", subject: "Hello" },
      { method: "POST", path: "/conversations", body: '{"from":{"type":"lead","id":"6512"},"body":"Hi","subject":"Hello"}' },
    ],
    [
      "contacts.search",
      { query: { field: "email", operator: "=", value: "a@b.c" }, startingAfter: "cur" },
      {
        method: "POST",
        path: "/contacts/search",
        body: '{"query":{"field":"email","operator":"=","value":"a@b.c"},"pagination":{"starting_after":"cur"}}',
      },
    ],
    ["contacts.archive", { id: "6512" }, { method: "POST", path: "/contacts/6512/archive", body: null }],
    ["contacts.unarchive", { id: "6512" }, { method: "POST", path: "/contacts/6512/unarchive", body: null }],
    [
      "contacts.attach_company",
      { id: "6512", companyId: "531" },
      { method: "POST", path: "/contacts/6512/companies", body: '{"id":"531"}' },
    ],
    [
      "contacts.detach_company",
      { id: "6512", companyId: "531" },
      { method: "DELETE", path: "/contacts/6512/companies/531", body: null },
    ],
    ["companies.delete", { id: "531" }, { method: "DELETE", path: "/companies/531", body: null }],
    ["tickets.get", { id: "494" }, { method: "GET", path: "/tickets/494", body: null }],
    ["tickets.delete", { id: "494" }, { method: "DELETE", path: "/tickets/494", body: null }],
    ["teams.list", {}, { method: "GET", path: "/teams", body: null }],
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

describe("Intercom G1 input and upstream errors", () => {
  test("companies.delete 404 surfaces CONNECTOR_UPSTREAM_ERROR", async () => {
    const settled = await run("companies.delete", { id: "999" }, 404, {
      type: "error.list",
      errors: [{ code: "company_not_found", message: "Company Not Found" }],
    });
    expect(settled.error).toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    expect(settled.calls).toHaveLength(1);
  });

  test("conversations.untag 404 never observes", async () => {
    const settled = await run("conversations.untag", { id: "123", tagId: "404", adminId: "991" }, 404, {
      type: "error.list",
      errors: [{ code: "not_found", message: "Resource Not Found" }],
    });
    expect(settled.error).toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    expect(settled.calls.map((c) => c.method)).toEqual(["DELETE"]);
  });

  for (const [action, input] of [
    ["conversations.untag", { id: "123", tagId: "17" }],
    ["conversations.reopen", { id: "123" }],
    ["conversations.create", { fromType: "visitor", fromContactId: "6512", body: "Hi" }],
    ["tickets.update", { id: "494", assignment: { adminId: "991" } }],
  ] as [string, Record<string, unknown>][]) {
    test(`${action} rejects invalid input before any fetch`, async () => {
      const settled = await run(action, input);
      expect(settled.calls).toHaveLength(0);
      const code = (settled.failure?.error as { code?: string } | undefined)?.code ?? settled.error?.code;
      expect(code).toBe("INVALID_ACTION_INPUT");
    });
  }
});
