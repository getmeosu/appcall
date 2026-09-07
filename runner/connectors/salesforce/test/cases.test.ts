import { describe, expect, test } from "bun:test";
import casesFixture from "../fixtures/cases_query.json";
import { normalizeCase, parseCasesResponse, validateCreateCaseInput } from "../src/cases";

describe("salesforce cases", () => {
  test("normalizes case from fixture", () => {
    const c = normalizeCase(casesFixture.records[0]);

    expect(c.id).toBe("sf-case:500D000001AbCdE");
    expect(c.provider).toBe("salesforce");
    expect(c.providerCaseId).toBe("500D000001AbCdE");
    expect(c.caseNumber).toBe("00001001");
    expect(c.subject).toBe("Unable to export data");
    expect(c.description).toContain("export my contacts");
    expect(c.status).toBe("New");
    expect(c.priority).toBe("High");
    expect(c.origin).toBe("Email");
    expect(c.reason).toBe("Data issue");
    expect(c.isClosed).toBe(false);
    expect(c.isEscalated).toBe(false);
    expect(c.accountId).toBe("001D000001XyZwV");
    expect(c.contactId).toBe("003D000001AbCdE");
    expect(c.modelVersion).toBe("2026-05-16");
  });

  test("normalizes closed case", () => {
    const c = normalizeCase(casesFixture.records[1]);

    expect(c.status).toBe("Closed");
    expect(c.isClosed).toBe(true);
    expect(c.closedAt).toBe("2026-05-12T16:00:00.000Z");
  });

  test("normalizes case with minimal fields", () => {
    const c = normalizeCase({ Id: "500-min" });

    expect(c.id).toBe("sf-case:500-min");
    expect(c.caseNumber).toBe("");
    expect(c.isClosed).toBe(false);
  });

  test("parses SOQL cases response", () => {
    const parsed = parseCasesResponse(casesFixture);

    expect(parsed.cases).toHaveLength(2);
    expect(parsed.cases[0].CaseNumber).toBe("00001001");
    expect(parsed.cases[1].IsClosed).toBe(true);
    expect(parsed.done).toBe(true);
  });

  test("handles non-object response gracefully", () => {
    expect(parseCasesResponse(null)).toEqual({ cases: [], nextLink: null, done: true });
  });

  test("validates create case input", () => {
    expect(validateCreateCaseInput({ subject: "Bug report", priority: "High", origin: "Web" })).toEqual({
      subject: "Bug report",
      priority: "High",
      origin: "Web",
    });
  });

  test("rejects invalid create case input", () => {
    expect(() => validateCreateCaseInput("not object")).toThrow();
    expect(() => validateCreateCaseInput({})).toThrow();
  });
});
