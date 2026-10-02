import { describe, expect, it } from "bun:test";
import {
  normalizeJob,
  parseJobsResponse,
  normalizeCandidate,
  parseCandidatesResponse,
  normalizeApplication,
  parseApplicationsResponse,
  normalizeUser,
  parseUsersResponse,
} from "../src/objects";
import jobsFixture from "../fixtures/jobs_list.json";
import candidatesFixture from "../fixtures/candidates_list.json";
import applicationsFixture from "../fixtures/applications_list.json";
import usersFixture from "../fixtures/users_list.json";

describe("Greenhouse normalizeJob", () => {
  it("normalizes a full job correctly", () => {
    const job = normalizeJob({
      id: 12345,
      title: "Senior Software Engineer",
      location: { name: "San Francisco, CA" },
      departments: [{ name: "Engineering" }],
      updated_at: "2025-12-01T10:30:00Z",
      absolute_url: "https://boards-api.greenhouse.io/example/jobs/12345",
      metadata: [{ name: "Employment Type", value: "Full Time" }],
    });

    expect(job.id).toBe("gh-job:12345");
    expect(job.provider).toBe("greenhouse");
    expect(job.title).toBe("Senior Software Engineer");
    expect(job.location).toBe("San Francisco, CA");
    expect(job.department).toBe("Engineering");
    expect(job.jobType).toBe("Full Time");
    expect(job.updatedAt).toBe("2025-12-01T10:30:00Z");
    expect(job.url).toBe("https://boards-api.greenhouse.io/example/jobs/12345");
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
    const job = normalizeJob({ id: 1, location: null });
    expect(job.location).toBeNull();
  });

  it("handles missing departments gracefully", () => {
    const job = normalizeJob({ id: 1, departments: null });
    expect(job.department).toBeNull();
  });

  it("handles missing metadata gracefully", () => {
    const job = normalizeJob({ id: 1, metadata: null });
    expect(job.jobType).toBeNull();
  });

  it("handles empty metadata array", () => {
    const job = normalizeJob({ id: 1, metadata: [] });
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
    const result = parseJobsResponse(jobsFixture);
    expect(result.jobs).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  it("normalizes each job in the response", () => {
    const result = parseJobsResponse(jobsFixture);
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

describe("Greenhouse normalizeCandidate", () => {
  it("normalizes a full candidate from fixture", () => {
    const candidate = normalizeCandidate(candidatesFixture[0] as never);
    expect(candidate.id).toBe("gh-candidate:53883394");
    expect(candidate.provider).toBe("greenhouse");
    expect(candidate.name).toBe("John Locke");
    expect(candidate.firstName).toBe("John");
    expect(candidate.lastName).toBe("Locke");
    expect(candidate.company).toBe("The Tustin Box Company");
    expect(candidate.emails).toEqual(["test@work.com", "test@example.com"]);
    expect(candidate.phones).toEqual(["555-555-5555"]);
    expect(candidate.applicationIds).toEqual(["69102626", "65153308"]);
    expect(candidate.tags).toEqual(["Python", "Ruby"]);
    expect(candidate.recruiterId).toBe("92120");
    expect(candidate.coordinatorId).toBe("453636");
  });

  it("handles sparse candidate", () => {
    const candidate = normalizeCandidate({ id: 99 });
    expect(candidate.id).toBe("gh-candidate:99");
    expect(candidate.name).toBe("");
    expect(candidate.emails).toEqual([]);
    expect(candidate.phones).toEqual([]);
    expect(candidate.applicationIds).toEqual([]);
    expect(candidate.tags).toEqual([]);
    expect(candidate.recruiterId).toBeNull();
  });
});

describe("Greenhouse parseCandidatesResponse", () => {
  it("parses fixture response", () => {
    const result = parseCandidatesResponse(candidatesFixture);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[1].id).toBe("gh-candidate:57683957");
  });

  it("handles non-array body", () => {
    expect(parseCandidatesResponse({}).candidates).toHaveLength(0);
    expect(parseCandidatesResponse(null).candidates).toHaveLength(0);
  });
});

describe("Greenhouse normalizeApplication", () => {
  it("normalizes a full application from fixture", () => {
    const app = normalizeApplication(applicationsFixture[0] as never);
    expect(app.id).toBe("gh-application:69306314");
    expect(app.provider).toBe("greenhouse");
    expect(app.candidateId).toBe("57683957");
    expect(app.prospect).toBe(false);
    expect(app.status).toBe("active");
    expect(app.jobId).toBe("107761");
    expect(app.jobName).toBe("UX Designer - Boston");
    expect(app.stageId).toBe("767358");
    expect(app.stageName).toBe("Application Review");
    expect(app.source).toBe("Jobs page on your website");
  });

  it("handles prospect without stage", () => {
    const app = normalizeApplication(applicationsFixture[1] as never);
    expect(app.prospect).toBe(true);
    expect(app.status).toBe("hired");
    expect(app.stageId).toBeNull();
    expect(app.jobId).toBe("224587");
  });
});

describe("Greenhouse parseApplicationsResponse", () => {
  it("parses fixture response", () => {
    const result = parseApplicationsResponse(applicationsFixture);
    expect(result.applications).toHaveLength(2);
  });

  it("handles non-array body", () => {
    expect(parseApplicationsResponse({}).applications).toHaveLength(0);
  });
});

describe("Greenhouse normalizeUser", () => {
  it("normalizes a full user from fixture", () => {
    const user = normalizeUser(usersFixture[0] as never);
    expect(user.id).toBe("gh-user:1049756");
    expect(user.provider).toBe("greenhouse");
    expect(user.name).toBe("Integration User");
    expect(user.primaryEmail).toBe("integrationuser@example.com");
    expect(user.emails).toEqual(["integrationuser@example.com"]);
    expect(user.employeeId).toBe("INTUSER123");
    expect(user.disabled).toBe(false);
    expect(user.siteAdmin).toBe(true);
  });

  it("falls back to primary email when emails empty", () => {
    const user = normalizeUser({
      id: 1,
      primary_email_address: "solo@example.com",
      emails: [],
    });
    expect(user.emails).toEqual(["solo@example.com"]);
  });

  it("handles sparse user", () => {
    const user = normalizeUser({ id: 7 });
    expect(user.id).toBe("gh-user:7");
    expect(user.name).toBe("");
    expect(user.disabled).toBe(false);
    expect(user.siteAdmin).toBe(false);
  });
});

describe("Greenhouse parseUsersResponse", () => {
  it("parses fixture response", () => {
    const result = parseUsersResponse(usersFixture);
    expect(result.users).toHaveLength(2);
    expect(result.users[1].id).toBe("gh-user:92120");
  });

  it("handles non-array body", () => {
    expect(parseUsersResponse({}).users).toHaveLength(0);
  });
});
