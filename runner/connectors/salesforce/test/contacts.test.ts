import { describe, expect, test } from "bun:test";
import contactsFixture from "../fixtures/contacts_query.json";
import contactsPagedFixture from "../fixtures/contacts_query_paged.json";
import {
  normalizeContact,
  parseContactsResponse,
  validateCreateContactInput,
  validateCreateLeadInput,
} from "../src/contacts";
import { parseSalesforceRateLimit } from "../src/http";

describe("salesforce contacts", () => {
  test("normalizes contact from fixture", () => {
    const contact = normalizeContact(contactsFixture.records[0]);

    expect(contact.id).toBe("sf-contact:003D000001AbCdE");
    expect(contact.provider).toBe("salesforce");
    expect(contact.providerContactId).toBe("003D000001AbCdE");
    expect(contact.firstName).toBe("Alice");
    expect(contact.lastName).toBe("Johnson");
    expect(contact.email).toBe("alice@example.com");
    expect(contact.phone).toBe("+1-555-0101");
    expect(contact.mobilePhone).toBe("+1-555-0201");
    expect(contact.title).toBe("VP Engineering");
    expect(contact.department).toBe("Engineering");
    expect(contact.accountId).toBe("001D000001XyZwV");
    expect(contact.mailingCity).toBe("San Francisco");
    expect(contact.mailingState).toBe("CA");
    expect(contact.mailingPostalCode).toBe("94102");
    expect(contact.mailingCountry).toBe("US");
    expect(contact.ownerId).toBe("005D000001OpQrS");
    expect(contact.modelVersion).toBe("2026-05-16");
  });

  test("normalizes contact with minimal fields", () => {
    const contact = normalizeContact({ Id: "003-min" });

    expect(contact.id).toBe("sf-contact:003-min");
    expect(contact.firstName).toBe("");
    expect(contact.lastName).toBe("");
    expect(contact.email).toBe("");
  });

  test("normalizes contact missing optional fields", () => {
    const contact = normalizeContact(contactsFixture.records[2]);

    expect(contact.firstName).toBe("");
    expect(contact.lastName).toBe("Chen");
    expect(contact.accountId).toBe("");
  });

  test("parses SOQL contacts response", () => {
    const parsed = parseContactsResponse(contactsFixture);

    expect(parsed.contacts).toHaveLength(3);
    expect(parsed.contacts[0].Id).toBe("003D000001AbCdE");
    expect(parsed.contacts[1].Id).toBe("003D000001FgHiJ");
    expect(parsed.done).toBe(true);
    expect(parsed.nextLink).toBeNull();
  });

  test("parses paged SOQL response with nextRecordsUrl", () => {
    const parsed = parseContactsResponse(contactsPagedFixture);

    expect(parsed.contacts).toHaveLength(1);
    expect(parsed.done).toBe(false);
    expect(parsed.nextLink).toBe("/services/data/v60.0/query/01gD0000002JkLm-2000");
  });

  test("parses empty SOQL response", () => {
    const parsed = parseContactsResponse({ totalSize: 0, done: true, records: [] });

    expect(parsed.contacts).toHaveLength(0);
    expect(parsed.done).toBe(true);
  });

  test("handles non-object response gracefully", () => {
    expect(parseContactsResponse(null)).toEqual({ contacts: [], nextLink: null, done: true });
    expect(parseContactsResponse("string")).toEqual({ contacts: [], nextLink: null, done: true });
  });

  test("parses Salesforce rate limit from 429", () => {
    expect(parseSalesforceRateLimit(429, { "retry-after": "30" })).toEqual({
      limited: true,
      retryAfterSeconds: 30,
    });
  });

  test("parses Salesforce rate limit from 403 with exhausted remaining", () => {
    const result = parseSalesforceRateLimit(403, {
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 120),
    });
    expect(result.limited).toBe(true);
    if (result.limited) expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("returns not limited for 200", () => {
    expect(parseSalesforceRateLimit(200, {})).toEqual({ limited: false });
  });

  test("validates create contact input", () => {
    expect(validateCreateContactInput({ lastName: "Smith", firstName: "Alice", email: "a@b.com" })).toEqual({
      lastName: "Smith",
      firstName: "Alice",
      email: "a@b.com",
    });
  });

  test("rejects invalid create contact input", () => {
    expect(() => validateCreateContactInput("not object")).toThrow();
    expect(() => validateCreateContactInput({})).toThrow();
    expect(() => validateCreateContactInput({ firstName: "Alice" })).toThrow();
  });

  test("validates create lead input", () => {
    expect(validateCreateLeadInput({ lastName: "Smith", company: "Acme", email: "a@b.com" })).toEqual({
      lastName: "Smith",
      company: "Acme",
      email: "a@b.com",
    });
  });

  test("rejects invalid create lead input", () => {
    expect(() => validateCreateLeadInput("not object")).toThrow();
    expect(() => validateCreateLeadInput({ lastName: "Smith" })).toThrow();
  });
});
