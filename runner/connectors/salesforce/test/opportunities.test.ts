import { describe, expect, test } from "bun:test";
import opportunitiesFixture from "../fixtures/opportunities_query.json";
import { normalizeOpportunity, parseOpportunitiesResponse, validateCreateOpportunityInput } from "../src/opportunities";

describe("salesforce opportunities", () => {
  test("normalizes opportunity from fixture", () => {
    const opp = normalizeOpportunity(opportunitiesFixture.records[0]);

    expect(opp.id).toBe("sf-opportunity:006D000001AbCdE");
    expect(opp.provider).toBe("salesforce");
    expect(opp.providerOpportunityId).toBe("006D000001AbCdE");
    expect(opp.name).toBe("Acme Enterprise Deal");
    expect(opp.stage).toBe("Proposal");
    expect(opp.closeDate).toBe("2026-06-30");
    expect(opp.amount).toBe(120000);
    expect(opp.probability).toBe(60);
    expect(opp.type).toBe("New Business");
    expect(opp.accountId).toBe("001D000001XyZwV");
    expect(opp.isWon).toBe(false);
    expect(opp.isClosed).toBe(false);
    expect(opp.modelVersion).toBe("2026-05-16");
  });

  test("normalizes won opportunity", () => {
    const opp = normalizeOpportunity(opportunitiesFixture.records[1]);

    expect(opp.isWon).toBe(true);
    expect(opp.isClosed).toBe(true);
    expect(opp.stage).toBe("Closed Won");
  });

  test("normalizes opportunity with minimal fields", () => {
    const opp = normalizeOpportunity({ Id: "006-min" });

    expect(opp.id).toBe("sf-opportunity:006-min");
    expect(opp.amount).toBe(0);
    expect(opp.isWon).toBe(false);
  });

  test("parses SOQL opportunities response", () => {
    const parsed = parseOpportunitiesResponse(opportunitiesFixture);

    expect(parsed.opportunities).toHaveLength(2);
    expect(parsed.opportunities[0].Amount).toBe(120000);
    expect(parsed.opportunities[1].IsWon).toBe(true);
    expect(parsed.done).toBe(true);
  });

  test("handles non-object response gracefully", () => {
    expect(parseOpportunitiesResponse(null)).toEqual({ opportunities: [], nextLink: null, done: true });
  });

  test("validates create opportunity input", () => {
    expect(validateCreateOpportunityInput({ name: "Deal", closeDate: "2026-06-30", stage: "Proposal", amount: 50000 })).toEqual({
      name: "Deal",
      closeDate: "2026-06-30",
      stage: "Proposal",
      amount: 50000,
    });
  });

  test("rejects invalid create opportunity input", () => {
    expect(() => validateCreateOpportunityInput("not object")).toThrow();
    expect(() => validateCreateOpportunityInput({ name: "Deal" })).toThrow();
    expect(() => validateCreateOpportunityInput({ name: "Deal", closeDate: "", stage: "" })).toThrow();
  });
});
