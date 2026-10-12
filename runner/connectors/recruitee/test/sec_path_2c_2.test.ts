import { describe, expect, test } from "bun:test";
import { outcomeOf } from "../../_shared/test/path_segment_harness";

// SEC-PATH-2c-2 (sync fuzz): pipeline_stages.list put offerId / pipelineTemplateId
// into GET /offers/{offerId} and /pipeline_templates/{id} with encodeURIComponent
// only: ".." collapsed to the company root, "." left a trailing empty segment,
// whitespace went out as %20, and "" silently fell through to the next branch.
const CREDS = { company: "acme", accessToken: "tok" };
const BAD = ["", " ", "  ", "\t", ".", "..", " . ", "%2e", "%2e%2e", "%2E%2E", ".%2e"];

describe("recruitee SEC-PATH-2c-2 pipeline_stages.list ids", () => {
  for (const [field, prefix] of [["offerId", "/c/acme/offers/"], ["pipelineTemplateId", "/c/acme/pipeline_templates/"]]) {
    test(`${field} reaches the path when valid`, async () => {
      for (const value of ["123", 123]) {
        const result = await outcomeOf("recruitee", "pipeline_stages.list", { ...CREDS, [field]: value }, "sync");
        expect(result.calls.map((c) => new URL(c.url).pathname)).toEqual([`${prefix}123`]);
      }
    });
    test(`${field} rejects blank, whitespace, dot-only and %2e values with 0 fetches`, async () => {
      for (const value of BAD) {
        const result = await outcomeOf("recruitee", "pipeline_stages.list", { ...CREDS, [field]: value }, "sync");
        expect(result.calls, `${field}=${JSON.stringify(value)}`).toEqual([]);
        expect(result.ok).toBe(false);
      }
    });
  }
  test("without either id it still lists templates", async () => {
    const result = await outcomeOf("recruitee", "pipeline_stages.list", { ...CREDS }, "sync");
    expect(result.calls.map((c) => new URL(c.url).pathname)).toEqual(["/c/acme/pipeline_templates"]);
  });
});
