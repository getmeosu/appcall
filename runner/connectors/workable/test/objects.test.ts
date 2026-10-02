import { describe, expect, it } from "bun:test";
import {
  normalizeJob,
  parseJobsResponse,
  parseJobGetResponse,
  normalizeCandidate,
  parseCandidatesResponse,
  parseCandidateGetResponse,
  normalizeStage,
  parseStagesResponse,
  normalizeMember,
  parseMembersResponse,
  normalizeEvent,
  parseEventsResponse,
} from "../src/objects";
import jobsFixture from "../fixtures/jobs_list.json";
import jobGetFixture from "../fixtures/job_get.json";
import candidatesFixture from "../fixtures/candidates_list.json";
import candidateGetFixture from "../fixtures/candidate_get.json";
import stagesFixture from "../fixtures/stages_list.json";
import membersFixture from "../fixtures/members_list.json";
import eventsFixture from "../fixtures/events_list.json";

describe("Workable normalizeJob", () => {
  it("normalizes a full job correctly", () => {
    const job = normalizeJob({
      id: "wk-001",
      title: "DevOps Engineer",
      state: "published",
      url: "https://www.workable.com/jobs/wk-001",
      location: { city: "London", region: "Greater London", country: "United Kingdom" },
      department: { name: "Engineering" },
      type: "Full-time",
      employmentType: "full-time",
    });

    expect(job.id).toBe("wk-job:wk-001");
    expect(job.provider).toBe("workable");
    expect(job.title).toBe("DevOps Engineer");
    expect(job.state).toBe("published");
    expect(job.url).toBe("https://www.workable.com/jobs/wk-001");
    expect(job.location).toBe("London, Greater London, United Kingdom");
    expect(job.department).toBe("Engineering");
    expect(job.type).toBe("Full-time");
  });

  it("prefixes id with wk-job:", () => {
    const job = normalizeJob({ id: "x" });
    expect(job.id).toBe("wk-job:x");
  });

  it("sets provider to workable", () => {
    const job = normalizeJob({ id: "x" });
    expect(job.provider).toBe("workable");
  });

  it("defaults title to empty string", () => {
    const job = normalizeJob({ id: "x" });
    expect(job.title).toBe("");
  });

  it("handles null location", () => {
    const job = normalizeJob({ id: "x", location: null });
    expect(job.location).toBeNull();
  });

  it("handles partial location", () => {
    const job = normalizeJob({
      id: "x",
      location: { city: "Berlin" },
    });
    expect(job.location).toBe("Berlin");
  });

  it("handles null department", () => {
    const job = normalizeJob({ id: "x", department: null });
    expect(job.department).toBeNull();
  });

  it("handles missing department name", () => {
    const job = normalizeJob({ id: "x", department: {} });
    expect(job.department).toBeNull();
  });

  it("falls back to employmentType when type is null", () => {
    const job = normalizeJob({
      id: "x",
      type: null,
      employmentType: "contract",
    });
    expect(job.type).toBe("contract");
  });

  it("prefers type over employmentType", () => {
    const job = normalizeJob({
      id: "x",
      type: "Full-time",
      employmentType: "contract",
    });
    expect(job.type).toBe("Full-time");
  });

  it("handles null state", () => {
    const job = normalizeJob({ id: "x", state: null });
    expect(job.state).toBeNull();
  });

  it("handles null url", () => {
    const job = normalizeJob({ id: "x", url: null });
    expect(job.url).toBeNull();
  });
});

describe("Workable parseJobsResponse", () => {
  it("parses fixture response", () => {
    const result = parseJobsResponse(jobsFixture);
    expect(result).toHaveLength(3);
  });

  it("normalizes each job", () => {
    const result = parseJobsResponse(jobsFixture);
    expect(result[0].id).toBe("wk-job:wk-001");
    expect(result[1].id).toBe("wk-job:wk-002");
    expect(result[2].id).toBe("wk-job:wk-003");
  });

  it("handles empty jobs array", () => {
    const result = parseJobsResponse({ jobs: [] });
    expect(result).toHaveLength(0);
  });

  it("handles missing jobs field", () => {
    const result = parseJobsResponse({});
    expect(result).toHaveLength(0);
  });
});

describe("Workable normalizeCandidate", () => {
  it("normalizes a full candidate", () => {
    const c = normalizeCandidate({
      id: "ce4da98",
      name: "Lakita Marrero",
      email: "lakita@example.com",
      headline: "Ops",
      stage: "Interview",
      job: { shortcode: "GROOV005", title: "Office Manager" },
      disqualified: true,
      sourced: false,
      profile_url: "https://example.com/c/1",
      domain: "twitter.com",
      created_at: "2015-06-26T00:00:00Z",
      updated_at: "2015-07-08T14:46:48Z",
    });
    expect(c.id).toBe("wk-candidate:ce4da98");
    expect(c.provider).toBe("workable");
    expect(c.name).toBe("Lakita Marrero");
    expect(c.email).toBe("lakita@example.com");
    expect(c.stage).toBe("Interview");
    expect(c.jobShortcode).toBe("GROOV005");
    expect(c.jobTitle).toBe("Office Manager");
    expect(c.disqualified).toBe(true);
    expect(c.sourced).toBe(false);
  });

  it("defaults missing fields", () => {
    const c = normalizeCandidate({ id: "x" });
    expect(c.name).toBe("");
    expect(c.email).toBeNull();
    expect(c.jobShortcode).toBeNull();
    expect(c.disqualified).toBeNull();
  });
});

describe("Workable parseCandidatesResponse", () => {
  it("parses fixture", () => {
    const result = parseCandidatesResponse(candidatesFixture);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].id).toBe("wk-candidate:ce4da98");
    expect(result.next).toContain("/candidates?");
  });

  it("handles empty / missing", () => {
    expect(parseCandidatesResponse({ candidates: [] }).candidates).toHaveLength(0);
    expect(parseCandidatesResponse({}).candidates).toHaveLength(0);
    expect(parseCandidatesResponse({}).next).toBeNull();
  });
});

describe("Workable normalizeStage", () => {
  it("normalizes a stage by slug", () => {
    const s = normalizeStage({
      slug: "phone-screen",
      name: "Phone Screen",
      kind: "phone-screen",
      position: 2,
    });
    expect(s.id).toBe("wk-stage:phone-screen");
    expect(s.provider).toBe("workable");
    expect(s.slug).toBe("phone-screen");
    expect(s.name).toBe("Phone Screen");
    expect(s.kind).toBe("phone-screen");
    expect(s.position).toBe(2);
  });
});

describe("Workable parseStagesResponse", () => {
  it("parses fixture", () => {
    const result = parseStagesResponse(stagesFixture);
    expect(result.stages).toHaveLength(6);
    expect(result.stages[0].id).toBe("wk-stage:sourced");
    expect(result.stages[5].name).toBe("Hired");
  });

  it("handles empty / missing", () => {
    expect(parseStagesResponse({ stages: [] }).stages).toHaveLength(0);
    expect(parseStagesResponse({}).stages).toHaveLength(0);
  });
});

describe("Workable normalizeMember", () => {
  it("normalizes roles array", () => {
    const m = normalizeMember({
      id: "3dae6411",
      name: "John Doe",
      email: "john@example.com",
      roles: ["ats.admin"],
      active: true,
    });
    expect(m.id).toBe("wk-member:3dae6411");
    expect(m.provider).toBe("workable");
    expect(m.roles).toEqual(["ats.admin"]);
    expect(m.active).toBe(true);
  });

  it("falls back to singular role", () => {
    const m = normalizeMember({
      id: "x",
      name: "Jane",
      role: "reviewer",
    });
    expect(m.roles).toEqual(["reviewer"]);
  });
});

describe("Workable parseMembersResponse", () => {
  it("parses fixture", () => {
    const result = parseMembersResponse(membersFixture);
    expect(result.members).toHaveLength(2);
    expect(result.members[0].id).toBe("wk-member:3dae6411");
    expect(result.members[1].roles).toEqual(["reviewer"]);
  });

  it("handles empty / missing", () => {
    expect(parseMembersResponse({ members: [] }).members).toHaveLength(0);
    expect(parseMembersResponse({}).members).toHaveLength(0);
  });
});


describe("Workable parseJobGetResponse", () => {
  it("parses top-level job fixture", () => {
    const result = parseJobGetResponse(jobGetFixture);
    expect(result.job?.id).toBe("wk-job:167636b1");
    expect(result.job?.shortcode).toBe("GROOV005");
    expect(result.job?.department).toBe("Administration");
    expect(result.job?.type).toBe("Full-time");
    expect(result.job?.location).toBe("Chicago, Illinois, United States");
  });

  it("returns null for missing id", () => {
    expect(parseJobGetResponse({}).job).toBeNull();
    expect(parseJobGetResponse({ title: "x" }).job).toBeNull();
  });
});

describe("Workable parseCandidateGetResponse", () => {
  it("parses wrapped candidate fixture", () => {
    const result = parseCandidateGetResponse(candidateGetFixture);
    expect(result.candidate?.id).toBe("wk-candidate:108d1748");
    expect(result.candidate?.name).toBe("Cindy Sawyers");
    expect(result.candidate?.jobShortcode).toBe("GROOV005");
    expect(result.candidate?.email).toBe("cindy_sawyers@gmail.com");
  });

  it("returns null for missing candidate", () => {
    expect(parseCandidateGetResponse({}).candidate).toBeNull();
    expect(parseCandidateGetResponse({ candidate: null }).candidate).toBeNull();
  });
});

describe("Workable normalizeEvent", () => {
  it("normalizes a full event with conference", () => {
    const e = normalizeEvent({
      id: "47fdddd",
      title: "Interview with",
      description: null,
      type: "InterviewEvent",
      starts_at: "2017-01-17T22:00:00.000Z",
      ends_at: "2017-01-17T22:30:00.000Z",
      cancelled: false,
      job: { shortcode: "GROOV001", title: "Operations Manager" },
      candidate: { id: "2b50e243", name: "Wayne Walsh" },
      members: [{ id: "3f8918be", name: "Natalie Sung", status: "accepted" }],
      conference: { type: "zoom_meeting", id: 1100001, url: "https://zoom.us/j/1100001" },
    });
    expect(e.id).toBe("wk-event:47fdddd");
    expect(e.provider).toBe("workable");
    expect(e.jobShortcode).toBe("GROOV001");
    expect(e.candidateId).toBe("2b50e243");
    expect(e.members).toHaveLength(1);
    expect(e.conferenceType).toBe("zoom_meeting");
    expect(e.conferenceId).toBe("1100001");
  });
});

describe("Workable parseEventsResponse", () => {
  it("parses fixture", () => {
    const result = parseEventsResponse(eventsFixture);
    expect(result.events).toHaveLength(2);
    expect(result.events[0].id).toBe("wk-event:4770c5c");
    expect(result.events[1].conferenceUrl).toBe("https://zoom.us/j/1100001");
  });

  it("handles empty / missing", () => {
    expect(parseEventsResponse({ events: [] }).events).toHaveLength(0);
    expect(parseEventsResponse({}).events).toHaveLength(0);
  });
});
