import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

// ST-0: Stripe removed the Upcoming Invoice API and legacy usage records in
// 2025-03-31.basil. No operation may call those paths; the four ops reroute to
// the documented replacements (op count unchanged).
// https://docs.stripe.com/changelog/basil/2025-03-31/invoice-preview-api-deprecations
// https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-legacy-usage-based-billing
const ops = manifest.operations as Record<string, { request?: { method: string; path: string } }>;

describe("stripe ST-0 removed endpoints", () => {
  test("no operation targets /v1/invoices/upcoming or usage records", () => {
    for (const [key, op] of Object.entries(ops)) {
      const path = op.request?.path ?? "";
      expect(path, key).not.toMatch(/^\/v1\/invoices\/upcoming|usage_record/);
    }
  });
  test("the four ops reroute to the replacements", () => {
    expect(ops["invoices.upcoming.get"]!.request).toMatchObject({ method: "POST", path: "/v1/invoices/create_preview" });
    expect(ops["invoices.upcoming.lines.list"]!.request).toMatchObject({ method: "POST", path: "/v1/invoices/create_preview" });
    expect(ops["subscription_items.usage_records.create"]!.request).toMatchObject({ method: "POST", path: "/v1/billing/meter_events" });
    expect(ops["subscription_items.usage_record_summaries.list"]!.request).toMatchObject({ method: "GET", path: "/v1/billing/meters/{{meter}}/event_summaries" });
    expect(Object.keys(ops)).toHaveLength(427);
  });
});
