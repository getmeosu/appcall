import { describe, expect, it } from "bun:test";
import { normalizeJob, parseJobsResponse } from "../src/objects";
import fixture from "../fixtures/jobs_list.json";

describe("SmartRecruiters normalizeJob", () => {
  it("normalizes a full job correctly", () => {
    const job = normalizeJob({
      id: "sr-001",
      title: "Frontend Developer",
      location: { id: "Toronto, ON" },
      department: { id: "eng", label: "Engineering" },
      type: { id: "full_time", label: "Full-time" },
      createdOn: "2025-09-15T10:00:00Z",
    });

    expect(job.id).toBe("sr-job:sr-001");
    expect(job.provider).toBe("smartrecruiters");
    expect(job.title).toBe("Frontend Developer");
    expect(job.location).toBe("Toronto, ON");
    expect(job.department).toBe("Engineering");
    expect(job.type).toBe("Full-time");
    expect(job.createdAt).toBe("2025-09-15T10:00:00Z");
  });

  it("prefixes id with sr-job:", () => {
    const job = normalizeJob({ id: "x" });
    expect(job.id).toBe("sr-job:x");
  });

  it("sets provider to smartrecruiters", () => {
    const job = normalizeJob({ id: "x" });
    expect(job.provider).toBe("smartrecruiters");
  });

  it("defaults title to empty string", () => {
    const job = normalizeJob({ id: "x" });
    expect(job.title).toBe("");
  });

  it("handles null location", () => {
    const job = normalizeJob({ id: "x", location: null });
    expect(job.location).toBeNull();
  });

  it("handles null department", () => {
    const job = normalizeJob({ id: "x", department: null });
    expect(job.department).toBeNull();
  });

  it("extracts department label", () => {
    const job = normalizeJob({
      id: "x",
      department: { id: "eng", label: "Engineering" },
    });
    expect(job.department).toBe("Engineering");
  });

  it("handles null type", () => {
    const job = normalizeJob({ id: "x", type: null });
    expect(job.type).toBeNull();
  });

  it("extracts type label", () => {
    const job = normalizeJob({
      id: "x",
      type: { id: "full_time", label: "Full-time" },
    });
    expect(job.type).toBe("Full-time");
  });

  it("handles null createdOn", () => {
    const job = normalizeJob({ id: "x", createdOn: null });
    expect(job.createdAt).toBeNull();
  });

  it("handles missing location id", () => {
    const job = normalizeJob({ id: "x", location: {} });
    expect(job.location).toBeNull();
  });
});

describe("SmartRecruiters parseJobsResponse", () => {
  it("parses fixture response", () => {
    const result = parseJobsResponse(fixture);
    expect(result.jobs).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  it("normalizes each job", () => {
    const result = parseJobsResponse(fixture);
    expect(result.jobs[0].id).toBe("sr-job:sr-001");
    expect(result.jobs[1].id).toBe("sr-job:sr-002");
    expect(result.jobs[2].id).toBe("sr-job:sr-003");
  });

  it("handles empty content array", () => {
    const result = parseJobsResponse({ content: [] });
    expect(result.jobs).toHaveLength(0);
  });

  it("handles missing content field", () => {
    const result = parseJobsResponse({});
    expect(result.jobs).toHaveLength(0);
  });

  it("returns null total when totalFound is missing", () => {
    const result = parseJobsResponse({ content: [] });
    expect(result.total).toBeNull();
  });
});
