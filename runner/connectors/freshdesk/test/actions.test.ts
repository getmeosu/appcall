import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const credential = { domainAlias: "acme", apiKey: "key/+secret", basicAuth: "a2V5LytzZWNyZXQ6WA==" };
const response = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const empty = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers });

describe("freshdesk declarative actions", () => {
  it("executes every read operation with the documented Basic header", async () => {
    const cases = [
      ["healthcheck", {}, "/account"],
      ["account.get", {}, "/account"],
      ["tickets.list", { page: 2, perPage: 10 }, "/tickets?page=2&per_page=10"],
      ["tickets.get", { ticketId: 42 }, "/tickets/42"],
      ["tickets.conversations.list", { ticketId: 42 }, "/tickets/42/conversations"],
      ["contacts.list", { page: 1, perPage: 20, email: "ada@example.com" }, "/contacts?page=1&per_page=20&email=ada%40example.com"],
      ["contacts.get", { contactId: 7 }, "/contacts/7"],
      ["companies.list", { page: 2 }, "/companies?page=2"],
      ["companies.get", { companyId: 9 }, "/companies/9"],
      ["agents.me", {}, "/agents/me"],
      ["agents.list", { email: "agent@example.com" }, "/agents?email=agent%40example.com"],
      ["agents.get", { agentId: 3 }, "/agents/3"],
      ["groups.list", { page: 1 }, "/groups?page=1"],
    ] as const;
    for (const [op, input, suffix] of cases) {
      const result = await actions[op]!({
        ...credential,
        ...input,
        fetch: async (url: string, init?: RequestInit) => {
          expect(url).toContain(suffix);
          expect(new Headers(init?.headers).get("authorization")).toBe("Basic a2V5LytzZWNyZXQ6WA==");
          expect(init?.method ?? "GET").toBe("GET");
          return response(op.includes("list") ? [] : { id: 1 });
        },
      });
      expect(result).toBeDefined();
    }
  });

  it("creates and updates tickets with snake_case JSON bodies", async () => {
    let createInit: RequestInit | undefined;
    const created = await actions["tickets.create"]!({
      ...credential,
      subject: "Printer jam",
      description: "Third floor copier is stuck.",
      email: "ada@example.com",
      status: 2,
      priority: 1,
      groupId: 4,
      tags: ["hardware"],
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/tickets");
        createInit = init;
        return response({ id: 42, subject: "Printer jam" }, 201);
      },
    });
    expect(createInit?.method).toBe("POST");
    expect(new Headers(createInit?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(createInit?.body))).toEqual({
      subject: "Printer jam",
      description: "Third floor copier is stuck.",
      email: "ada@example.com",
      status: 2,
      priority: 1,
      group_id: 4,
      tags: ["hardware"],
    });
    expect(created).toMatchObject({ ticket: { id: 42 } });

    let updateInit: RequestInit | undefined;
    const updated = await actions["tickets.update"]!({
      ...credential,
      ticketId: 42,
      status: 4,
      priority: 3,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/tickets/42");
        updateInit = init;
        return response({ id: 42, status: 4 });
      },
    });
    expect(updateInit?.method).toBe("PUT");
    expect(JSON.parse(String(updateInit?.body))).toEqual({ status: 4, priority: 3 });
    expect(updated).toMatchObject({ ticket: { id: 42, status: 4 } });
  });

  it("creates contacts, companies, replies, and notes", async () => {
    const createdContact = await actions["contacts.create"]!({
      ...credential,
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "555-0100",
      companyId: 9,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/contacts");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          name: "Ada Lovelace",
          email: "ada@example.com",
          phone: "555-0100",
          company_id: 9,
        });
        return response({ id: 7, name: "Ada Lovelace" }, 201);
      },
    });
    expect(createdContact).toMatchObject({ contact: { id: 7 } });

    const updatedContact = await actions["contacts.update"]!({
      ...credential,
      contactId: 7,
      jobTitle: "Mathematician",
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/contacts/7");
        expect(init?.method).toBe("PUT");
        expect(JSON.parse(String(init?.body))).toEqual({ job_title: "Mathematician" });
        return response({ id: 7, job_title: "Mathematician" });
      },
    });
    expect(updatedContact).toMatchObject({ contact: { id: 7 } });

    const createdCompany = await actions["companies.create"]!({
      ...credential,
      name: "Analytical Engines",
      domains: ["example.com"],
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/companies");
        expect(JSON.parse(String(init?.body))).toEqual({ name: "Analytical Engines", domains: ["example.com"] });
        return response({ id: 9, name: "Analytical Engines" }, 201);
      },
    });
    expect(createdCompany).toMatchObject({ company: { id: 9 } });

    const reply = await actions["conversations.create"]!({
      ...credential,
      ticketId: 42,
      body: "<p>Replaced the roller.</p>",
      userId: 3,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/tickets/42/reply");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ body: "<p>Replaced the roller.</p>", user_id: 3 });
        return response({ id: 88, body_text: "Replaced the roller." }, 201);
      },
    });
    expect(reply).toMatchObject({ conversation: { id: 88 } });

    const note = await actions["conversations.notes.create"]!({
      ...credential,
      ticketId: 42,
      body: "<p>Internal follow-up</p>",
      private: true,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/tickets/42/notes");
        expect(JSON.parse(String(init?.body))).toEqual({ body: "<p>Internal follow-up</p>", private: true });
        return response({ id: 89, private: true }, 201);
      },
    });
    expect(note).toMatchObject({ conversation: { id: 89 } });
  });

  it("rejects missing IDs and hostile tenant aliases before fetch", async () => {
    let called = false;
    await expect(actions["tickets.get"]!({ ...credential, fetch: async () => { called = true; return response({}); } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["tickets.update"]!({ ...credential, status: 2, fetch: async () => { called = true; return response({}); } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["contacts.get"]!({ ...credential, fetch: async () => { called = true; return response({}); } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["tickets.create"]!({ ...credential, description: "no subject", email: "ada@example.com", fetch: async () => { called = true; return response({}); } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["conversations.create"]!({ ...credential, ticketId: 42, fetch: async () => { called = true; return empty(201); } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
  });

  it("redacts raw and encoded secrets and exposes retry metadata", async () => {
    await expect(actions.healthcheck!({ ...credential, fetch: async () => response({ description: `bad ${credential.apiKey} ${encodeURIComponent(credential.apiKey)}` }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: expect.not.stringContaining(credential.apiKey) });
    await expect(actions.healthcheck!({ ...credential, fetch: async () => response({ message: "slow" }, 429, { "retry-after": "17" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 17 });
  });
});
