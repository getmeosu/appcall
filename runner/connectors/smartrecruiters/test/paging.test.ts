import { describe, expect, test } from "bun:test";
import { executeJobsSearch } from "../src/g2";
import { executeMessagesList } from "../src/g3";
import { executeCandidatesListSync, executeUsersListSync } from "../src/sync";
import { nextPageIdFromLink, nextPageIdOf, pageIdParam } from "../src/paging";
import jobsSearch from "../fixtures/jobs_search.json";
import messagesList from "../fixtures/messages_list.json";
import candidatesList from "../fixtures/candidates_list.json";
import usersList from "../fixtures/users_list.json";

const auth = { apiKey: "fixture-smart-token" };
const C = "c9d8e7f6-a5b4-3210-9876-543210fedcba";
const J = "86272861-2022-40fa-aa21-ba081f329133";

type Reply = { body: unknown; status?: number; headers?: Record<string, string> };

function stub(reply: Reply) {
  const calls: Array<{ method: string; url: URL }> = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(input as string, init);
    calls.push({ method: req.method, url: new URL(req.url) });
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json", ...(reply.headers ?? {}) },
    });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

function without<T extends Record<string, unknown>>(body: T, key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...body };
  delete copy[key];
  return copy;
}

const BAD_PAGE_IDS = ["", "has space", "tab\tchar", "x".repeat(2049)];

describe("paging helpers", () => {
  test("nextPageIdFromLink reads rel=next pageId only", () => {
    expect(nextPageIdFromLink('<https://api.smartrecruiters.com/messages?candidateId=c&pageId=abc%3D%3D>; rel="next"')).toBe("abc==");
    expect(nextPageIdFromLink('</messages?pageId=p0>; rel="prev", </messages?pageId=p2&limit=10>; rel="next"')).toBe("p2");
    expect(nextPageIdFromLink("</messages?pageId=p2>; rel=next")).toBe("p2");
    expect(nextPageIdFromLink('</messages?pageId=p0>; rel="prev"')).toBeNull();
    expect(nextPageIdFromLink('</messages?limit=10>; rel="next"')).toBeNull();
    expect(nextPageIdFromLink("")).toBeNull();
    expect(nextPageIdFromLink(null)).toBeNull();
  });

  test("nextPageIdOf prefers a non-empty body nextPageId, then the Link header", () => {
    expect(nextPageIdOf({ nextPageId: "body" }, '</x?pageId=link>; rel="next"')).toBe("body");
    expect(nextPageIdOf({ nextPageId: "" }, '</x?pageId=link>; rel="next"')).toBe("link");
    expect(nextPageIdOf([], '</x?pageId=link>; rel="next"')).toBe("link");
    expect(nextPageIdOf({}, null)).toBeNull();
  });

  test("pageIdParam validates a safe opaque query value", () => {
    expect(pageIdParam(undefined)).toBeUndefined();
    expect(pageIdParam(null)).toBeUndefined();
    expect(pageIdParam("MTAwOjVm+/==")).toBe("MTAwOjVm+/==");
    expect(pageIdParam("", "pageId", { emptyAsAbsent: true })).toBeUndefined();
    for (const bad of BAD_PAGE_IDS) expect(() => pageIdParam(bad)).toThrow("pageId");
    expect(() => pageIdParam(5)).toThrow("pageId");
  });
});

describe("jobs.search paging (body nextPageId + Link, jobsall-1)", () => {
  test("surfaces the body nextPageId", async () => {
    const s = stub({ body: jobsSearch });
    const out = await executeJobsSearch({ ...auth, fetch: s.impl });
    expect(out.nextPageId).toBe("NWQ1ZTliMWE4YzFiMmEwMDAxZjNjMmQx");
  });

  test("falls back to the Link rel=next pageId when the body has none", async () => {
    const s = stub({
      body: without(jobsSearch, "nextPageId"),
      headers: { link: '<https://api.smartrecruiters.com/jobs?sort=job_id&pageId=bGluaw%3D%3D>; rel="next"' },
    });
    expect((await executeJobsSearch({ ...auth, fetch: s.impl })).nextPageId).toBe("bGluaw==");
  });

  test("null on the last page", async () => {
    const s = stub({ body: without(jobsSearch, "nextPageId") });
    expect((await executeJobsSearch({ ...auth, fetch: s.impl })).nextPageId).toBeNull();
  });

  test("passes pageId through (with the required sort=job_id) and validates it before any request", async () => {
    const s = stub({ body: jobsSearch });
    await executeJobsSearch({ ...auth, pageId: "NWQ1ZTli+/==", fetch: s.impl });
    expect(s.calls[0]!.url.searchParams.get("pageId")).toBe("NWQ1ZTli+/==");
    expect(s.calls[0]!.url.searchParams.get("sort")).toBe("job_id");
    for (const bad of BAD_PAGE_IDS) {
      const b = stub({ body: jobsSearch });
      await expect(executeJobsSearch({ ...auth, pageId: bad, fetch: b.impl })).rejects.toThrow("pageId");
      expect(b.calls).toHaveLength(0);
    }
  });

  test("calls without pageId send the same request as before", async () => {
    const s = stub({ body: jobsSearch });
    await executeJobsSearch({ ...auth, q: "engineer", limit: 10, fetch: s.impl });
    expect(s.calls[0]!.method).toBe("GET");
    expect(s.calls[0]!.url.pathname).toBe("/jobs");
    expect([...s.calls[0]!.url.searchParams]).toEqual([
      ["q", "engineer"],
      ["limit", "10"],
    ]);
    const bare = stub({ body: jobsSearch });
    await executeJobsSearch({ ...auth, fetch: bare.impl });
    expect(bare.calls[0]!.url.search).toBe("");
  });
});

describe("messages.list paging (Link header only, messagesfetch-1)", () => {
  test("surfaces the Link rel=next pageId", async () => {
    const s = stub({
      body: messagesList,
      headers: { link: `<https://api.smartrecruiters.com/messages?candidateId=${C}&pageId=bXNnLTI%3D>; rel="next"` },
    });
    const out = await executeMessagesList({ ...auth, candidateId: C, fetch: s.impl });
    expect(out.nextPageId).toBe("bXNnLTI=");
    expect(out.total).toBe(out.messages.length);
  });

  test("null when there is no Link header", async () => {
    const s = stub({ body: messagesList });
    expect((await executeMessagesList({ ...auth, candidateId: C, fetch: s.impl })).nextPageId).toBeNull();
  });

  test("passes pageId through and validates it before any request", async () => {
    const s = stub({ body: messagesList });
    await executeMessagesList({ ...auth, candidateId: C, pageId: "bXNnLTI=", fetch: s.impl });
    expect(s.calls[0]!.url.searchParams.get("pageId")).toBe("bXNnLTI=");
    for (const bad of BAD_PAGE_IDS) {
      const b = stub({ body: messagesList });
      await expect(executeMessagesList({ ...auth, candidateId: C, pageId: bad, fetch: b.impl })).rejects.toThrow("pageId");
      expect(b.calls).toHaveLength(0);
    }
  });

  test("calls without pageId send the same request as before", async () => {
    const s = stub({ body: messagesList });
    await executeMessagesList({ ...auth, candidateId: C, jobId: J, limit: 5, fetch: s.impl });
    expect(s.calls[0]!.method).toBe("GET");
    expect(s.calls[0]!.url.pathname).toBe("/messages");
    expect([...s.calls[0]!.url.searchParams]).toEqual([
      ["candidateId", C],
      ["jobId", J],
      ["limit", "5"],
    ]);
  });
});

describe("candidates.list / users.list paging (body nextPageId, candidatesall-1 / usersall-2)", () => {
  const cases = [
    {
      name: "candidates.list",
      path: "/candidates",
      body: candidatesList as Record<string, unknown>,
      next: "next-page-token-abc",
      run: (input: Record<string, unknown>) => executeCandidatesListSync({ ...auth, ...input } as Parameters<typeof executeCandidatesListSync>[0]),
    },
    {
      name: "users.list",
      path: "/user-api/v201804/users",
      body: usersList as Record<string, unknown>,
      next: "MTAwOjVmMGM3ZTJhYjFjZDJlMDAwMWQ2M2E5Yg==",
      run: (input: Record<string, unknown>) => executeUsersListSync({ ...auth, ...input } as Parameters<typeof executeUsersListSync>[0]),
    },
  ];

  for (const c of cases) {
    test(`${c.name}: body nextPageId surfaced, null on the last page`, async () => {
      const s = stub({ body: c.body });
      expect((await c.run({ fetch: s.impl })).nextPageId).toBe(c.next);
      const last = stub({ body: without(c.body, "nextPageId") });
      expect((await c.run({ fetch: last.impl })).nextPageId).toBeNull();
    });

    test(`${c.name}: pageId passed through and validated; empty pageId still dropped`, async () => {
      const s = stub({ body: c.body });
      await c.run({ pageId: c.next, limit: 10, fetch: s.impl });
      expect(s.calls[0]!.url.searchParams.get("pageId")).toBe(c.next);
      for (const bad of BAD_PAGE_IDS.slice(1)) {
        const b = stub({ body: c.body });
        await expect(c.run({ pageId: bad, fetch: b.impl })).rejects.toThrow("pageId");
        expect(b.calls).toHaveLength(0);
      }
      const empty = stub({ body: c.body });
      await c.run({ pageId: "", limit: 10, fetch: empty.impl });
      expect(empty.calls[0]!.url.searchParams.has("pageId")).toBe(false);
    });

    test(`${c.name}: calls without pageId send the same request as before`, async () => {
      const s = stub({ body: c.body });
      await c.run({ limit: 10, q: "ada", fetch: s.impl });
      expect(s.calls[0]!.method).toBe("GET");
      expect(s.calls[0]!.url.pathname).toBe(c.path);
      expect([...s.calls[0]!.url.searchParams]).toEqual([
        ["limit", "10"],
        ["q", "ada"],
      ]);
    });
  }
});
