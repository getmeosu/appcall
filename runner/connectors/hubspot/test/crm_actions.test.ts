import { describe, expect, it } from "bun:test";
import {
  getContact,
  updateContact,
  deleteContact,
  searchContacts,
  getCompany,
  updateCompany,
  deleteCompany,
  getDeal,
  updateDeal,
  deleteDeal,
  getTicket,
  updateTicket,
} from "../src/actions";
import getContactFixture from "../fixtures/get_contact.json";
import updateContactFixture from "../fixtures/update_contact.json";
import searchContactsFixture from "../fixtures/search_contacts.json";
import getCompanyFixture from "../fixtures/get_company.json";
import updateCompanyFixture from "../fixtures/update_company.json";
import getDealFixture from "../fixtures/get_deal.json";
import updateDealFixture from "../fixtures/update_deal.json";
import getTicketFixture from "../fixtures/get_ticket.json";
import updateTicketFixture from "../fixtures/update_ticket.json";

function createMockFetch(status: number, body: unknown) {
  return (url: string, init?: RequestInit) =>
    Promise.resolve(
      new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      })
    );
}

function createRateLimitFetch() {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify({ status: "error", message: "rate limit" }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "30" },
      })
    );
}

function createUpstreamErrorFetch(status: number) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify({ status: "error", message: "upstream error" }), {
        status,
        headers: { "content-type": "application/json" },
      })
    );
}

// ─── contacts.get ────────────────────────────────────────────────────────────

describe("getContact action", () => {
  it("validates input without accessToken", () => {
    const result = getContact({ contactId: "601" });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("contacts.get");
    expect((result as any).validated.contactId).toBe("601");
  });

  it("throws when contactId is missing", () => {
    expect(() => getContact({})).toThrow("contactId is required");
  });

  it("fetches contact with accessToken", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    const mockFetch = (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "GET";
      capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
      return Promise.resolve(
        new Response(JSON.stringify(getContactFixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    };
    const result = await getContact({ accessToken: "tok-abc", contactId: "601", fetch: mockFetch });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("contacts.get");
    expect(capturedUrl).toBe("https://api.hubapi.com/crm/v3/objects/contacts/601");
    expect(capturedMethod).toBe("GET");
    expect(capturedAuth).toBe("Bearer tok-abc");
    expect((result as any).contact.id).toBe("hs-contact:601");
    expect((result as any).contact.firstName).toBe("Alice");
    expect((result as any).contact.email).toBe("alice@example.com");
  });

  it("throws CONNECTOR_RATE_LIMITED on 429", async () => {
    const result = getContact({ accessToken: "tok", contactId: "601", fetch: createRateLimitFetch() });
    await expect(result as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });

  it("throws CONNECTOR_UPSTREAM_ERROR on 404", async () => {
    const result = getContact({ accessToken: "tok", contactId: "999", fetch: createUpstreamErrorFetch(404) });
    await expect(result as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── contacts.update ─────────────────────────────────────────────────────────

describe("updateContact action", () => {
  it("validates input without accessToken", () => {
    const result = updateContact({ contactId: "601", firstName: "Bob" });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("contacts.update");
    expect((result as any).validated.contactId).toBe("601");
    expect((result as any).validated.firstName).toBe("Bob");
  });

  it("throws when contactId is missing", () => {
    expect(() => updateContact({ firstName: "Bob" })).toThrow("contactId is required");
  });

  it("patches contact with accessToken", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    let capturedBody = "";
    const mockFetch = (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
      capturedBody = init?.body as string ?? "";
      return Promise.resolve(
        new Response(JSON.stringify(updateContactFixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    };
    const result = await updateContact({ accessToken: "tok-abc", contactId: "601", lastName: "Johnson", fetch: mockFetch });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("contacts.update");
    expect(capturedUrl).toBe("https://api.hubapi.com/crm/v3/objects/contacts/601");
    expect(capturedMethod).toBe("PATCH");
    expect(capturedAuth).toBe("Bearer tok-abc");
    const body = JSON.parse(capturedBody);
    expect(body.properties.last_name).toBe("Johnson");
    expect((result as any).contact.id).toBe("hs-contact:601");
  });

  it("throws CONNECTOR_RATE_LIMITED on 429", async () => {
    const result = updateContact({ accessToken: "tok", contactId: "601", fetch: createRateLimitFetch() });
    await expect(result as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── contacts.delete ─────────────────────────────────────────────────────────

describe("deleteContact action", () => {
  it("validates input without accessToken", () => {
    const result = deleteContact({ contactId: "601" });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("contacts.delete");
    expect((result as any).validated.contactId).toBe("601");
  });

  it("throws when contactId is missing", () => {
    expect(() => deleteContact({})).toThrow("contactId is required");
  });

  it("deletes contact with accessToken", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    const mockFetch = (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
      return Promise.resolve(new Response(null, { status: 204, headers: {} }));
    };
    const result = await deleteContact({ accessToken: "tok-abc", contactId: "601", fetch: mockFetch });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("contacts.delete");
    expect(capturedUrl).toBe("https://api.hubapi.com/crm/v3/objects/contacts/601");
    expect(capturedMethod).toBe("DELETE");
    expect(capturedAuth).toBe("Bearer tok-abc");
    expect((result as any).deleted).toBe(true);
  });

  it("throws CONNECTOR_UPSTREAM_ERROR on non-204 error", async () => {
    const result = deleteContact({ accessToken: "tok", contactId: "999", fetch: createUpstreamErrorFetch(404) });
    await expect(result as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── contacts.search ─────────────────────────────────────────────────────────

describe("searchContacts action", () => {
  it("validates input without accessToken", () => {
    const result = searchContacts({ query: "Alice", limit: 10 });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("contacts.search");
    expect((result as any).validated.query).toBe("Alice");
    expect((result as any).validated.limit).toBe(10);
  });

  it("searches contacts with accessToken", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    let capturedBody = "";
    const mockFetch = (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
      capturedBody = init?.body as string ?? "";
      return Promise.resolve(
        new Response(JSON.stringify(searchContactsFixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    };
    const result = await searchContacts({ accessToken: "tok-abc", query: "ACME", limit: 10, fetch: mockFetch });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("contacts.search");
    expect(capturedUrl).toBe("https://api.hubapi.com/crm/v3/objects/contacts/search");
    expect(capturedMethod).toBe("POST");
    expect(capturedAuth).toBe("Bearer tok-abc");
    const body = JSON.parse(capturedBody);
    expect(body.query).toBe("ACME");
    expect(body.limit).toBe(10);
    expect((result as any).contacts).toHaveLength(2);
    expect((result as any).total).toBe(2);
    expect((result as any).nextCursor).toBe("NTI1Cg%3D%3D");
  });

  it("throws CONNECTOR_RATE_LIMITED on 429", async () => {
    const result = searchContacts({ accessToken: "tok", query: "x", fetch: createRateLimitFetch() });
    await expect(result as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── companies.get ───────────────────────────────────────────────────────────

describe("getCompany action", () => {
  it("validates input without accessToken", () => {
    const result = getCompany({ companyId: "701" });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("companies.get");
    expect((result as any).validated.companyId).toBe("701");
  });

  it("throws when companyId is missing", () => {
    expect(() => getCompany({})).toThrow("companyId is required");
  });

  it("fetches company with accessToken", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    const mockFetch = (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "GET";
      capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
      return Promise.resolve(
        new Response(JSON.stringify(getCompanyFixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    };
    const result = await getCompany({ accessToken: "tok-abc", companyId: "701", fetch: mockFetch });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("companies.get");
    expect(capturedUrl).toBe("https://api.hubapi.com/crm/v3/objects/companies/701");
    expect(capturedMethod).toBe("GET");
    expect(capturedAuth).toBe("Bearer tok-abc");
    expect((result as any).company.id).toBe("hs-company:701");
    expect((result as any).company.name).toBe("ACME Corp");
    expect((result as any).company.domain).toBe("acme.com");
  });

  it("throws CONNECTOR_RATE_LIMITED on 429", async () => {
    const result = getCompany({ accessToken: "tok", companyId: "701", fetch: createRateLimitFetch() });
    await expect(result as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });
});

// ─── companies.update ────────────────────────────────────────────────────────

describe("updateCompany action", () => {
  it("validates input without accessToken", () => {
    const result = updateCompany({ companyId: "701", name: "NewCo" });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("companies.update");
    expect((result as any).validated.companyId).toBe("701");
    expect((result as any).validated.name).toBe("NewCo");
  });

  it("throws when companyId is missing", () => {
    expect(() => updateCompany({ name: "NewCo" })).toThrow("companyId is required");
  });

  it("patches company with accessToken", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedBody = "";
    const mockFetch = (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      capturedBody = init?.body as string ?? "";
      return Promise.resolve(
        new Response(JSON.stringify(updateCompanyFixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    };
    const result = await updateCompany({ accessToken: "tok-abc", companyId: "701", name: "ACME Corp Updated", industry: "SOFTWARE", fetch: mockFetch });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("companies.update");
    expect(capturedUrl).toBe("https://api.hubapi.com/crm/v3/objects/companies/701");
    expect(capturedMethod).toBe("PATCH");
    const body = JSON.parse(capturedBody);
    expect(body.properties.name).toBe("ACME Corp Updated");
    expect(body.properties.industry).toBe("SOFTWARE");
    expect((result as any).company.name).toBe("ACME Corp Updated");
  });

  it("throws CONNECTOR_UPSTREAM_ERROR on 400", async () => {
    const result = updateCompany({ accessToken: "tok", companyId: "701", fetch: createUpstreamErrorFetch(400) });
    await expect(result as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── companies.delete ────────────────────────────────────────────────────────

describe("deleteCompany action", () => {
  it("validates input without accessToken", () => {
    const result = deleteCompany({ companyId: "701" });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("companies.delete");
    expect((result as any).validated.companyId).toBe("701");
  });

  it("throws when companyId is missing", () => {
    expect(() => deleteCompany({})).toThrow("companyId is required");
  });

  it("deletes company with accessToken", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    const mockFetch = (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      return Promise.resolve(new Response(null, { status: 204, headers: {} }));
    };
    const result = await deleteCompany({ accessToken: "tok-abc", companyId: "701", fetch: mockFetch });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("companies.delete");
    expect(capturedUrl).toBe("https://api.hubapi.com/crm/v3/objects/companies/701");
    expect(capturedMethod).toBe("DELETE");
    expect((result as any).deleted).toBe(true);
  });
});

// ─── deals.get ───────────────────────────────────────────────────────────────

describe("getDeal action", () => {
  it("validates input without accessToken", () => {
    const result = getDeal({ dealId: "801" });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("deals.get");
    expect((result as any).validated.dealId).toBe("801");
  });

  it("throws when dealId is missing", () => {
    expect(() => getDeal({})).toThrow("dealId is required");
  });

  it("fetches deal with accessToken", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    const mockFetch = (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "GET";
      capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
      return Promise.resolve(
        new Response(JSON.stringify(getDealFixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    };
    const result = await getDeal({ accessToken: "tok-abc", dealId: "801", fetch: mockFetch });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("deals.get");
    expect(capturedUrl).toBe("https://api.hubapi.com/crm/v3/objects/deals/801");
    expect(capturedMethod).toBe("GET");
    expect(capturedAuth).toBe("Bearer tok-abc");
    expect((result as any).deal.id).toBe("hs-deal:801");
    expect((result as any).deal.name).toBe("Enterprise Expansion");
    expect((result as any).deal.amount).toBe(250000);
  });

  it("throws CONNECTOR_RATE_LIMITED on 429", async () => {
    const result = getDeal({ accessToken: "tok", dealId: "801", fetch: createRateLimitFetch() });
    await expect(result as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });
});

// ─── deals.update ────────────────────────────────────────────────────────────

describe("updateDeal action", () => {
  it("validates input without accessToken", () => {
    const result = updateDeal({ dealId: "801", name: "New Name", amount: 300000 });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("deals.update");
    expect((result as any).validated.dealId).toBe("801");
    expect((result as any).validated.amount).toBe(300000);
  });

  it("throws when dealId is missing", () => {
    expect(() => updateDeal({ name: "test" })).toThrow("dealId is required");
  });

  it("patches deal with accessToken and converts amount to string", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedBody = "";
    const mockFetch = (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      capturedBody = init?.body as string ?? "";
      return Promise.resolve(
        new Response(JSON.stringify(updateDealFixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    };
    const result = await updateDeal({ accessToken: "tok-abc", dealId: "801", amount: 300000, stage: "presentationscheduled", fetch: mockFetch });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("deals.update");
    expect(capturedUrl).toBe("https://api.hubapi.com/crm/v3/objects/deals/801");
    expect(capturedMethod).toBe("PATCH");
    const body = JSON.parse(capturedBody);
    expect(body.properties.amount).toBe("300000");
    expect(body.properties.dealstage).toBe("presentationscheduled");
    expect((result as any).deal.amount).toBe(300000);
  });

  it("throws CONNECTOR_UPSTREAM_ERROR on 400", async () => {
    const result = updateDeal({ accessToken: "tok", dealId: "801", fetch: createUpstreamErrorFetch(400) });
    await expect(result as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── deals.delete ────────────────────────────────────────────────────────────

describe("deleteDeal action", () => {
  it("validates input without accessToken", () => {
    const result = deleteDeal({ dealId: "801" });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("deals.delete");
    expect((result as any).validated.dealId).toBe("801");
  });

  it("throws when dealId is missing", () => {
    expect(() => deleteDeal({})).toThrow("dealId is required");
  });

  it("deletes deal with accessToken", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    const mockFetch = (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
      return Promise.resolve(new Response(null, { status: 204, headers: {} }));
    };
    const result = await deleteDeal({ accessToken: "tok-abc", dealId: "801", fetch: mockFetch });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("deals.delete");
    expect(capturedUrl).toBe("https://api.hubapi.com/crm/v3/objects/deals/801");
    expect(capturedMethod).toBe("DELETE");
    expect(capturedAuth).toBe("Bearer tok-abc");
    expect((result as any).deleted).toBe(true);
  });
});

// ─── tickets.get ─────────────────────────────────────────────────────────────

describe("getTicket action", () => {
  it("validates input without accessToken", () => {
    const result = getTicket({ ticketId: "901" });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("tickets.get");
    expect((result as any).validated.ticketId).toBe("901");
  });

  it("throws when ticketId is missing", () => {
    expect(() => getTicket({})).toThrow("ticketId is required");
  });

  it("fetches ticket with accessToken", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    const mockFetch = (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "GET";
      capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
      return Promise.resolve(
        new Response(JSON.stringify(getTicketFixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    };
    const result = await getTicket({ accessToken: "tok-abc", ticketId: "901", fetch: mockFetch });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("tickets.get");
    expect(capturedUrl).toBe("https://api.hubapi.com/crm/v3/objects/tickets/901");
    expect(capturedMethod).toBe("GET");
    expect(capturedAuth).toBe("Bearer tok-abc");
    expect((result as any).ticket.id).toBe("hs-ticket:901");
    expect((result as any).ticket.subject).toBe("Login issue");
    expect((result as any).ticket.priority).toBe("HIGH");
  });

  it("throws CONNECTOR_RATE_LIMITED on 429", async () => {
    const result = getTicket({ accessToken: "tok", ticketId: "901", fetch: createRateLimitFetch() });
    await expect(result as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });
});

// ─── tickets.update ──────────────────────────────────────────────────────────

describe("updateTicket action", () => {
  it("validates input without accessToken", () => {
    const result = updateTicket({ ticketId: "901", subject: "Resolved", priority: "low" });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("tickets.update");
    expect((result as any).validated.ticketId).toBe("901");
    expect((result as any).validated.subject).toBe("Resolved");
  });

  it("throws when ticketId is missing", () => {
    expect(() => updateTicket({ subject: "test" })).toThrow("ticketId is required");
  });

  it("patches ticket and uppercases priority/category", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedBody = "";
    const mockFetch = (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      capturedBody = init?.body as string ?? "";
      return Promise.resolve(
        new Response(JSON.stringify(updateTicketFixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    };
    const result = await updateTicket({ accessToken: "tok-abc", ticketId: "901", subject: "Login issue - resolved", priority: "low", fetch: mockFetch });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("tickets.update");
    expect(capturedUrl).toBe("https://api.hubapi.com/crm/v3/objects/tickets/901");
    expect(capturedMethod).toBe("PATCH");
    const body = JSON.parse(capturedBody);
    expect(body.properties.subject).toBe("Login issue - resolved");
    expect(body.properties.hs_ticket_priority).toBe("LOW");
    expect((result as any).ticket.id).toBe("hs-ticket:901");
  });

  it("throws CONNECTOR_UPSTREAM_ERROR on 400", async () => {
    const result = updateTicket({ accessToken: "tok", ticketId: "901", fetch: createUpstreamErrorFetch(400) });
    await expect(result as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  it("throws CONNECTOR_RATE_LIMITED on 429", async () => {
    const result = updateTicket({ accessToken: "tok", ticketId: "901", fetch: createRateLimitFetch() });
    await expect(result as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});
