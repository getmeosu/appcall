import { describe, expect, it } from "bun:test";
import { normalizeJob, parseJobsResponse } from "../src/objects";
import fixture from "../fixtures/jobs_list.json";

describe("Greenhouse normalizeJob", () => {
  it("normalizes a full job correctly", () => {
    const job = normalizeJob({
      id: 12345,
      title: "Senior Software Engineer",
      location: { name: "San Francisco, CA" },
      departments: [{ name: "Engineering" }],
      updated_at: "2025-12-01T10:30:00Z",
      absolute_url: "https://boards-api.greenhouse.io/example/jobs/12345",
      metadata: [{ name: "Employment Type", "value": "Full Time" }],
    });

    expect(job.id).toBe("gh-job:12345");
    expect(job.provider).toBe("greenhouse");
    expect(job.title).toBe("Senior Software Engineer");
    expect(job.location).toBe("San Francisco, CA");
    expect(job.department).toBe("Engineering");
    expect(job.jobType).toBe("Full Time");
    expect(job.updatedAt).toBe("2025-12-01T10:30:00Z");
    expect(job.url).toBe(
      "https://boards-api.greenhouse.io/example/jobs/12345",
    );
  });

  it("prefixes id with gh-job:", () => {
    const job = normalizeJob({ id: 99 });
    expect(job.id).toBe("gh-job:99");
  });

  it("sets provider to greenhouse", () => {
    const job = normalizeJob({ id: 1 });
    expect(job.provider).toBe("greenhouse");
  });

  it("handles missing location gracefully", () => {
    const job = normalizeJob({
      id: 1,
      location: null,
    });
    expect(job.location).toBeNull();
  });

  it("handles missing departments gracefully", () => {
    const job = normalizeJob({
      id: 1,
      departments: null,
    });
    expect(job.department).toBeNull();
  });

  it("handles missing metadata gracefully", () => {
    const job = normalizeJob({
      id: 1,
      metadata: null,
    });
    expect(job.jobType).toBeNull();
  });

  it("handles empty metadata array", () => {
    const job = normalizeJob({
      id: 1,
      metadata: [],
    });
    expect(job.jobType).toBeNull();
  });

  it("defaults title to empty string", () => {
    const job = normalizeJob({ id: 1 });
    expect(job.title).toBe("");
  });

  it("handles null updatedAt", () => {
    const job = normalizeJob({ id: 1, updated_at: null });
    expect(job.updatedAt).toBeNull();
  });

  it("handles null absolute_url", () => {
    const job = normalizeJob({ id: 1, absolute_url: null });
    expect(job.url).toBeNull();
  });

  it("extracts first department from list", () => {
    const job = normalizeJob({
      id: 1,
      departments: [{ name: "Eng" }, { name: "Product" }],
    });
    expect(job.department).toBe("Eng");
  });

  it("ignores metadata entries without Employment Type name", () => {
    const job = normalizeJob({
      id: 1,
      metadata: [{ name: "Other", value: "Something" }],
    });
    expect(job.jobType).toBeNull();
  });
});

describe("Greenhouse parseJobsResponse", () => {
  it("parses fixture response", () => {
    const result = parseJobsResponse(fixture);
    expect(result.jobs).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  it("normalizes each job in the response", () => {
    const result = parseJobsResponse(fixture);
    expect(result.jobs[0].id).toBe("gh-job:12345");
    expect(result.jobs[1].id).toBe("gh-job:67890");
    expect(result.jobs[2].id).toBe("gh-job:11111");
  });

  it("handles empty jobs array", () => {
    const result = parseJobsResponse({ jobs: [] });
    expect(result.jobs).toHaveLength(0);
  });

  it("handles null jobs gracefully", () => {
    const result = parseJobsResponse({ jobs: null as unknown as [] });
    expect(result.jobs).toHaveLength(0);
  });

  it("returns null total when meta is missing", () => {
    const result = parseJobsResponse({ jobs: [] });
    expect(result.total).toBeNull();
  });
});
