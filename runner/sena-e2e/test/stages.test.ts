import { test, expect } from "bun:test";
import { composeFor } from "../stages";
import type { Lead } from "../state";

test("composeFor embeds the booking url into both email and dm", () => {
  const lead: Lead = { lead_id: "1", full_name: "Jane Roe", title: "VP", company: "Acme",
    linkedin_url: "", email: "j@acme.com", apollo_id: "", stage: "booking_ready",
    channel: "email", booking_url: "https://cal/abc", last_request_id: "" };
  const m = composeFor(lead, lead.booking_url);
  expect(m.html).toContain("https://cal/abc");
  expect(m.dm).toContain("https://cal/abc");
  expect(m.subject).toContain("Jane");
});

test("composeFor falls back to a placeholder when no booking url", () => {
  const lead: Lead = { lead_id: "2", full_name: "Sam Doe", title: "", company: "Co",
    linkedin_url: "", email: "", apollo_id: "", stage: "enriched", channel: "dm",
    booking_url: "", last_request_id: "" };
  const m = composeFor(lead, "");
  expect(m.html).toContain("{{booking_url}}");
});
