import { describe, expect, test } from "bun:test";
import issuesListFixture from "../fixtures/issues_list.json";
import issuesNoPageFixture from "../fixtures/issues_list_no_page.json";
import createIssueFixture from "../fixtures/create_issue.json";
import {
  normalizeGitHubIssue,
  parseIssuesResponse,
  validateCreateIssueInput,
  validateCreateCommentInput,
  createIssuesClient,
} from "../src/issues";
import { parseGitHubRateLimit } from "../src/http";

describe("github issues", () => {
  test("normalizes GitHub issue from fixture", () => {
    const issue = normalizeGitHubIssue(issuesListFixture[0]);

    expect(issue.id).toBe("gh-issue:123456789");
    expect(issue.provider).toBe("github");
    expect(issue.providerIssueId).toBe(123456789);
    expect(issue.number).toBe(42);
    expect(issue.title).toBe("Fix authentication middleware");
    expect(issue.body).toContain("auth middleware");
    expect(issue.state).toBe("open");
    expect(issue.isOpen).toBe(true);
    expect(issue.url).toBe("https://github.com/acme/app/issues/42");
    expect(issue.labels).toEqual(["bug", "security"]);
    expect(issue.author).toBe("alice");
    expect(issue.assignee).toBe("bob");
    expect(issue.modelVersion).toBe("2026-05-16");
    expect(issue.raw.title).toBe("Fix authentication middleware");
  });

  test("normalizes issue with minimal fields", () => {
    const issue = normalizeGitHubIssue({ id: 1, number: 1, title: "Minimal" });

    expect(issue.id).toBe("gh-issue:1");
    expect(issue.title).toBe("Minimal");
    expect(issue.labels).toEqual([]);
    expect(issue.author).toBe("");
  });

  test("normalizes closed issue", () => {
    const issue = normalizeGitHubIssue(issuesListFixture[2]);

    expect(issue.state).toBe("closed");
    expect(issue.isOpen).toBe(false);
    expect(issue.closedAt).toBe("2026-05-11T12:00:00Z");
  });

  test("parses issues list response", () => {
    const parsed = parseIssuesResponse(issuesListFixture);

    expect(parsed.issues).toHaveLength(3);
    expect(parsed.issues[0].id).toBe(123456789);
    expect(parsed.issues[1].number).toBe(43);
  });

  test("parses issues list response without nextLink", () => {
    const parsed = parseIssuesResponse(issuesNoPageFixture);

    expect(parsed.issues).toHaveLength(1);
    expect(parsed.nextLink).toBeNull();
  });

  test("parses empty issues list response", () => {
    const parsed = parseIssuesResponse([]);

    expect(parsed.issues).toHaveLength(0);
    expect(parsed.nextLink).toBeNull();
  });

  test("handles non-object response gracefully", () => {
    expect(parseIssuesResponse(null)).toEqual({ issues: [], nextLink: null });
    expect(parseIssuesResponse("string")).toEqual({ issues: [], nextLink: null });
  });

  test("parses GitHub rate limit from 403 with exhausted remaining", () => {
    const result = parseGitHubRateLimit(403, {
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 60),
    });
    expect(result.limited).toBe(true);
    if (result.limited) expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("parses GitHub rate limit from 429 with Retry-After", () => {
    expect(parseGitHubRateLimit(429, { "retry-after": "30" })).toEqual({
      limited: true,
      retryAfterSeconds: 30,
    });
  });

  test("returns not limited for 200", () => {
    expect(parseGitHubRateLimit(200, {})).toEqual({ limited: false });
  });

  test("returns not limited for 403 with remaining quota", () => {
    expect(parseGitHubRateLimit(403, { "x-ratelimit-remaining": "100" })).toEqual({ limited: false });
  });

  test("validates create issue input", () => {
    expect(validateCreateIssueInput({ owner: "acme", repo: "app", title: "Bug", body: "desc" })).toEqual({
      owner: "acme",
      repo: "app",
      title: "Bug",
      body: "desc",
    });
  });

  test("validates create issue with labels and assignees", () => {
    const result = validateCreateIssueInput({
      owner: "acme", repo: "app", title: "Bug",
      labels: ["bug", "urgent"], assignees: ["alice", "bob"],
    });
    expect(result.labels).toEqual(["bug", "urgent"]);
    expect(result.assignees).toEqual(["alice", "bob"]);
  });

  test("rejects invalid create issue input", () => {
    expect(() => validateCreateIssueInput("not object")).toThrow();
    expect(() => validateCreateIssueInput({})).toThrow();
    expect(() => validateCreateIssueInput({ owner: "acme", repo: "", title: "Bug" })).toThrow();
    expect(() => validateCreateIssueInput({ owner: "acme", repo: "app", title: "" })).toThrow();
  });

  test("validates create comment input", () => {
    expect(validateCreateCommentInput({ owner: "acme", repo: "app", issueNumber: 42, body: "comment" })).toEqual({
      owner: "acme",
      repo: "app",
      issueNumber: 42,
      body: "comment",
    });
  });

  test("rejects invalid create comment input", () => {
    expect(() => validateCreateCommentInput("not object")).toThrow();
    expect(() => validateCreateCommentInput({ owner: "acme", repo: "app", issueNumber: "abc", body: "comment" })).toThrow();
    expect(() => validateCreateCommentInput({ owner: "acme", repo: "app", issueNumber: 42, body: "" })).toThrow();
  });

  test("create issue posts to GitHub API and normalizes response", async () => {
    const requests: Request[] = [];
    const client = createIssuesClient({
      accessToken: "ghp_test-token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(JSON.stringify(createIssueFixture), { status: 201 });
      },
    });

    const result = await client.create({ owner: "acme", repo: "app", title: "New feature request", body: "desc" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("https://api.github.com/repos/acme/app/issues");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ghp_test-token");
    expect(requests[0].headers.get("Accept")).toBe("application/vnd.github+json");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.issue.number).toBe(50);
      expect(result.issue.title).toBe("New feature request");
    }
  });

  test("create issue maps GitHub 429 to rate limit error", async () => {
    const client = createIssuesClient({
      accessToken: "ghp_test-token",
      fetch: async () => new Response(JSON.stringify({ message: "rate limited" }), {
        status: 429,
        headers: { "Retry-After": "30" },
      }),
    });

    const result = await client.create({ owner: "acme", repo: "app", title: "Test", body: "body" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(result.error.retryAfterSeconds).toBe(30);
    }
  });
});
