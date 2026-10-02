import { describe, expect, test } from "bun:test";
import commentsFixture from "../fixtures/pr_conversation_comments.json";
import repoFixture from "../fixtures/repo_update.json";
import commitCommentFixture from "../fixtures/commit_comment.json";
import {
  listPullRequestComments,
  updateRepo,
  deleteBranch,
  createCommitComment,
  getRepo,
  getBranch,
  getCommit,
} from "../src/actions";
import { normalizeConversationComment } from "../src/pull_requests";
import { normalizeCommitComment } from "../src/commits";
import { validateUpdateRepoInput, validateGetRepoInput } from "../src/repos";
import { validateDeleteBranchInput } from "../src/branches";
import { validateCreateCommitCommentInput } from "../src/commits";

const SHA = "abc123def456abc123def456abc123def456abc1";

describe("github S11 agent polish", () => {
  test("normalizes conversation and commit comments", () => {
    const conversation = normalizeConversationComment(commentsFixture[0] as Record<string, unknown>);
    expect(conversation.id).toBe("gh-pr-comment:10");
    expect(conversation.author).toBe("octocat");
    const commitComment = normalizeCommitComment(commitCommentFixture as Record<string, unknown>);
    expect(commitComment.id).toBe("gh-commit-comment:42");
    expect(commitComment.path).toBe("src/main.ts");
    expect(commitComment.sha).toBe(SHA);
  });

  test("validates S11 inputs", () => {
    expect(validateUpdateRepoInput({ owner: "acme", repo: "app", description: "x" }).description).toBe("x");
    expect(() => validateUpdateRepoInput({ owner: "acme", repo: "app" })).toThrow("at least one repository field");
    expect(() => validateUpdateRepoInput({ owner: "acme", repo: "app", visibility: "secret" })).toThrow("visibility");
    expect(validateGetRepoInput({ owner: "acme", repo: "app", name: "app-renamed" }).repo).toBe("app-renamed");
    expect(validateGetRepoInput({ owner: "acme", repo: "app" }).repo).toBe("app");
    expect(validateDeleteBranchInput({ owner: "acme", repo: "app", branch: "feature/x" }).branch).toBe("feature/x");
    expect(validateCreateCommitCommentInput({ owner: "acme", repo: "app", sha: SHA, body: "hi", side: "RIGHT" }).side).toBe("RIGHT");
    expect(() => validateCreateCommitCommentInput({ owner: "acme", repo: "app", sha: SHA, body: "hi", side: "MIDDLE" })).toThrow("side");
  });

  test("lists pull request conversation comments", async () => {
    const calls: string[] = [];
    const result = await listPullRequestComments({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 7,
      perPage: 10,
      fetch: async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        calls.push(url);
        return new Response(JSON.stringify(commentsFixture), { status: 200 });
      },
    });
    expect(calls[0]).toContain("/repos/acme/app/issues/7/comments");
    expect(calls[0]).toContain("per_page=10");
    expect(result.action).toBe("pull_requests.comments.list");
    expect((result.comments as { author: string }[])[0].author).toBe("octocat");
  });

  test("updates a repository and observes the renamed name", async () => {
    const calls: { url: string; method: string; body: string }[] = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, method: init?.method ?? "GET", body: String(init?.body ?? "") });
      return new Response(JSON.stringify(repoFixture), { status: 200 });
    };
    const updated = await updateRepo({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      name: "app-renamed",
      description: "Updated description",
      fetch: fetchImpl,
    });
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toContain("/repos/acme/app");
    expect(JSON.parse(calls[0].body).name).toBe("app-renamed");
    expect((updated.repo as { name: string }).name).toBe("app-renamed");
    calls.length = 0;
    const observed = await getRepo({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      name: "app-renamed",
      fetch: fetchImpl,
    });
    expect(calls[0].url).toContain("/repos/acme/app-renamed");
    expect((observed.repo as { fullName: string }).fullName).toBe("acme/app-renamed");
  });

  test("deletes a branch and soft-observes absence", async () => {
    const calls: { url: string; method: string }[] = [];
    const deleted = await deleteBranch({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      branch: "feature/gone",
      fetch: async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        calls.push({ url, method: init?.method ?? "GET" });
        return new Response(null, { status: 204 });
      },
    });
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toContain("/git/refs/heads/feature/gone");
    expect(deleted.deleted).toBe(true);
    const missing = await getBranch({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      branch: "feature/gone",
      fetch: async () => new Response(JSON.stringify({ message: "Branch not found" }), { status: 404 }),
    });
    expect(missing.found).toBe(false);
    await expect(getBranch({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "missing",
      branch: "feature/gone",
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("creates a commit comment and observes via commits.get", async () => {
    const calls: { url: string; method: string; body: string }[] = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: String(init?.body ?? "") });
      if (method === "POST") return new Response(JSON.stringify(commitCommentFixture), { status: 201 });
      return new Response(JSON.stringify(commitCommentsFixture), { status: 200 });
    };
    const created = await createCommitComment({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      sha: SHA,
      body: "nit: rename this",
      path: "src/main.ts",
      line: 12,
      side: "RIGHT",
      fetch: fetchImpl,
    });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain(`/commits/${SHA}/comments`);
    expect(JSON.parse(calls[0].body).side).toBe("RIGHT");
    expect((created.comment as { id: string }).id).toBe("gh-commit-comment:42");
    const observed = await getCommit({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      sha: SHA,
      body: "nit: rename this",
      fetch: async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (!url.includes("/commits/" + SHA)) throw new Error(url);
        return new Response(JSON.stringify({
          sha: SHA,
          commit: { message: "ship", author: { name: "octocat", email: "octo@github.com", date: "2026-05-16T12:00:00Z" }, committer: { name: "octocat", email: "octo@github.com", date: "2026-05-16T12:00:00Z" } },
          html_url: "https://github.com/acme/app/commit/" + SHA,
        }), { status: 200 });
      },
    });
    expect(observed.action).toBe("commits.get");
    expect((observed.commit as { sha: string }).sha).toBe(SHA);
  });

  test("maps upstream failures", async () => {
    await expect(updateRepo({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "missing",
      description: "x",
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(deleteBranch({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      branch: "main",
      fetch: async () => new Response(JSON.stringify({ message: "protected" }), { status: 422 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(createCommitComment({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      sha: SHA,
      body: "hi",
      fetch: async () => new Response(JSON.stringify({ message: "invalid" }), { status: 422 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
