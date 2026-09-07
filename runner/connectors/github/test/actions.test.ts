import { describe, expect, test } from "bun:test";
import createIssueFixture from "../fixtures/create_issue.json";
import createPrFixture from "../fixtures/create_pr.json";
import {
  createIssue,
  createIssueComment,
  createPullRequest,
  mergePullRequest,
} from "../src/actions";

describe("github connector actions", () => {
  test("createIssue validates input and marks connector-owned output", () => {
    const result = createIssue({ owner: "acme", repo: "app", title: "Bug", body: "desc" });

    expect(result.source).toBe("connector");
    expect(result.connector).toBe("github");
    expect(result.action).toBe("issues.create");
    expect(result.validated).toEqual({ owner: "acme", repo: "app", title: "Bug", body: "desc" });
  });

  test("createIssue posts to GitHub API with connector-owned raw HTTP", async () => {
    const requests: Request[] = [];
    const result = await createIssue({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      title: "New feature",
      body: "desc",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(JSON.stringify(createIssueFixture), { status: 201 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("https://api.github.com/repos/acme/app/issues");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ghp_test-token");
    expect(result).toEqual({
      connector: "github",
      action: "issues.create",
      source: "connector",
      issue: expect.any(Object),
    });
  });

  test("createIssue maps GitHub 429 to rate limit error", async () => {
    await expect(createIssue({
      accessToken: "ghp_test-token",
      owner: "acme", repo: "app", title: "Test", body: "body",
      fetch: async () => new Response(JSON.stringify({ message: "rate limited" }), {
        status: 429,
        headers: { "Retry-After": "45" },
      }),
    })).rejects.toEqual({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "GitHub rate limit exceeded.",
      retryAfterSeconds: 45,
    });
  });

  test("createIssueComment validates input", () => {
    const result = createIssueComment({ owner: "acme", repo: "app", issueNumber: 42, body: "comment" });

    expect(result.source).toBe("connector");
    expect(result.action).toBe("issues.comments.create");
    expect(result.validated.issueNumber).toBe(42);
  });

  test("createPullRequest validates input", () => {
    const result = createPullRequest({ owner: "acme", repo: "app", title: "PR", head: "f", base: "main" });

    expect(result.source).toBe("connector");
    expect(result.action).toBe("pull_requests.create");
    expect(result.validated).toEqual({ owner: "acme", repo: "app", title: "PR", head: "f", base: "main" });
  });

  test("createPullRequest posts to GitHub API", async () => {
    const requests: Request[] = [];
    const result = await createPullRequest({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      title: "New PR",
      head: "feature",
      base: "main",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(JSON.stringify(createPrFixture), { status: 201 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("https://api.github.com/repos/acme/app/pulls");
    expect(result.connector).toBe("github");
    expect(result.action).toBe("pull_requests.create");
    expect(result.pullRequest).toBeDefined();
  });

  test("mergePullRequest validates input", () => {
    const result = mergePullRequest({ owner: "acme", repo: "app", pullNumber: 15 });

    expect(result.source).toBe("connector");
    expect(result.action).toBe("pull_requests.merge");
    expect(result.validated.pullNumber).toBe(15);
  });

  test("mergePullRequest posts to GitHub API", async () => {
    const requests: Request[] = [];
    const result = await mergePullRequest({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 15,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(JSON.stringify({ merged: true, message: "Pull Request successfully merged" }), { status: 200 });
      },
    });

    expect(result).toEqual({
      connector: "github",
      action: "pull_requests.merge",
      source: "connector",
      merged: true,
    });
    const mergeReq = requests.find((r) => r.url.includes("/merge"));
    expect(mergeReq).toBeDefined();
    expect(mergeReq!.method).toBe("PUT");
  });
});
