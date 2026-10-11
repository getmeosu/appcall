import { describe, expect, test } from "bun:test";
import {
  executeOpportunitiesUpdateSync,
  executeCandidatesGetSync,
  executeInterviewsListSync,
  executeInterviewsGetSync,
  executeOffersListSync,
  executeOffersGetSync,
  executePostingsListSync,
  executePostingsGetSync,
  executeNotesListSync,
  executeUsersGetSync,
  executeRequisitionsListSync,
  executeFeedbackGetSync,
} from "../src/sync";
import opportunitiesGetFixture from "../fixtures/opportunities_get.json";
import interviewsFixture from "../fixtures/opportunities_interviews_list.json";
import interviewGetFixture from "../fixtures/interview_get.json";
import offersFixture from "../fixtures/offers_list.json";
import offerGetFixture from "../fixtures/offer_get.json";
import postingsFixture from "../fixtures/postings_list.json";
import postingGetFixture from "../fixtures/posting_get.json";
import notesFixture from "../fixtures/notes_list.json";
import userGetFixture from "../fixtures/user_get.json";
import requisitionsFixture from "../fixtures/requisitions_list.json";
import feedbackGetFixture from "../fixtures/feedback_get.json";

function stubFetch(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(body, { status: init.status ?? 200, headers: init.headers });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const auth = { apiKey: "fixturekey", region: "co" };

describe("Lever opportunities.update (write; runner owns Reconcile)", () => {
  test("PUTs /v1/opportunities/{id} without in-handler GET", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(opportunitiesGetFixture));
    const result = await executeOpportunitiesUpdateSync({
      ...auth,
      id: "3410c8b9-5c31-4bab-b7e9-9f710206d647",
      headline: "Staff Engineer",
      location: "Remote",
      fetch: impl,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(new URL(calls[0].url).pathname).toBe(
      "/v1/opportunities/3410c8b9-5c31-4bab-b7e9-9f710206d647",
    );
    expect(JSON.parse(await calls[0].text())).toEqual({
      headline: "Staff Engineer",
      location: "Remote",
    });
    expect(result.opportunity).toBeNull();
  });

  test("forwards performAs query", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(opportunitiesGetFixture));
    await executeOpportunitiesUpdateSync({
      ...auth,
      id: "3410c8b9-5c31-4bab-b7e9-9f710206d647",
      name: "Teresa Kale",
      performAs: "8d49b010-cc6a-4f40-ace5-e86061c677ed",
      fetch: impl,
    });
    expect(new URL(calls[0].url).searchParams.get("perform_as")).toBe(
      "8d49b010-cc6a-4f40-ace5-e86061c677ed",
    );
  });

  test("rejects missing id before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeOpportunitiesUpdateSync({ ...auth, id: "", name: "x", fetch: impl })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("Lever candidates.get", () => {
  test("GETs /v1/opportunities/{id} as a candidate", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(opportunitiesGetFixture));
    const result = await executeCandidatesGetSync({
      ...auth,
      id: "3410c8b9-5c31-4bab-b7e9-9f710206d647",
      fetch: impl,
    });
    expect(new URL(calls[0].url).pathname).toBe(
      "/v1/opportunities/3410c8b9-5c31-4bab-b7e9-9f710206d647",
    );
    expect(result.candidate?.id).toBe("lev-candidate:3410c8b9-5c31-4bab-b7e9-9f710206d647");
    expect(result.candidate?.name).toBe("Teresa Kale");
    expect(result.candidate?.emails).toEqual(["teresa@example.com"]);
  });
});

describe("Lever interviews.list / get", () => {
  test("GETs /v1/opportunities/{id}/interviews", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(interviewsFixture));
    const result = await executeInterviewsListSync({
      ...auth,
      opportunityId: "3410c8b9-5c31-4bab-b7e9-9f710206d647",
      fetch: impl,
    });
    expect(new URL(calls[0].url).pathname).toBe(
      "/v1/opportunities/3410c8b9-5c31-4bab-b7e9-9f710206d647/interviews",
    );
    expect(result.interviews.length).toBeGreaterThan(0);
    expect(result.interviews[0].opportunityId).toBe("3410c8b9-5c31-4bab-b7e9-9f710206d647");
  });

  test("GETs /v1/opportunities/{id}/interviews/{interviewId}", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(interviewGetFixture));
    const result = await executeInterviewsGetSync({
      ...auth,
      opportunityId: "3410c8b9-5c31-4bab-b7e9-9f710206d647",
      interviewId: "int-1",
      fetch: impl,
    });
    expect(new URL(calls[0].url).pathname).toBe(
      "/v1/opportunities/3410c8b9-5c31-4bab-b7e9-9f710206d647/interviews/int-1",
    );
    expect(result.interview?.id).toBe("lev-interview:int-1");
    expect(result.interview?.subject).toBe("Phone screen");
  });
});

describe("Lever offers.list / get", () => {
  test("GETs /v1/opportunities/{id}/offers", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(offersFixture));
    const result = await executeOffersListSync({
      ...auth,
      opportunityId: "3410c8b9-5c31-4bab-b7e9-9f710206d647",
      fetch: impl,
    });
    expect(new URL(calls[0].url).pathname).toBe(
      "/v1/opportunities/3410c8b9-5c31-4bab-b7e9-9f710206d647/offers",
    );
    expect(result.offers[0].id).toBe("lev-offer:off-aaa111");
    expect(result.offers[0].status).toBe("sent");
  });

  test("GETs /v1/opportunities/{id}/offers/{offerId}", async () => {
    const { impl } = stubFetch(JSON.stringify(offerGetFixture));
    const result = await executeOffersGetSync({
      ...auth,
      opportunityId: "3410c8b9-5c31-4bab-b7e9-9f710206d647",
      offerId: "off-aaa111",
      fetch: impl,
    });
    expect(result.offer?.creatorId).toBe("8d49b010-cc6a-4f40-ace5-e86061c677ed");
  });
});

describe("Lever postings.list / get", () => {
  test("GETs authenticated /v1/postings", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(postingsFixture));
    const result = await executePostingsListSync({ ...auth, state: "published", fetch: impl });
    expect(new URL(calls[0].url).hostname).toBe("api.lever.co");
    expect(new URL(calls[0].url).pathname).toBe("/v1/postings");
    expect(new URL(calls[0].url).searchParams.get("state")).toBe("published");
    expect(result.postings[0].id).toBe("lev-posting:730e37db-93d3-4acf-b9de-7cfc397cef1d");
    expect(result.next).toBe("cursor-post-2");
  });

  test("GETs /v1/postings/{id}", async () => {
    const { impl } = stubFetch(JSON.stringify(postingGetFixture));
    const result = await executePostingsGetSync({
      ...auth,
      id: "730e37db-93d3-4acf-b9de-7cfc397cef1d",
      fetch: impl,
    });
    expect(result.posting?.title).toBe("Infrastructure Engineer");
    expect(result.posting?.state).toBe("published");
  });
});

describe("Lever notes.list", () => {
  test("GETs /v1/opportunities/{id}/notes", async () => {
    const { impl } = stubFetch(JSON.stringify(notesFixture));
    const result = await executeNotesListSync({
      ...auth,
      opportunityId: "3410c8b9-5c31-4bab-b7e9-9f710206d647",
      fetch: impl,
    });
    expect(result.notes[0].id).toBe("lev-note:note-1");
    expect(result.notes[0].text).toBe("Strong systems background.");
  });
});

describe("Lever users.get", () => {
  test("GETs /v1/users/{id}", async () => {
    const { impl } = stubFetch(JSON.stringify(userGetFixture));
    const result = await executeUsersGetSync({
      ...auth,
      id: "8d49b010-cc6a-4f40-ace5-e86061c677ed",
      fetch: impl,
    });
    expect(result.user?.id).toBe("lev-user:8d49b010-cc6a-4f40-ace5-e86061c677ed");
    expect(result.user?.email).toBe("stephen@example.com");
  });
});

describe("Lever requisitions.list", () => {
  test("GETs /v1/requisitions", async () => {
    const { impl } = stubFetch(JSON.stringify(requisitionsFixture));
    const result = await executeRequisitionsListSync({ ...auth, fetch: impl });
    expect(result.requisitions[0].id).toBe("lev-requisition:req-1");
    expect(result.requisitions[0].requisitionCode).toBe("ENG-12");
  });
});

describe("Lever feedback.get", () => {
  test("GETs /v1/opportunities/{id}/feedback/{feedbackId}", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(feedbackGetFixture));
    const result = await executeFeedbackGetSync({
      ...auth,
      opportunityId: "3410c8b9-5c31-4bab-b7e9-9f710206d647",
      feedbackId: "fb-1",
      fetch: impl,
    });
    expect(new URL(calls[0].url).pathname).toBe(
      "/v1/opportunities/3410c8b9-5c31-4bab-b7e9-9f710206d647/feedback/fb-1",
    );
    expect(result.feedback?.id).toBe("lev-feedback:fb-1");
    expect(result.feedback?.text).toBe("Hire");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 500 });
    await expect(
      executeFeedbackGetSync({
        ...auth,
        opportunityId: "3410c8b9-5c31-4bab-b7e9-9f710206d647",
        feedbackId: "fb-1",
        fetch: impl,
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
