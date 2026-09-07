import { describe, expect, it } from "bun:test";
import { normalizeJob, parseJobsResponse } from "../src/objects";
import fixture from "../fixtures/jobs_list.json";

describe("Workable normalizeJob", () => {
  it("normalizes a full job correctly", () => {
    const job = normalizeJob({
      id: "wk-001",
      title: "DevOps Engineer",
      state: "published",
      url: "https://www.workable.com/jobs/wk-001",
      location: { city: "London", region: "Greater London", country: "United Kingdom" },
      department: { name: "Engineering" },
      type: "Full-time",
      employmentType: "full-time",
    });

    expect(job.id).toBe("wk-job:wk-001");
    expect(job.provider).toBe("workable");
    expect(job.title).toBe("DevOps Engineer");
    expect(job.state).toBe("published");
    expect(job.url).toBe("https://www.workable.com/jobs/wk-001");
    expect(job.location).toBe("London, Greater London, United Kingdom");
    expect(job.department).toBe("Engineering");
    expect(job.type).toBe("Full-time");
  });

  it("prefixes id with wk-job:", () => {
    const job = normalizeJob({ id: "x" });
    expect(job.id).toBe("wk-job:x");
  });

  it("sets provider to workable", () => {
    const job = normalizeJob({ id: "x" });
    expect(job.provider).toBe("workable");
  });

  it("defaults title to empty string", () => {
    const job = normalizeJob({ id: "x" });
    expect(job.title).toBe("");
  });

  it("handles null location", () => {
    const job = normalizeJob({ id: "x", location: null });
    expect(job.location).toBeNull();
  });

  it("handles partial location", () => {
    const job = normalizeJob({
      id: "x",
      location: { city: "Berlin" },
    });
    expect(job.location).toBe("Berlin");
  });

  it("handles null department", () => {
    const job = normalizeJob({ id: "x", department: null });
    expect(job.department).toBeNull();
  });

  it("handles missing department name", () => {
    const job = normalizeJob({ id: "x", department: {} });
    expect(job.department).toBeNull();
  });

  it("falls back to employmentType when type is null", () => {
    const job = normalizeJob({
      id: "x",
      type: null,
      employmentType: "contract",
    });
    expect(job.type).toBe("contract");
  });

  it("prefers type over employmentType", () => {
    const job = normalizeJob({
      id: "x",
      type: "Full-time",
      employmentType: "contract",
    });
    expect(job.type).toBe("Full-time");
  });

  it("handles null state", () => {
    const job = normalizeJob({ id: "x", state: null });
    expect(job.state).toBeNull();
  });

  it("handles null url", () => {
    const job = normalizeJob({ id: "x", url: null });
    expect(job.url).toBeNull();
  });
});

describe("Workable parseJobsResponse", () => {
  it("parses fixture response", () => {
    const result = parseJobsResponse(fixture);
    expect(result).toHaveLength(3);
  });

  it("normalizes each job", () => {
    const result = parseJobsResponse(fixture);
    expect(result[0].id).toBe("wk-job:wk-001");
    expect(result[1].id).toBe("wk-job:wk-002");
    expect(result[2].id).toBe("wk-job:wk-003");
  });

  it("handles empty jobs array", () => {
    const result = parseJobsResponse({ jobs: [] });
    expect(result).toHaveLength(0);
  });

  it("handles missing jobs field", () => {
    const result = parseJobsResponse({});
    expect(result).toHaveLength(0);
  });
});
