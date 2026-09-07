import { describe, expect, it } from "bun:test";
import { executeContactsListSync, executeCompaniesListSync, executeDealsListSync, executeTicketsListSync } from "../src/sync";
import contactsList from "../fixtures/contacts_list.json";
import contactsListNoPage from "../fixtures/contacts_list_no_page.json";
import companiesList from "../fixtures/companies_list.json";
import dealsList from "../fixtures/deals_list.json";
import ticketsList from "../fixtures/tickets_list.json";

describe("contacts.list sync", () => {
  it("returns normalized contacts with cursor", () => {
    const result = executeContactsListSync({ response: contactsList });
    expect(result.provider).toBe("hubspot");
    expect(result.operation).toBe("contacts.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("hs-contact:101");
    expect(result.items[0].firstName).toBe("Jane");
    expect(result.nextCursor).toBe("102");
  });

  it("returns no cursor on last page", () => {
    const result = executeContactsListSync({ response: contactsListNoPage });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });
});

describe("companies.list sync", () => {
  it("returns normalized companies with cursor", () => {
    const result = executeCompaniesListSync({ response: companiesList });
    expect(result.provider).toBe("hubspot");
    expect(result.operation).toBe("companies.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("hs-company:301");
    expect(result.items[0].name).toBe("Acme Corp");
    expect(result.items[0].numberOfEmployees).toBe(500);
    expect(result.nextCursor).toBe("302");
  });
});

describe("deals.list sync", () => {
  it("returns normalized deals with cursor", () => {
    const result = executeDealsListSync({ response: dealsList });
    expect(result.provider).toBe("hubspot");
    expect(result.operation).toBe("deals.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("hs-deal:401");
    expect(result.items[0].amount).toBe(120000);
    expect(result.nextCursor).toBe("402");
  });
});

describe("tickets.list sync", () => {
  it("returns normalized tickets with cursor", () => {
    const result = executeTicketsListSync({ response: ticketsList });
    expect(result.provider).toBe("hubspot");
    expect(result.operation).toBe("tickets.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("hs-ticket:501");
    expect(result.items[0].priority).toBe("HIGH");
    expect(result.nextCursor).toBe("502");
  });
});
