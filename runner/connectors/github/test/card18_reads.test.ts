import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import commentsFixture from "../fixtures/pr_review_comments_list.json";
import { listRepoPullComments } from "../src/actions";
import { validateListRepoPullCommentsInput } from "../src/card18_reads";

const OP = "repos.pulls.comments.list";
const PATH = "/repos/{owner}/{repo}/pulls/comments";

describe("github card-18 reads", () => {
  test("manifest stays v0.56.0 at 582 ops and this read omits effect policy", () => {
    expect(manifest.version).toBe("0.56.0");
    expect(Object.keys(manifest.operations).length).toBe(582);
    const op = manifest.operations[OP] as Record<string, unknown>;
    expect(op.kind).toBe("action");
    expect(op.sideEffect).toBe("read");
    expect(op.effectPolicy).toBeUndefined();
    expect(op.reconcile).toBeUndefined();
    expect(op.description).toContain(`via GET ${PATH}.`);
    expect(op.description).toContain("Not GET /repos/{owner}/{repo}/pulls/{pull_number}/comments.");
    expect(op.description).toContain("Not GET /repos/{owner}/{repo}/pulls/comments/{comment_id}.");
    expect(manifest.operations["pull_requests.review_comments.list"]).toBeDefined();
    expect(manifest.operations["pull_requests.comments.list"]).toBeDefined();
    expect(manifest.operations["pull_requests.reviews.comments.list"]).toBeDefined();
  });

  test("validates owner, repo, documented sort, and pagination", () => {
    expect(validateListRepoPullCommentsInput({
      owner: "octocat",
      repo: "Hello-World",
      sort: "updated",
      direction: "desc",
      since: "2026-01-01T00:00:00Z",
      perPage: 30,
      page: 2,
    })).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      sort: "updated",
      direction: "desc",
      since: "2026-01-01T00:00:00Z",
      perPage: 30,
      page: 2,
    });
    expect(validateListRepoPullCommentsInput({ owner: "octocat", repo: "Hello-World", pullNumber: 4 })).toEqual({
      owner: "octocat",
      repo: "Hello-World",
    });
    expect(() => validateListRepoPullCommentsInput({ owner: "octo/cat", repo: "Hello-World" })).toThrow(/owner/);
    expect(() => validateListRepoPullCommentsInput({ owner: "octocat", repo: "Hello-World", perPage: 101 })).toThrow(/perPage/);
    expect(() => validateListRepoPullCommentsInput({ owner: "octocat", repo: "Hello-World", sort: "popularity" })).toThrow(/sort/);
    expect(() => validateListRepoPullCommentsInput({ owner: "octocat", repo: "Hello-World", direction: "sideways" })).toThrow(/direction/);
    expect(() => validateListRepoPullCommentsInput({ owner: "octocat", repo: "Hello-World", since: "2026-01-01\n" })).toThrow(/since/);
  });

  test("lists repository review comments, not a pull or a single comment", async () => {
    const listed = await listRepoPullComments({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      sort: "updated",
      direction: "desc",
      since: "2026-01-01T00:00:00Z",
      perPage: 30,
      page: 2,
      pullNumber: 15,
      commentId: 10,
      fetch: async (input, init) => {
        const url = String(input);
        expect(url).toBe("https://api.github.com/repos/octo%20cat/Hello%20World/pulls/comments?sort=updated&direction=desc&since=2026-01-01T00%3A00%3A00Z&per_page=30&page=2");
        expect(url).not.toMatch(/\/pulls\/\d+\/comments/);
        expect(url).not.toMatch(/\/pulls\/comments\/[^?]/);
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer t");
        expect(init?.method ?? "GET").toBe("GET");
        return new Response(JSON.stringify(commentsFixture), { status: 200 });
      },
    });
    expect(listed.action).toBe(OP);
    expect((listed.comments as { id: number; author: string; path: string }[])[0]).toMatchObject({
      id: 10,
      author: "octocat",
      path: "src/index.ts",
    });
  });

  test("maps 429 and keeps 404 and 204 as CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listRepoPullComments({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "9" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });

    await expect(listRepoPullComments({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    await expect(listRepoPullComments({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      fetch: async () => new Response(null, { status: 204 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation-only path does not fetch", () => {
    const result = listRepoPullComments({ owner: "octocat", repo: "Hello-World" });
    expect(result.action).toBe(OP);
    expect(result.validated).toEqual({ owner: "octocat", repo: "Hello-World" });
  });
});
