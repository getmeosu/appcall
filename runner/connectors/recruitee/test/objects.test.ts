import { describe, expect, it } from "bun:test";
import {
  normalizeJob,
  parseJobsResponse,
  normalizeCandidate,
  parseCandidatesResponse,
  normalizeOffer,
  parseOffersResponse,
  normalizePipelineStage,
  parseStagesFromOfferResponse,
  parseStagesFromPipelineTemplateResponse,
  parsePipelineTemplatesList,
  dedupeStages,
} from "../src/objects";
import jobsFixture from "../fixtures/jobs_list.json";
import candidatesFixture from "../fixtures/candidates_list.json";
import offersFixture from "../fixtures/offers_list.json";
import offerDetailFixture from "../fixtures/offer_detail_stages.json";
import templateDetailFixture from "../fixtures/pipeline_template_detail.json";
import templatesListFixture from "../fixtures/pipeline_templates_list.json";

describe("Recruitee normalizeJob", () => {
  it("normalizes a full job correctly", () => {
    const job = normalizeJob({
      id: 1001,
      title: "Backend Engineer",
      location: { city: "Amsterdam", country: "Netherlands" },
      department: { name: "Engineering" },
      employment_type: "full-time",
      url: "https://company.recruitee.com/o/backend-engineer",
      created_at: "2025-08-20T09:00:00Z",
    });

    expect(job.id).toBe("rc-job:1001");
    expect(job.provider).toBe("recruitee");
    expect(job.title).toBe("Backend Engineer");
    expect(job.location).toBe("Amsterdam, Netherlands");
    expect(job.department).toBe("Engineering");
    expect(job.employmentType).toBe("full-time");
    expect(job.url).toBe("https://company.recruitee.com/o/backend-engineer");
    expect(job.createdAt).toBe("2025-08-20T09:00:00Z");
  });

  it("prefixes id with rc-job:", () => {
    expect(normalizeJob({ id: 42 }).id).toBe("rc-job:42");
  });

  it("defaults title to empty string", () => {
    expect(normalizeJob({ id: 1 }).title).toBe("");
  });

  it("handles null location and department", () => {
    const job = normalizeJob({ id: 1, location: null, department: null });
    expect(job.location).toBeNull();
    expect(job.department).toBeNull();
  });

  it("handles partial location (city only)", () => {
    expect(normalizeJob({ id: 1, location: { city: "Berlin" } }).location).toBe("Berlin");
  });

  it("handles empty location object", () => {
    expect(normalizeJob({ id: 1, location: {} }).location).toBeNull();
  });
});

describe("Recruitee parseJobsResponse", () => {
  it("parses fixture response", () => {
    const result = parseJobsResponse(jobsFixture);
    expect(result.jobs).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.jobs[0].id).toBe("rc-job:1001");
  });

  it("handles missing offers field", () => {
    const result = parseJobsResponse({});
    expect(result.jobs).toHaveLength(0);
    expect(result.total).toBeNull();
  });
});

describe("Recruitee normalizeCandidate", () => {
  it("normalizes fixture candidate", () => {
    const c = normalizeCandidate(candidatesFixture.candidates[0] as never);
    expect(c.id).toBe("rc-candidate:28057517");
    expect(c.provider).toBe("recruitee");
    expect(c.name).toBe("Jane Doe");
    expect(c.emails).toEqual(["jane@example.com"]);
    expect(c.phones).toEqual([]);
    expect(c.source).toBe("career_site");
    expect(c.placements).toEqual([
      { id: "29327897", offerId: "744511", stageId: "4190047" },
    ]);
  });

  it("defaults missing arrays", () => {
    const c = normalizeCandidate({ id: 1 });
    expect(c.name).toBe("");
    expect(c.emails).toEqual([]);
    expect(c.phones).toEqual([]);
    expect(c.placements).toEqual([]);
  });
});

describe("Recruitee parseCandidatesResponse", () => {
  it("parses fixture", () => {
    const result = parseCandidatesResponse(candidatesFixture);
    expect(result.candidates).toHaveLength(2);
    expect(result.limit).toBe(2);
    expect(result.offset).toBe(0);
    expect(result.candidates[1].id).toBe("rc-candidate:27746490");
  });

  it("handles missing candidates", () => {
    expect(parseCandidatesResponse({}).candidates).toHaveLength(0);
  });
});

describe("Recruitee normalizeOffer", () => {
  it("normalizes ATS offer with string department/location", () => {
    const o = normalizeOffer(offersFixture.offers[0] as never);
    expect(o.id).toBe("rc-offer:945");
    expect(o.provider).toBe("recruitee");
    expect(o.title).toBe("Backend Engineer");
    expect(o.status).toBe("published");
    expect(o.kind).toBe("job");
    expect(o.department).toBe("Engineering");
    expect(o.location).toBe("Amsterdam, Netherlands");
    expect(o.pipelineTemplateId).toBe("2438");
    expect(o.candidatesCount).toBe(12);
    expect(o.careersUrl).toBe("https://acme.recruitee.com/o/backend-engineer");
  });

  it("builds location from city + country_code", () => {
    const o = normalizeOffer(offersFixture.offers[1] as never);
    expect(o.id).toBe("rc-offer:946");
    expect(o.location).toBe("Berlin, DE");
    expect(o.kind).toBe("talent_pool");
  });
});

describe("Recruitee parseOffersResponse", () => {
  it("parses fixture", () => {
    const result = parseOffersResponse(offersFixture);
    expect(result.offers).toHaveLength(2);
    expect(result.total).toBe(2);
  });
});

describe("Recruitee pipeline stages", () => {
  it("normalizes a stage", () => {
    const s = normalizePipelineStage(
      { id: 19794, name: "Applied", category: "apply", group: "applicants", position: -1 },
      { pipelineTemplateId: "2438", offerId: "945" },
    );
    expect(s.id).toBe("rc-stage:19794");
    expect(s.provider).toBe("recruitee");
    expect(s.pipelineTemplateId).toBe("2438");
    expect(s.offerId).toBe("945");
  });

  it("parses stages from offer detail", () => {
    const { stages } = parseStagesFromOfferResponse(offerDetailFixture);
    expect(stages).toHaveLength(2);
    expect(stages[0].id).toBe("rc-stage:19794");
    expect(stages[0].offerId).toBe("945");
  });

  it("parses stages from pipeline template detail", () => {
    const { stages } = parseStagesFromPipelineTemplateResponse(templateDetailFixture);
    expect(stages).toHaveLength(3);
    expect(stages[2].name).toBe("Hired");
    expect(stages[2].pipelineTemplateId).toBe("2438");
  });

  it("parses pipeline templates list without embedded stages", () => {
    const { templates } = parsePipelineTemplatesList(templatesListFixture);
    expect(templates).toHaveLength(2);
    expect(templates[0].id).toBe("2438");
    expect(templates[0].stages).toHaveLength(0);
  });

  it("dedupes stages by id", () => {
    const a = normalizePipelineStage({ id: 1, name: "A" });
    const b = normalizePipelineStage({ id: 1, name: "A again" });
    const c = normalizePipelineStage({ id: 2, name: "B" });
    expect(dedupeStages([a, b, c])).toHaveLength(2);
  });
});
