import { describe, expect, it } from "bun:test";
import { normalizeJob, parseJobsResponse } from "../src/objects";
import fixture from "../fixtures/jobs_list.json";

describe("Ashby normalizeJob", () => {
  it("normalizes a full job correctly", () => {
    const job = normalizeJob({
      id: "job-001",
      title: "Staff Engineer",
      locationName: "Austin, TX",
      departmentName: "Platform",
      employmentType: "FULL_TIME",
      descriptionHtml: "<p>Lead platform engineering efforts...</p>",
      url: "https://jobs.ashbyhq.com/example/job-001",
      publishedAt: "2025-10-20T09:00:00Z",
    });

    expect(job.id).toBe("ash-job:job-001");
    expect(job.provider).toBe("ashby");
    expect(job.title).toBe("Staff Engineer");
    expect(job.location).toBe("Austin, TX");
    expect(job.department).toBe("Platform");
    expect(job.employmentType).toBe("FULL_TIME");
    expect(job.createdAt).toBe("2025-10-20T09:00:00Z");
  });

  it("prefixes id with ash-job:", () => {
    const job = normalizeJob({ id: "x" });
    expect(job.id).toBe("ash-job:x");
  });

  it("sets provider to ashby", () => {
    const job = normalizeJob({ id: "x" });
    expect(job.provider).toBe("ashby");
  });

  it("defaults title to empty string", () => {
    const job = normalizeJob({ id: "x" });
    expect(job.title).toBe("");
  });

  it("handles null locationName", () => {
    const job = normalizeJob({ id: "x", locationName: null });
    expect(job.location).toBeNull();
  });

  it("handles null departmentName", () => {
    const job = normalizeJob({ id: "x", departmentName: null });
    expect(job.department).toBeNull();
  });

  it("handles null employmentType", () => {
    const job = normalizeJob({ id: "x", employmentType: null });
    expect(job.employmentType).toBeNull();
  });

  it("handles null publishedAt", () => {
    const job = normalizeJob({ id: "x", publishedAt: null });
    expect(job.createdAt).toBeNull();
  });

  it("uses publishedAt for createdAt", () => {
    const job = normalizeJob({
      id: "x",
      publishedAt: "2025-01-01T00:00:00Z",
    });
    expect(job.createdAt).toBe("2025-01-01T00:00:00Z");
  });
});

describe("Ashby parseJobsResponse", () => {
  it("parses fixture response", () => {
    const result = parseJobsResponse(fixture);
    expect(result).toHaveLength(3);
  });

  it("normalizes each job", () => {
    const result = parseJobsResponse(fixture);
    expect(result[0].id).toBe("ash-job:job-001");
    expect(result[1].id).toBe("ash-job:job-002");
    expect(result[2].id).toBe("ash-job:job-003");
  });

  it("handles empty jobs array", () => {
    const result = parseJobsResponse({ jobs: [] });
    expect(result).toHaveLength(0);
  });

  it("handles missing jobs field", () => {
    const result = parseJobsResponse({});
    expect(result).toHaveLength(0);
  });

  it("handles non-array jobs field", () => {
    const result = parseJobsResponse({ jobs: "not-array" });
    expect(result).toHaveLength(0);
  });
});
