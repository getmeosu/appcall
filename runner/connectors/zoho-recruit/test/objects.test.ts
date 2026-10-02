import { describe, expect, it } from "bun:test";
import {
  normalizeJob,
  parseJobsResponse,
  normalizeCandidate,
  parseCandidatesResponse,
  parseCandidateGetResponse,
  parseCandidatesSearchResponse,
  normalizeJobOpening,
  parseJobOpeningsResponse,
  normalizeApplication,
  parseApplicationsResponse,
  normalizeInterview,
  parseInterviewsResponse,
} from "../src/objects";
import jobsFixture from "../fixtures/jobs_list.json";
import candidatesFixture from "../fixtures/candidates_list.json";
import candidateGetFixture from "../fixtures/candidate_get.json";
import candidatesSearchFixture from "../fixtures/candidates_search.json";
import jobOpeningsFixture from "../fixtures/job_openings_list.json";
import applicationsFixture from "../fixtures/applications_list.json";
import interviewsFixture from "../fixtures/interviews_list.json";

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

  it("falls back to Posting_Title when Job_Title is absent", () => {
    const job = normalizeJob({ id: "1", Posting_Title: "Accountant" });
    expect(job.title).toBe("Accountant");
  });

  it("prefixes id with zr-job:", () => {
    const job = normalizeJob({ id: "123" });
    expect(job.id).toBe("zr-job:123");
  });

  it("defaults title to empty string", () => {
    const job = normalizeJob({ id: "1" });
    expect(job.title).toBe("");
  });

  it("handles null Hiring_Manager", () => {
    const job = normalizeJob({ id: "1", Hiring_Manager: null });
    expect(job.hiringManager).toBeNull();
  });

  it("handles missing Hiring_Manager name", () => {
    const job = normalizeJob({ id: "1", Hiring_Manager: {} });
    expect(job.hiringManager).toBeNull();
  });
});

describe("Zoho Recruit parseJobsResponse", () => {
  it("parses fixture response", () => {
    const result = parseJobsResponse(jobsFixture);
    expect(result.jobs).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.hasMore).toBe(false);
    expect(result.page).toBe(1);
  });

  it("handles empty data array", () => {
    const result = parseJobsResponse({ data: [] });
    expect(result.jobs).toHaveLength(0);
  });

  it("handles missing data field", () => {
    const result = parseJobsResponse({});
    expect(result.jobs).toHaveLength(0);
  });

  it("reads more_records as hasMore", () => {
    const result = parseJobsResponse({ data: [], info: { more_records: true } });
    expect(result.hasMore).toBe(true);
  });
});

describe("Zoho Recruit normalizeCandidate", () => {
  it("normalizes a full candidate", () => {
    const c = normalizeCandidate({
      id: "4000000020001",
      First_Name: "Christina",
      Last_Name: "Palaskas",
      Email: "c.palaskas@example.com",
      Mobile: "555-0100",
      Candidate_Status: "New",
      Current_Employer: "Chandlers",
      Current_Job_Title: "Technical Consultant",
      Experience_in_Years: 3,
      Skill_Set: "Communication",
      Candidate_Owner: { name: "Jane Smith" },
      Created_Time: "2025-07-10T08:00:00Z",
      Modified_Time: "2025-08-01T10:00:00Z",
    });

    expect(c.id).toBe("zr-candidate:4000000020001");
    expect(c.provider).toBe("zoho-recruit");
    expect(c.name).toBe("Christina Palaskas");
    expect(c.email).toBe("c.palaskas@example.com");
    expect(c.phone).toBe("555-0100");
    expect(c.status).toBe("New");
    expect(c.experienceYears).toBe(3);
    expect(c.ownerName).toBe("Jane Smith");
  });

  it("handles sparse candidate", () => {
    const c = normalizeCandidate({ id: "9", Last_Name: "Orphan" });
    expect(c.name).toBe("Orphan");
    expect(c.email).toBeNull();
    expect(c.phone).toBeNull();
  });
});

describe("Zoho Recruit parseCandidatesResponse", () => {
  it("parses fixture", () => {
    const result = parseCandidatesResponse(candidatesFixture);
    expect(result.candidates).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.hasMore).toBe(false);
    expect(result.candidates[0].id).toBe("zr-candidate:4000000020001");
  });

  it("handles null input", () => {
    const result = parseCandidatesResponse(null);
    expect(result.candidates).toHaveLength(0);
  });
});

describe("Zoho Recruit normalizeJobOpening", () => {
  it("normalizes a full job opening", () => {
    const o = normalizeJobOpening({
      id: "4000000030001",
      Posting_Title: "Senior Accountant",
      Job_Opening_Status: "In-progress",
      Date_Opened: "2026-01-21",
      Target_Date: "2026-02-20",
      Industry: "Accounting",
      City: "Tallahassee",
      Job_Type: "Full Time",
      Description: "Own the books...",
      No_of_Candidates_Hired: 1,
      No_of_Candidates_Associated: 4,
      Created_Time: "2026-01-21T09:00:00Z",
    });

    expect(o.id).toBe("zr-job-opening:4000000030001");
    expect(o.title).toBe("Senior Accountant");
    expect(o.status).toBe("In-progress");
    expect(o.candidatesHired).toBe(1);
    expect(o.candidatesAssociated).toBe(4);
  });

  it("defaults title to empty string", () => {
    const o = normalizeJobOpening({ id: "1" });
    expect(o.title).toBe("");
  });
});

describe("Zoho Recruit parseJobOpeningsResponse", () => {
  it("parses fixture with more_records", () => {
    const result = parseJobOpeningsResponse(jobOpeningsFixture);
    expect(result.jobOpenings).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.jobOpenings[0].id).toBe("zr-job-opening:4000000030001");
  });
});

describe("Zoho Recruit normalizeApplication", () => {
  it("normalizes a full application", () => {
    const a = normalizeApplication({
      id: "4000000040001",
      Application_Status: "Associated",
      Email: "c.palaskas@example.com",
      Origin: "Career site",
      Candidate_Name: { name: "Christina Palaskas", id: "4000000020001" },
      Job_Opening_Name: { name: "Senior Accountant", id: "4000000030001" },
      Created_Time: "2026-01-22T11:00:00Z",
      Modified_Time: "2026-01-23T09:00:00Z",
    });

    expect(a.id).toBe("zr-application:4000000040001");
    expect(a.candidateId).toBe("4000000020001");
    expect(a.candidateName).toBe("Christina Palaskas");
    expect(a.jobOpeningId).toBe("4000000030001");
    expect(a.jobOpeningName).toBe("Senior Accountant");
  });

  it("handles null lookups", () => {
    const a = normalizeApplication({ id: "1", Candidate_Name: null, Job_Opening_Name: null });
    expect(a.candidateId).toBeNull();
    expect(a.jobOpeningName).toBeNull();
  });
});

describe("Zoho Recruit parseApplicationsResponse", () => {
  it("parses fixture", () => {
    const result = parseApplicationsResponse(applicationsFixture);
    expect(result.applications).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.applications[0].id).toBe("zr-application:4000000040001");
  });
});

describe("Zoho Recruit parseCandidateGetResponse", () => {
  it("parses get fixture", () => {
    const result = parseCandidateGetResponse(candidateGetFixture);
    expect(result.candidate).not.toBeNull();
    expect(result.candidate!.id).toBe("zr-candidate:4000000020001");
    expect(result.candidate!.email).toBe("c.palaskas@example.com");
  });

  it("returns null for empty data", () => {
    expect(parseCandidateGetResponse({ data: [] }).candidate).toBeNull();
    expect(parseCandidateGetResponse(null).candidate).toBeNull();
  });
});

describe("Zoho Recruit parseCandidatesSearchResponse", () => {
  it("parses search fixture", () => {
    const result = parseCandidatesSearchResponse(candidatesSearchFixture);
    expect(result.candidates).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.candidates[0].id).toBe("zr-candidate:4000000020001");
  });
});

describe("Zoho Recruit normalizeInterview", () => {
  it("normalizes a full interview with interviewer array", () => {
    const i = normalizeInterview({
      id: "4000000050001",
      Interview_Name: "Technical Interview",
      Interview_Status: "Scheduled",
      Candidate_Name: { name: "Christina Palaskas", id: "4000000020001" },
      Posting_Title: { name: "Senior Accountant", id: "4000000030001" },
      Interviewer: [
        { name: "Jane Smith", id: "4000000000001" },
        { name: "Alex Rivera", id: "4000000000002" },
      ],
      Start_DateTime: "2026-02-10T10:00:00-08:00",
      End_DateTime: "2026-02-10T11:00:00-08:00",
      Location: "Zoom",
      Created_Time: "2026-02-01T09:00:00Z",
      Modified_Time: "2026-02-02T09:00:00Z",
    });

    expect(i.id).toBe("zr-interview:4000000050001");
    expect(i.provider).toBe("zoho-recruit");
    expect(i.name).toBe("Technical Interview");
    expect(i.status).toBe("Scheduled");
    expect(i.candidateId).toBe("4000000020001");
    expect(i.jobOpeningName).toBe("Senior Accountant");
    expect(i.interviewerIds).toEqual(["4000000000001", "4000000000002"]);
    expect(i.interviewerNames).toEqual(["Jane Smith", "Alex Rivera"]);
    expect(i.startsAt).toBe("2026-02-10T10:00:00-08:00");
    expect(i.location).toBe("Zoom");
  });

  it("handles single interviewer object and Job_Opening_Name fallback", () => {
    const i = normalizeInterview({
      id: "9",
      Interview_Name: "Culture Fit",
      Interviewer: { name: "Jane Smith", id: "4000000000001" },
      Job_Opening_Name: { name: "Technical Lead", id: "4000000012345" },
    });
    expect(i.interviewerIds).toEqual(["4000000000001"]);
    expect(i.jobOpeningId).toBe("4000000012345");
    expect(i.jobOpeningName).toBe("Technical Lead");
  });
});

describe("Zoho Recruit parseInterviewsResponse", () => {
  it("parses fixture", () => {
    const result = parseInterviewsResponse(interviewsFixture);
    expect(result.interviews).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.interviews[0].id).toBe("zr-interview:4000000050001");
    expect(result.interviews[1].interviewerIds).toEqual(["4000000000001"]);
  });

  it("handles null input", () => {
    const result = parseInterviewsResponse(null);
    expect(result.interviews).toHaveLength(0);
  });
});
