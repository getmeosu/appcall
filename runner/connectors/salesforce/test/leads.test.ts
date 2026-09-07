import { describe, expect, test } from "bun:test";
import leadsFixture from "../fixtures/leads_query.json";
import { normalizeLead, parseLeadsResponse } from "../src/leads";

describe("salesforce leads", () => {
  test("normalizes lead from fixture", () => {
    const lead = normalizeLead(leadsFixture.records[0]);

    expect(lead.id).toBe("sf-lead:00QD000001AbCdE");
    expect(lead.provider).toBe("salesforce");
    expect(lead.providerLeadId).toBe("00QD000001AbCdE");
    expect(lead.firstName).toBe("Dan");
    expect(lead.lastName).toBe("Williams");
    expect(lead.company).toBe("Acme Corp");
    expect(lead.email).toBe("dan@acme.com");
    expect(lead.phone).toBe("+1-555-0301");
    expect(lead.title).toBe("Director of Sales");
    expect(lead.website).toBe("https://acme.com");
    expect(lead.industry).toBe("Technology");
    expect(lead.leadSource).toBe("Web");
    expect(lead.status).toBe("Open - Not Contacted");
    expect(lead.modelVersion).toBe("2026-05-16");
  });

  test("normalizes lead with minimal fields", () => {
    const lead = normalizeLead({ Id: "00Q-min" });

    expect(lead.id).toBe("sf-lead:00Q-min");
    expect(lead.company).toBe("");
    expect(lead.email).toBe("");
  });

  test("parses SOQL leads response", () => {
    const parsed = parseLeadsResponse(leadsFixture);

    expect(parsed.leads).toHaveLength(2);
    expect(parsed.leads[0].Company).toBe("Acme Corp");
    expect(parsed.leads[1].Status).toBe("Working");
    expect(parsed.done).toBe(true);
    expect(parsed.nextLink).toBeNull();
  });

  test("handles non-object response gracefully", () => {
    expect(parseLeadsResponse(null)).toEqual({ leads: [], nextLink: null, done: true });
  });
});
