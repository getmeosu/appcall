import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import orgIssuesFixture from "../fixtures/org_issues.json";
import dependenciesFixture from "../fixtures/issue_dependencies.json";
import pinFixture from "../fixtures/issue_comment_pin.json";
import repoReviewCommentsFixture from "../fixtures/pr_review_comments_repo.json";
import {
  addIssueBlockedBy,
  listIssueBlockedBy,
  listIssueBlocking,
  listOrgIssues,
  listRepoReviewComments,
  pinIssueComment,
  removeIssueBlockedBy,
  renderMarkdown,
  rerequestPullReviewers,
  unpinIssueComment,
} from "../src/actions";
import {
  validateAddIssueBlockedByInput,
  validateListIssueBlockedByInput,
  validateListOrgIssuesInput,
  validateListRepoReviewCommentsInput,
  validatePinIssueCommentInput,
  validateRemoveIssueBlockedByInput,
  validateRenderMarkdownInput,
  validateRerequestPullReviewersInput,
} from "../src/card_issues_remaining";

const READS = [
  "orgs.issues.list",
  "issues.dependencies.blocked_by.list",
  "issues.dependencies.blocking.list",
  "pulls.review_comments.repo.list",
] as const;

const WRITES = [
  ["issues.comments.pin", "Reconcile", "issues.comments.get"],
  ["issues.dependencies.blocked_by.add", "Reconcile", "issues.dependencies.blocked_by.list"],
  ["pulls.reviewers.rerequest", "Reconcile", "pull_requests.requested_reviewers.list"],
  ["markdown.render", "Idempotent", undefined],
] as const;

const DESTRUCTIVE = [
  ["issues.comments.unpin", "Idempotent"],
  ["issues.dependencies.blocked_by.remove", "Reconcile"],
] as const;

describe("github remaining issue ops", () => {
  test("manifest is v0.44.0 at 434 ops with read, write, and destructive policies", () => {
    expect(manifest.version).toBe("0.44.0");
    expect(Object.keys(manifest.operations).length).toBe(434);
    expect(manifest.operations["issues.comments.pin.get"]).toBeUndefined();
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
    for (const [key, policy, reconcile] of WRITES) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe(policy);
      expect(op.reconcile).toBe(reconcile);
    }
    for (const [key, policy] of DESTRUCTIVE) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("destructive");
      expect(op.effectPolicy).toBe(policy);
    }
    expect(manifest.operations["issues.comments.unpin"].reconcile).toBeUndefined();
    expect(manifest.operations["issues.dependencies.blocked_by.remove"].reconcile).toBe(
      "issues.dependencies.blocked_by.list",
    );
    expect(manifest.operations["orgs.issues.list"].description).toContain("GET /orgs/{org}/issues");
    expect(manifest.operations["issues.dependencies.blocked_by.list"].description).toContain(
      "GET /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by",
    );
    expect(manifest.operations["issues.dependencies.blocking.list"].description).toContain(
      "GET /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocking",
    );
    expect(manifest.operations["pulls.review_comments.repo.list"].description).toContain(
      "GET /repos/{owner}/{repo}/pulls/comments",
    );
    expect(manifest.operations["issues.comments.pin"].description).toContain(
      "PUT /repos/{owner}/{repo}/issues/comments/{comment_id}/pin",
    );
    expect(manifest.operations["issues.comments.unpin"].description).toContain(
      "DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}/pin",
    );
    expect(manifest.operations["issues.dependencies.blocked_by.add"].description).toContain(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by",
    );
    expect(manifest.operations["issues.dependencies.blocked_by.remove"].description).toContain(
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by/{issue_id}",
    );
    expect(manifest.operations["pulls.reviewers.rerequest"].description).toContain(
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers/rerequest",
    );
    expect(manifest.operations["markdown.render"].description).toContain("POST /markdown");
    expect(manifest.operations["issues.assigned.list"]).toBeDefined();
    expect(manifest.operations["pull_requests.review_comments.list"]).toBeDefined();
    expect(manifest.operations["issues.comments.get"]).toBeDefined();
  });

  test("validates documented path fields, enums, and pagination only", () => {
    expect(validateListOrgIssuesInput({
      org: "octocat",
      filter: "created",
      state: "all",
      labels: "bug,ui",
      sort: "updated",
      direction: "asc",
      since: "2026-01-01T00:00:00Z",
      perPage: 30,
      page: 2,
    })).toEqual({
      org: "octocat",
      filter: "created",
      state: "all",
      labels: "bug,ui",
      sort: "updated",
      direction: "asc",
      since: "2026-01-01T00:00:00Z",
      perPage: 30,
      page: 2,
    });
    expect(() => validateListOrgIssuesInput({ org: "octo/cat" })).toThrow(/org/);
    expect(() => validateListOrgIssuesInput({ org: "octocat", filter: "unknown" })).toThrow(/filter/);
    expect(() => validateListOrgIssuesInput({ org: "octocat", perPage: 101 })).toThrow(/perPage/);
    expect(validateListIssueBlockedByInput({
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      perPage: 10,
      page: 1,
    })).toEqual({ owner: "octocat", repo: "Hello-World", issueNumber: 4, perPage: 10, page: 1 });
    expect(() => validateListIssueBlockedByInput({ owner: "octo/cat", repo: "Hello-World", issueNumber: 4 })).toThrow(/owner/);
    expect(() => validateListIssueBlockedByInput({ owner: "octocat", repo: "Hello-World", issueNumber: 0 })).toThrow(/issueNumber/);
    expect(validateListRepoReviewCommentsInput({
      owner: "octocat",
      repo: "Hello-World",
      sort: "updated",
      direction: "desc",
      since: "2026-01-01T00:00:00Z",
    })).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      sort: "updated",
      direction: "desc",
      since: "2026-01-01T00:00:00Z",
      perPage: undefined,
      page: undefined,
    });
    expect(() => validateListRepoReviewCommentsInput({ owner: "octocat", repo: "Hello-World", sort: "comments" })).toThrow(/sort/);
    expect(validatePinIssueCommentInput({ owner: "octocat", repo: "Hello-World", commentId: 1 })).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      commentId: 1,
    });
    expect(validateAddIssueBlockedByInput({
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      issueId: 1,
    })).toEqual({ owner: "octocat", repo: "Hello-World", issueNumber: 4, issueId: 1 });
    expect(() => validateAddIssueBlockedByInput({ owner: "octocat", repo: "Hello-World", issueNumber: 4 })).toThrow(/issueId/);
    expect(validateRemoveIssueBlockedByInput({
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      issueId: 1,
    }).issueId).toBe(1);
    expect(validateRerequestPullReviewersInput({
      owner: "octocat",
      repo: "Hello-World",
      pullNumber: 15,
      reviewers: ["octocat"],
      teamReviewers: ["justice-league"],
    })).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      pullNumber: 15,
      reviewers: ["octocat"],
      teamReviewers: ["justice-league"],
    });
    expect(() => validateRerequestPullReviewersInput({ owner: "octocat", repo: "Hello-World", pullNumber: 15, reviewers: [""] })).toThrow(/reviewers/);
    expect(validateRenderMarkdownInput({ text: "Hello **world**", mode: "gfm", context: "octocat/Hello-World" })).toEqual({
      text: "Hello **world**",
      mode: "gfm",
      context: "octocat/Hello-World",
    });
    expect(() => validateRenderMarkdownInput({ text: "hi", mode: "raw" })).toThrow(/mode/);
    expect(() => validateRenderMarkdownInput({})).toThrow(/text/);
  });

  test("lists org issues on GET /orgs/{org}/issues and not /issues", async () => {
    const result = await listOrgIssues({
      accessToken: "t",
      org: "octo cat",
      filter: "created",
      state: "open",
      labels: "bug",
      sort: "updated",
      direction: "asc",
      since: "2026-01-01T00:00:00Z",
      perPage: 30,
      page: 2,
      fetch: async (input, init) => {
        expect(String(input)).toBe(
          "https://api.github.com/orgs/octo%20cat/issues?filter=created&state=open&labels=bug&sort=updated&direction=asc&since=2026-01-01T00%3A00%3A00Z&per_page=30&page=2",
        );
        expect(String(input)).not.toMatch(/\/user\/issues/);
        expect(String(input)).not.toBe("https://api.github.com/issues");
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        expect(init?.method ?? "GET").toBe("GET");
        return json(orgIssuesFixture);
      },
    });
    expect(result.action).toBe("orgs.issues.list");
    expect((result.issues as { number: number; title: string }[])[0]).toMatchObject({
      number: 42,
      title: "Fix authentication middleware",
      state: "open",
      htmlUrl: "https://github.com/octocat/Hello-World/issues/42",
    });
    expect(JSON.stringify(result.issues)).not.toContain("drop-me");
  });

  test("lists blocked-by and blocking dependencies on the documented child routes", async () => {
    const blocked = await listIssueBlockedBy({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      issueNumber: 4,
      perPage: 10,
      page: 2,
      fetch: async (input, init) => {
        expect(String(input)).toBe(
          "https://api.github.com/repos/octo%20cat/Hello%20World/issues/4/dependencies/blocked_by?per_page=10&page=2",
        );
        expect(init?.method ?? "GET").toBe("GET");
        return json(dependenciesFixture);
      },
    });
    expect(blocked.action).toBe("issues.dependencies.blocked_by.list");
    expect((blocked.issues as { id: number; number: number }[])[0]).toMatchObject({
      id: 1,
      number: 2,
      title: "Blocking issue",
    });

    const blocking = await listIssueBlocking({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      fetch: async (input) => {
        expect(String(input)).toBe(
          "https://api.github.com/repos/octocat/Hello-World/issues/4/dependencies/blocking",
        );
        expect(String(input)).not.toContain("blocked_by");
        return json(dependenciesFixture);
      },
    });
    expect(blocking.action).toBe("issues.dependencies.blocking.list");
    expect((blocking.issues as { number: number }[])[0].number).toBe(2);
  });

  test("lists repository review comments on GET /pulls/comments not a pull number route", async () => {
    const result = await listRepoReviewComments({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      sort: "updated",
      direction: "desc",
      since: "2026-01-01T00:00:00Z",
      perPage: 50,
      page: 3,
      fetch: async (input, init) => {
        expect(String(input)).toBe(
          "https://api.github.com/repos/octo%20cat/Hello%20World/pulls/comments?sort=updated&direction=desc&since=2026-01-01T00%3A00%3A00Z&per_page=50&page=3",
        );
        expect(String(input)).not.toMatch(/\/pulls\/\d+\/comments/);
        expect(init?.method ?? "GET").toBe("GET");
        return json(repoReviewCommentsFixture);
      },
    });
    expect(result.action).toBe("pulls.review_comments.repo.list");
    expect((result.comments as { id: number; path: string }[])[0]).toMatchObject({
      id: 10,
      body: "Nit: rename this",
      path: "src/index.ts",
      user: "octocat",
    });
    expect(JSON.stringify(result.comments)).not.toContain("drop-me");
  });

  test("pins and unpins issue comments on the /pin route", async () => {
    const pinned = await pinIssueComment({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      commentId: 1,
      fetch: async (input, init) => {
        expect(String(input)).toBe(
          "https://api.github.com/repos/octo%20cat/Hello%20World/issues/comments/1/pin",
        );
        expect(init?.method).toBe("PUT");
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        return json(pinFixture);
      },
    });
    expect(pinned.action).toBe("issues.comments.pin");
    expect(pinned.comment).toMatchObject({
      id: 1,
      body: "Me too",
      user: "octocat",
      pinnedAt: "2021-01-01T00:00:00Z",
      pinnedBy: "octocat",
    });
    expect(JSON.stringify(pinned.comment)).not.toContain("drop-me");

    const unpinned = await unpinIssueComment({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      commentId: 1,
      fetch: async (input, init) => {
        expect(String(input)).toBe(
          "https://api.github.com/repos/octocat/Hello-World/issues/comments/1/pin",
        );
        expect(init?.method).toBe("DELETE");
        return new Response(null, { status: 204 });
      },
    });
    expect(unpinned.action).toBe("issues.comments.unpin");
    expect(unpinned).toMatchObject({ unpinned: true, commentId: 1 });
  });

  test("adds and removes blocked-by dependencies with issue_id not issue number", async () => {
    const added = await addIssueBlockedBy({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      issueNumber: 4,
      issueId: 1,
      fetch: async (input, init) => {
        expect(String(input)).toBe(
          "https://api.github.com/repos/octo%20cat/Hello%20World/issues/4/dependencies/blocked_by",
        );
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ issue_id: 1 });
        return new Response(JSON.stringify(dependenciesFixture[0]), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(added.action).toBe("issues.dependencies.blocked_by.add");
    expect(added.issue).toMatchObject({ id: 1, number: 2, title: "Blocking issue" });

    const removed = await removeIssueBlockedBy({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      issueId: 1,
      fetch: async (input, init) => {
        expect(String(input)).toBe(
          "https://api.github.com/repos/octocat/Hello-World/issues/4/dependencies/blocked_by/1",
        );
        expect(init?.method).toBe("DELETE");
        return json(dependenciesFixture[0]);
      },
    });
    expect(removed.action).toBe("issues.dependencies.blocked_by.remove");
    expect(removed.issue).toMatchObject({ id: 1, number: 2 });
  });

  test("rerequests reviewers on the /requested_reviewers/rerequest route", async () => {
    const result = await rerequestPullReviewers({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      pullNumber: 15,
      reviewers: ["octocat"],
      teamReviewers: ["justice-league"],
      fetch: async (input, init) => {
        expect(String(input)).toBe(
          "https://api.github.com/repos/octo%20cat/Hello%20World/pulls/15/requested_reviewers/rerequest",
        );
        expect(String(input)).not.toMatch(/\/requested_reviewers$/);
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          reviewers: ["octocat"],
          team_reviewers: ["justice-league"],
        });
        return new Response("{}", { status: 201, headers: { "content-type": "application/json" } });
      },
    });
    expect(result.action).toBe("pulls.reviewers.rerequest");
    expect(result.rerequested).toBe(true);
  });

  test("renders markdown text to html via POST /markdown", async () => {
    const result = await renderMarkdown({
      accessToken: "t",
      text: "Hello **world**",
      mode: "gfm",
      context: "octocat/Hello-World",
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/markdown");
        expect(String(input)).not.toContain("/markdown/raw");
        expect(init?.method).toBe("POST");
        expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
        expect(JSON.parse(String(init?.body))).toEqual({
          text: "Hello **world**",
          mode: "gfm",
          context: "octocat/Hello-World",
        });
        return new Response("<p>Hello <strong>world</strong></p>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      },
    });
    expect(result.action).toBe("markdown.render");
    expect(result.html).toBe("<p>Hello <strong>world</strong></p>");
  });

  test("maps 429 and keeps 404 as CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listOrgIssues({
      accessToken: "t",
      org: "octocat",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "9" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });

    const missing = async () => new Response("{}", { status: 404 });
    await expect(listOrgIssues({ accessToken: "t", org: "missing", fetch: missing })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(listIssueBlockedBy({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 1,
      fetch: missing,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listIssueBlocking({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 1,
      fetch: missing,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listRepoReviewComments({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      fetch: missing,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(pinIssueComment({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      commentId: 1,
      fetch: missing,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(unpinIssueComment({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      commentId: 1,
      fetch: missing,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(addIssueBlockedBy({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 1,
      issueId: 2,
      fetch: missing,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(removeIssueBlockedBy({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 1,
      issueId: 2,
      fetch: missing,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(rerequestPullReviewers({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      pullNumber: 15,
      fetch: missing,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(renderMarkdown({
      accessToken: "t",
      text: "hi",
      fetch: missing,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation-only path does not fetch", () => {
    const listed = listOrgIssues({ org: "octocat" });
    expect(listed.action).toBe("orgs.issues.list");
    expect(listed.validated).toEqual({
      org: "octocat",
      filter: undefined,
      state: undefined,
      labels: undefined,
      sort: undefined,
      direction: undefined,
      since: undefined,
      perPage: undefined,
      page: undefined,
    });
    const rendered = renderMarkdown({ text: "Hello **world**" });
    expect(rendered.action).toBe("markdown.render");
    expect(rendered.validated).toEqual({ text: "Hello **world**", mode: undefined, context: undefined });
  });
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
