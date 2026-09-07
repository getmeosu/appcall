import { describe, expect, it } from "bun:test";
import { normalizeJob, parseJobsResponse } from "../src/objects";
import fixture from "../fixtures/jobs_list.json";

describe("Lever normalizeJob", () => {
  it("normalizes a full posting correctly", () => {
    const job = normalizeJob({
      id: "abc-123",
      text: "Senior Backend Engineer",
      categories: {
        location: "San Francisco",
        team: "Engineering",
        commitment: "Full-time",
      },
      content: { description: "<p>Build scalable backend systems...</p>" },
      hostedUrl: "https://jobs.lever.co/example/abc-123",
    });

    expect(job.id).toBe("lev-job:abc-123");
    expect(job.provider).toBe("lever");
    expect(job.title).toBe("Senior Backend Engineer");
    expect(job.location).toBe("San Francisco");
    expect(job.team).toBe("Engineering");
    expect(job.commitment).toBe("Full-time");
    expect(job.description).toBe("<p>Build scalable backend systems...</p>");
    expect(job.url).toBe("https://jobs.lever.co/example/abc-123");
  });

  it("prefixes id with lev-job:", () => {
    const job = normalizeJob({ id: "x" });
    expect(job.id).toBe("lev-job:x");
  });

  it("sets provider to lever", () => {
    const job = normalizeJob({ id: "x" });
    expect(job.provider).toBe("lever");
  });

  it("defaults title to empty string", () => {
    const job = normalizeJob({ id: "x" });
    expect(job.title).toBe("");
  });

  it("handles null categories", () => {
    const job = normalizeJob({ id: "x", categories: null });
    expect(job.location).toBeNull();
    expect(job.team).toBeNull();
    expect(job.commitment).toBeNull();
  });

  it("handles missing category fields", () => {
    const job = normalizeJob({ id: "x", categories: {} });
    expect(job.location).toBeNull();
    expect(job.team).toBeNull();
    expect(job.commitment).toBeNull();
  });

  it("handles null content", () => {
    const job = normalizeJob({ id: "x", content: null });
    expect(job.description).toBeNull();
  });

  it("handles null hostedUrl", () => {
    const job = normalizeJob({ id: "x", hostedUrl: null });
    expect(job.url).toBeNull();
  });

  it("handles null text", () => {
    const job = normalizeJob({ id: "x", text: null });
    expect(job.title).toBe("");
  });

  it("handles undefined categories", () => {
    const job = normalizeJob({ id: "x", categories: undefined });
    expect(job.location).toBeNull();
  });
});

describe("Lever parseJobsResponse", () => {
  it("parses fixture response", () => {
    const result = parseJobsResponse(fixture);
    expect(result).toHaveLength(3);
  });

  it("normalizes each posting", () => {
    const result = parseJobsResponse(fixture);
    expect(result[0].id).toBe("lev-job:abc-123");
    expect(result[1].id).toBe("lev-job:def-456");
    expect(result[2].id).toBe("lev-job:ghi-789");
  });

  it("handles empty array", () => {
    const result = parseJobsResponse([]);
    expect(result).toHaveLength(0);
  });

  it("handles non-array input gracefully", () => {
    const result = parseJobsResponse({});
    expect(result).toHaveLength(0);
  });
});
