import { describe, expect, it } from "bun:test";
import {
  normalizeJob,
  parseJobsResponse,
  normalizeOpportunity,
  parseOpportunitiesResponse,
  parseOpportunityGetResponse,
  normalizeInterview,
  parseInterviewsResponse,
  normalizeFeedback,
  parseFeedbackResponse,
  normalizeStage,
  parseStagesResponse,
  parseArchiveReasonsResponse,
  normalizeArchiveReason,
  normalizeUser,
  parseUsersResponse,
} from "../src/objects";
import jobsFixture from "../fixtures/jobs_list.json";
import opportunitiesFixture from "../fixtures/opportunities_list.json";
import opportunitiesGetFixture from "../fixtures/opportunities_get.json";
import interviewsFixture from "../fixtures/opportunities_interviews_list.json";
import feedbackFixture from "../fixtures/opportunities_feedback_list.json";
import stagesFixture from "../fixtures/stages_list.json";
import usersFixture from "../fixtures/users_list.json";

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
    const result = parseJobsResponse(jobsFixture);
    expect(result).toHaveLength(3);
  });

  it("normalizes each posting", () => {
    const result = parseJobsResponse(jobsFixture);
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

describe("Lever normalizeOpportunity", () => {
  it("normalizes a full opportunity", () => {
    const opp = normalizeOpportunity({
      id: "3410c8b9-5c31-4bab-b7e9-9f710206d647",
      name: "Teresa Kale",
      headline: "Engineer",
      location: "SF",
      stage: "lead-new",
      origin: "applied",
      owner: "owner-1",
      contact: "contact-1",
      emails: ["a@b.com"],
      tags: ["eng"],
      sources: ["linkedin"],
      archived: null,
      createdAt: 1417586757232,
      updatedAt: 1423231493557,
      urls: { list: "https://hire.lever.co/c", show: "https://hire.lever.co/c/1" },
    });

    expect(opp.id).toBe("lev-opportunity:3410c8b9-5c31-4bab-b7e9-9f710206d647");
    expect(opp.provider).toBe("lever");
    expect(opp.name).toBe("Teresa Kale");
    expect(opp.headline).toBe("Engineer");
    expect(opp.stageId).toBe("lead-new");
    expect(opp.archived).toBe(false);
    expect(opp.emails).toEqual(["a@b.com"]);
    expect(opp.createdAt).toBe(new Date(1417586757232).toISOString());
  });

  it("marks archived when archived object present", () => {
    const opp = normalizeOpportunity({
      id: "x",
      archived: { archivedAt: 1, reason: "hired" },
    });
    expect(opp.archived).toBe(true);
  });
});

describe("Lever parseOpportunitiesResponse", () => {
  it("parses fixture response", () => {
    const result = parseOpportunitiesResponse(opportunitiesFixture);
    expect(result.opportunities).toHaveLength(2);
    expect(result.opportunities[0].id).toBe(
      "lev-opportunity:3410c8b9-5c31-4bab-b7e9-9f710206d647",
    );
    expect(result.opportunities[1].archived).toBe(true);
    expect(result.hasNext).toBe(true);
    expect(result.next).toContain("0.1414895548650");
  });

  it("handles missing data gracefully", () => {
    const result = parseOpportunitiesResponse({});
    expect(result.opportunities).toHaveLength(0);
    expect(result.hasNext).toBe(false);
    expect(result.next).toBeNull();
  });
});

describe("Lever normalizeStage", () => {
  it("normalizes a stage", () => {
    const stage = normalizeStage({ id: "lead-new", text: "New lead" });
    expect(stage.id).toBe("lev-stage:lead-new");
    expect(stage.provider).toBe("lever");
    expect(stage.name).toBe("New lead");
  });

  it("defaults name to empty string", () => {
    expect(normalizeStage({ id: "x" }).name).toBe("");
  });
});

describe("Lever parseStagesResponse", () => {
  it("parses fixture response", () => {
    const result = parseStagesResponse(stagesFixture);
    expect(result.stages).toHaveLength(4);
    expect(result.stages[0].id).toBe("lev-stage:lead-new");
    expect(result.hasNext).toBe(false);
    expect(result.next).toBeNull();
  });
});

describe("Lever normalizeUser", () => {
  it("normalizes a user", () => {
    const user = normalizeUser({
      id: "8d49b010-cc6a-4f40-ace5-e86061c677ed",
      name: "Nicolas Cage",
      username: "nic",
      email: "nic@brickly.com",
      accessRole: "super admin",
      photo: "https://cdn.lever.co/img/nic.png",
      createdAt: 1412096173299,
      deactivatedAt: null,
    });
    expect(user.id).toBe("lev-user:8d49b010-cc6a-4f40-ace5-e86061c677ed");
    expect(user.provider).toBe("lever");
    expect(user.accessRole).toBe("super admin");
    expect(user.deactivatedAt).toBeNull();
    expect(user.createdAt).toBe(new Date(1412096173299).toISOString());
  });

  it("converts deactivatedAt ms to ISO", () => {
    const user = normalizeUser({ id: "x", deactivatedAt: 1526925087354 });
    expect(user.deactivatedAt).toBe(new Date(1526925087354).toISOString());
  });
});

describe("Lever parseUsersResponse", () => {
  it("parses fixture response", () => {
    const result = parseUsersResponse(usersFixture);
    expect(result.users).toHaveLength(2);
    expect(result.users[0].id).toBe("lev-user:8d49b010-cc6a-4f40-ace5-e86061c677ed");
    expect(result.users[1].deactivatedAt).toBe(new Date(1526925087354).toISOString());
    expect(result.hasNext).toBe(false);
  });
});

describe("Lever parseOpportunityGetResponse", () => {
  it("parses singular fixture envelope", () => {
    const result = parseOpportunityGetResponse(opportunitiesGetFixture);
    expect(result.opportunity).not.toBeNull();
    expect(result.opportunity!.id).toBe(
      "lev-opportunity:3410c8b9-5c31-4bab-b7e9-9f710206d647",
    );
    expect(result.opportunity!.name).toBe("Teresa Kale");
  });

  it("returns null for missing data", () => {
    expect(parseOpportunityGetResponse({}).opportunity).toBeNull();
    expect(parseOpportunityGetResponse({ data: null }).opportunity).toBeNull();
  });
});

describe("Lever normalizeInterview", () => {
  it("normalizes a full interview", () => {
    const interview = normalizeInterview(
      {
        id: "85110ec8-e33a-4997-a798-5affc854b7ce",
        panel: "2cdfff3a-2d7e-4fa6-9a9b-25ba25b6a9f8",
        subject: "On-site interview",
        note: "Bring laptop",
        interviewers: [
          { id: "a0afa6f7-7bb5-4ff6-93c3-e215fbcf3b2e", name: "Alex" },
          { id: "8d49b010-cc6a-4f40-ace5-e86061c677ed", name: "Nic" },
        ],
        timezone: "America/Los_Angeles",
        createdAt: 1423231493557,
        date: 1423509968652,
        duration: 60,
        location: "HQ Room 3",
        stage: "lead-new",
        user: "8d49b010-cc6a-4f40-ace5-e86061c677ed",
        canceledAt: null,
        postings: ["6a1e4b79-75a3-454f-9417-ea79612b9585"],
      },
      "3410c8b9-5c31-4bab-b7e9-9f710206d647",
    );

    expect(interview.id).toBe("lev-interview:85110ec8-e33a-4997-a798-5affc854b7ce");
    expect(interview.provider).toBe("lever");
    expect(interview.opportunityId).toBe("3410c8b9-5c31-4bab-b7e9-9f710206d647");
    expect(interview.subject).toBe("On-site interview");
    expect(interview.interviewerIds).toHaveLength(2);
    expect(interview.durationMinutes).toBe(60);
    expect(interview.date).toBe(new Date(1423509968652).toISOString());
    expect(interview.canceledAt).toBeNull();
  });
});

describe("Lever parseInterviewsResponse", () => {
  it("parses fixture response", () => {
    const result = parseInterviewsResponse(
      interviewsFixture,
      "3410c8b9-5c31-4bab-b7e9-9f710206d647",
    );
    expect(result.interviews).toHaveLength(2);
    expect(result.interviews[0].id).toBe(
      "lev-interview:85110ec8-e33a-4997-a798-5affc854b7ce",
    );
    expect(result.interviews[0].opportunityId).toBe(
      "3410c8b9-5c31-4bab-b7e9-9f710206d647",
    );
    expect(result.interviews[1].canceledAt).toBe(new Date(1418400000000).toISOString());
    expect(result.hasNext).toBe(false);
  });

  it("handles missing data gracefully", () => {
    const result = parseInterviewsResponse({});
    expect(result.interviews).toHaveLength(0);
    expect(result.hasNext).toBe(false);
  });
});

describe("Lever normalizeFeedback", () => {
  it("normalizes a feedback form", () => {
    const fb = normalizeFeedback({
      id: "c64fb192-d6d8-42dc-ac82-47cb87e9839c",
      type: "interview",
      text: "On-site interview",
      user: "a0afa6f7-7bb5-4ff6-93c3-e215fbcf3b2e",
      panel: "2cdfff3a-2d7e-4fa6-9a9b-25ba25b6a9f8",
      interview: "85110ec8-e33a-4997-a798-5affc854b7ce",
      baseTemplateId: "a12851f5-25cd-495b-9dae-b29b02d0b49d",
      createdAt: 1423231493557,
      updatedAt: 1423231493667,
      completedAt: 1423231549510,
      deletedAt: null,
      fields: [
        { id: "f1", type: "score", text: "Rating", value: "4 - Strong Hire" },
      ],
    });
    expect(fb.id).toBe("lev-feedback:c64fb192-d6d8-42dc-ac82-47cb87e9839c");
    expect(fb.provider).toBe("lever");
    expect(fb.type).toBe("interview");
    expect(fb.fields).toHaveLength(1);
    expect(fb.fields[0].value).toBe("4 - Strong Hire");
    expect(fb.deletedAt).toBeNull();
  });
});

describe("Lever parseFeedbackResponse", () => {
  it("parses fixture response", () => {
    const result = parseFeedbackResponse(feedbackFixture);
    expect(result.feedback).toHaveLength(2);
    expect(result.feedback[0].id).toBe(
      "lev-feedback:c64fb192-d6d8-42dc-ac82-47cb87e9839c",
    );
    expect(result.feedback[0].fields).toHaveLength(2);
    expect(result.feedback[1].type).toBe("share");
    expect(result.feedback[1].deletedAt).toBe(new Date(1526925087354).toISOString());
    expect(result.hasNext).toBe(false);
  });
});

describe("Lever archive reason normalization", () => {
  it("normalizes archive reason fields", () => {
    const reason = normalizeArchiveReason({
      id: "63dd55b2-a99f-4e7b-985f-22c7bf80ab42",
      text: "Underqualified",
      status: "active",
      type: "non-hired",
    });
    expect(reason.id).toBe("lev-archive-reason:63dd55b2-a99f-4e7b-985f-22c7bf80ab42");
    expect(reason.provider).toBe("lever");
    expect(reason.text).toBe("Underqualified");
    expect(reason.status).toBe("active");
    expect(reason.type).toBe("non-hired");
  });

  it("parses archive_reasons list envelope", () => {
    const result = parseArchiveReasonsResponse({
      data: [
        { id: "a", text: "Timing", status: "active", type: "non-hired" },
        { id: "b", text: "Hired", status: "active", type: "hired" },
      ],
      next: null,
      hasNext: false,
    });
    expect(result.archiveReasons).toHaveLength(2);
    expect(result.archiveReasons[1].type).toBe("hired");
    expect(result.hasNext).toBe(false);
  });
});
