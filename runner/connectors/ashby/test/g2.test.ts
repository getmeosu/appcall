import { describe, expect, test } from "bun:test";
import {
  executeJobsListInternal,
  executeJobsSearch,
  executeJobsCreate,
  executeJobsUpdate,
  executeJobsSetStatus,
  executeJobTemplatesList,
  executeJobInterviewPlansGet,
  executeJobPostingsList,
  executeJobPostingsGet,
  executeJobPostingsUpdate,
  executeOpeningsGet,
  executeOpeningsSearch,
  executeOpeningsCreate,
  executeOpeningsUpdate,
  executeCloseReasonsList,
} from "../src/g2";
import jobsListInternal from "../fixtures/jobs_list_internal.json";
import jobsSearch from "../fixtures/jobs_search.json";
import jobCreated from "../fixtures/job_created.json";
import jobUpdated from "../fixtures/job_updated.json";
import jobStatusSet from "../fixtures/job_status_set.json";
import jobTemplatesList from "../fixtures/job_templates_list.json";
import jobInterviewPlan from "../fixtures/job_interview_plan_info.json";
import jobPostingsList from "../fixtures/job_postings_list.json";
import jobPostingInfo from "../fixtures/job_posting_info.json";
import jobPostingUpdated from "../fixtures/job_posting_updated.json";
import openingInfo from "../fixtures/opening_info.json";
import openingsSearch from "../fixtures/openings_search.json";
import openingCreated from "../fixtures/opening_created.json";
import openingUpdated from "../fixtures/opening_updated.json";
import closeReasonsList from "../fixtures/close_reasons_list.json";

function stubFetch(body: string, init: { status?: number } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(body, { status: init.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const auth = { apiKey: "fixturekey" };
const OPENING_ID = "3f1c2a4b-5d6e-4f70-8a91-b2c3d4e5f601";

describe("Ashby G2 jobs list/search/create/update/status", () => {
  test("jobs.list_internal POSTs /job.list", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(jobsListInternal));
    const result = await executeJobsListInternal({
      ...auth,
      status: ["Open"],
      limit: 10,
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/job.list");
    expect(JSON.parse(await calls[0]!.text())).toEqual({ status: ["Open"], limit: 10 });
    expect(result.jobs).toHaveLength(2);
    expect(result.moreDataAvailable).toBe(false);
  });

  test("jobs.search POSTs /job.search", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(jobsSearch));
    const result = await executeJobsSearch({ ...auth, title: "Staff", fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/job.search");
    expect(JSON.parse(await calls[0]!.text())).toEqual({ title: "Staff" });
    expect(result.jobs).toHaveLength(1);
  });

  test("jobs.search rejects when title and requisitionId absent", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeJobsSearch({ ...auth, fetch: impl })).rejects.toThrow(/title|requisition/i);
    expect(calls).toHaveLength(0);
  });

  test("jobs.create POSTs /job.create and returns results with id", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(jobCreated));
    const result = await executeJobsCreate({
      ...auth,
      title: "Staff Engineer",
      teamId: "dept-1",
      locationId: "loc-1",
      employmentType: "FullTime",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/job.create");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      title: "Staff Engineer",
      teamId: "dept-1",
      locationId: "loc-1",
      employmentType: "FullTime",
    });
    expect(result.id).toBe("2cb69137-763a-4d6f-8f17-bbc3564ecb2e");
  });

  test("jobs.update POSTs /job.update and returns null for Reconcile", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(jobUpdated));
    const result = await executeJobsUpdate({
      ...auth,
      jobId: "job-1",
      title: "Principal Engineer",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/job.update");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      jobId: "job-1",
      title: "Principal Engineer",
    });
    expect(result.job).toBeNull();
  });

  test("jobs.update rejects when only jobId provided", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeJobsUpdate({ ...auth, jobId: "job-1", fetch: impl })).rejects.toThrow(
      /at least one field/,
    );
    expect(calls).toHaveLength(0);
  });

  test("jobs.set_status POSTs /job.setStatus and returns null for Reconcile", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(jobStatusSet));
    const result = await executeJobsSetStatus({
      ...auth,
      jobId: "job-1",
      status: "Closed",
      closeReasonId: "cr-1",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/job.setStatus");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      jobId: "job-1",
      status: "Closed",
      closeReasonId: "cr-1",
    });
    expect(result.job).toBeNull();
  });
});

describe("Ashby G2 templates / interview plan / postings", () => {
  test("job_templates.list POSTs /jobTemplate.list", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(jobTemplatesList));
    const result = await executeJobTemplatesList({ ...auth, fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/jobTemplate.list");
    expect(result.jobTemplates).toHaveLength(2);
  });

  test("job_interview_plans.get POSTs /jobInterviewPlan.info", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(jobInterviewPlan));
    const result = await executeJobInterviewPlansGet({ ...auth, jobId: "job-1", fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/jobInterviewPlan.info");
    expect(JSON.parse(await calls[0]!.text())).toEqual({ jobId: "job-1" });
    expect((result.interviewPlan as { id?: string })?.id).toBe("jip-1");
  });

  test("job_postings.list POSTs /jobPosting.list", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(jobPostingsList));
    const result = await executeJobPostingsList({ ...auth, listedOnly: true, fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/jobPosting.list");
    expect(result.jobPostings).toHaveLength(1);
  });

  test("job_postings.get POSTs /jobPosting.info", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(jobPostingInfo));
    const result = await executeJobPostingsGet({
      ...auth,
      jobPostingId: "post-1",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/jobPosting.info");
    expect((result.jobPosting as { id?: string })?.id).toBe("post-1");
  });

  test("job_postings.update POSTs /jobPosting.update and returns null for Reconcile", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(jobPostingUpdated));
    const result = await executeJobPostingsUpdate({
      ...auth,
      jobPostingId: "post-1",
      title: "Staff Engineer (Remote)",
      workplaceType: "Remote",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/jobPosting.update");
    expect(result.jobPosting).toBeNull();
  });
});

describe("Ashby G2 openings / close reasons", () => {
  test("openings.get POSTs /opening.info with openingId", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(openingInfo));
    const result = await executeOpeningsGet({ ...auth, openingId: OPENING_ID, fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/opening.info");
    expect(JSON.parse(await calls[0]!.text())).toEqual({ openingId: OPENING_ID });
    expect((result.opening as { id?: string })?.id).toBe(OPENING_ID);
    // raw passthrough keeps the live nesting: version fields live under latestVersion
    expect((result.opening as Record<string, any>).latestVersion.identifier).toBe("ENG-12");
  });

  test("openings.get accepts id alias for Idempotent observe", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(openingInfo));
    await executeOpeningsGet({ ...auth, id: OPENING_ID, fetch: impl });
    expect(JSON.parse(await calls[0]!.text())).toEqual({ openingId: OPENING_ID });
  });

  test("openings.search POSTs /opening.search", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(openingsSearch));
    const result = await executeOpeningsSearch({ ...auth, identifier: "ENG-12", fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/opening.search");
    expect(result.openings).toHaveLength(1);
  });

  test("openings.create POSTs /opening.create and returns results with id", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(openingCreated));
    const result = await executeOpeningsCreate({
      ...auth,
      identifier: "ENG-12",
      teamId: "dept-1",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/opening.create");
    expect(result.id).toBe(OPENING_ID);
  });

  test("openings.update POSTs /opening.update and returns null for Reconcile", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(openingUpdated));
    const result = await executeOpeningsUpdate({
      ...auth,
      openingId: OPENING_ID,
      description: "Updated opening description",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/opening.update");
    expect(result.opening).toBeNull();
  });

  test("close_reasons.list POSTs /closeReason.list", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(closeReasonsList));
    const result = await executeCloseReasonsList({ ...auth, includeArchived: false, fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/closeReason.list");
    expect(result.closeReasons).toHaveLength(2);
  });
});
