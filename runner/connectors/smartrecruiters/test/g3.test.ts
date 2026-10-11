import { describe, expect, test } from "bun:test";
import {
  executeInterviewsCreate,
  executeInterviewsGet,
  executeInterviewsUpdate,
  executeInterviewsDelete,
  executeInterviewTypesList,
  executeMessagesShare,
  executeMessagesList,
  executeOffersList,
  executeOffersGet,
  executeOffersSearch,
  executeReviewsList,
  executeReviewsGet,
  executeScorecardsCriteriaList,
  executeUsersGet,
  executeUsersMe,
  buildInterviewInput,
} from "../src/g3";
import { candidateIdSegment, interviewIdSegment, jobIdSegment, userIdSegment } from "../src/ids";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import interviewCreated from "../fixtures/interview_created.json";
import interviewGet from "../fixtures/interview_get.json";
import interviewTypes from "../fixtures/interview_types.json";
import messageShared from "../fixtures/message_shared.json";
import messagesList from "../fixtures/messages_list.json";
import offersList from "../fixtures/offers_list.json";
import offerGet from "../fixtures/offer_get.json";
import offersSearch from "../fixtures/offers_search.json";
import reviewsList from "../fixtures/reviews_list.json";
import reviewGet from "../fixtures/review_get.json";
import scorecardCriteria from "../fixtures/scorecard_criteria.json";
import userGet from "../fixtures/user_get.json";
import userMe from "../fixtures/user_me.json";

const J = "86272861-2022-40fa-aa21-ba081f329133";
const C = "c9d8e7f6-a5b4-3210-9876-543210fedcba";
const I = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const U = "5f0c7e2ab1cd2e0001d63a9a";
const auth = { apiKey: "fixture-smart-token" };

type Reply = { body: unknown; status?: number; headers?: Record<string, string> };

function stub(replies: Reply[]) {
  const calls: Array<{ method: string; url: URL; headers: Headers; body: unknown }> = [];
  let i = 0;
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(input as string, init);
    const text = init?.body == null ? "" : String(init.body);
    calls.push({ method: req.method, url: new URL(req.url), headers: req.headers, body: text ? JSON.parse(text) : undefined });
    const r = replies[Math.min(i, replies.length - 1)]!;
    i += 1;
    const body = r.body === "" || r.body == null ? null : typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    return new Response(body, { status: r.status ?? 200, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

function expectCall(call: { method: string; url: URL; headers: Headers }, method: string, path: string) {
  expect(call.method).toBe(method);
  expect(call.url.hostname).toBe("api.smartrecruiters.com");
  expect(call.url.pathname).toBe(path);
  expect(call.headers.get("x-smarttoken")).toBe("fixture-smart-token");
}

const createInput = {
  candidateId: C,
  jobId: J,
  organizerId: U,
  timezone: "America/Los_Angeles",
  location: "https://zoom.us/j/555999888",
  timeslots: [
    {
      startsOn: "2026-10-10T17:00:00.000Z",
      endsOn: "2026-10-10T18:00:00.000Z",
      interviewType: "Technical",
      title: "Technical Screen",
      interviewers: [
        { id: U, status: "accepted" as const },
        { id: "5f0c7e2ab1cd2e0001d63a9b", status: "pending" as const },
      ],
    },
  ],
  refId: "ext-int-0412",
};

describe("SmartRecruiters G3 id prefix stripping", () => {
  test("shared helpers strip one leading prefix and reject unsafe segments", () => {
    expect(jobIdSegment(`sr-job:${J}`, "jobId")).toBe(J);
    expect(candidateIdSegment(`sr-candidate:${C}`, "id")).toBe(C);
    expect(interviewIdSegment(`sr-interview:${I}`, "interviewId")).toBe(I);
    expect(userIdSegment(`sr-user:${U}`, "id")).toBe(U);
    expect(jobIdSegment(J, "jobId")).toBe(J);
    expect(() => jobIdSegment("sr-job:../x", "jobId")).toThrow("letters, digits");
    expect(() => interviewIdSegment("sr-interview:sr-interview:x", "interviewId")).toThrow("letters, digits");
    expect(() => jobIdSegment("", "jobId")).toThrow("required");
  });
});

describe("SmartRecruiters G3 interviews CRUD", () => {
  test("interviews.create POSTs InterviewToCreate and returns raw id + normalized interview", async () => {
    const { calls, impl } = stub([{ body: interviewCreated, status: 201 }]);
    const out = await executeInterviewsCreate({ ...auth, ...createInput, fetch: impl });
    expectCall(calls[0]!, "POST", "/interviews-api/v201904/interviews");
    expect(calls[0]!.body).toEqual({
      candidate: { id: C },
      jobId: J,
      organizerId: U,
      timezone: "America/Los_Angeles",
      location: "https://zoom.us/j/555999888",
      timeslots: [
        {
          startsOn: "2026-10-10T17:00:00.000Z",
          endsOn: "2026-10-10T18:00:00.000Z",
          interviewType: "Technical",
          title: "Technical Screen",
          interviewers: [
            { id: U, status: "accepted" },
            { id: "5f0c7e2ab1cd2e0001d63a9b", status: "pending" },
          ],
        },
      ],
      refId: "ext-int-0412",
    });
    expect(out.id).toBe(`sr-interview:${I}`);
    expect(out.interview.id).toBe(`sr-interview:${I}`);
    expect(out.interview.candidateId).toBe(C);
    expect(out.interview.jobId).toBe(J);
    expect(out.interview.title).toBe("Technical Screen");
  });

  test("interviews.create accepts prefixed candidate/job ids and rejects empty timeslots", () => {
    const body = buildInterviewInput({
      ...auth,
      ...createInput,
      candidateId: `sr-candidate:${C}`,
      jobId: `sr-job:${J}`,
    });
    expect(body.candidate).toEqual({ id: C });
    expect(body.jobId).toBe(J);
    expect(() => buildInterviewInput({ ...auth, ...createInput, timeslots: [] })).toThrow("1-50");
  });

  test("interviews.get strips sr-interview: and normalizes", async () => {
    const { calls, impl } = stub([{ body: interviewGet }]);
    const out = await executeInterviewsGet({ ...auth, interviewId: `sr-interview:${I}`, fetch: impl });
    expectCall(calls[0]!, "GET", `/interviews-api/v201904/interviews/${I}`);
    expect(out.interview?.location).toBe("https://meet.example.com/room-41");
    expect(out.interview?.timezone).toBe("America/New_York");
  });

  test("interviews.update PATCHes location/timezone only", async () => {
    const { calls, impl } = stub([{ body: "", status: 204 }]);
    await executeInterviewsUpdate({
      ...auth,
      interviewId: I,
      location: "https://meet.example.com/room-41",
      timezone: "America/New_York",
      fetch: impl,
    });
    expectCall(calls[0]!, "PATCH", `/interviews-api/v201904/interviews/${I}`);
    expect(calls[0]!.body).toEqual({ location: "https://meet.example.com/room-41", timezone: "America/New_York" });
    await expect(executeInterviewsUpdate({ ...auth, interviewId: I, fetch: impl })).rejects.toThrow("location or timezone");
  });

  test("interviews.delete DELETEs and maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const ok = stub([{ body: "", status: 204 }]);
    await expect(executeInterviewsDelete({ ...auth, interviewId: I, fetch: ok.impl })).resolves.toEqual({ ok: true });
    expectCall(ok.calls[0]!, "DELETE", `/interviews-api/v201904/interviews/${I}`);

    const missing = stub([{ body: { errors: [{ code: "INTERVIEW_NOT_FOUND" }] }, status: 404 }]);
    await expect(executeInterviewsDelete({ ...auth, interviewId: I, fetch: missing.impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("interview_types.list returns the string array", async () => {
    const { calls, impl } = stub([{ body: interviewTypes }]);
    const out = await executeInterviewTypesList({ ...auth, fetch: impl });
    expectCall(calls[0]!, "GET", "/interviews-api/v201904/interview-types");
    expect(out).toEqual({ types: ["Technical", "Culture", "Hiring Manager", "Onsite Loop"], total: 4 });
  });
});

describe("SmartRecruiters G3 messages", () => {
  test("messages.share POSTs content and strips sr-job: on hiringTeamOf", async () => {
    const { calls, impl } = stub([{ body: messageShared, status: 201 }]);
    const out = await executeMessagesShare({
      ...auth,
      content: "Looping @[USER:5f0c7e2ab1cd2e0001d63a9a]",
      shareWith: { users: [U], hiringTeamOf: [`sr-job:${J}`], everyone: false },
      fetch: impl,
    });
    expectCall(calls[0]!, "POST", "/messages/shares");
    expect(calls[0]!.body).toEqual({
      content: "Looping @[USER:5f0c7e2ab1cd2e0001d63a9a]",
      shareWith: { users: [U], hiringTeamOf: [J], everyone: false },
    });
    expect(out).toEqual({ id: "msg-share-001", shareRequired: false });
  });

  test("messages.share rejects everyone+openNote", async () => {
    await expect(
      executeMessagesShare({ ...auth, content: "x", shareWith: { everyone: true, openNote: true }, fetch: stub([]).impl }),
    ).rejects.toThrow("mutually exclusive");
  });

  test("messages.list GETs with candidateId/jobId and maps MessageView rows", async () => {
    const { calls, impl } = stub([{ body: messagesList }]);
    const out = await executeMessagesList({
      ...auth,
      candidateId: `sr-candidate:${C}`,
      jobId: `sr-job:${J}`,
      limit: 10,
      fetch: impl,
    });
    expectCall(calls[0]!, "GET", "/messages");
    expect(calls[0]!.url.searchParams.get("candidateId")).toBe(C);
    expect(calls[0]!.url.searchParams.get("jobId")).toBe(J);
    expect(out.total).toBe(2);
    expect(out.messages[0]).toMatchObject({
      visibility: "DIRECT",
      authorId: "sr-user:5f0c7e2ab1cd2e0001d63a9b",
      applications: [{ candidateId: `sr-candidate:${C}`, jobId: `sr-job:${J}` }],
    });
  });
});

describe("SmartRecruiters G3 offers / reviews / scorecards / users", () => {
  test("offers.list / offers.get strip candidate and job prefixes", async () => {
    const list = stub([{ body: offersList }]);
    const listed = await executeOffersList({ ...auth, id: `sr-candidate:${C}`, jobId: `sr-job:${J}`, fetch: list.impl });
    expectCall(list.calls[0]!, "GET", `/candidates/${C}/jobs/${J}/offers`);
    expect(listed.total).toBe(1);
    expect(listed.offers[0]).toMatchObject({ id: "off-001-aaaa-bbbb-cccc-dddddddddddd", status: "PENDING_ACCEPTANCE" });
    expect(listed.offers[0]!.properties.baseSalary).toBe("185000");

    const get = stub([{ body: offerGet }]);
    const got = await executeOffersGet({
      ...auth,
      id: C,
      jobId: J,
      offerId: "off-001-aaaa-bbbb-cccc-dddddddddddd",
      fetch: get.impl,
    });
    expectCall(get.calls[0]!, "GET", `/candidates/${C}/jobs/${J}/offers/off-001-aaaa-bbbb-cccc-dddddddddddd`);
    expect(got.offer?.status).toBe("PENDING_ACCEPTANCE");
  });

  test("offers.search appends status filters (Admin/Extended)", async () => {
    const { calls, impl } = stub([{ body: offersSearch }]);
    const out = await executeOffersSearch({
      ...auth,
      limit: 10,
      offset: 0,
      status: ["PENDING_ACCEPTANCE", "ACCEPTED"],
      fetch: impl,
    });
    expectCall(calls[0]!, "GET", "/offers");
    expect(calls[0]!.url.searchParams.getAll("status")).toEqual(["PENDING_ACCEPTANCE", "ACCEPTED"]);
    expect(out.total).toBe(2);
  });

  test("reviews.list / reviews.get", async () => {
    const list = stub([{ body: reviewsList }]);
    const listed = await executeReviewsList({ ...auth, candidateId: C, jobId: J, fetch: list.impl });
    expectCall(list.calls[0]!, "GET", "/reviews-api/v201910/reviews");
    expect(callsParams(list.calls[0]!).candidateId).toBe(C);
    expect(listed.reviews[0]).toMatchObject({ id: "rev-001-aaaa-bbbb-cccc-dddddddddddd", overallRating: 4 });
    for (const r of listed.reviews) {
      expect(r.candidateId?.startsWith("sr-candidate:")).toBe(true);
      expect(r.jobId?.startsWith("sr-job:")).toBe(true);
      expect(r.reviewerId?.startsWith("sr-user:")).toBe(true);
    }

    const get = stub([{ body: reviewGet }]);
    const got = await executeReviewsGet({ ...auth, reviewId: "rev-001-aaaa-bbbb-cccc-dddddddddddd", fetch: get.impl });
    expectCall(get.calls[0]!, "GET", "/reviews-api/v201910/reviews/rev-001-aaaa-bbbb-cccc-dddddddddddd");
    expect(got.review?.comment).toBe("Strong fundamentals; hire.");
  });

  test("scorecards.criteria.list strips sr-job:", async () => {
    const { calls, impl } = stub([{ body: scorecardCriteria }]);
    const out = await executeScorecardsCriteriaList({ ...auth, jobId: `sr-job:${J}`, fetch: impl });
    expectCall(calls[0]!, "GET", `/reviews-api/v201910/jobs/${J}/criteria`);
    expect(out.total).toBe(2);
    expect(out.criteria[0]).toMatchObject({
      name: "System Design",
      assignedAll: false,
      questions: ["Walk through a cache design.", "How do you handle partition tolerance?"],
    });
  });

  test("users.get / users.me normalize via normalizeUser", async () => {
    const get = stub([{ body: userGet }]);
    const got = await executeUsersGet({ ...auth, id: U, fetch: get.impl });
    expectCall(get.calls[0]!, "GET", `/user-api/v201804/users/${U}`);
    expect(got.user).toMatchObject({
      id: `sr-user:${U}`,
      email: "recruiter.one@example.com",
      role: "ADMINISTRATOR",
      active: true,
    });

    const me = stub([{ body: userMe }]);
    const self = await executeUsersMe({ ...auth, fetch: me.impl });
    expectCall(me.calls[0]!, "GET", "/user-api/v201804/users/me");
    expect(self.user?.name).toBe("Recruiter One");
  });
});

function callsParams(call: { url: URL }) {
  return Object.fromEntries(call.url.searchParams.entries());
}

describe("SmartRecruiters G3 id consistency (raw vs prefixed)", () => {
  // [op, runner(rawOrPrefixed ids), reply, raw ids, prefixed ids]
  type Ids = { job: string; cand: string; intv: string; user: string };
  const RAW: Ids = { job: J, cand: C, intv: I, user: U };
  const PREF: Ids = { job: `sr-job:${J}`, cand: `sr-candidate:${C}`, intv: `sr-interview:${I}`, user: `sr-user:${U}` };
  type IdOp = [string, (ids: Ids, impl: typeof fetch) => Promise<unknown>, Reply];
  const slots = (user: string) => [{ startsOn: "2026-10-10T17:00:00.000Z", endsOn: "2026-10-10T18:00:00.000Z", interviewers: [{ id: user, status: "accepted" as const }] }];
  const OPS: IdOp[] = [
    ["interviews.create", (x, fetch) => executeInterviewsCreate({ ...auth, candidateId: x.cand, jobId: x.job, organizerId: x.user, timezone: "UTC", timeslots: slots(x.user), fetch }), { body: interviewCreated, status: 201 }],
    ["interviews.get", (x, fetch) => executeInterviewsGet({ ...auth, interviewId: x.intv, fetch }), { body: interviewGet }],
    ["interviews.update", (x, fetch) => executeInterviewsUpdate({ ...auth, interviewId: x.intv, timezone: "UTC", fetch }), { body: "", status: 204 }],
    ["interviews.delete", (x, fetch) => executeInterviewsDelete({ ...auth, interviewId: x.intv, fetch }), { body: "", status: 204 }],
    ["messages.share", (x, fetch) => executeMessagesShare({ ...auth, content: "n", shareWith: { users: [x.user], hiringTeamOf: [x.job] }, fetch }), { body: messageShared, status: 201 }],
    ["messages.list", (x, fetch) => executeMessagesList({ ...auth, candidateId: x.cand, jobId: x.job, fetch }), { body: messagesList }],
    ["offers.list", (x, fetch) => executeOffersList({ ...auth, id: x.cand, jobId: x.job, fetch }), { body: offersList }],
    ["offers.get", (x, fetch) => executeOffersGet({ ...auth, id: x.cand, jobId: x.job, offerId: "off-1", fetch }), { body: offerGet }],
    ["reviews.list", (x, fetch) => executeReviewsList({ ...auth, candidateId: x.cand, jobId: x.job, fetch }), { body: reviewsList }],
    ["scorecards.criteria.list", (x, fetch) => executeScorecardsCriteriaList({ ...auth, jobId: x.job, fetch }), { body: scorecardCriteria }],
    ["users.get", (x, fetch) => executeUsersGet({ ...auth, id: x.user, fetch }), { body: userGet }],
  ];

  for (const [name, runOp, reply] of OPS) {
    test(`${name}: raw and prefixed ids produce the identical request`, async () => {
      const raw = stub([reply]);
      await runOp(RAW, raw.impl);
      const pref = stub([reply]);
      await runOp(PREF, pref.impl);
      expect(raw.calls).toHaveLength(1);
      expect(pref.calls).toHaveLength(1);
      expect(pref.calls[0]!.method).toBe(raw.calls[0]!.method);
      expect(pref.calls[0]!.url.href).toBe(raw.calls[0]!.url.href);
      expect(pref.calls[0]!.body).toEqual(raw.calls[0]!.body);
      expect(raw.calls[0]!.url.href).not.toContain("sr-");
      expect(JSON.stringify(raw.calls[0]!.body ?? null)).not.toMatch(/sr-(job|candidate|user|interview):/);
    });
  }

  const BAD = ["", "   ", "../x", "a/b"];
  const badFor = (prefix: string, other: string) => [...BAD, prefix, `${prefix}../x`, `${prefix}${prefix}x`, `${other}x`];
  type BadCase = [string, string, (bad: string, impl: typeof fetch) => Promise<unknown>, Reply];
  const BAD_CASES: BadCase[] = [
    ["interviews.create candidateId", "sr-candidate:", (b, fetch) => executeInterviewsCreate({ ...auth, candidateId: b, jobId: J, organizerId: U, timezone: "UTC", timeslots: slots(U), fetch }), { body: interviewCreated, status: 201 }],
    ["interviews.create jobId", "sr-job:", (b, fetch) => executeInterviewsCreate({ ...auth, candidateId: C, jobId: b, organizerId: U, timezone: "UTC", timeslots: slots(U), fetch }), { body: interviewCreated, status: 201 }],
    ["interviews.create organizerId", "sr-user:", (b, fetch) => executeInterviewsCreate({ ...auth, candidateId: C, jobId: J, organizerId: b, timezone: "UTC", timeslots: slots(U), fetch }), { body: interviewCreated, status: 201 }],
    ["interviews.create interviewer id", "sr-user:", (b, fetch) => executeInterviewsCreate({ ...auth, candidateId: C, jobId: J, organizerId: U, timezone: "UTC", timeslots: slots(b), fetch }), { body: interviewCreated, status: 201 }],
    ["interviews.get", "sr-interview:", (b, fetch) => executeInterviewsGet({ ...auth, interviewId: b, fetch }), { body: interviewGet }],
    ["interviews.update", "sr-interview:", (b, fetch) => executeInterviewsUpdate({ ...auth, interviewId: b, timezone: "UTC", fetch }), { body: "", status: 204 }],
    ["interviews.delete", "sr-interview:", (b, fetch) => executeInterviewsDelete({ ...auth, interviewId: b, fetch }), { body: "", status: 204 }],
    ["messages.share users", "sr-user:", (b, fetch) => executeMessagesShare({ ...auth, content: "n", shareWith: { users: [b] }, fetch }), { body: messageShared, status: 201 }],
    ["messages.share hiringTeamOf", "sr-job:", (b, fetch) => executeMessagesShare({ ...auth, content: "n", shareWith: { hiringTeamOf: [b] }, fetch }), { body: messageShared, status: 201 }],
    ["messages.list candidateId", "sr-candidate:", (b, fetch) => executeMessagesList({ ...auth, candidateId: b, fetch }), { body: messagesList }],
    ["offers.list id", "sr-candidate:", (b, fetch) => executeOffersList({ ...auth, id: b, jobId: J, fetch }), { body: offersList }],
    ["offers.get jobId", "sr-job:", (b, fetch) => executeOffersGet({ ...auth, id: C, jobId: b, offerId: "off-1", fetch }), { body: offerGet }],
    ["reviews.list jobId", "sr-job:", (b, fetch) => executeReviewsList({ ...auth, candidateId: C, jobId: b, fetch }), { body: reviewsList }],
    ["scorecards.criteria.list", "sr-job:", (b, fetch) => executeScorecardsCriteriaList({ ...auth, jobId: b, fetch }), { body: scorecardCriteria }],
    ["users.get", "sr-user:", (b, fetch) => executeUsersGet({ ...auth, id: b, fetch }), { body: userGet }],
  ];
  for (const [name, prefix, runOp, reply] of BAD_CASES) {
    test(`${name}: unsafe or empty ids are rejected before any request`, async () => {
      const other = prefix === "sr-job:" ? "sr-user:" : "sr-job:";
      for (const bad of badFor(prefix, other)) {
        const s = stub([reply]);
        await expect(runOp(bad, s.impl)).rejects.toThrow(/required|letters, digits/);
        expect(s.calls).toHaveLength(0);
      }
    });

    test(`${name}: dot-segment ids (raw or ${prefix}) are rejected before any request`, async () => {
      for (const bad of [".", "..", "...", `${prefix}.`, `${prefix}..`]) {
        const s = stub([reply]);
        await expect(runOp(bad, s.impl)).rejects.toThrow("must not be a dot segment");
        expect(s.calls).toHaveLength(0);
      }
    });
  }

  test("offerId / reviewId reject dot segments", async () => {
    for (const bad of [".", ".."]) {
      const o = stub([{ body: offerGet }]);
      await expect(executeOffersGet({ ...auth, id: C, jobId: J, offerId: bad, fetch: o.impl })).rejects.toThrow("must not be a dot segment");
      expect(o.calls).toHaveLength(0);
      const r = stub([{ body: reviewGet }]);
      await expect(executeReviewsGet({ ...auth, reviewId: bad, fetch: r.impl })).rejects.toThrow("must not be a dot segment");
      expect(r.calls).toHaveLength(0);
    }
  });

  test("interviewIdSegment ends in the shared dot-segment check", () => {
    for (const bad of [".", "..", "sr-interview:.", "sr-interview:..", " sr-interview:.. "]) {
      expect(() => interviewIdSegment(bad, "interviewId")).toThrow("must not be a dot segment");
    }
    expect(interviewIdSegment("sr-interview:a.b", "interviewId")).toBe("a.b");
  });

  test("offerId / reviewId have no prefixed form and still reject unsafe ids", async () => {
    for (const bad of ["../x", "a/b", "sr-offer:x"]) {
      const o = stub([{ body: offerGet }]);
      await expect(executeOffersGet({ ...auth, id: C, jobId: J, offerId: bad, fetch: o.impl })).rejects.toThrow("letters, digits");
      expect(o.calls).toHaveLength(0);
      const r = stub([{ body: reviewGet }]);
      await expect(executeReviewsGet({ ...auth, reviewId: bad, fetch: r.impl })).rejects.toThrow("letters, digits");
      expect(r.calls).toHaveLength(0);
    }
  });
});

describe("SmartRecruiters G3 through the registry (effect policy)", () => {
  async function run(action: string, input: Record<string, unknown>) {
    const result = defaultConnectorRegistry.executeAction("smartrecruiters", action, input);
    expect(result.ok).toBe(true);
    return await (result as { ok: true; output: unknown }).output;
  }

  test("interviews.update reconciles via interviews.get on the same interviewId", async () => {
    const { calls, impl } = stub([{ body: "", status: 204 }, { body: interviewGet }]);
    const out = (await run("interviews.update", {
      ...auth,
      interviewId: I,
      location: "https://meet.example.com/room-41",
      timezone: "America/New_York",
      fetch: impl,
    })) as { interview: { location: string; timezone: string } };
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      `PATCH /interviews-api/v201904/interviews/${I}`,
      `GET /interviews-api/v201904/interviews/${I}`,
    ]);
    expect(out.interview.location).toBe("https://meet.example.com/room-41");
    expect(out.interview.timezone).toBe("America/New_York");
  });

  test("creates and deletes make exactly one call (no observe)", async () => {
    for (const [action, input, reply] of [
      ["interviews.create", { ...auth, ...createInput }, { body: interviewCreated, status: 201 }],
      ["messages.share", { ...auth, content: "hi" }, { body: messageShared, status: 201 }],
      ["interviews.delete", { ...auth, interviewId: I }, { body: "", status: 204 }],
    ] as Array<[string, Record<string, unknown>, Reply]>) {
      const s = stub([reply]);
      await run(action, { ...input, fetch: s.impl });
      expect({ action, calls: s.calls.length }).toEqual({ action, calls: 1 });
    }
  });
});
