import { describe, expect, test } from "bun:test";
import getAccountFixture from "../fixtures/get_account.json";
import getContactFixture from "../fixtures/get_contact.json";
import getOpportunityFixture from "../fixtures/get_opportunity.json";
import queryResultFixture from "../fixtures/query_result.json";
import searchResultFixture from "../fixtures/search_result.json";
import createAccountFixture from "../fixtures/create_account.json";
import getCaseFixture from "../fixtures/get_case.json";
import describeFixture from "../fixtures/sobject_describe.json";
import usersMeFixture from "../fixtures/users_me.json";
import {
  createAccount,
  getAccount,
  updateAccount,
  deleteAccount,
  getContact,
  updateContact,
  deleteContact,
  updateLead,
  deleteLead,
  getOpportunity,
  updateOpportunity,
  deleteOpportunity,
  getCase,
  updateCase,
  deleteCase,
  querySobjects,
  searchSobjects,
  describeSobject,
  getCurrentUser,
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

// ── accounts.delete ──────────────────────────────────────────────────────────

describe("accounts.delete", () => {
  test("validates input without token", () => {
    const result = deleteAccount({ id: "001D000002XyZaC" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("accounts.delete");
  });

  test("rejects missing id", () => {
    expect(() => deleteAccount({})).toThrow("id is required");
  });

  test("DELETEs the correct URL", async () => {
    const { requests, fetch } = mockFetch("", 204);
    const result = await deleteAccount({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      id: "001D000002XyZaC",
      fetch,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`${BASE_URL}/services/data/v60.0/sobjects/Account/001D000002XyZaC`);
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].headers.get("Authorization")).toBe(AUTH_HEADER);
    expect(result.deleted).toBe(true);
    expect(result.id).toBe("001D000002XyZaC");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const { fetch } = mockFetch({}, 429);
    await expect(
      deleteAccount({ accessToken: TOKEN, instanceUrl: BASE_URL, id: "001xxx", fetch })
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ── leads.delete ─────────────────────────────────────────────────────────────

describe("leads.delete", () => {
  test("validates input without token", () => {
    const result = deleteLead({ id: "00Q-lead1" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("leads.delete");
  });

  test("rejects missing id", () => {
    expect(() => deleteLead({})).toThrow("id is required");
  });

  test("DELETEs the correct URL", async () => {
    const { requests, fetch } = mockFetch("", 204);
    const result = await deleteLead({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      id: "00Q-lead1",
      fetch,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`${BASE_URL}/services/data/v60.0/sobjects/Lead/00Q-lead1`);
    expect(requests[0].method).toBe("DELETE");
    expect(result.deleted).toBe(true);
    expect(result.id).toBe("00Q-lead1");
  });
});

// ── opportunities.update ─────────────────────────────────────────────────────

describe("opportunities.update", () => {
  test("validates input without token", () => {
    const result = updateOpportunity({ id: "006D000002XyZaD", stage: "Closed Won" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("opportunities.update");
  });

  test("rejects missing id", () => {
    expect(() => updateOpportunity({ stage: "Closed Won" })).toThrow("id is required");
  });

  test("PATCHes the correct URL", async () => {
    const { requests, fetch } = mockFetch("", 204);
    const result = await updateOpportunity({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      id: "006D000002XyZaD",
      name: "Renamed Deal",
      stage: "Negotiation",
      amount: 300000,
      fetch,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`${BASE_URL}/services/data/v60.0/sobjects/Opportunity/006D000002XyZaD`);
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].headers.get("Authorization")).toBe(AUTH_HEADER);
    const body = JSON.parse(await requests[0].text());
    expect(body).toEqual({ Name: "Renamed Deal", StageName: "Negotiation", Amount: 300000 });
    expect(result.updated).toBe(true);
    expect(result.id).toBe("006D000002XyZaD");
  });

  test("maps 500 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const { fetch } = mockFetch({}, 500);
    await expect(
      updateOpportunity({ accessToken: TOKEN, instanceUrl: BASE_URL, id: "006xxx", fetch })
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ── opportunities.delete ─────────────────────────────────────────────────────

describe("opportunities.delete", () => {
  test("validates input without token", () => {
    const result = deleteOpportunity({ id: "006D000002XyZaD" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("opportunities.delete");
  });

  test("rejects missing id", () => {
    expect(() => deleteOpportunity({})).toThrow("id is required");
  });

  test("DELETEs the correct URL", async () => {
    const { requests, fetch } = mockFetch("", 204);
    const result = await deleteOpportunity({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      id: "006D000002XyZaD",
      fetch,
    });

    expect(requests[0].url).toBe(`${BASE_URL}/services/data/v60.0/sobjects/Opportunity/006D000002XyZaD`);
    expect(requests[0].method).toBe("DELETE");
    expect(result.deleted).toBe(true);
  });
});

// ── cases.get ────────────────────────────────────────────────────────────────

describe("cases.get", () => {
  test("validates input without token", () => {
    const result = getCase({ id: "500D000001AbCdE" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("cases.get");
  });

  test("rejects missing id", () => {
    expect(() => getCase({})).toThrow("id is required");
  });

  test("GETs the correct URL and returns normalized case", async () => {
    const { requests, fetch } = mockFetch(getCaseFixture, 200);
    const result = await getCase({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      id: "500D000001AbCdE",
      fetch,
    });

    expect(requests[0].url).toBe(`${BASE_URL}/services/data/v60.0/sobjects/Case/500D000001AbCdE`);
    expect(requests[0].method).toBe("GET");
    const c = result.case as Record<string, unknown>;
    expect(c.providerCaseId).toBe("500D000001AbCdE");
    expect(c.subject).toBe("Unable to export data");
    expect(c.status).toBe("New");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const { fetch } = mockFetch({}, 429);
    await expect(
      getCase({ accessToken: TOKEN, instanceUrl: BASE_URL, id: "500xxx", fetch })
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ── cases.update ─────────────────────────────────────────────────────────────

describe("cases.update", () => {
  test("validates input without token", () => {
    const result = updateCase({ id: "500D000001AbCdE", status: "Working" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("cases.update");
  });

  test("rejects missing id", () => {
    expect(() => updateCase({ status: "Working" })).toThrow("id is required");
  });

  test("PATCHes the correct URL", async () => {
    const { requests, fetch } = mockFetch("", 204);
    const result = await updateCase({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      id: "500D000001AbCdE",
      status: "Working",
      priority: "High",
      fetch,
    });

    expect(requests[0].url).toBe(`${BASE_URL}/services/data/v60.0/sobjects/Case/500D000001AbCdE`);
    expect(requests[0].method).toBe("PATCH");
    const body = JSON.parse(await requests[0].text());
    expect(body).toEqual({ Status: "Working", Priority: "High" });
    expect(result.updated).toBe(true);
  });
});

// ── cases.delete ─────────────────────────────────────────────────────────────

describe("cases.delete", () => {
  test("validates input without token", () => {
    const result = deleteCase({ id: "500D000001AbCdE" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("cases.delete");
  });

  test("rejects missing id", () => {
    expect(() => deleteCase({})).toThrow("id is required");
  });

  test("DELETEs the correct URL", async () => {
    const { requests, fetch } = mockFetch("", 204);
    const result = await deleteCase({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      id: "500D000001AbCdE",
      fetch,
    });

    expect(requests[0].url).toBe(`${BASE_URL}/services/data/v60.0/sobjects/Case/500D000001AbCdE`);
    expect(requests[0].method).toBe("DELETE");
    expect(result.deleted).toBe(true);
  });
});

// ── sobjects.describe ────────────────────────────────────────────────────────

describe("sobjects.describe", () => {
  test("validates input without token", () => {
    const result = describeSobject({ sobject: "Account" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("sobjects.describe");
    expect((result.validated as Record<string, unknown>).sobject).toBe("Account");
  });

  test("rejects missing sobject", () => {
    expect(() => describeSobject({})).toThrow("sobject is required");
  });

  test("GETs the describe URL and returns metadata", async () => {
    const { requests, fetch } = mockFetch(describeFixture, 200);
    const result = await describeSobject({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      sobject: "Account",
      fetch,
    });

    expect(requests[0].url).toBe(`${BASE_URL}/services/data/v60.0/sobjects/Account/describe`);
    expect(requests[0].method).toBe("GET");
    const describe = result.describe as Record<string, unknown>;
    expect(describe.name).toBe("Account");
    expect(describe.label).toBe("Account");
    expect(describe.keyPrefix).toBe("001");
    expect(Array.isArray(describe.fields)).toBe(true);
    expect((describe.fields as unknown[]).length).toBe(2);
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const { fetch } = mockFetch({}, 404);
    await expect(
      describeSobject({ accessToken: TOKEN, instanceUrl: BASE_URL, sobject: "Missing__c", fetch })
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ── users.me ─────────────────────────────────────────────────────────────────

describe("users.me", () => {
  test("validates input without token", () => {
    const result = getCurrentUser({});
    expect(result.source).toBe("connector");
    expect(result.action).toBe("users.me");
  });

  test("GETs Chatter users/me", async () => {
    const { requests, fetch } = mockFetch(usersMeFixture, 200);
    const result = await getCurrentUser({
      accessToken: TOKEN,
      instanceUrl: BASE_URL,
      fetch,
    });

    expect(requests[0].url).toBe(`${BASE_URL}/services/data/v60.0/chatter/users/me`);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe(AUTH_HEADER);
    const user = result.user as Record<string, unknown>;
    expect(user.providerUserId).toBe("005D000003X5yZaA");
    expect(user.username).toBe("alice@example.com");
    expect(user.email).toBe("alice@example.com");
    expect(user.displayName).toBe("Alice Smith");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const { fetch } = mockFetch({}, 429);
    await expect(
      getCurrentUser({ accessToken: TOKEN, instanceUrl: BASE_URL, fetch })
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});
