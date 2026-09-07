import { describe, expect, test } from "bun:test";
import prsListFixture from "../fixtures/pull_requests_list.json";
import createPrFixture from "../fixtures/create_pr.json";
import {
  normalizeGitHubPullRequest,
  parsePullRequestsResponse,
  validateCreatePullRequestInput,
  validateMergePullRequestInput,
  createPullRequestsClient,
} from "../src/pull_requests";
import { createGitHubClient } from "../src/http";

describe("github pull requests", () => {
  test("normalizes open PR from fixture", () => {
    const pr = normalizeGitHubPullRequest(prsListFixture[0]);

    expect(pr.id).toBe("gh-pr:987654321");
    expect(pr.provider).toBe("github");
    expect(pr.providerPullRequestId).toBe(987654321);
    expect(pr.number).toBe(15);
    expect(pr.title).toBe("Feature: add dark mode support");
    expect(pr.state).toBe("open");
    expect(pr.isOpen).toBe(true);
    expect(pr.isDraft).toBe(false);
    expect(pr.isMerged).toBe(false);
    expect(pr.headBranch).toBe("feature/dark-mode");
    expect(pr.baseBranch).toBe("main");
    expect(pr.headRepo).toBe("alice/app");
    expect(pr.baseRepo).toBe("acme/app");
    expect(pr.author).toBe("alice");
    expect(pr.modelVersion).toBe("2026-05-16");
  });

  test("normalizes draft PR", () => {
    const pr = normalizeGitHubPullRequest(prsListFixture[1]);

    expect(pr.isDraft).toBe(true);
    expect(pr.headBranch).toBe("refactor/db-layer");
  });

  test("normalizes merged PR", () => {
    const pr = normalizeGitHubPullRequest(prsListFixture[2]);

    expect(pr.state).toBe("closed");
    expect(pr.isMerged).toBe(true);
    expect(pr.mergedAt).toBe("2026-05-12T16:00:00Z");
  });

  test("normalizes PR with minimal fields", () => {
    const pr = normalizeGitHubPullRequest({ id: 1, number: 1, title: "Minimal" });

    expect(pr.id).toBe("gh-pr:1");
    expect(pr.isDraft).toBe(false);
    expect(pr.isMerged).toBe(false);
    expect(pr.headBranch).toBe("");
  });

  test("parses PRs list response", () => {
    const parsed = parsePullRequestsResponse(prsListFixture);

    expect(parsed.pullRequests).toHaveLength(3);
    expect(parsed.pullRequests[0].id).toBe(987654321);
    expect(parsed.pullRequests[1].draft).toBe(true);
  });

  test("parses empty PRs list response", () => {
    const parsed = parsePullRequestsResponse([]);

    expect(parsed.pullRequests).toHaveLength(0);
    expect(parsed.nextLink).toBeNull();
  });

  test("handles non-object response gracefully", () => {
    expect(parsePullRequestsResponse(null)).toEqual({ pullRequests: [], nextLink: null });
    expect(parsePullRequestsResponse("string")).toEqual({ pullRequests: [], nextLink: null });
  });

  test("validates create PR input", () => {
    expect(validateCreatePullRequestInput({ owner: "acme", repo: "app", title: "New PR", head: "feature", base: "main" })).toEqual({
      owner: "acme",
      repo: "app",
      title: "New PR",
      head: "feature",
      base: "main",
    });
  });

  test("validates create PR with optional fields", () => {
    const result = validateCreatePullRequestInput({
      owner: "acme", repo: "app", title: "Draft PR",
      head: "wip", base: "main", body: "WIP", draft: true,
    });
    expect(result.draft).toBe(true);
    expect(result.body).toBe("WIP");
  });

  test("rejects invalid create PR input", () => {
    expect(() => validateCreatePullRequestInput("not object")).toThrow();
    expect(() => validateCreatePullRequestInput({ owner: "", repo: "app", title: "PR", head: "f", base: "m" })).toThrow();
    expect(() => validateCreatePullRequestInput({ owner: "acme", repo: "app", title: "", head: "f", base: "m" })).toThrow();
  });

  test("validates merge PR input", () => {
    expect(validateMergePullRequestInput({ owner: "acme", repo: "app", pullNumber: 15 })).toEqual({
      owner: "acme",
      repo: "app",
      pullNumber: 15,
      mergeMethod: "merge",
    });
  });

  test("validates merge PR with custom method", () => {
    const result = validateMergePullRequestInput({
      owner: "acme", repo: "app", pullNumber: 15, mergeMethod: "squash",
    });
    expect(result.mergeMethod).toBe("squash");
  });

  test("rejects invalid merge PR input", () => {
    expect(() => validateMergePullRequestInput("not object")).toThrow();
    expect(() => validateMergePullRequestInput({ owner: "acme", repo: "app", pullNumber: "abc" })).toThrow();
  });

  test("create PR posts to GitHub API", async () => {
    const requests: Request[] = [];
    const client = createPullRequestsClient({
      accessToken: "ghp_test-token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(JSON.stringify(createPrFixture), { status: 201 });
      },
    });

    const result = await client.create({ owner: "acme", repo: "app", title: "New PR", head: "feature", base: "main" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("https://api.github.com/repos/acme/app/pulls");
    expect(requests[0].method).toBe("POST");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pullRequest.number).toBe(20);
    }
  });

  test("merge PR sends PUT and returns success", async () => {
    const requests: Request[] = [];
    const client = createPullRequestsClient({
      accessToken: "ghp_test-token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(JSON.stringify({ merged: true, message: "Pull Request successfully merged" }), { status: 200 });
      },
      githubClient: createGitHubClient({ accessToken: "ghp_test-token", fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(JSON.stringify({ merged: true, message: "Pull Request successfully merged" }), { status: 200 });
      }, operation: "pull_requests.merge" }),
    });

    const result = await client.merge({ owner: "acme", repo: "app", pullNumber: 15 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.merged).toBe(true);
    }
  });

  test("merge PR handles not mergeable (405)", async () => {
    const client = createPullRequestsClient({
      accessToken: "ghp_test-token",
      fetch: async () => new Response(JSON.stringify({ message: "Pull Request is not mergeable" }), { status: 405 }),
      githubClient: createGitHubClient({ accessToken: "ghp_test-token", fetch: async () => new Response(JSON.stringify({}), { status: 405 }), operation: "pull_requests.merge" }),
    });

    const result = await client.merge({ owner: "acme", repo: "app", pullNumber: 15 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
      expect(result.error.message).toContain("not mergeable");
    }
  });

  test("merge PR handles conflict (409)", async () => {
    const client = createPullRequestsClient({
      accessToken: "ghp_test-token",
      fetch: async () => new Response(JSON.stringify({ message: "Merge conflict" }), { status: 409 }),
      githubClient: createGitHubClient({ accessToken: "ghp_test-token", fetch: async () => new Response(JSON.stringify({}), { status: 409 }), operation: "pull_requests.merge" }),
    });

    const result = await client.merge({ owner: "acme", repo: "app", pullNumber: 15 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("conflict");
    }
  });
});
