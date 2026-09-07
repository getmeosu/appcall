import { describe, expect, test } from "bun:test";
import accountsFixture from "../fixtures/accounts_query.json";
import { normalizeAccount, parseAccountsResponse } from "../src/accounts";

describe("salesforce accounts", () => {
  test("normalizes account from fixture", () => {
    const account = normalizeAccount(accountsFixture.records[0]);

    expect(account.id).toBe("sf-account:001D000001XyZwV");
    expect(account.provider).toBe("salesforce");
    expect(account.providerAccountId).toBe("001D000001XyZwV");
    expect(account.name).toBe("Acme Corp");
    expect(account.type).toBe("Customer");
    expect(account.industry).toBe("Technology");
    expect(account.billingCity).toBe("San Francisco");
    expect(account.billingState).toBe("CA");
    expect(account.billingCountry).toBe("US");
    expect(account.billingPostalCode).toBe("94102");
    expect(account.phone).toBe("+1-555-1000");
    expect(account.website).toBe("https://acme.com");
    expect(account.numberOfEmployees).toBe(500);
    expect(account.annualRevenue).toBe(50000000);
    expect(account.modelVersion).toBe("2026-05-16");
  });

  test("normalizes account with minimal fields", () => {
    const account = normalizeAccount({ Id: "001-min" });

    expect(account.id).toBe("sf-account:001-min");
    expect(account.name).toBe("");
    expect(account.numberOfEmployees).toBe(0);
  });

  test("parses SOQL accounts response", () => {
    const parsed = parseAccountsResponse(accountsFixture);

    expect(parsed.accounts).toHaveLength(2);
    expect(parsed.accounts[0].Name).toBe("Acme Corp");
    expect(parsed.accounts[1].Type).toBe("Prospect");
    expect(parsed.done).toBe(true);
  });

  test("handles non-object response gracefully", () => {
    expect(parseAccountsResponse(null)).toEqual({ accounts: [], nextLink: null, done: true });
  });
});
