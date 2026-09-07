import { describe, expect, test } from "bun:test";
import personEnrichFixture from "../fixtures/person_enrich.json";
import companyEnrichFixture from "../fixtures/company_enrich.json";
import {
  normalizePerson,
  parsePersonResponse,
  normalizeCompany,
  parseCompanyResponse,
} from "../src/objects";

// ---------------------------------------------------------------------------
// normalizePerson
// ---------------------------------------------------------------------------

describe("normalizePerson", () => {
  test("normalizes a full person from fixture data", () => {
    const raw = personEnrichFixture.data;
    const result = normalizePerson(raw);

    expect(result.id).toBe("lusha-person:contact_abc123");
    expect(result.provider).toBe("lusha");
    expect(result.firstName).toBe("John");
    expect(result.lastName).toBe("Smith");
    expect(result.fullName).toBe("John Smith");
    expect(result.jobTitle).toBe("VP of Engineering");
    expect(result.companyName).toBe("Acme Corp");
    expect(result.companyDomain).toBe("acme.com");
    expect(result.linkedinUrl).toBe("https://www.linkedin.com/in/johnsmith");
    expect(result.emails).toEqual(["john.smith@acme.com"]);
    expect(result.phones).toEqual(["+1 (415) 555-0123"]);
    expect(result.location).toBe("San Francisco, California, United States");
    expect(result.modelVersion).toBe("2026-05-17");
    expect(result.raw).toBe(raw);
  });

  test("normalizes a person with minimal fields", () => {
    const result = normalizePerson({});

    expect(result.id).toBe("lusha-person:");
    expect(result.provider).toBe("lusha");
    expect(result.firstName).toBe("");
    expect(result.lastName).toBe("");
    expect(result.fullName).toBe("");
    expect(result.jobTitle).toBe("");
    expect(result.emails).toEqual([]);
    expect(result.phones).toEqual([]);
    expect(result.location).toBe("");
  });

  test("extracts emails from array of email objects", () => {
    const result = normalizePerson({
      id: "p1",
      emails: [
        { email: "work@co.com", type: "work" },
        { email: "personal@gmail.com", type: "personal" },
      ],
    });
    expect(result.emails).toEqual(["work@co.com", "personal@gmail.com"]);
  });

  test("extracts phones from array of phone objects", () => {
    const result = normalizePerson({
      id: "p1",
      phones: [
        { localizedNumber: "+1 (212) 555-1234", number: "+12125551234", type: "work" },
      ],
    });
    expect(result.phones).toEqual(["+1 (212) 555-1234"]);
  });

  test("falls back to phone number field when localizedNumber absent", () => {
    const result = normalizePerson({
      phones: [{ number: "+12125551234", type: "direct" }],
    });
    expect(result.phones).toEqual(["+12125551234"]);
  });

  test("builds fullName from firstName + lastName when fullName absent", () => {
    const result = normalizePerson({ firstName: "Jane", lastName: "Doe" });
    expect(result.fullName).toBe("Jane Doe");
  });
});

// ---------------------------------------------------------------------------
// parsePersonResponse
// ---------------------------------------------------------------------------

describe("parsePersonResponse", () => {
  test("parses the person_enrich fixture", () => {
    const result = parsePersonResponse(personEnrichFixture);
    expect(result.person).not.toBeNull();
    expect(result.person!.id).toBe("lusha-person:contact_abc123");
    expect(result.person!.firstName).toBe("John");
    expect(result.person!.emails).toEqual(["john.smith@acme.com"]);
  });

  test("returns null person for null input", () => {
    expect(parsePersonResponse(null).person).toBeNull();
  });

  test("returns null person for non-record input", () => {
    expect(parsePersonResponse("string").person).toBeNull();
  });

  test("parses response with person key", () => {
    const result = parsePersonResponse({ person: { id: "p99", firstName: "Test" } });
    expect(result.person).not.toBeNull();
    expect(result.person!.firstName).toBe("Test");
  });
});

// ---------------------------------------------------------------------------
// normalizeCompany
// ---------------------------------------------------------------------------

describe("normalizeCompany", () => {
  test("normalizes a full company from fixture data", () => {
    const raw = companyEnrichFixture.data;
    const result = normalizeCompany(raw);

    expect(result.id).toBe("lusha-company:company_xyz789");
    expect(result.provider).toBe("lusha");
    expect(result.name).toBe("Acme Corp");
    expect(result.domain).toBe("acme.com");
    expect(result.industry).toBe("Software");
    expect(result.employeeCount).toBe(250);
    expect(result.revenue).toBe("$10M - $50M");
    expect(result.location).toBe("San Francisco, California, United States");
    expect(result.linkedinUrl).toBe("https://www.linkedin.com/company/acme-corp");
    expect(result.website).toBe("https://acme.com");
    expect(result.phone).toBe("+1 (415) 555-0100");
    expect(result.modelVersion).toBe("2026-05-17");
    expect(result.raw).toBe(raw);
  });

  test("normalizes a company with minimal fields", () => {
    const result = normalizeCompany({});
    expect(result.id).toBe("lusha-company:");
    expect(result.provider).toBe("lusha");
    expect(result.name).toBe("");
    expect(result.domain).toBe("");
    expect(result.employeeCount).toBe(0);
    expect(result.location).toBe("");
  });

  test("builds location from city, state, country", () => {
    const result = normalizeCompany({
      location: { city: "Austin", state: "Texas", country: "United States" },
    });
    expect(result.location).toBe("Austin, Texas, United States");
  });

  test("omits empty location parts", () => {
    const result = normalizeCompany({
      location: { city: "London", state: "", country: "United Kingdom" },
    });
    expect(result.location).toBe("London, United Kingdom");
  });
});

// ---------------------------------------------------------------------------
// parseCompanyResponse
// ---------------------------------------------------------------------------

describe("parseCompanyResponse", () => {
  test("parses the company_enrich fixture", () => {
    const result = parseCompanyResponse(companyEnrichFixture);
    expect(result.company).not.toBeNull();
    expect(result.company!.id).toBe("lusha-company:company_xyz789");
    expect(result.company!.name).toBe("Acme Corp");
    expect(result.company!.domain).toBe("acme.com");
  });

  test("returns null company for null input", () => {
    expect(parseCompanyResponse(null).company).toBeNull();
  });

  test("returns null company for non-record input", () => {
    expect(parseCompanyResponse("string").company).toBeNull();
  });

  test("parses response with company key", () => {
    const result = parseCompanyResponse({ company: { id: "c99", name: "TestCo" } });
    expect(result.company).not.toBeNull();
    expect(result.company!.name).toBe("TestCo");
  });
});
