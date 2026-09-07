import { describe, expect, test } from "bun:test";
import contactsFixture from "../fixtures/contacts_query.json";
import leadsFixture from "../fixtures/leads_query.json";
import accountsFixture from "../fixtures/accounts_query.json";
import opportunitiesFixture from "../fixtures/opportunities_query.json";
import casesFixture from "../fixtures/cases_query.json";
import {
  executeContactsListSync,
  executeLeadsListSync,
  executeAccountsListSync,
  executeOpportunitiesListSync,
  executeCasesListSync,
} from "../src/sync";

describe("salesforce sync operations", () => {
  test("contacts.list sync parses and normalizes SOQL results", () => {
    const result = executeContactsListSync({ response: contactsFixture });

    expect(result.provider).toBe("salesforce");
    expect(result.operation).toBe("contacts.list");
    expect(result.items).toHaveLength(3);
    expect(result.items[0].id).toBe("sf-contact:003D000001AbCdE");
    expect(result.items[0].firstName).toBe("Alice");
    expect(result.items[0].lastName).toBe("Johnson");
    expect(result.nextLink).toBeNull();
  });

  test("contacts.list sync handles empty response", () => {
    const result = executeContactsListSync({ response: { totalSize: 0, done: true, records: [] } });

    expect(result.items).toHaveLength(0);
  });

  test("leads.list sync parses and normalizes SOQL results", () => {
    const result = executeLeadsListSync({ response: leadsFixture });

    expect(result.provider).toBe("salesforce");
    expect(result.operation).toBe("leads.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].company).toBe("Acme Corp");
    expect(result.items[1].status).toBe("Working");
  });

  test("accounts.list sync parses and normalizes SOQL results", () => {
    const result = executeAccountsListSync({ response: accountsFixture });

    expect(result.provider).toBe("salesforce");
    expect(result.operation).toBe("accounts.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe("Acme Corp");
    expect(result.items[0].numberOfEmployees).toBe(500);
    expect(result.items[1].type).toBe("Prospect");
  });

  test("opportunities.list sync parses and normalizes SOQL results", () => {
    const result = executeOpportunitiesListSync({ response: opportunitiesFixture });

    expect(result.provider).toBe("salesforce");
    expect(result.operation).toBe("opportunities.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].amount).toBe(120000);
    expect(result.items[1].isWon).toBe(true);
  });

  test("cases.list sync parses and normalizes SOQL results", () => {
    const result = executeCasesListSync({ response: casesFixture });

    expect(result.provider).toBe("salesforce");
    expect(result.operation).toBe("cases.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].caseNumber).toBe("00001001");
    expect(result.items[1].isClosed).toBe(true);
  });

  test("all syncs handle non-object response gracefully", () => {
    expect(() => executeContactsListSync({ response: "bad" })).toThrow();
    expect(() => executeLeadsListSync({ response: [] })).toThrow();
  });
});
