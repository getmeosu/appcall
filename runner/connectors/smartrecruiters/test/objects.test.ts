import { describe, expect, it } from "bun:test";
import {
  normalizeJob,
  parseJobsResponse,
  normalizeCandidate,
  parseCandidatesResponse,
  parseCandidateDetailsResponse,
  normalizeUser,
  parseUsersResponse,
} from "../src/objects";
import jobsFixture from "../fixtures/jobs_list.json";
import candidatesFixture from "../fixtures/candidates_list.json";
import candidateGetFixture from "../fixtures/candidate_get.json";
import usersFixture from "../fixtures/users_list.json";

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
    const result = parseJobsResponse(jobsFixture);
    expect(result.jobs).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  it("normalizes each job", () => {
    const result = parseJobsResponse(jobsFixture);
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

describe("SmartRecruiters normalizeCandidate", () => {
  it("normalizes a full candidate from list fixture", () => {
    const candidate = normalizeCandidate(candidatesFixture.content[0] as never);
    expect(candidate.id).toBe("sr-candidate:cand-001");
    expect(candidate.provider).toBe("smartrecruiters");
    expect(candidate.name).toBe("Ada Lovelace");
    expect(candidate.email).toBe("ada@example.com");
    expect(candidate.location).toBe("London, England, United Kingdom");
    expect(candidate.tags).toEqual(["python", "math"]);
    expect(candidate.internal).toBe(false);
    expect(candidate.primaryJobId).toBe("job-100");
    expect(candidate.primaryJobTitle).toBe("Software Engineer");
    expect(candidate.primaryStatus).toBe("IN_REVIEW");
  });

  it("normalizes candidate details with phone", () => {
    const candidate = normalizeCandidate(candidateGetFixture as never);
    expect(candidate.phoneNumber).toBe("+44-20-555-0100");
    expect(candidate.name).toBe("Ada Lovelace");
  });

  it("handles sparse candidate", () => {
    const candidate = normalizeCandidate({ id: "sparse" });
    expect(candidate.id).toBe("sr-candidate:sparse");
    expect(candidate.name).toBe("");
    expect(candidate.email).toBeNull();
    expect(candidate.tags).toEqual([]);
    expect(candidate.internal).toBe(false);
    expect(candidate.primaryJobId).toBeNull();
  });
});

describe("SmartRecruiters parseCandidatesResponse", () => {
  it("parses fixture response", () => {
    const result = parseCandidatesResponse(candidatesFixture);
    expect(result.candidates).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.nextPageId).toBe("next-page-token-abc");
    expect(result.candidates[1].id).toBe("sr-candidate:cand-002");
  });

  it("handles missing content", () => {
    expect(parseCandidatesResponse({}).candidates).toHaveLength(0);
    expect(parseCandidatesResponse(null).candidates).toHaveLength(0);
  });
});

describe("SmartRecruiters parseCandidateDetailsResponse", () => {
  it("parses get fixture", () => {
    const result = parseCandidateDetailsResponse(candidateGetFixture);
    expect(result.candidate?.id).toBe("sr-candidate:cand-001");
    expect(result.candidate?.phoneNumber).toBe("+44-20-555-0100");
  });

  it("returns null for non-object", () => {
    expect(parseCandidateDetailsResponse(null).candidate).toBeNull();
    expect(parseCandidateDetailsResponse([]).candidate).toBeNull();
    expect(parseCandidateDetailsResponse({}).candidate).toBeNull();
  });
});

describe("SmartRecruiters normalizeUser", () => {
  it("normalizes a full user from fixture", () => {
    const user = normalizeUser(usersFixture.content[0] as never);
    expect(user.id).toBe("sr-user:user-001");
    expect(user.provider).toBe("smartrecruiters");
    expect(user.name).toBe("Recruiter One");
    expect(user.email).toBe("recruiter.one@example.com");
    expect(user.role).toBe("ADMINISTRATOR");
    expect(user.active).toBe(true);
    expect(user.language).toBe("en");
  });

  it("marks inactive users", () => {
    const user = normalizeUser(usersFixture.content[1] as never);
    expect(user.active).toBe(false);
    expect(user.role).toBe("STANDARD");
  });

  it("handles sparse user", () => {
    const user = normalizeUser({ id: "u1" });
    expect(user.id).toBe("sr-user:u1");
    expect(user.name).toBe("");
    expect(user.active).toBe(true);
  });
});

describe("SmartRecruiters parseUsersResponse", () => {
  it("parses fixture response", () => {
    const result = parseUsersResponse(usersFixture);
    expect(result.users).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.users[1].id).toBe("sr-user:user-002");
  });

  it("handles missing content", () => {
    expect(parseUsersResponse({}).users).toHaveLength(0);
    expect(parseUsersResponse(null).users).toHaveLength(0);
  });
});

