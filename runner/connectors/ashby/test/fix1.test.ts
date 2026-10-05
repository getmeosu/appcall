/**
 * ASHBY-fix-1 — normalizers read the live Ashby response nesting.
 *
 * - opening.list / opening.info: version fields live under `latestVersion`
 *   (identifier, description, teamId, targetHireDate, targetStartDate,
 *   isBackfill, employmentType, jobIds, locationIds); no top-level jobId/isOpen.
 * - posting-api job board (jobs.list): `location` / `department` are strings.
 * - job.info: `location` is an object ({ id, name, ... }) when expanded.
 * - offer.list / offer.info: no top-level createdAt; latestVersion.createdAt.
 */
import { describe, expect, test } from "bun:test";
import {
  normalizeJob,
  normalizeOffer,
  normalizeOpening,
  parseJobInfoResponse,
  parseJobsResponse,
  parseOffersResponse,
  parseOpeningsResponse,
} from "../src/objects";
import { executeJobsGetSync, executeJobsListSync, executeOpeningsListSync } from "../src/sync";
import openingsList from "../fixtures/openings_list.json";
import openingInfo from "../fixtures/opening_info.json";
import openingsSearch from "../fixtures/openings_search.json";
import openingCreated from "../fixtures/opening_created.json";
import openingUpdated from "../fixtures/opening_updated.json";
import jobsListLive from "../fixtures/jobs_list_live.json";
import jobInfoLive from "../fixtures/job_info_live.json";
import offersListLive from "../fixtures/offers_list_live.json";

function stubFetch(body: string, init: { status?: number } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(body, { status: init.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const auth = { apiKey: "fixturekey" };
const OPENING_1 = "3f1c2a4b-5d6e-4f70-8a91-b2c3d4e5f601";
const OPENING_2 = "3f1c2a4b-5d6e-4f70-8a91-b2c3d4e5f602";
const JOB_1 = "2cb69137-763a-4d6f-8f17-bbc3564ecb2e";
const JOB_2 = "4071538b-3cac-4fbf-ac76-f78ed250ffdd";
const TEAM = "7d8e9f0a-1b2c-4d3e-8f4a-5b6c7d8e9f0a";

describe("ASHBY-fix-1 opening fixtures use the live opening shape", () => {
  test("every opening fixture nests version fields under latestVersion", () => {
    const records = [
      ...(openingsList.results as Record<string, any>[]),
      ...(openingsSearch.results as Record<string, any>[]),
      openingInfo.results as Record<string, any>,
      openingCreated.results as Record<string, any>,
      openingUpdated.results as Record<string, any>,
    ];
    for (const record of records) {
      for (const key of [
        "identifier",
        "description",
        "teamId",
        "targetHireDate",
        "targetStartDate",
        "isBackfill",
        "employmentType",
        "jobId",
        "isOpen",
      ]) {
        expect(record).not.toHaveProperty(key);
      }
      expect(typeof record.openingState).toBe("string");
      expect(typeof record.latestVersion.identifier).toBe("string");
      expect(Array.isArray(record.latestVersion.jobIds)).toBe(true);
      expect(Array.isArray(record.latestVersion.locationIds)).toBe(true);
    }
  });
});

describe("ASHBY-fix-1 openings.list normalizes latestVersion fields", () => {
  test("POST /opening.list returns non-null identifier, description and version fields", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(openingsList));
    const result = await executeOpeningsListSync({ ...auth, fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/opening.list");
    expect(result.openings).toHaveLength(2);
    const [open, filled] = result.openings;
    expect(open).toEqual({
      id: `ash-opening:${OPENING_1}`,
      provider: "ashby",
      jobId: JOB_1,
      isOpen: true,
      openedAt: "2026-01-05T09:00:00.000Z",
      closedAt: null,
      identifier: "ENG-12",
      description: "Backfill for departing engineer",
      teamId: TEAM,
      targetHireDate: "2026-03-01",
      targetStartDate: "2026-04-01",
      isBackfill: true,
      employmentType: "FullTime",
      openingState: "Open",
    });
    expect(filled).toEqual({
      id: `ash-opening:${OPENING_2}`,
      provider: "ashby",
      jobId: JOB_2,
      isOpen: false,
      openedAt: "2025-06-02T09:00:00.000Z",
      closedAt: "2025-11-20T17:30:00.000Z",
      identifier: "ENG-11",
      description: "Platform team expansion",
      teamId: TEAM,
      targetHireDate: "2025-10-01",
      targetStartDate: "2025-11-15",
      isBackfill: false,
      employmentType: "FullTime",
      openingState: "Filled",
    });
    expect(result.syncToken).toBe("sync-open-1");
  });

  test("no normalized field that the live shape carries is null", () => {
    const { openings } = parseOpeningsResponse(openingsList);
    const open = openings[0]!;
    for (const key of [
      "jobId",
      "openedAt",
      "identifier",
      "description",
      "teamId",
      "targetHireDate",
      "targetStartDate",
      "isBackfill",
      "employmentType",
      "openingState",
    ] as const) {
      expect(open[key]).not.toBeNull();
    }
  });

  test("normalizes the opening.info fixture the same way", () => {
    const opening = normalizeOpening(openingInfo.results as Parameters<typeof normalizeOpening>[0]);
    expect(opening.identifier).toBe("ENG-12");
    expect(opening.description).toBe("Backfill for departing engineer");
    expect(opening.jobId).toBe(JOB_1);
    expect(opening.isOpen).toBe(true);
  });

  test("null latestVersion yields null version fields without throwing", () => {
    const opening = normalizeOpening({
      id: OPENING_1,
      openedAt: null,
      closedAt: null,
      isArchived: false,
      openingState: "Draft",
      latestVersion: null,
    });
    expect(opening.identifier).toBeNull();
    expect(opening.description).toBeNull();
    expect(opening.jobId).toBeNull();
    expect(opening.isBackfill).toBeNull();
    expect(opening.isOpen).toBe(false);
    expect(opening.openingState).toBe("Draft");
  });

  test("legacy top-level keys remain a fallback only", () => {
    const opening = normalizeOpening({
      id: "legacy",
      jobId: JOB_1,
      isOpen: true,
      identifier: "OLD-1",
      description: "legacy",
      isBackfill: false,
    });
    expect(opening.identifier).toBe("OLD-1");
    expect(opening.jobId).toBe(JOB_1);
    expect(opening.isOpen).toBe(true);
    expect(opening.isBackfill).toBe(false);
    const preferred = normalizeOpening({
      id: "both",
      identifier: "TOP",
      latestVersion: { identifier: "NESTED", jobIds: [JOB_2] },
      jobId: JOB_1,
    });
    expect(preferred.identifier).toBe("NESTED");
    expect(preferred.jobId).toBe(JOB_2);
  });
});

describe("ASHBY-fix-1 jobs normalizer reads live location/department", () => {
  test("jobs.list (posting-api) maps string location/department", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(jobsListLive));
    const result = await executeJobsListSync({ boardName: "example", fetch: impl } as Parameters<
      typeof executeJobsListSync
    >[0]);
    expect(calls).toHaveLength(1);
    expect(result.jobs).toHaveLength(2);
    expect(result.jobs[0]).toMatchObject({
      id: "ash-job:7458d4e9-da2e-47bd-98cb-adfda43d42b2",
      title: "Engineering Manager",
      location: "Remote - European Union",
      department: "Engineering",
      employmentType: "FullTime",
      createdAt: "2026-03-04T14:29:08.532+00:00",
    });
    expect(result.jobs[1]!.location).toBe("Houston, TX");
    expect(result.jobs[1]!.department).toBe("Product");
  });

  test("parseJobsResponse on the live fixture has no null location/department", () => {
    for (const job of parseJobsResponse(jobsListLive)) {
      expect(job.location).not.toBeNull();
      expect(job.department).not.toBeNull();
    }
  });

  test("jobs.get (job.info) maps location.name and keeps ids", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(jobInfoLive));
    const result = await executeJobsGetSync({ ...auth, id: JOB_1, fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/job.info");
    expect(result.job).toMatchObject({
      id: `ash-job:${JOB_1}`,
      title: "Staff Engineer",
      location: "Austin, TX",
      status: "Open",
      employmentType: "FullTime",
      locationId: "9a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d",
      departmentId: TEAM,
      defaultInterviewPlanId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      customRequisitionId: "REQ-42",
      createdAt: "2025-10-01T09:00:00.000Z",
    });
    // job.info carries no department name (only departmentId).
    expect(result.job?.department).toBeNull();
  });

  test("legacy locationName/departmentName still win when present", () => {
    const job = normalizeJob({
      id: "x",
      locationName: "Legacy City",
      departmentName: "Legacy Dept",
      location: "Other",
      department: "Other",
    });
    expect(job.location).toBe("Legacy City");
    expect(job.department).toBe("Legacy Dept");
    expect(parseJobInfoResponse({ results: { id: "y", location: { name: "Obj" } } }).job?.location).toBe(
      "Obj",
    );
  });
});

describe("ASHBY-fix-1 offers normalizer reads latestVersion.createdAt", () => {
  test("offer.list live shape yields createdAt from latestVersion", () => {
    const { offers } = parseOffersResponse(offersListLive);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      id: "ash-offer:a7b8c9d0-e1f2-4a3b-8c4d-5e6f7a8b9c01",
      applicationId: "f9e52a51-a075-4116-a7b8-484deba69004",
      latestVersionId: "b8c9d0e1-f2a3-4b4c-9d5e-6f7a8b9c0d01",
      startDate: "2026-05-01",
      createdAt: "2026-04-01T12:00:00.000Z",
      updatedAt: null,
    });
  });

  test("top-level createdAt still wins when present", () => {
    const offer = normalizeOffer({
      id: "o",
      createdAt: "2024-01-01T00:00:00.000Z",
      latestVersion: { createdAt: "2025-01-01T00:00:00.000Z" },
    });
    expect(offer.createdAt).toBe("2024-01-01T00:00:00.000Z");
  });
});
