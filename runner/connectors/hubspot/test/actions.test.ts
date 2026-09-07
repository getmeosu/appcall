import { describe, expect, it } from "bun:test";
import { createContact, createCompany, createDeal, createTicket } from "../src/actions";
import createContactFixture from "../fixtures/create_contact.json";
import createCompanyFixture from "../fixtures/create_company.json";
import createDealFixture from "../fixtures/create_deal.json";
import createTicketFixture from "../fixtures/create_ticket.json";

function createMockFetch(status: number, body: unknown) {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

describe("createContact action", () => {
  it("validates input without accessToken", () => {
    const result = createContact({ email: "test@example.com", firstName: "Test", lastName: "User" });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("contacts.create");
    expect((result as any).validated.email).toBe("test@example.com");
  });

  it("creates contact with accessToken", async () => {
    const fetch = createMockFetch(201, createContactFixture);
    const result = await createContact({ accessToken: "test-token", email: "new@example.com", firstName: "New", lastName: "Contact", fetch });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("contacts.create");
    expect((result as any).contact.id).toBe("hs-contact:601");
    expect((result as any).contact.firstName).toBe("New");
  });
});

describe("createCompany action", () => {
  it("validates input without accessToken", () => {
    const result = createCompany({ name: "Test Corp" });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("companies.create");
    expect((result as any).validated.name).toBe("Test Corp");
  });

  it("throws when name is missing", () => {
    expect(() => createCompany({ domain: "test.com" })).toThrow("name is required");
  });

  it("creates company with accessToken", async () => {
    const fetch = createMockFetch(201, createCompanyFixture);
    const result = await createCompany({ accessToken: "test-token", name: "New Company Inc", domain: "newcompany.com", fetch });
    expect(result.connector).toBe("hubspot");
    expect((result as any).company.id).toBe("hs-company:701");
    expect((result as any).company.name).toBe("New Company Inc");
  });
});

describe("createDeal action", () => {
  it("validates input without accessToken", () => {
    const result = createDeal({ name: "Test Deal", amount: 10000 });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("deals.create");
    expect((result as any).validated.name).toBe("Test Deal");
    expect((result as any).validated.amount).toBe(10000);
  });

  it("throws when name is missing", () => {
    expect(() => createDeal({ amount: 5000 })).toThrow("name is required");
  });

  it("creates deal with accessToken", async () => {
    const fetch = createMockFetch(201, createDealFixture);
    const result = await createDeal({ accessToken: "test-token", name: "New Deal", amount: 50000, fetch });
    expect(result.connector).toBe("hubspot");
    expect((result as any).deal.id).toBe("hs-deal:801");
    expect((result as any).deal.amount).toBe(50000);
  });
});

describe("createTicket action", () => {
  it("validates input without accessToken", () => {
    const result = createTicket({ subject: "Test ticket", priority: "high" });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("tickets.create");
    expect((result as any).validated.subject).toBe("Test ticket");
  });

  it("throws when subject is missing", () => {
    expect(() => createTicket({ content: "help" })).toThrow("subject is required");
  });

  it("creates ticket with accessToken", async () => {
    const fetch = createMockFetch(201, createTicketFixture);
    const result = await createTicket({ accessToken: "test-token", subject: "Billing question", content: "Invoice question", priority: "medium", fetch });
    expect(result.connector).toBe("hubspot");
    expect((result as any).ticket.id).toBe("hs-ticket:901");
    expect((result as any).ticket.subject).toBe("Billing question");
  });
});
