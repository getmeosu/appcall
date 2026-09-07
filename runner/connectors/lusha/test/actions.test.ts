import { describe, expect, test } from "bun:test";
import personEnrichFixture from "../fixtures/person_enrich.json";
import companyEnrichFixture from "../fixtures/company_enrich.json";
import prospectingContactSearchFixture from "../fixtures/prospecting_contact_search.json";
import prospectingContactEnrichFixture from "../fixtures/prospecting_contact_enrich.json";
import prospectingCompanySearchFixture from "../fixtures/prospecting_company_search.json";
import prospectingCompanyEnrichFixture from "../fixtures/prospecting_company_enrich.json";
import bulkPersonFixture from "../fixtures/bulk_person.json";
import usageGetFixture from "../fixtures/usage_get.json";

import {
  enrichPerson,
  enrichCompany,
  searchProspectingContacts,
  enrichProspectingContacts,
  searchProspectingCompanies,
  enrichProspectingCompanies,
  bulkEnrichPersons,
  getUsage,
  validatePersonEnrichInput,
  validateCompanyEnrichInput,
  validateProspectingContactSearchInput,
  validateProspectingContactEnrichInput,
  validateProspectingCompanySearchInput,
  validateProspectingCompanyEnrichInput,
  validateBulkPersonInput,
  validateUsageGetInput,
} from "../src/actions";

// ─── person.enrich ────────────────────────────────────────────────────────────

describe("enrichPerson", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = enrichPerson({ email: "john@acme.com" });
    expect(result.source).toBe("connector");
    expect(result.connector).toBe("lusha");
    expect(result.action).toBe("person.enrich");
    expect((result.validated as { email: string }).email).toBe("john@acme.com");
  });

  test("calls GET /v2/person with api_key header and email param", async () => {
    const requests: Request[] = [];
    const result = await enrichPerson({
      apiKey: "key_test",
      email: "john.smith@acme.com",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(personEnrichFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/person");
    expect(url.searchParams.get("email")).toBe("john.smith@acme.com");
    expect(requests[0].headers.get("api_key")).toBe("key_test");
    expect(result.connector).toBe("lusha");
    expect(result.action).toBe("person.enrich");
    expect(result.source).toBe("connector");
    expect(result.person).toBeDefined();
  });

  test("calls GET /v2/person with linkedinUrl param", async () => {
    const requests: Request[] = [];
    await enrichPerson({
      apiKey: "key_test",
      linkedinUrl: "https://www.linkedin.com/in/johnsmith",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(personEnrichFixture), { status: 200 });
      },
    });
    const url = new URL(requests[0].url);
    expect(url.searchParams.get("linkedinUrl")).toBe("https://www.linkedin.com/in/johnsmith");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(enrichPerson({
      apiKey: "key_test",
      email: "test@test.com",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "30" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });

  test("maps 500 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(enrichPerson({
      apiKey: "key_test",
      email: "test@test.com",
      fetch: async () => new Response("{}", { status: 500 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── company.enrich ───────────────────────────────────────────────────────────

describe("enrichCompany", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = enrichCompany({ domain: "acme.com" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("company.enrich");
    expect((result.validated as { domain: string }).domain).toBe("acme.com");
  });

  test("calls GET /v2/company with domain param", async () => {
    const requests: Request[] = [];
    const result = await enrichCompany({
      apiKey: "key_test",
      domain: "acme.com",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(companyEnrichFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/company");
    expect(url.searchParams.get("domain")).toBe("acme.com");
    expect(requests[0].headers.get("api_key")).toBe("key_test");
    expect(result.action).toBe("company.enrich");
    expect(result.company).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(enrichCompany({
      apiKey: "key_test",
      domain: "acme.com",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "15" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 15 });
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(enrichCompany({
      apiKey: "key_test",
      domain: "notfound.com",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── prospecting.contact.search ───────────────────────────────────────────────

describe("searchProspectingContacts", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = searchProspectingContacts({ jobTitles: ["CTO"], seniorities: ["C-Level"] });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("prospecting.contact.search");
    const validated = result.validated as { jobTitles: string[] };
    expect(validated.jobTitles).toEqual(["CTO"]);
  });

  test("calls POST /prospecting/contact/search with correct body", async () => {
    const requests: Request[] = [];
    const result = await searchProspectingContacts({
      apiKey: "key_test",
      jobTitles: ["CTO", "VP of Engineering"],
      seniorities: ["C-Level", "VP"],
      companyDomains: ["techstart.io"],
      page: 1,
      size: 10,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(prospectingContactSearchFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.lusha.com/prospecting/contact/search");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("api_key")).toBe("key_test");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.jobTitles).toEqual(["CTO", "VP of Engineering"]);
    expect(body.companyDomains).toEqual(["techstart.io"]);
    expect((body.pages as { page: number; size: number }).page).toBe(1);
    expect((body.pages as { page: number; size: number }).size).toBe(10);
    expect(result.action).toBe("prospecting.contact.search");
    expect(result.requestId).toBe("req_search_contact_001");
    expect(Array.isArray(result.contacts)).toBe(true);
    expect((result.contacts as unknown[]).length).toBe(2);
    expect(result.totalResults).toBe(142);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(searchProspectingContacts({
      apiKey: "key_test",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 });
  });
});

// ─── prospecting.contact.enrich ───────────────────────────────────────────────

describe("enrichProspectingContacts", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = enrichProspectingContacts({ requestId: "req_001", contactIds: ["contact_001"] });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("prospecting.contact.enrich");
    const validated = result.validated as { requestId: string; contactIds: string[] };
    expect(validated.requestId).toBe("req_001");
    expect(validated.contactIds).toEqual(["contact_001"]);
  });

  test("throws when requestId is missing", () => {
    expect(() => validateProspectingContactEnrichInput({ contactIds: ["c1"] })).toThrow("requestId is required");
  });

  test("throws when contactIds is missing", () => {
    expect(() => validateProspectingContactEnrichInput({ requestId: "r1" })).toThrow("contactIds is required");
  });

  test("calls POST /prospecting/contact/enrich with correct body", async () => {
    const requests: Request[] = [];
    const result = await enrichProspectingContacts({
      apiKey: "key_test",
      requestId: "req_search_contact_001",
      contactIds: ["contact_001", "contact_002"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(prospectingContactEnrichFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.lusha.com/prospecting/contact/enrich");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.requestId).toBe("req_search_contact_001");
    expect(body.contactIds).toEqual(["contact_001", "contact_002"]);
    expect(result.action).toBe("prospecting.contact.enrich");
    expect(Array.isArray(result.contacts)).toBe(true);
    expect((result.contacts as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(enrichProspectingContacts({
      apiKey: "key_test",
      requestId: "req_001",
      contactIds: ["c1"],
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "20" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 20 });
  });
});

// ─── prospecting.company.search ───────────────────────────────────────────────

describe("searchProspectingCompanies", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = searchProspectingCompanies({ industries: ["Software"], sizes: ["51-200"] });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("prospecting.company.search");
    const validated = result.validated as { industries: string[] };
    expect(validated.industries).toEqual(["Software"]);
  });

  test("calls POST /prospecting/company/search with correct body", async () => {
    const requests: Request[] = [];
    const result = await searchProspectingCompanies({
      apiKey: "key_test",
      industries: ["Software"],
      sizes: ["51-200", "201-500"],
      locations: ["United States"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(prospectingCompanySearchFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.lusha.com/prospecting/company/search");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.industries).toEqual(["Software"]);
    expect(body.sizes).toEqual(["51-200", "201-500"]);
    expect(result.action).toBe("prospecting.company.search");
    expect(result.requestId).toBe("req_search_company_001");
    expect(Array.isArray(result.companies)).toBe(true);
    expect((result.companies as unknown[]).length).toBe(2);
    expect(result.totalResults).toBe(87);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(searchProspectingCompanies({
      apiKey: "key_test",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "10" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── prospecting.company.enrich ───────────────────────────────────────────────

describe("enrichProspectingCompanies", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = enrichProspectingCompanies({ requestId: "req_001", companyIds: ["company_001"] });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("prospecting.company.enrich");
    const validated = result.validated as { requestId: string; companyIds: string[] };
    expect(validated.requestId).toBe("req_001");
  });

  test("throws when requestId is missing", () => {
    expect(() => validateProspectingCompanyEnrichInput({ companyIds: ["c1"] })).toThrow("requestId is required");
  });

  test("throws when companyIds is missing", () => {
    expect(() => validateProspectingCompanyEnrichInput({ requestId: "r1" })).toThrow("companyIds is required");
  });

  test("calls POST /prospecting/company/enrich with correct body", async () => {
    const requests: Request[] = [];
    const result = await enrichProspectingCompanies({
      apiKey: "key_test",
      requestId: "req_search_company_001",
      companyIds: ["company_001"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(prospectingCompanyEnrichFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.lusha.com/prospecting/company/enrich");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.requestId).toBe("req_search_company_001");
    expect(body.companyIds).toEqual(["company_001"]);
    expect(result.action).toBe("prospecting.company.enrich");
    expect(Array.isArray(result.companies)).toBe(true);
  });

  test("maps 500 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(enrichProspectingCompanies({
      apiKey: "key_test",
      requestId: "req_001",
      companyIds: ["c1"],
      fetch: async () => new Response("{}", { status: 500 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── bulk.person ──────────────────────────────────────────────────────────────

describe("bulkEnrichPersons", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = bulkEnrichPersons({
      contacts: [{ email: "a@b.com" }, { linkedinUrl: "https://www.linkedin.com/in/test" }],
    });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("bulk.person");
    const validated = result.validated as { contacts: { email: string }[] };
    expect(validated.contacts).toHaveLength(2);
  });

  test("throws when contacts is missing", () => {
    expect(() => validateBulkPersonInput({})).toThrow("contacts is required");
  });

  test("throws when contacts[i] is not an object", () => {
    expect(() => validateBulkPersonInput({ contacts: ["bad"] })).toThrow("contacts[0] must be an object");
  });

  test("calls POST /v2/person (bulk) with correct body", async () => {
    const requests: Request[] = [];
    const result = await bulkEnrichPersons({
      apiKey: "key_test",
      contacts: [
        { contactId: "my-ref-001", email: "sarah.williams@growthco.com" },
        { contactId: "my-ref-002", linkedinUrl: "https://www.linkedin.com/in/davidmartinez" },
      ],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(bulkPersonFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.lusha.com/v2/person");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("api_key")).toBe("key_test");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(Array.isArray(body.contacts)).toBe(true);
    expect((body.contacts as unknown[]).length).toBe(2);
    expect(result.action).toBe("bulk.person");
    expect(Array.isArray(result.contacts)).toBe(true);
    expect((result.contacts as unknown[]).length).toBe(2);
    expect(result.requestId).toBe("req_bulk_001");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(bulkEnrichPersons({
      apiKey: "key_test",
      contacts: [{ email: "test@test.com" }],
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "45" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 45 });
  });

  test("maps 400 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(bulkEnrichPersons({
      apiKey: "key_test",
      contacts: [{ email: "bad" }],
      fetch: async () => new Response("{}", { status: 400 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── usage.get ────────────────────────────────────────────────────────────────

describe("getUsage", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = getUsage({});
    expect(result.source).toBe("connector");
    expect(result.action).toBe("usage.get");
    expect(result.validated).toEqual({});
  });

  test("calls GET /credits with api_key header", async () => {
    const requests: Request[] = [];
    const result = await getUsage({
      apiKey: "key_test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(usageGetFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.lusha.com/credits");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("api_key")).toBe("key_test");
    expect(result.action).toBe("usage.get");
    expect(result.credits).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getUsage({
      apiKey: "key_test",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "5" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 5 });
  });

  test("maps 401 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getUsage({
      apiKey: "key_test",
      fetch: async () => new Response("{}", { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
