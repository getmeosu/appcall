import { describe, expect, test } from "bun:test";
import visitorFixture from "../fixtures/visitor_identified.json";
import visitorPartialFixture from "../fixtures/visitor_identified_partial.json";
import { executeVisitorIdentifiedSync } from "../src/sync";

// ---------------------------------------------------------------------------
// executeVisitorIdentifiedSync
// ---------------------------------------------------------------------------

describe("executeVisitorIdentifiedSync", () => {
  test("parses visitor_identified fixture into sync result", () => {
    const result = executeVisitorIdentifiedSync({ response: visitorFixture });

    expect(result.provider).toBe("rb2b");
    expect(result.operation).toBe("webhook.visitor_identified");
    expect(result.count).toBe(1);
    expect(result.items).toHaveLength(1);

    const visitor = result.items[0];
    expect(visitor.firstName).toBe("John");
    expect(visitor.lastName).toBe("Smith");
    expect(visitor.fullName).toBe("John Smith");
    expect(visitor.workEmail).toBe("john.smith@acmecorp.com");
    expect(visitor.linkedinUrl).toBe("https://www.linkedin.com/in/johnsmith");
    expect(visitor.company).toBe("Acme Corp");
    expect(visitor.title).toBe("VP of Engineering");
    expect(visitor.location).toBe("San Francisco, California");
    expect(visitor.visitedPages).toHaveLength(2);
    expect(visitor.modelVersion).toBe("2026-05-17");
  });

  test("parses partial payload gracefully", () => {
    const result = executeVisitorIdentifiedSync({ response: visitorPartialFixture });

    expect(result.provider).toBe("rb2b");
    expect(result.operation).toBe("webhook.visitor_identified");
    expect(result.count).toBe(1);
    expect(result.items).toHaveLength(1);

    const visitor = result.items[0];
    expect(visitor.firstName).toBe("");
    expect(visitor.workEmail).toBe("someone@somecorp.io");
  });

  test("returns empty items for null response", () => {
    const result = executeVisitorIdentifiedSync({ response: null });

    expect(result.provider).toBe("rb2b");
    expect(result.operation).toBe("webhook.visitor_identified");
    expect(result.count).toBe(0);
    expect(result.items).toEqual([]);
  });

  test("returns empty items for non-record response", () => {
    const result = executeVisitorIdentifiedSync({ response: "bad" });

    expect(result.count).toBe(0);
    expect(result.items).toEqual([]);
  });

  test("returns empty items for array response", () => {
    const result = executeVisitorIdentifiedSync({ response: [] });
    expect(result.count).toBe(0);
    expect(result.items).toEqual([]);
  });
});
