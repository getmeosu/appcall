import { describe, expect, test } from "bun:test";
import { executeJobsSearch, executeJobsHiringTeamAdd } from "../src/g2";
import { executeInterviewsCreate, executeMessagesList, executeMessagesShare, executeReviewsList } from "../src/g3";
import { executeCandidatesListSync, executeJobsListSync, executeUsersListSync } from "../src/sync";
import { candidateIdValue, jobIdValue, userIdValue } from "../src/ids";
import { nextPageIdFromLink, nextPageIdOf } from "../src/paging";
import usersFixture from "../fixtures/users_list.json";
import jobsFixture from "../fixtures/jobs_list.json";
import candidatesFixture from "../fixtures/candidates_list.json";
import jobsSearchFixture from "../fixtures/jobs_search.json";
import memberAdded from "../fixtures/job_hiring_team_member_added.json";
import interviewCreated from "../fixtures/interview_created.json";
import messageShared from "../fixtures/message_shared.json";
import messagesList from "../fixtures/messages_list.json";
import reviewsList from "../fixtures/reviews_list.json";

// SR-ID-1: list outputs emit sr-user: / sr-job: / sr-candidate: ids. Every
// id-bearing query or body field accepts that form (or the raw id) and sends the
// raw id; invalid ids are rejected before any request.

const auth = { apiKey: "fixture-smart-token" };

type Call = { url: URL; body: any };
function stub(reply: { body: unknown; status?: number }) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(input as string, init);
    const text = init?.body == null ? "" : String(init.body);
    calls.push({ url: new URL(req.url), body: text ? JSON.parse(text) : undefined });
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, impl };
}
const respond = (body: unknown) => (async () => Response.json(body)) as unknown as typeof fetch;

/** Prefixed ids exactly as the list operations return them. */
async function listedIds() {
  const users = await executeUsersListSync({ ...auth, fetch: respond(usersFixture) } as any);
  const jobs = await executeJobsListSync({ company: "acme", fetch: respond(jobsFixture) } as any);
  const candidates = await executeCandidatesListSync({ ...auth, fetch: respond(candidatesFixture) } as any);
  const user = (users as any).users[0].id as string;
  const job = (jobs as any).jobs[0].id as string;
  const cand = (candidates as any).candidates[0].id as string;
  expect(user.startsWith("sr-user:")).toBe(true);
  expect(job.startsWith("sr-job:")).toBe(true);
  expect(cand.startsWith("sr-candidate:")).toBe(true);
  return { user, job, cand };
}
const raw = (id: string) => id.slice(id.indexOf(":") + 1);

type Kind = "user" | "job" | "cand";
type FieldCase = {
  name: string;
  kind: Kind;
  reply: { body: unknown; status?: number };
  run: (value: string, fetch: typeof globalThis.fetch) => Promise<unknown>;
  sent: (call: Call) => unknown;
};

const RAW_USER = "5f0c7e2ab1cd2e0001d63a9a";
const RAW_JOB = "744000153583401";
const RAW_CAND = "cand-001";
const ok = { user: RAW_USER, job: RAW_JOB, cand: RAW_CAND };
const slots = (user: string) => [{ startsOn: "2026-10-10T17:00:00.000Z", endsOn: "2026-10-10T18:00:00.000Z", interviewers: [{ id: user, status: "accepted" as const }] }];
const interview = (o: Partial<typeof ok> & { interviewer?: string }, fetch: typeof globalThis.fetch) =>
  executeInterviewsCreate({ ...auth, candidateId: o.cand ?? RAW_CAND, jobId: o.job ?? RAW_JOB, organizerId: o.user ?? RAW_USER, timezone: "UTC", timeslots: slots(o.interviewer ?? RAW_USER), fetch } as any);

const FIELDS: FieldCase[] = [
  { name: "jobs.search hiringTeamMemberId[] (query)", kind: "user", reply: { body: jobsSearchFixture },
    run: (v, fetch) => executeJobsSearch({ ...auth, hiringTeamMemberId: [v], fetch } as any),
    sent: (c) => c.url.searchParams.getAll("hiringTeamMemberId") },
  { name: "jobs.hiring_team.add userId (body)", kind: "user", reply: { body: memberAdded },
    run: (v, fetch) => executeJobsHiringTeamAdd({ ...auth, id: RAW_JOB, userId: v, role: "RECRUITER", fetch } as any),
    sent: (c) => c.body.id },
  { name: "candidates.list jobId (query)", kind: "job", reply: { body: candidatesFixture },
    run: (v, fetch) => executeCandidatesListSync({ ...auth, jobId: v, fetch } as any),
    sent: (c) => c.url.searchParams.get("jobId") },
  { name: "interviews.create candidateId (body)", kind: "cand", reply: { body: interviewCreated, status: 201 },
    run: (v, fetch) => interview({ cand: v }, fetch), sent: (c) => c.body.candidate.id },
  { name: "interviews.create jobId (body)", kind: "job", reply: { body: interviewCreated, status: 201 },
    run: (v, fetch) => interview({ job: v }, fetch), sent: (c) => c.body.jobId },
  { name: "interviews.create organizerId (body)", kind: "user", reply: { body: interviewCreated, status: 201 },
    run: (v, fetch) => interview({ user: v }, fetch), sent: (c) => c.body.organizerId },
  { name: "interviews.create timeslots[].interviewers[].id (body)", kind: "user", reply: { body: interviewCreated, status: 201 },
    run: (v, fetch) => interview({ interviewer: v }, fetch), sent: (c) => c.body.timeslots[0].interviewers[0].id },
  { name: "messages.share shareWith.users[] (body)", kind: "user", reply: { body: messageShared, status: 201 },
    run: (v, fetch) => executeMessagesShare({ ...auth, content: "n", shareWith: { users: [v] }, fetch } as any),
    sent: (c) => c.body.shareWith.users },
  { name: "messages.share shareWith.hiringTeamOf[] (body)", kind: "job", reply: { body: messageShared, status: 201 },
    run: (v, fetch) => executeMessagesShare({ ...auth, content: "n", shareWith: { hiringTeamOf: [v] }, fetch } as any),
    sent: (c) => c.body.shareWith.hiringTeamOf },
  { name: "messages.list candidateId (query)", kind: "cand", reply: { body: messagesList },
    run: (v, fetch) => executeMessagesList({ ...auth, candidateId: v, fetch } as any),
    sent: (c) => c.url.searchParams.get("candidateId") },
  { name: "messages.list jobId (query)", kind: "job", reply: { body: messagesList },
    run: (v, fetch) => executeMessagesList({ ...auth, candidateId: RAW_CAND, jobId: v, fetch } as any),
    sent: (c) => c.url.searchParams.get("jobId") },
  { name: "reviews.list candidateId (query)", kind: "cand", reply: { body: reviewsList },
    run: (v, fetch) => executeReviewsList({ ...auth, candidateId: v, jobId: RAW_JOB, fetch } as any),
    sent: (c) => c.url.searchParams.get("candidateId") },
  { name: "reviews.list jobId (query)", kind: "job", reply: { body: reviewsList },
    run: (v, fetch) => executeReviewsList({ ...auth, candidateId: RAW_CAND, jobId: v, fetch } as any),
    sent: (c) => c.url.searchParams.get("jobId") },
];

const asSent = (value: unknown) => (Array.isArray(value) ? value[0] : value);
const PREFIX: Record<Kind, string> = { user: "sr-user:", job: "sr-job:", cand: "sr-candidate:" };
const INVALID = (kind: Kind): Array<[string, string]> => [
  [PREFIX[kind], "is required"],
  ["  ", "is required"],
  [`${PREFIX[kind]}a b`, "letters, digits"],
  ["a:b", "letters, digits"],
  [`${PREFIX[kind]}..`, "must not be a dot segment"],
];

describe("SR-ID-1 id-bearing query/body fields", () => {
  for (const f of FIELDS) {
    test(`${f.name}: prefixed id from list output round-trips as the raw id`, async () => {
      const listed = (await listedIds())[f.kind];
      const s = stub(f.reply);
      await f.run(listed, s.impl);
      expect(s.calls).toHaveLength(1);
      expect(asSent(f.sent(s.calls[0]!))).toBe(raw(listed));
    });
    test(`${f.name}: raw id passes through unchanged`, async () => {
      const s = stub(f.reply);
      await f.run(ok[f.kind], s.impl);
      expect(asSent(f.sent(s.calls[0]!))).toBe(ok[f.kind]);
    });
    test(`${f.name}: invalid ids are rejected before any request`, async () => {
      for (const [bad, message] of INVALID(f.kind)) {
        const s = stub(f.reply);
        await expect(f.run(bad, s.impl)).rejects.toThrow(message);
        expect(s.calls).toHaveLength(0);
      }
    });
  }

  test("non-path helpers strip exactly one prefix of their own kind", () => {
    expect(userIdValue("sr-user:U1")).toBe("U1");
    expect(jobIdValue("sr-job:J1")).toBe("J1");
    expect(candidateIdValue("sr-candidate:C1")).toBe("C1");
    expect(() => userIdValue("sr-job:J1")).toThrow("letters, digits");
    expect(() => jobIdValue("sr-job:sr-job:J1")).toThrow("letters, digits");
    expect(() => userIdValue(42 as unknown as string)).toThrow("is required");
  });
});

describe("SR-ID-1 Link header parser (Codeant #631)", () => {
  const next = "</messages?pageId=P2&limit=10>";
  test("a quoted comma inside a parameter does not split the link-value", () => {
    expect(nextPageIdFromLink(`${next}; title="a, b"; rel="next"`)).toBe("P2");
    expect(nextPageIdFromLink(`</messages?pageId=P0>; rel="prev"; title="x, y, z", ${next}; rel="next"`)).toBe("P2");
  });
  test("quoted semicolons and escaped quotes stay inside the parameter", () => {
    expect(nextPageIdFromLink(`${next}; title="a; rel=\\"prev\\", b"; rel="next"`)).toBe("P2");
    expect(nextPageIdFromLink(`${next}; title="say \\"hi, there\\""; rel=next`)).toBe("P2");
  });
  test("a rel inside a quoted title is not mistaken for the link's rel", () => {
    expect(nextPageIdFromLink(`${next}; title="rel=next, really"; rel="prev"`)).toBeNull();
  });
  test("commas inside the URI reference are not separators", () => {
    expect(nextPageIdFromLink(`</messages?fields=a,b&pageId=P3>; rel="next"`)).toBe("P3");
  });
  test("existing forms keep working", () => {
    expect(nextPageIdFromLink(`${next}; rel="next"`)).toBe("P2");
    expect(nextPageIdFromLink(`${next}; rel=next`)).toBe("P2");
    expect(nextPageIdFromLink(`${next}; rel="prev next"`)).toBe("P2");
    expect(nextPageIdFromLink(`</messages?pageId=P0>; rel="prev"`)).toBeNull();
    expect(nextPageIdFromLink("")).toBeNull();
    expect(nextPageIdFromLink(null)).toBeNull();
    expect(nextPageIdOf({ nextPageId: "B1" }, `${next}; title="a, b"; rel="next"`)).toBe("B1");
    expect(nextPageIdOf({}, `${next}; title="a, b"; rel="next"`)).toBe("P2");
  });
});
