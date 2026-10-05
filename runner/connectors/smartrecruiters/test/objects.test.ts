import { describe, expect, it } from "bun:test";
import {
  normalizeJob,
  parseJobsResponse,
  parsePostingsResponse,
  parseJobGetResponse,
  normalizeCandidate,
  parseCandidatesResponse,
  parseCandidateDetailsResponse,
  normalizeUser,
  parseUsersResponse,
  normalizeInterview,
  parseInterviewsResponse,
} from "../src/objects";
import jobsFixture from "../fixtures/jobs_list.json";
import jobGetFixture from "../fixtures/job_get.json";
import postingsFixture from "../fixtures/postings_list.json";
import candidatesFixture from "../fixtures/candidates_list.json";
import candidateGetFixture from "../fixtures/candidate_get.json";
import usersFixture from "../fixtures/users_list.json";
import interviewsFixture from "../fixtures/interviews_list.json";

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
    expect(result.jobs[0].id).toBe("sr-job:744000153583401");
    expect(result.jobs[1].id).toBe("sr-job:744000153583402");
    expect(result.jobs[2].id).toBe("sr-job:744000153583403");
  });

  // SR-0: live Posting API PostingItem shape (v1listpostings). The title lives in
  // `name` and the publish time in `releasedDate`; before SR-0 the normalizer read
  // `title` / `createdOn`, so every listed posting had title "" and createdAt null.
  it("reads live PostingItem fields (name, releasedDate, typeOfEmployment, location)", () => {
    const result = parseJobsResponse(jobsFixture);
    for (const job of result.jobs) {
      expect(job.title).not.toBe("");
      expect(job.createdAt).not.toBeNull();
      expect(job.refNumber).not.toBeNull();
    }
    const [first, second, minimal] = result.jobs;
    expect(first).toMatchObject({
      title: "Frontend Developer",
      createdAt: "2025-09-15T10:00:00.000Z",
      location: "Toronto, ON, ca",
      department: "Engineering",
      type: "Full-time",
      refNumber: "REF1001A",
    });
    for (const field of ["title", "createdAt", "location", "department", "type", "refNumber"] as const) {
      expect(first[field]).not.toBeNull();
      expect(second[field]).not.toBeNull();
    }
    expect(second.title).toBe("Sales Representative");
    expect(second.createdAt).toBe("2025-10-01T14:30:00.000Z");
    // Sparse live item: empty department object and remote-only location.
    expect(minimal.title).toBe("Unknown Role");
    expect(minimal.createdAt).toBe("2025-10-02T08:00:00.000Z");
    expect(minimal.department).toBeNull();
    expect(minimal.location).toBeNull();
  });

  it("keeps JobDetails title/createdOn precedence over posting fields", () => {
    const job = normalizeJob({ id: "x", title: "Details", name: "Posting", createdOn: "a", releasedDate: "b" });
    expect(job.title).toBe("Details");
    expect(job.createdAt).toBe("a");
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

describe("SmartRecruiters parseJobGetResponse", () => {
  it("parses authenticated JobDetails fixture", () => {
    const result = parseJobGetResponse(jobGetFixture);
    expect(result.job?.id).toBe("sr-job:job-100");
    expect(result.job?.title).toBe("Software Engineer");
    expect(result.job?.department).toBe("Engineering");
    expect(result.job?.location).toBe("San Francisco, California, United States");
    expect(result.job?.type).toBe("Full-time");
    expect(result.job?.status).toBe("SOURCING");
    expect(result.job?.postingStatus).toBe("PUBLIC");
    expect(result.job?.refNumber).toBe("ENG-100");
    expect(result.job?.provider).toBe("smartrecruiters");
  });

  it("returns null for non-object bodies", () => {
    expect(parseJobGetResponse([]).job).toBeNull();
    expect(parseJobGetResponse(null).job).toBeNull();
    expect(parseJobGetResponse({}).job).toBeNull();
  });
});

describe("SmartRecruiters parsePostingsResponse", () => {
  it("parses postings fixture", () => {
    const result = parsePostingsResponse(postingsFixture);
    expect(result.postings).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.postings[0].id).toBe("sr-job:744000153583411");
    expect(result.postings[1].title).toBe("Product Designer");
  });

  it("returns non-null title/createdAt/type for live-shape postings", () => {
    const result = parsePostingsResponse(postingsFixture);
    expect(result.postings[0]).toMatchObject({
      title: "Backend Engineer",
      createdAt: "2025-08-01T09:00:00.000Z",
      location: "Berlin, Berlin, de",
      department: "Engineering",
      type: "Full-time",
      refNumber: "REF2001A",
    });
    for (const posting of result.postings) {
      for (const field of ["createdAt", "location", "department", "type", "refNumber"] as const) {
        expect(posting[field]).not.toBeNull();
      }
      expect(posting.title.length).toBeGreaterThan(0);
    }
  });

  it("handles missing content", () => {
    expect(parsePostingsResponse({}).postings).toHaveLength(0);
    expect(parsePostingsResponse(null).postings).toHaveLength(0);
  });
});

describe("SmartRecruiters normalizeInterview", () => {
  it("normalizes an interview from fixture", () => {
    const interview = normalizeInterview(interviewsFixture.content[0] as never);
    expect(interview.id).toBe("sr-interview:int-001-aaaa-bbbb-cccc-dddddddddddd");
    expect(interview.provider).toBe("smartrecruiters");
    expect(interview.candidateId).toBe("cand-001");
    expect(interview.jobId).toBe("job-100");
    expect(interview.location).toBe("https://zoom.us/j/555111222");
    expect(interview.locationType).toBe("VIDEO_MEETING_ZOOM");
    expect(interview.organizerId).toBe("aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(interview.timezone).toBe("America/Los_Angeles");
    expect(interview.title).toBe("Technical Screen");
    expect(interview.interviewType).toBe("Technical");
    expect(interview.startsAt).toBe("2024-03-10T17:00:00.000Z");
    expect(interview.endsAt).toBe("2024-03-10T18:00:00.000Z");
    expect(interview.interviewerIds).toEqual([
      "aaaaaaaaaaaaaaaaaaaaaaaa",
      "bbbbbbbbbbbbbbbbbbbbbbbb",
    ]);
    expect(interview.refUrl).toBe("https://www.smartrecruiters.com/app/interviews/int-001");
    expect(interview.source).toBe("API");
  });

  it("handles sparse interview without organizer", () => {
    const interview = normalizeInterview(interviewsFixture.content[1] as never);
    expect(interview.id).toBe("sr-interview:int-002-aaaa-bbbb-cccc-dddddddddddd");
    expect(interview.organizerId).toBeNull();
    expect(interview.title).toBe("Onsite Loop");
    expect(interview.interviewerIds).toEqual(["cccccccccccccccccccccccc"]);
    expect(interview.refUrl).toBeNull();
  });

  it("handles interview with no timeslots", () => {
    const interview = normalizeInterview({ id: "sparse", timeslots: [] });
    expect(interview.id).toBe("sr-interview:sparse");
    expect(interview.title).toBeNull();
    expect(interview.startsAt).toBeNull();
    expect(interview.interviewerIds).toEqual([]);
  });
});

describe("SmartRecruiters parseInterviewsResponse", () => {
  it("parses fixture response", () => {
    const result = parseInterviewsResponse(interviewsFixture);
    expect(result.interviews).toHaveLength(2);
    expect(result.interviews[0].id).toBe(
      "sr-interview:int-001-aaaa-bbbb-cccc-dddddddddddd",
    );
  });

  it("handles missing content", () => {
    expect(parseInterviewsResponse({}).interviews).toHaveLength(0);
    expect(parseInterviewsResponse(null).interviews).toHaveLength(0);
  });
});
