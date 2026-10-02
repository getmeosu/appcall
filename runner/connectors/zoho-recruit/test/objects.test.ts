import { describe, expect, it } from "bun:test";
import {
  normalizeJob,
  parseJobsResponse,
  normalizeCandidate,
  parseCandidatesResponse,
  normalizeJobOpening,
  parseJobOpeningsResponse,
  normalizeApplication,
  parseApplicationsResponse,
} from "../src/objects";
import jobsFixture from "../fixtures/jobs_list.json";
import candidatesFixture from "../fixtures/candidates_list.json";
import jobOpeningsFixture from "../fixtures/job_openings_list.json";
import applicationsFixture from "../fixtures/applications_list.json";

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
