import { describe, expect, it } from "bun:test";
import {
  normalizeJob,
  parseJobsResponse,
  normalizeCandidate,
  parseCandidatesResponse,
  parseCandidateInfoResponse,
  normalizeApplication,
  parseApplicationsResponse,
  parseApplicationInfoResponse,
  normalizeInterview,
  parseInterviewsResponse,
} from "../src/objects";
import jobsFixture from "../fixtures/jobs_list.json";
import candidatesFixture from "../fixtures/candidates_list.json";
import applicationsFixture from "../fixtures/applications_list.json";
import candidateInfoFixture from "../fixtures/candidate_info.json";
import applicationInfoFixture from "../fixtures/application_info.json";
import candidatesSearchFixture from "../fixtures/candidates_search.json";
import interviewsFixture from "../fixtures/interviews_list.json";

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
    const result = parseJobsResponse(jobsFixture);
    expect(result).toHaveLength(3);
  });

  it("normalizes each job", () => {
    const result = parseJobsResponse(jobsFixture);
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

describe("Ashby normalizeCandidate", () => {
  it("normalizes a full candidate from fixture", () => {
    const candidate = normalizeCandidate(candidatesFixture.results[0] as never);
    expect(candidate.id).toBe("ash-candidate:e9ed20fd-d45f-4aad-8a00-a19bfba0083e");
    expect(candidate.provider).toBe("ashby");
    expect(candidate.name).toBe("Adam Hart");
    expect(candidate.emails).toEqual(["adam.hart@example.com", "adam@work.example"]);
    expect(candidate.phones).toEqual(["+1-555-0100"]);
    expect(candidate.applicationIds).toEqual(["f9e52a51-a075-4116-a7b8-484deba69004"]);
    expect(candidate.profileUrl).toContain("e9ed20fd-d45f-4aad-8a00-a19bfba0083e");
    expect(candidate.source).toBe("Applied");
    expect(candidate.createdAt).toBe("2024-01-15T10:30:00.000Z");
  });

  it("falls back to primaryEmailAddress when emailAddresses empty", () => {
    const candidate = normalizeCandidate({
      id: "c1",
      primaryEmailAddress: { value: "solo@example.com", type: "Work", isPrimary: true },
      emailAddresses: [],
    });
    expect(candidate.emails).toEqual(["solo@example.com"]);
  });

  it("handles sparse candidate", () => {
    const candidate = normalizeCandidate({ id: "sparse" });
    expect(candidate.id).toBe("ash-candidate:sparse");
    expect(candidate.name).toBe("");
    expect(candidate.emails).toEqual([]);
    expect(candidate.phones).toEqual([]);
    expect(candidate.applicationIds).toEqual([]);
    expect(candidate.profileUrl).toBeNull();
    expect(candidate.source).toBeNull();
  });
});

describe("Ashby parseCandidatesResponse", () => {
  it("parses fixture response", () => {
    const result = parseCandidatesResponse(candidatesFixture);
    expect(result.candidates).toHaveLength(2);
    expect(result.moreDataAvailable).toBe(true);
    expect(result.nextCursor).toBe("cursor-page-2");
    expect(result.syncToken).toBe("sync-token-example");
  });

  it("handles missing results", () => {
    const result = parseCandidatesResponse({});
    expect(result.candidates).toHaveLength(0);
    expect(result.moreDataAvailable).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(result.syncToken).toBeNull();
  });
});

describe("Ashby parseCandidateInfoResponse", () => {
  it("parses fixture info response", () => {
    const result = parseCandidateInfoResponse(candidateInfoFixture);
    expect(result.candidate).not.toBeNull();
    expect(result.candidate!.id).toBe("ash-candidate:e9ed20fd-d45f-4aad-8a00-a19bfba0083e");
    expect(result.candidate!.name).toBe("Adam Hart");
  });

  it("returns null when results missing", () => {
    expect(parseCandidateInfoResponse({}).candidate).toBeNull();
    expect(parseCandidateInfoResponse({ results: [] }).candidate).toBeNull();
  });
});

describe("Ashby normalizeApplication", () => {
  it("normalizes a full application from fixture", () => {
    const app = normalizeApplication(applicationsFixture.results[0] as never);
    expect(app.id).toBe("ash-application:e9ed20fd-d45f-4aad-8a00-a19bfba0083e");
    expect(app.provider).toBe("ashby");
    expect(app.status).toBe("Active");
    expect(app.candidateId).toBe("84bfbed7-ed0a-496d-bb18-11b73369f666");
    expect(app.candidateName).toBe("Michael Bluth");
    expect(app.jobId).toBe("4071538b-3cac-4fbf-ac76-f78ed250ffdd");
    expect(app.jobTitle).toBe("First Designer");
    expect(app.stageId).toBe("c153b3e9-8b97-4fc0-bad1-6c654122c1f8");
    expect(app.stageTitle).toBe("Application Review");
    expect(app.archivedAt).toBeNull();
  });

  it("handles archived application without stage", () => {
    const app = normalizeApplication(applicationsFixture.results[1] as never);
    expect(app.status).toBe("Archived");
    expect(app.stageId).toBeNull();
    expect(app.archivedAt).toBe("2024-03-02T12:00:00.000Z");
  });
});

describe("Ashby parseApplicationsResponse", () => {
  it("parses fixture response", () => {
    const result = parseApplicationsResponse(applicationsFixture);
    expect(result.applications).toHaveLength(2);
    expect(result.moreDataAvailable).toBe(false);
    expect(result.syncToken).toBe("sync-apps-1");
  });

  it("handles missing results", () => {
    const result = parseApplicationsResponse({});
    expect(result.applications).toHaveLength(0);
  });
});

describe("Ashby parseApplicationInfoResponse", () => {
  it("parses fixture info response", () => {
    const result = parseApplicationInfoResponse(applicationInfoFixture);
    expect(result.application).not.toBeNull();
    expect(result.application!.id).toBe("ash-application:e9ed20fd-d45f-4aad-8a00-a19bfba0083e");
    expect(result.application!.candidateName).toBe("Michael Bluth");
    expect(result.application!.jobTitle).toBe("First Designer");
  });

  it("returns null when results missing", () => {
    expect(parseApplicationInfoResponse({}).application).toBeNull();
    expect(parseApplicationInfoResponse({ results: [] }).application).toBeNull();
  });
});

describe("Ashby candidates.search parse via parseCandidatesResponse", () => {
  it("parses search fixture (array results, no cursor)", () => {
    const result = parseCandidatesResponse(candidatesSearchFixture);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].id).toBe("ash-candidate:e9ed20fd-d45f-4aad-8a00-a19bfba0083e");
    expect(result.candidates[0].name).toBe("Adam Hart");
    expect(result.moreDataAvailable).toBe(false);
    expect(result.nextCursor).toBeNull();
  });
});

describe("Ashby normalizeInterview", () => {
  it("normalizes a full interview from fixture", () => {
    const interview = normalizeInterview(interviewsFixture.results[0] as never);
    expect(interview.id).toBe("ash-interview:e9ed20fd-d45f-4aad-8a00-a19bfba0083e");
    expect(interview.provider).toBe("ashby");
    expect(interview.title).toBe("Technical Interview");
    expect(interview.externalTitle).toBe("Technical Interview");
    expect(interview.isArchived).toBe(false);
    expect(interview.isDebrief).toBe(false);
    expect(interview.isFeedbackRequired).toBe(true);
    expect(interview.isFeedbackRequested).toBe(true);
    expect(interview.instructionsPlain).toBe("Use the scorecard to evaluate the candidate.");
    expect(interview.jobId).toBe("2cb69137-763a-4d6f-8f17-bbc3564ecb2e");
    expect(interview.feedbackFormDefinitionId).toBe("07189c2e-cacd-489d-8946-165acacc386f");
  });

  it("handles archived shared interview", () => {
    const interview = normalizeInterview(interviewsFixture.results[1] as never);
    expect(interview.isArchived).toBe(true);
    expect(interview.externalTitle).toBeNull();
    expect(interview.jobId).toBeNull();
    expect(interview.isFeedbackRequired).toBe(false);
  });
});

describe("Ashby parseInterviewsResponse", () => {
  it("parses fixture response", () => {
    const result = parseInterviewsResponse(interviewsFixture);
    expect(result.interviews).toHaveLength(2);
    expect(result.moreDataAvailable).toBe(true);
    expect(result.nextCursor).toBe("cursor-int-2");
    expect(result.syncToken).toBe("sync-interviews-1");
  });

  it("handles missing results", () => {
    const result = parseInterviewsResponse({});
    expect(result.interviews).toHaveLength(0);
    expect(result.moreDataAvailable).toBe(false);
  });
});
