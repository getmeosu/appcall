import { describe, expect, test } from "bun:test";
import peopleSearchFixture from "../fixtures/people_search.json";
import peopleSearchEmptyFixture from "../fixtures/people_search_empty.json";
import organizationsSearchFixture from "../fixtures/organizations_search.json";
import organizationsEnrichFixture from "../fixtures/organizations_enrich.json";

import {
  normalizePerson,
  parsePeopleSearchResponse,
  normalizeOrganization,
  parseOrganizationsSearchResponse,
  parseOrganizationEnrichResponse,
} from "../src/objects";

// ---------------------------------------------------------------------------
// normalizePerson
// ---------------------------------------------------------------------------

describe("normalizePerson", () => {
  test("normalizes a full person from fixture", () => {
    const raw = peopleSearchFixture.people[0];
    const result = normalizePerson(raw);

    expect(result.id).toBe("apl-person:prs_001");
    expect(result.provider).toBe("apollo");
    expect(result.firstName).toBe("Jane");
    expect(result.lastName).toBe("Smith");
    expect(result.name).toBe("Jane Smith");
    expect(result.email).toBe("jane.smith@acme.com");
    expect(result.title).toBe("VP of Sales");
    expect(result.seniority).toBe("vp");
    expect(result.linkedinUrl).toBe("https://www.linkedin.com/in/janesmith");
    expect(result.city).toBe("San Francisco");
    expect(result.state).toBe("California");
    expect(result.country).toBe("United States");
    expect(result.modelVersion).toBe("2026-05-17");
    expect(result.raw).toBe(raw);
  });

  test("normalizes a person with minimal fields", () => {
    const result = normalizePerson({});
    expect(result.id).toBe("apl-person:");
    expect(result.provider).toBe("apollo");
    expect(result.firstName).toBe("");
    expect(result.lastName).toBe("");
    expect(result.email).toBe("");
    expect(result.title).toBe("");
  });

  test("picks up organization_name from organization object when not top-level", () => {
    const result = normalizePerson({ organization: { id: "o1", name: "Nested Corp" } });
    expect(result.organizationName).toBe("Nested Corp");
    expect(result.organizationId).toBe("o1");
  });

  test("prefers top-level organization_name over nested", () => {
    const result = normalizePerson({ organization_name: "Top Corp", organization: { name: "Nested Corp" } });
    expect(result.organizationName).toBe("Top Corp");
  });
});

// ---------------------------------------------------------------------------
// parsePeopleSearchResponse
// ---------------------------------------------------------------------------

describe("parsePeopleSearchResponse", () => {
  test("parses the people_search fixture", () => {
    const result = parsePeopleSearchResponse(peopleSearchFixture);
    expect(result.people).toHaveLength(2);
    expect(result.people[0].id).toBe("apl-person:prs_001");
    expect(result.people[0].firstName).toBe("Jane");
    expect(result.people[1].id).toBe("apl-person:prs_002");
    expect(result.people[1].firstName).toBe("Bob");
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.perPage).toBe(25);
    expect(result.pagination.totalEntries).toBe(142);
    expect(result.pagination.totalPages).toBe(6);
  });

  test("parses empty collection", () => {
    const result = parsePeopleSearchResponse(peopleSearchEmptyFixture);
    expect(result.people).toEqual([]);
    expect(result.pagination.totalEntries).toBe(0);
  });

  test("returns empty for null input", () => {
    const result = parsePeopleSearchResponse(null);
    expect(result.people).toEqual([]);
  });

  test("returns empty for non-record input", () => {
    const result = parsePeopleSearchResponse("string");
    expect(result.people).toEqual([]);
  });

  test("filters non-record entries in people array", () => {
    const result = parsePeopleSearchResponse({
      people: [null, { id: "p1" }, "bad", 42],
      pagination: { page: 1, per_page: 25, total_entries: 1, total_pages: 1 },
    });
    expect(result.people).toHaveLength(1);
    expect(result.people[0].id).toBe("apl-person:p1");
  });
});

// ---------------------------------------------------------------------------
// normalizeOrganization
// ---------------------------------------------------------------------------

describe("normalizeOrganization", () => {
  test("normalizes a full organization from fixture", () => {
    const raw = organizationsSearchFixture.organizations[0];
    const result = normalizeOrganization(raw);

    expect(result.id).toBe("apl-org:org_001");
    expect(result.provider).toBe("apollo");
    expect(result.name).toBe("Acme Corp");
    expect(result.domain).toBe("acme.com");
    expect(result.websiteUrl).toBe("https://acme.com");
    expect(result.linkedinUrl).toBe("https://www.linkedin.com/company/acme-corp");
    expect(result.industry).toBe("Software");
    expect(result.city).toBe("San Francisco");
    expect(result.state).toBe("California");
    expect(result.country).toBe("United States");
    expect(result.numEmployees).toBe(500);
    expect(result.estimatedNumEmployees).toBe(480);
    expect(result.annualRevenue).toBe(50000000);
    expect(result.modelVersion).toBe("2026-05-17");
    expect(result.raw).toBe(raw);
  });

  test("normalizes an organization with minimal fields", () => {
    const result = normalizeOrganization({});
    expect(result.id).toBe("apl-org:");
    expect(result.provider).toBe("apollo");
    expect(result.name).toBe("");
    expect(result.domain).toBe("");
    expect(result.numEmployees).toBe(0);
  });

  test("falls back to domain when primary_domain is absent", () => {
    const result = normalizeOrganization({ domain: "fallback.com" });
    expect(result.domain).toBe("fallback.com");
  });

  test("prefers primary_domain over domain", () => {
    const result = normalizeOrganization({ primary_domain: "primary.com", domain: "secondary.com" });
    expect(result.domain).toBe("primary.com");
  });
});

// ---------------------------------------------------------------------------
// parseOrganizationsSearchResponse
// ---------------------------------------------------------------------------

describe("parseOrganizationsSearchResponse", () => {
  test("parses the organizations_search fixture", () => {
    const result = parseOrganizationsSearchResponse(organizationsSearchFixture);
    expect(result.organizations).toHaveLength(2);
    expect(result.organizations[0].id).toBe("apl-org:org_001");
    expect(result.organizations[0].name).toBe("Acme Corp");
    expect(result.organizations[1].id).toBe("apl-org:org_002");
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.totalEntries).toBe(87);
  });

  test("returns empty for null input", () => {
    const result = parseOrganizationsSearchResponse(null);
    expect(result.organizations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseOrganizationEnrichResponse
// ---------------------------------------------------------------------------

describe("parseOrganizationEnrichResponse", () => {
  test("parses the organizations_enrich fixture", () => {
    const result = parseOrganizationEnrichResponse(organizationsEnrichFixture);
    expect(result.organization).not.toBeNull();
    expect(result.organization!.id).toBe("apl-org:org_001");
    expect(result.organization!.name).toBe("Acme Corp");
    expect(result.organization!.domain).toBe("acme.com");
    expect(result.organization!.industry).toBe("Software");
  });

  test("returns null organization for null input", () => {
    const result = parseOrganizationEnrichResponse(null);
    expect(result.organization).toBeNull();
  });

  test("returns null organization for non-record input", () => {
    const result = parseOrganizationEnrichResponse("string");
    expect(result.organization).toBeNull();
  });

  test("returns null organization when id is missing", () => {
    const result = parseOrganizationEnrichResponse({ organization: { name: "No ID Corp" } });
    expect(result.organization).toBeNull();
  });
});
