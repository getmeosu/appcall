import { describe, expect, test } from "bun:test";
import {
  executeJobsListSync,
  executeCandidatesListSync,
  executeCandidatesGetSync,
  executeCandidatesSearchSync,
  executeJobOpeningsListSync,
  executeApplicationsListSync,
  executeInterviewsListSync,
} from "../src/sync";
import jobsFixture from "../fixtures/jobs_list.json";
import candidatesFixture from "../fixtures/candidates_list.json";
import candidateGetFixture from "../fixtures/candidate_get.json";
import candidatesSearchFixture from "../fixtures/candidates_search.json";
import jobOpeningsFixture from "../fixtures/job_openings_list.json";
import applicationsFixture from "../fixtures/applications_list.json";
import interviewsFixture from "../fixtures/interviews_list.json";

// Every request is served by an injected fetch. No real network.
function stubFetch(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(body, { status: init.status ?? 200, headers: init.headers });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const auth = { accessToken: "zoho_tok_secret_value" };

describe("zoho-recruit jobs.list sync", () => {
  test("GETs /recruit/v2/Job_Openings with Zoho-oauthtoken", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(jobsFixture));

    const result = await executeJobsListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("recruit.zoho.com");
    expect(url.pathname).toBe("/recruit/v2/Job_Openings");
    expect(calls[0].headers.get("authorization")).toBe("Zoho-oauthtoken zoho_tok_secret_value");
    expect(result.provider).toBe("zoho-recruit");
    expect(result.operation).toBe("jobs.list");
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].id).toBe("zr-job:4000000012345");
  });

  test("forwards page and perPage", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(jobsFixture));

    await executeJobsListSync({ ...auth, page: 2, perPage: 50, fetch: impl });

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("50");
  });

  test("classifies an upstream failure instead of throwing a bare Error", async () => {
    const { impl } = stubFetch(`{"error":"nope"}`, { status: 500 });

    await expect(executeJobsListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("refuses a redirect rather than following it off the allowed host", async () => {
    const { impl } = stubFetch("", { status: 302, headers: { location: "https://evil.example.net/" } });

    await expect(executeJobsListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "OUTBOUND_REDIRECT_BLOCKED",
    });
  });
});

describe("zoho-recruit candidates.list sync", () => {
  test("GETs /recruit/v2/Candidates", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidatesFixture));

    const result = await executeCandidatesListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("recruit.zoho.com");
    expect(url.pathname).toBe("/recruit/v2/Candidates");
    expect(result.operation).toBe("candidates.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("zr-candidate:4000000020001");
    expect(result.hasMore).toBe(false);
  });

  test("forwards page/perPage/fields/sortBy/sortOrder", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidatesFixture));

    await executeCandidatesListSync({
      ...auth,
      page: 3,
      perPage: 10,
      fields: "id,Email",
      sortBy: "Created_Time",
      sortOrder: "desc",
      fetch: impl,
    });

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("per_page")).toBe("10");
    expect(url.searchParams.get("fields")).toBe("id,Email");
    expect(url.searchParams.get("sort_by")).toBe("Created_Time");
    expect(url.searchParams.get("sort_order")).toBe("desc");
  });
});

describe("zoho-recruit job_openings.list sync", () => {
  test("GETs /recruit/v2/Job_Openings into job_opening model", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(jobOpeningsFixture));

    const result = await executeJobOpeningsListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe("/recruit/v2/Job_Openings");
    expect(result.operation).toBe("job_openings.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("zr-job-opening:4000000030001");
    expect(result.items[0].title).toBe("Senior Accountant");
    expect(result.hasMore).toBe(true);
  });
});

describe("zoho-recruit applications.list sync", () => {
  test("GETs /recruit/v2/Applications", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(applicationsFixture));

    const result = await executeApplicationsListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe("/recruit/v2/Applications");
    expect(result.operation).toBe("applications.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("zr-application:4000000040001");
    expect(result.items[0].candidateId).toBe("4000000020001");
    expect(result.items[0].jobOpeningName).toBe("Senior Accountant");
  });
});

describe("zoho-recruit candidates.get sync", () => {
  test("GETs /recruit/v2/Candidates/{id}", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidateGetFixture));

    const result = await executeCandidatesGetSync({ ...auth, id: "4000000020001", fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("recruit.zoho.com");
    expect(url.pathname).toBe("/recruit/v2/Candidates/4000000020001");
    expect(calls[0].headers.get("authorization")).toBe("Zoho-oauthtoken zoho_tok_secret_value");
    expect(result.operation).toBe("candidates.get");
    expect(result.candidate?.id).toBe("zr-candidate:4000000020001");
    expect(result.candidate?.name).toBe("Christina Palaskas");
  });

  test("forwards fields and rejects unsafe id", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidateGetFixture));

    await executeCandidatesGetSync({ ...auth, id: "4000000020001", fields: "id,Email", fetch: impl });
    expect(new URL(calls[0].url).searchParams.get("fields")).toBe("id,Email");

    await expect(
      executeCandidatesGetSync({ ...auth, id: "../escape", fetch: impl }),
    ).rejects.toThrow(/may only contain/);
  });
});

describe("zoho-recruit candidates.search sync", () => {
  test("GETs /recruit/v2/Candidates/search", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidatesSearchFixture));

    const result = await executeCandidatesSearchSync({
      ...auth,
      criteria: "(Last_Name:contains:Palaskas)",
      fetch: impl,
    });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("recruit.zoho.com");
    expect(url.pathname).toBe("/recruit/v2/Candidates/search");
    expect(url.searchParams.get("criteria")).toBe("(Last_Name:contains:Palaskas)");
    expect(result.operation).toBe("candidates.search");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("zr-candidate:4000000020001");
  });

  test("forwards email/phone/word/page/perPage/fields", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidatesSearchFixture));

    await executeCandidatesSearchSync({
      ...auth,
      email: "c.palaskas@example.com",
      phone: "555-0100",
      word: "Christina",
      page: 2,
      perPage: 25,
      fields: "id,Email",
      fetch: impl,
    });

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("email")).toBe("c.palaskas@example.com");
    expect(url.searchParams.get("phone")).toBe("555-0100");
    expect(url.searchParams.get("word")).toBe("Christina");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("25");
    expect(url.searchParams.get("fields")).toBe("id,Email");
  });
});

describe("zoho-recruit interviews.list sync", () => {
  test("GETs /recruit/v2/Interviews", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(interviewsFixture));

    const result = await executeInterviewsListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("recruit.zoho.com");
    expect(url.pathname).toBe("/recruit/v2/Interviews");
    expect(result.operation).toBe("interviews.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("zr-interview:4000000050001");
    expect(result.items[0].candidateId).toBe("4000000020001");
    expect(result.items[0].interviewerNames).toEqual(["Jane Smith", "Alex Rivera"]);
  });

  test("forwards page/perPage/fields/sortBy/sortOrder", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(interviewsFixture));

    await executeInterviewsListSync({
      ...auth,
      page: 1,
      perPage: 50,
      fields: "id,Interview_Name",
      sortBy: "Start_DateTime",
      sortOrder: "desc",
      fetch: impl,
    });

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("per_page")).toBe("50");
    expect(url.searchParams.get("fields")).toBe("id,Interview_Name");
    expect(url.searchParams.get("sort_by")).toBe("Start_DateTime");
    expect(url.searchParams.get("sort_order")).toBe("desc");
  });
});
