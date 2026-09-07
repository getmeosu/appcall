import { describe, expect, test } from "bun:test";
import visitorFixture from "../fixtures/visitor_identified.json";
import visitorPartialFixture from "../fixtures/visitor_identified_partial.json";
import visitorAllTimeFixture from "../fixtures/visitor_identified_all_time_page_views.json";
import {
  parseVisitorWebhook,
  parseVisitorResponse,
} from "../src/objects";

// ---------------------------------------------------------------------------
// parseVisitorWebhook — happy path
// ---------------------------------------------------------------------------

describe("parseVisitorWebhook", () => {
  test("normalizes a full visitor-identified payload", () => {
    const result = parseVisitorWebhook(visitorFixture);

    expect(result.provider).toBe("rb2b");
    expect(result.modelVersion).toBe("2026-05-17");
    expect(result.firstName).toBe("John");
    expect(result.lastName).toBe("Smith");
    expect(result.fullName).toBe("John Smith");
    expect(result.linkedinUrl).toBe("https://www.linkedin.com/in/johnsmith");
    expect(result.workEmail).toBe("john.smith@acmecorp.com");
    expect(result.personalEmail).toBe("johnsmith@gmail.com");
    expect(result.company).toBe("Acme Corp");
    expect(result.title).toBe("VP of Engineering");
    expect(result.location).toBe("San Francisco, California");
    expect(result.visitedAt).toBe("2025-07-15T14:30:00.000Z");
    expect(result.visitedPages).toHaveLength(2);
    expect(result.visitedPages[0].url).toBe("https://example.com/pricing");
    expect(result.visitedPages[0].timestamp).toBe("2025-07-15T14:28:00.000Z");
    expect(result.visitedPages[1].url).toBe("https://example.com/");
    expect(result.raw).toBe(visitorFixture);
  });

  test("produces a stable id from linkedin_url when no explicit id", () => {
    const result = parseVisitorWebhook(visitorFixture);
    expect(result.id).toBe("rb2b-visitor:https---www-linkedin-com-in-johnsmith");
  });

  test("normalizes partial payload without throwing", () => {
    const result = parseVisitorWebhook(visitorPartialFixture);

    expect(result.provider).toBe("rb2b");
    expect(result.firstName).toBe("");
    expect(result.lastName).toBe("");
    expect(result.fullName).toBe("");
    expect(result.linkedinUrl).toBe("https://www.linkedin.com/in/unknownperson");
    expect(result.workEmail).toBe("someone@somecorp.io");
    expect(result.personalEmail).toBe("");
    expect(result.company).toBe("");
    expect(result.title).toBe("");
    expect(result.location).toBe("");
    expect(result.visitedPages).toEqual([]);
    expect(result.visitedAt).toBe("");
  });

  test("falls back to all_time_page_views when pages is absent", () => {
    const result = parseVisitorWebhook(visitorAllTimeFixture);

    expect(result.visitedPages).toHaveLength(1);
    expect(result.visitedPages[0].url).toBe("https://example.com/demo");
    expect(result.visitedPages[0].timestamp).toBe("2025-07-16T08:58:00.000Z");
  });

  test("handles empty object gracefully", () => {
    const result = parseVisitorWebhook({});

    expect(result.provider).toBe("rb2b");
    expect(result.id).toBe("rb2b-visitor:unknown");
    expect(result.firstName).toBe("");
    expect(result.lastName).toBe("");
    expect(result.fullName).toBe("");
    expect(result.visitedPages).toEqual([]);
    expect(result.raw).toEqual({});
  });

  test("derives id from explicit id field when present", () => {
    const result = parseVisitorWebhook({ id: "vis_abc123" });
    expect(result.id).toBe("rb2b-visitor:vis_abc123");
  });

  test("falls back to business_email for id when linkedin is absent", () => {
    const result = parseVisitorWebhook({ business_email: "test@example.com" });
    expect(result.id).toBe("rb2b-visitor:test@example.com");
  });

  test("constructs location from city+region, or just city, or just region", () => {
    expect(parseVisitorWebhook({ city: "Dallas", region: "Texas" }).location).toBe("Dallas, Texas");
    expect(parseVisitorWebhook({ city: "Dallas" }).location).toBe("Dallas");
    expect(parseVisitorWebhook({ region: "Texas" }).location).toBe("Texas");
    expect(parseVisitorWebhook({}).location).toBe("");
  });

  test("takes first element from personal_emails array", () => {
    const result = parseVisitorWebhook({ personal_emails: ["first@personal.io", "second@personal.io"] });
    expect(result.personalEmail).toBe("first@personal.io");
  });

  test("tolerates personal_emails being an empty array", () => {
    const result = parseVisitorWebhook({ personal_emails: [] });
    expect(result.personalEmail).toBe("");
  });
});

// ---------------------------------------------------------------------------
// parseVisitorResponse
// ---------------------------------------------------------------------------

describe("parseVisitorResponse", () => {
  test("wraps parseVisitorWebhook for non-null record input", () => {
    const result = parseVisitorResponse(visitorFixture);
    expect(result.visitor).not.toBeNull();
    expect(result.visitor!.firstName).toBe("John");
  });

  test("returns null visitor for null input", () => {
    const result = parseVisitorResponse(null);
    expect(result.visitor).toBeNull();
  });

  test("returns null visitor for non-object input", () => {
    const result = parseVisitorResponse("string");
    expect(result.visitor).toBeNull();
  });

  test("returns null visitor for array input", () => {
    const result = parseVisitorResponse([]);
    expect(result.visitor).toBeNull();
  });
});
