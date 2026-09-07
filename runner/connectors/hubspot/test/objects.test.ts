import { describe, expect, it } from "bun:test";
import { normalizeContact, parseContactsResponse } from "../src/objects";
import { normalizeCompany, parseCompaniesResponse } from "../src/objects";
import { normalizeDeal, parseDealsResponse } from "../src/objects";
import { normalizeTicket, parseTicketsResponse } from "../src/objects";
import contactsList from "../fixtures/contacts_list.json";
import contactsListNoPage from "../fixtures/contacts_list_no_page.json";
import companiesList from "../fixtures/companies_list.json";
import dealsList from "../fixtures/deals_list.json";
import ticketsList from "../fixtures/tickets_list.json";

describe("normalizeContact", () => {
  const raw = contactsList.results[0] as any;

  it("maps all contact fields", () => {
    const c = normalizeContact(raw);
    expect(c.id).toBe("hs-contact:101");
    expect(c.provider).toBe("hubspot");
    expect(c.providerContactId).toBe("101");
    expect(c.firstName).toBe("Jane");
    expect(c.lastName).toBe("Smith");
    expect(c.email).toBe("jane@example.com");
    expect(c.phone).toBe("+1234567890");
    expect(c.company).toBe("Acme Corp");
    expect(c.website).toBe("https://acme.com");
    expect(c.jobTitle).toBe("CEO");
    expect(c.city).toBe("Boston");
    expect(c.state).toBe("MA");
    expect(c.country).toBe("US");
    expect(c.ownerId).toBe("456");
    expect(c.lifecycleStage).toBe("customer");
    expect(c.modelVersion).toBe("2026-05-16");
  });

  it("handles null properties with empty defaults", () => {
    const raw2 = contactsList.results[1] as any;
    const c = normalizeContact(raw2);
    expect(c.firstName).toBe("Bob");
    expect(c.phone).toBe("");
    expect(c.company).toBe("");
    expect(c.website).toBe("");
    expect(c.ownerId).toBe("");
  });
});

describe("parseContactsResponse", () => {
  it("parses contacts and cursor", () => {
    const result = parseContactsResponse(contactsList);
    expect(result.contacts).toHaveLength(2);
    expect(result.nextCursor).toBe("102");
  });

  it("returns no cursor when paging is absent", () => {
    const result = parseContactsResponse(contactsListNoPage);
    expect(result.contacts).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("handles null input", () => {
    const result = parseContactsResponse(null);
    expect(result.contacts).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it("handles array input", () => {
    const result = parseContactsResponse([1, 2]);
    expect(result.contacts).toHaveLength(0);
  });
});

describe("normalizeCompany", () => {
  const raw = companiesList.results[0] as any;

  it("maps all company fields", () => {
    const c = normalizeCompany(raw);
    expect(c.id).toBe("hs-company:301");
    expect(c.provider).toBe("hubspot");
    expect(c.providerCompanyId).toBe("301");
    expect(c.name).toBe("Acme Corp");
    expect(c.domain).toBe("acme.com");
    expect(c.industry).toBe("Technology");
    expect(c.city).toBe("Boston");
    expect(c.state).toBe("MA");
    expect(c.country).toBe("US");
    expect(c.phone).toBe("+16170000001");
    expect(c.website).toBe("https://acme.com");
    expect(c.description).toBe("Leading technology solutions");
    expect(c.numberOfEmployees).toBe(500);
    expect(c.annualRevenue).toBe(50000000);
    expect(c.ownerId).toBe("456");
    expect(c.lifecycleStage).toBe("customer");
  });

  it("handles null properties", () => {
    const raw2 = companiesList.results[1] as any;
    const c = normalizeCompany(raw2);
    expect(c.name).toBe("StartupXYZ");
    expect(c.phone).toBe("");
    expect(c.annualRevenue).toBe(0);
    expect(c.ownerId).toBe("");
  });
});

describe("parseCompaniesResponse", () => {
  it("parses companies and cursor", () => {
    const result = parseCompaniesResponse(companiesList);
    expect(result.companies).toHaveLength(2);
    expect(result.nextCursor).toBe("302");
  });

  it("handles null input", () => {
    const result = parseCompaniesResponse(null);
    expect(result.companies).toHaveLength(0);
  });
});

describe("normalizeDeal", () => {
  const raw = dealsList.results[0] as any;

  it("maps all deal fields", () => {
    const d = normalizeDeal(raw);
    expect(d.id).toBe("hs-deal:401");
    expect(d.provider).toBe("hubspot");
    expect(d.providerDealId).toBe("401");
    expect(d.name).toBe("Enterprise License");
    expect(d.amount).toBe(120000);
    expect(d.stage).toBe("closedwon");
    expect(d.pipeline).toBe("default");
    expect(d.closeDate).toBe("2025-04-30");
    expect(d.ownerId).toBe("456");
    expect(d.description).toBe("Annual enterprise license deal");
    expect(d.dealType).toBe("newbusiness");
    expect(d.probability).toBe(100);
  });

  it("handles null properties", () => {
    const raw2 = dealsList.results[1] as any;
    const d = normalizeDeal(raw2);
    expect(d.name).toBe("Pro Upgrade");
    expect(d.description).toBe("");
    expect(d.ownerId).toBe("");
  });
});

describe("parseDealsResponse", () => {
  it("parses deals and cursor", () => {
    const result = parseDealsResponse(dealsList);
    expect(result.deals).toHaveLength(2);
    expect(result.nextCursor).toBe("402");
  });

  it("handles null input", () => {
    const result = parseDealsResponse(null);
    expect(result.deals).toHaveLength(0);
  });
});

describe("normalizeTicket", () => {
  const raw = ticketsList.results[0] as any;

  it("maps all ticket fields", () => {
    const t = normalizeTicket(raw);
    expect(t.id).toBe("hs-ticket:501");
    expect(t.provider).toBe("hubspot");
    expect(t.providerTicketId).toBe("501");
    expect(t.subject).toBe("Login not working");
    expect(t.content).toBe("I cannot log in to my account after resetting my password.");
    expect(t.status).toBe("3");
    expect(t.priority).toBe("HIGH");
    expect(t.category).toBe("BUG");
    expect(t.pipeline).toBe("0");
    expect(t.pipelineStage).toBe("3");
    expect(t.ownerId).toBe("456");
  });

  it("handles null properties", () => {
    const raw2 = ticketsList.results[1] as any;
    const t = normalizeTicket(raw2);
    expect(t.subject).toBe("Feature request: dark mode");
    expect(t.ownerId).toBe("");
  });
});

describe("parseTicketsResponse", () => {
  it("parses tickets and cursor", () => {
    const result = parseTicketsResponse(ticketsList);
    expect(result.tickets).toHaveLength(2);
    expect(result.nextCursor).toBe("502");
  });

  it("handles null input", () => {
    const result = parseTicketsResponse(null);
    expect(result.tickets).toHaveLength(0);
  });
});
