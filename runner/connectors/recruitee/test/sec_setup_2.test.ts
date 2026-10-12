import { describe, expect, test } from "bun:test";
import { outcomeOf } from "../../_shared/test/path_segment_harness";

// SEC-SETUP-2 (item 2): admin (ATS) operations accept the same stored company
// spellings as the careers jobs.list: https://acme1, acme1/, acme1.recruitee.com.
const GOOD = ["acme1", "https://acme1", "acme1/", "acme1.recruitee.com", "https://acme1.recruitee.com/"];

describe("recruitee SEC-SETUP-2 admin company spellings", () => {
  test("admin ops normalize stored spellings to /c/acme1", async () => {
    for (const value of GOOD) {
      const result = await outcomeOf("recruitee", "pipeline_stages.list", { accessToken: "tok", company: value }, "sync");
      expect(result.calls.map((c) => `${new URL(c.url).hostname}${new URL(c.url).pathname}`), value)
        .toEqual(["api.recruitee.com/c/acme1/pipeline_templates"]);
    }
  });
  test("careers jobs.list takes the same spellings", async () => {
    for (const value of GOOD) {
      const result = await outcomeOf("recruitee", "jobs.list", { accessToken: "t", company: value }, "sync");
      expect(result.calls.map((c) => new URL(c.url).hostname), value).toEqual(["acme1.recruitee.com"]);
    }
  });
  test("other schemes, paths and dot segments still reject with 0 fetches", async () => {
    for (const value of ["http://acme1", "acme1/x", "..", "%2e", "acme1.evil.com/x"]) {
      const result = await outcomeOf("recruitee", "pipeline_stages.list", { accessToken: "tok", company: value }, "sync");
      expect({ value, calls: result.calls.length, ok: result.ok }).toEqual({ value, calls: 0, ok: false });
    }
  });
});
