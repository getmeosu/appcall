// runner/sena-e2e/test/state.test.ts
import { test, expect } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { serializeLeads, parseLeads, Store, type Lead } from "../state";

function mkLead(over: Partial<Lead> = {}): Lead {
  return {
    lead_id: "1", full_name: "Jane Roe", title: "VP Sales", company: "Acme",
    linkedin_url: "https://linkedin.com/in/jane", email: "jane@acme.com",
    apollo_id: "a1", stage: "enriched", channel: "email", booking_url: "", last_request_id: "req_1",
    ...over,
  };
}

test("leads round-trip through CSV", () => {
  const leads: Lead[] = [
    { lead_id: "1", full_name: "Jane Roe", title: "VP Sales", company: "Acme",
      linkedin_url: "https://linkedin.com/in/jane", email: "jane@acme.com",
      apollo_id: "a1", stage: "enriched", channel: "email", booking_url: "", last_request_id: "req_1" },
  ];
  const csv = serializeLeads(leads);
  const back = parseLeads(csv);
  expect(back).toEqual(leads);
});

test("parseLeads tolerates an empty file", () => {
  expect(parseLeads("")).toEqual([]);
});

test("CSV escaping round-trips commas and embedded quotes", () => {
  const lead = mkLead({ full_name: `Roe, "JR" Jane`, company: "Acme, Inc" });
  expect(parseLeads(serializeLeads([lead]))).toEqual([lead]);
});

test("newlines in a field are flattened to a space (no row corruption)", () => {
  const lead = mkLead({ title: "Line1\nLine2" });
  const back = parseLeads(serializeLeads([lead]));
  expect(back).toHaveLength(1);
  expect(back[0].title).toBe("Line1 Line2");
});

test("Store.priorEvidenceGreen() requires both a live_single send and a booking", () => {
  const dir = join("runner/sena-e2e", "state-test-priorEvidenceGreen");
  rmSync(dir, { recursive: true, force: true });
  try {
    const both = new Store(dir);
    both.appendEvidence({ ts: "t", stage: "send", tool: "x", request_id: "r1", status: "ok", mode: "live_single" });
    both.appendEvidence({ ts: "t", stage: "booking", tool: "x", request_id: "r2", status: "ok", mode: "live_single" });
    expect(both.priorEvidenceGreen()).toBe(true);

    const onlyDir = join("runner/sena-e2e", "state-test-priorEvidenceGreen-partial");
    rmSync(onlyDir, { recursive: true, force: true });
    try {
      const only = new Store(onlyDir);
      only.appendEvidence({ ts: "t", stage: "send", tool: "x", request_id: "r1", status: "ok", mode: "live_single" });
      expect(only.priorEvidenceGreen()).toBe(false);
    } finally {
      rmSync(onlyDir, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
