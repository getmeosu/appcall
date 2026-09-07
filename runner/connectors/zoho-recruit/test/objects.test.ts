import { describe, expect, it } from "bun:test";
import { normalizeJob, parseJobsResponse } from "../src/objects";
import fixture from "../fixtures/jobs_list.json";

describe("Zoho Recruit normalizeJob", () => {
  it("normalizes a full job correctly", () => {
    const job = normalizeJob({
      id: "4000000012345",
      Job_Title: "Technical Lead",
      Job_Type: "Full Time",
      Hiring_Manager: { name: "Jane Smith" },
      Description: "Lead the engineering team...",
      Status: "Active",
      Created_Time: "2025-07-10T08:00:00Z",
    });

    expect(job.id).toBe("zr-job:4000000012345");
    expect(job.provider).toBe("zoho-recruit");
    expect(job.title).toBe("Technical Lead");
    expect(job.jobType).toBe("Full Time");
    expect(job.hiringManager).toBe("Jane Smith");
    expect(job.description).toBe("Lead the engineering team...");
    expect(job.status).toBe("Active");
    expect(job.createdAt).toBe("2025-07-10T08:00:00Z");
  });

  it("prefixes id with zr-job:", () => {
    const job = normalizeJob({ id: "123" });
    expect(job.id).toBe("zr-job:123");
  });

  it("sets provider to zoho-recruit", () => {
    const job = normalizeJob({ id: "1" });
    expect(job.provider).toBe("zoho-recruit");
  });

  it("defaults title to empty string", () => {
    const job = normalizeJob({ id: "1" });
    expect(job.title).toBe("");
  });

  it("handles null Job_Type", () => {
    const job = normalizeJob({ id: "1", Job_Type: null });
    expect(job.jobType).toBeNull();
  });

  it("handles null Hiring_Manager", () => {
    const job = normalizeJob({ id: "1", Hiring_Manager: null });
    expect(job.hiringManager).toBeNull();
  });

  it("extracts Hiring_Manager name", () => {
    const job = normalizeJob({
      id: "1",
      Hiring_Manager: { name: "Test Manager" },
    });
    expect(job.hiringManager).toBe("Test Manager");
  });

  it("handles null Description", () => {
    const job = normalizeJob({ id: "1", Description: null });
    expect(job.description).toBeNull();
  });

  it("handles null Status", () => {
    const job = normalizeJob({ id: "1", Status: null });
    expect(job.status).toBeNull();
  });

  it("handles null Created_Time", () => {
    const job = normalizeJob({ id: "1", Created_Time: null });
    expect(job.createdAt).toBeNull();
  });

  it("handles missing Hiring_Manager name", () => {
    const job = normalizeJob({ id: "1", Hiring_Manager: {} });
    expect(job.hiringManager).toBeNull();
  });
});

describe("Zoho Recruit parseJobsResponse", () => {
  it("parses fixture response", () => {
    const result = parseJobsResponse(fixture);
    expect(result.jobs).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.hasMore).toBe(false);
    expect(result.page).toBe(1);
  });

  it("normalizes each job", () => {
    const result = parseJobsResponse(fixture);
    expect(result.jobs[0].id).toBe("zr-job:4000000012345");
    expect(result.jobs[1].id).toBe("zr-job:4000000012346");
    expect(result.jobs[2].id).toBe("zr-job:4000000012347");
  });

  it("handles empty data array", () => {
    const result = parseJobsResponse({ data: [] });
    expect(result.jobs).toHaveLength(0);
  });

  it("handles missing data field", () => {
    const result = parseJobsResponse({});
    expect(result.jobs).toHaveLength(0);
  });

  it("defaults hasMore to false", () => {
    const result = parseJobsResponse({ data: [] });
    expect(result.hasMore).toBe(false);
  });
});
