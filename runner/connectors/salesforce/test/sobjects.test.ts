import { describe, expect, test } from "bun:test";
import getAccountFixture from "../fixtures/get_account.json";
import getContactFixture from "../fixtures/get_contact.json";
import getOpportunityFixture from "../fixtures/get_opportunity.json";
import queryResultFixture from "../fixtures/query_result.json";
import searchResultFixture from "../fixtures/search_result.json";
import createAccountFixture from "../fixtures/create_account.json";
import {
  createAccount,
  getAccount,
  updateAccount,
  getContact,
  updateContact,
  deleteContact,
  updateLead,
  getOpportunity,
  querySobjects,
  searchSobjects,
} from "../src/actions";

const BASE_URL = "https://org.my.salesforce.com";
const TOKEN = "00D.test-token";
const AUTH_HEADER = `Bearer ${TOKEN}`;

// ── helper ───────────────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200) {
  const requests: Request[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };
  return { requests, fetch };
}

// ── accounts.create ──────────────────────────────────────────────────────────

describe("accounts.create", () => {
  test("validates input without token", () => {
    const result = createAccount({ name: "Acme Corp" });
    expect(result.source).toBe("connector");
    expect(result.connector).toBe("salesforce");
    expect(result.action).toBe("accounts.create");
    expect((result.validated as Record<string, unknown>).name).toBe("Acme Corp");
  });

  test("rejects missing name", () => {
    expect(() => createAccount({})).toThrow("name is required");
    expect(() => createAccount("not an object")).toThrow();
  });

  test("posts to Salesforce API and returns account", async () => {
    const { requests, fetch } = mockFetch(createAccountFixture, 201);
    const result = await createAccount({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      name: "Acme Corp",
      industry: "Technology",
      fetch,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`${BASE_URL}/services/data/v60.0/sobjects/Account`);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe(AUTH_HEADER);
    expect(result.connector).toBe("salesforce");
    expect(result.action).toBe("accounts.create");
    expect((result.account as Record<string, unknown>).providerAccountId).toBe("001D000002XyZaC");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const { fetch } = mockFetch({}, 429);
    await expect(
      createAccount({ accessToken: TOKEN, instanceUrl: BASE_URL, name: "Fail", fetch })
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });

  test("maps 500 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const { fetch } = mockFetch({ message: "Internal Server Error" }, 500);
    await expect(
      createAccount({ accessToken: TOKEN, instanceUrl: BASE_URL, name: "Fail", fetch })
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ── accounts.get ─────────────────────────────────────────────────────────────

describe("accounts.get", () => {
  test("validates input without token", () => {
    const result = getAccount({ id: "001D000002XyZaC" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("accounts.get");
    expect((result.validated as Record<string, unknown>).id).toBe("001D000002XyZaC");
  });

  test("rejects missing id", () => {
    expect(() => getAccount({})).toThrow("id is required");
  });

  test("GETs the correct URL and returns normalized account", async () => {
    const { requests, fetch } = mockFetch(getAccountFixture, 200);
    const result = await getAccount({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      id: "001D000002XyZaC",
      fetch,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`${BASE_URL}/services/data/v60.0/sobjects/Account/001D000002XyZaC`);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe(AUTH_HEADER);
    const account = result.account as Record<string, unknown>;
    expect(account.providerAccountId).toBe("001D000002XyZaC");
    expect(account.name).toBe("Acme Corp");
    expect(account.industry).toBe("Technology");
    expect(account.provider).toBe("salesforce");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const { fetch } = mockFetch({}, 429);
    await expect(
      getAccount({ accessToken: TOKEN, instanceUrl: BASE_URL, id: "001xxx", fetch })
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ── accounts.update ──────────────────────────────────────────────────────────

describe("accounts.update", () => {
  test("validates input without token", () => {
    const result = updateAccount({ id: "001D000002XyZaC", name: "Renamed" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("accounts.update");
    expect((result.validated as Record<string, unknown>).id).toBe("001D000002XyZaC");
  });

  test("rejects missing id", () => {
    expect(() => updateAccount({ name: "No id" })).toThrow("id is required");
  });

  test("PATCHes the correct URL and returns updated:true", async () => {
    const { requests, fetch } = mockFetch("", 204);
    const result = await updateAccount({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      id: "001D000002XyZaC",
      name: "Renamed Corp",
      industry: "Finance",
      fetch,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`${BASE_URL}/services/data/v60.0/sobjects/Account/001D000002XyZaC`);
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].headers.get("Authorization")).toBe(AUTH_HEADER);
    expect(result.updated).toBe(true);
    expect(result.id).toBe("001D000002XyZaC");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const { fetch } = mockFetch({}, 429);
    await expect(
      updateAccount({ accessToken: TOKEN, instanceUrl: BASE_URL, id: "001xxx", name: "Fail", fetch })
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ── contacts.get ─────────────────────────────────────────────────────────────

describe("contacts.get", () => {
  test("validates input without token", () => {
    const result = getContact({ id: "003D000002XyZaB" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("contacts.get");
  });

  test("rejects missing id", () => {
    expect(() => getContact({})).toThrow("id is required");
  });

  test("GETs the correct URL and returns normalized contact", async () => {
    const { requests, fetch } = mockFetch(getContactFixture, 200);
    const result = await getContact({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      id: "003D000002XyZaB",
      fetch,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`${BASE_URL}/services/data/v60.0/sobjects/Contact/003D000002XyZaB`);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe(AUTH_HEADER);
    const contact = result.contact as Record<string, unknown>;
    expect(contact.providerContactId).toBe("003D000002XyZaB");
    expect(contact.firstName).toBe("Alice");
    expect(contact.lastName).toBe("Smith");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const { fetch } = mockFetch({}, 429);
    await expect(
      getContact({ accessToken: TOKEN, instanceUrl: BASE_URL, id: "003xxx", fetch })
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ── contacts.update ──────────────────────────────────────────────────────────

describe("contacts.update", () => {
  test("validates input without token", () => {
    const result = updateContact({ id: "003D000002XyZaB", email: "new@example.com" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("contacts.update");
  });

  test("rejects missing id", () => {
    expect(() => updateContact({ email: "x@x.com" })).toThrow("id is required");
  });

  test("PATCHes the correct URL", async () => {
    const { requests, fetch } = mockFetch("", 204);
    const result = await updateContact({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      id: "003D000002XyZaB",
      email: "new@example.com",
      title: "CTO",
      fetch,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`${BASE_URL}/services/data/v60.0/sobjects/Contact/003D000002XyZaB`);
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].headers.get("Authorization")).toBe(AUTH_HEADER);
    expect(result.updated).toBe(true);
  });

  test("maps 500 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const { fetch } = mockFetch({}, 500);
    await expect(
      updateContact({ accessToken: TOKEN, instanceUrl: BASE_URL, id: "003xxx", fetch })
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ── contacts.delete ──────────────────────────────────────────────────────────

describe("contacts.delete", () => {
  test("validates input without token", () => {
    const result = deleteContact({ id: "003D000002XyZaB" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("contacts.delete");
  });

  test("rejects missing id", () => {
    expect(() => deleteContact({})).toThrow("id is required");
  });

  test("DELETEs the correct URL", async () => {
    const { requests, fetch } = mockFetch("", 204);
    const result = await deleteContact({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      id: "003D000002XyZaB",
      fetch,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`${BASE_URL}/services/data/v60.0/sobjects/Contact/003D000002XyZaB`);
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].headers.get("Authorization")).toBe(AUTH_HEADER);
    expect(result.deleted).toBe(true);
    expect(result.id).toBe("003D000002XyZaB");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const { fetch } = mockFetch({}, 429);
    await expect(
      deleteContact({ accessToken: TOKEN, instanceUrl: BASE_URL, id: "003xxx", fetch })
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ── leads.update ─────────────────────────────────────────────────────────────

describe("leads.update", () => {
  test("validates input without token", () => {
    const result = updateLead({ id: "00Q-lead1", status: "Working" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("leads.update");
    expect((result.validated as Record<string, unknown>).id).toBe("00Q-lead1");
  });

  test("rejects missing id", () => {
    expect(() => updateLead({ status: "Working" })).toThrow("id is required");
  });

  test("PATCHes the correct URL", async () => {
    const { requests, fetch } = mockFetch("", 204);
    const result = await updateLead({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      id: "00Q-lead1",
      status: "Qualified",
      company: "Updated Corp",
      fetch,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`${BASE_URL}/services/data/v60.0/sobjects/Lead/00Q-lead1`);
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].headers.get("Authorization")).toBe(AUTH_HEADER);
    expect(result.updated).toBe(true);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const { fetch } = mockFetch({}, 429);
    await expect(
      updateLead({ accessToken: TOKEN, instanceUrl: BASE_URL, id: "00Qxxx", fetch })
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ── opportunities.get ────────────────────────────────────────────────────────

describe("opportunities.get", () => {
  test("validates input without token", () => {
    const result = getOpportunity({ id: "006D000002XyZaD" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("opportunities.get");
  });

  test("rejects missing id", () => {
    expect(() => getOpportunity({})).toThrow("id is required");
  });

  test("GETs the correct URL and returns normalized opportunity", async () => {
    const { requests, fetch } = mockFetch(getOpportunityFixture, 200);
    const result = await getOpportunity({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      id: "006D000002XyZaD",
      fetch,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`${BASE_URL}/services/data/v60.0/sobjects/Opportunity/006D000002XyZaD`);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe(AUTH_HEADER);
    const opp = result.opportunity as Record<string, unknown>;
    expect(opp.providerOpportunityId).toBe("006D000002XyZaD");
    expect(opp.name).toBe("Enterprise Deal Q3");
    expect(opp.stage).toBe("Proposal/Price Quote");
    expect(opp.amount).toBe(250000);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const { fetch } = mockFetch({}, 429);
    await expect(
      getOpportunity({ accessToken: TOKEN, instanceUrl: BASE_URL, id: "006xxx", fetch })
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ── sobjects.query ───────────────────────────────────────────────────────────

describe("sobjects.query", () => {
  test("validates input without token", () => {
    const soql = "SELECT Id, FirstName, LastName FROM Contact LIMIT 10";
    const result = querySobjects({ query: soql });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("sobjects.query");
    expect((result.validated as Record<string, unknown>).query).toBe(soql);
  });

  test("rejects missing query", () => {
    expect(() => querySobjects({})).toThrow("query is required");
  });

  test("GETs the correct SOQL query URL", async () => {
    const { requests, fetch } = mockFetch(queryResultFixture, 200);
    const soql = "SELECT Id, FirstName, LastName FROM Contact LIMIT 10";
    const result = await querySobjects({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      query: soql,
      fetch,
    });

    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/services/data/v60.0/query");
    expect(url.searchParams.get("q")).toBe(soql);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe(AUTH_HEADER);

    const queryResult = result.result as Record<string, unknown>;
    expect(queryResult.totalSize).toBe(2);
    expect(queryResult.done).toBe(true);
    expect(Array.isArray(queryResult.records)).toBe(true);
    expect((queryResult.records as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const { fetch } = mockFetch({}, 429);
    await expect(
      querySobjects({ accessToken: TOKEN, instanceUrl: BASE_URL, query: "SELECT Id FROM Contact", fetch })
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });

  test("maps 400 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const { fetch } = mockFetch([{ message: "MALFORMED_QUERY", errorCode: "MALFORMED_QUERY" }], 400);
    await expect(
      querySobjects({ accessToken: TOKEN, instanceUrl: BASE_URL, query: "INVALID SOQL", fetch })
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ── sobjects.search ──────────────────────────────────────────────────────────

describe("sobjects.search", () => {
  test("validates input without token", () => {
    const sosl = "FIND {Alice} IN ALL FIELDS RETURNING Contact(Id, Name)";
    const result = searchSobjects({ query: sosl });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("sobjects.search");
    expect((result.validated as Record<string, unknown>).query).toBe(sosl);
  });

  test("rejects missing query", () => {
    expect(() => searchSobjects({})).toThrow("query is required");
  });

  test("GETs the correct SOSL search URL", async () => {
    const { requests, fetch } = mockFetch(searchResultFixture, 200);
    const sosl = "FIND {Alice} IN ALL FIELDS RETURNING Contact(Id, Name)";
    const result = await searchSobjects({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      query: sosl,
      fetch,
    });

    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/services/data/v60.0/search");
    expect(url.searchParams.get("q")).toBe(sosl);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe(AUTH_HEADER);

    const searchResult = result.result as Record<string, unknown>;
    expect(Array.isArray(searchResult.searchRecords)).toBe(true);
    expect(searchResult.count).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const { fetch } = mockFetch({}, 429);
    await expect(
      searchSobjects({ accessToken: TOKEN, instanceUrl: BASE_URL, query: "FIND {X}", fetch })
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });

  test("maps 400 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const { fetch } = mockFetch([{ message: "MALFORMED_SEARCH", errorCode: "MALFORMED_SEARCH" }], 400);
    await expect(
      searchSobjects({ accessToken: TOKEN, instanceUrl: BASE_URL, query: "FIND INVALID", fetch })
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
