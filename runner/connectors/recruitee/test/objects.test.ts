import { describe, expect, it } from "bun:test";
import { normalizeJob, parseJobsResponse } from "../src/objects";
import fixture from "../fixtures/jobs_list.json";

describe("Recruitee normalizeJob", () => {
  it("normalizes a full job correctly", () => {
    const job = normalizeJob({
      id: 1001,
      title: "Backend Engineer",
      location: { city: "Amsterdam", country: "Netherlands" },
      department: { name: "Engineering" },
      employment_type: "full-time",
      url: "https://company.recruitee.com/o/backend-engineer",
      created_at: "2025-08-20T09:00:00Z",
    });

    expect(job.id).toBe("rc-job:1001");
    expect(job.provider).toBe("recruitee");
    expect(job.title).toBe("Backend Engineer");
    expect(job.location).toBe("Amsterdam, Netherlands");
    expect(job.department).toBe("Engineering");
    expect(job.employmentType).toBe("full-time");
    expect(job.url).toBe("https://company.recruitee.com/o/backend-engineer");
    expect(job.createdAt).toBe("2025-08-20T09:00:00Z");
  });

  it("prefixes id with rc-job:", () => {
    const job = normalizeJob({ id: 42 });
    expect(job.id).toBe("rc-job:42");
  });

  it("sets provider to recruitee", () => {
    const job = normalizeJob({ id: 1 });
    expect(job.provider).toBe("recruitee");
  });

  it("defaults title to empty string", () => {
    const job = normalizeJob({ id: 1 });
    expect(job.title).toBe("");
  });

  it("handles null location", () => {
    const job = normalizeJob({ id: 1, location: null });
    expect(job.location).toBeNull();
  });

  it("handles partial location (city only)", () => {
    const job = normalizeJob({ id: 1, location: { city: "Berlin" } });
    expect(job.location).toBe("Berlin");
  });

  it("handles null department", () => {
    const job = normalizeJob({ id: 1, department: null });
    expect(job.department).toBeNull();
  });

  it("handles null employment_type", () => {
    const job = normalizeJob({ id: 1, employment_type: null });
    expect(job.employmentType).toBeNull();
  });

  it("handles null url", () => {
    const job = normalizeJob({ id: 1, url: null });
    expect(job.url).toBeNull();
  });

  it("handles null created_at", () => {
    const job = normalizeJob({ id: 1, created_at: null });
    expect(job.createdAt).toBeNull();
  });

  it("handles empty location object", () => {
    const job = normalizeJob({ id: 1, location: {} });
    expect(job.location).toBeNull();
  });
});

describe("Recruitee parseJobsResponse", () => {
  it("parses fixture response", () => {
    const result = parseJobsResponse(fixture);
    expect(result.jobs).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  it("normalizes each offer", () => {
    const result = parseJobsResponse(fixture);
    expect(result.jobs[0].id).toBe("rc-job:1001");
    expect(result.jobs[1].id).toBe("rc-job:1002");
    expect(result.jobs[2].id).toBe("rc-job:1003");
  });

  it("handles empty offers array", () => {
    const result = parseJobsResponse({ offers: [] });
    expect(result.jobs).toHaveLength(0);
  });

  it("handles missing offers field", () => {
    const result = parseJobsResponse({});
    expect(result.jobs).toHaveLength(0);
  });

  it("returns null total when total is missing", () => {
    const result = parseJobsResponse({ offers: [] });
    expect(result.total).toBeNull();
  });
});
