import { describe, expect, it } from "bun:test";
import { executeJobsListSync } from "../src/sync";
import jobsList from "../fixtures/jobs_list.json";

describe("zoho-recruit jobs.list sync", () => {
  it("returns normalized jobs from response", () => {
    const result = executeJobsListSync({ response: jobsList });
    expect(result.provider).toBe("zoho-recruit");
    expect(result.operation).toBe("jobs.list");
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("returns pagination info", () => {
    const result = executeJobsListSync({ response: jobsList });
    expect(result.total).toBeDefined();
  });

  it("handles null input", () => {
    const result = executeJobsListSync({ response: null });
    expect(result.items).toHaveLength(0);
  });
});
