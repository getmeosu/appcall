import { describe, expect, test } from "bun:test";
import commentsListFixture from "../fixtures/issue_comments_list.json";
import commentUpdateFixture from "../fixtures/issue_comment_update.json";
import assigneesFixture from "../fixtures/issue_assignees.json";
import labelsFixture from "../fixtures/issue_labels.json";
import repoLabelsFixture from "../fixtures/repo_labels_list.json";
import searchIssuesFixture from "../fixtures/search_issues.json";
import searchPrsFixture from "../fixtures/search_pull_requests.json";
import {
  listIssueComments,
  updateIssueComment,
  deleteIssueComment,
  addIssueAssignees,
  removeIssueAssignees,
  removeIssueLabels,
  setIssueLabels,
  lockIssue,
  unlockIssue,
  listLabels,
  searchIssues,
  searchPullRequests,
} from "../src/actions";
import {
  normalizeGitHubComment,
  normalizeGitHubLabel,
  validateListCommentsInput,
  validateUpdateCommentInput,
  validateDeleteCommentInput,
  validateAssigneesInput,
  validateRemoveLabelsInput,
  validateSetLabelsInput,
  validateLockIssueInput,
  validateUnlockIssueInput,
  validateListLabelsInput,
} from "../src/issues";
import { validateSearchIssuesInput, validateSearchPullRequestsInput } from "../src/search";

describe("github S2 issues-deepen-search", () => {
  test("normalizes comment and label fixtures", () => {
    const comment = normalizeGitHubComment(commentsListFixture[0] as Record<string, unknown>);
    expect(comment.id).toBe("gh-comment:1");
    expect(comment.author).toBe("alice");
    const label = normalizeGitHubLabel(repoLabelsFixture[0] as { id: number; name: string; color?: string; description?: string });
    expect(label.id).toBe("gh-label:10");
    expect(label.name).toBe("bug");
  });

  test("validates S2 inputs", () => {
    expect(validateListCommentsInput({ owner: "acme", repo: "app", issueNumber: 50 }).issueNumber).toBe(50);
    expect(validateUpdateCommentInput({ owner: "acme", repo: "app", commentId: 1, body: "x" }).commentId).toBe(1);
    expect(validateDeleteCommentInput({ owner: "acme", repo: "app", commentId: 1 }).commentId).toBe(1);
    expect(validateAssigneesInput({ owner: "acme", repo: "app", issueNumber: 50, assignees: ["bob"] }).assignees).toEqual(["bob"]);
    expect(() => validateAssigneesInput({ owner: "acme", repo: "app", issueNumber: 50, assignees: [] })).toThrow();
    expect(() => validateAssigneesInput({ owner: "acme", repo: "app", issueNumber: 50, assignees: [123 as unknown as string] })).toThrow();
    expect(validateRemoveLabelsInput({ owner: "acme", repo: "app", issueNumber: 50, labels: ["bug"] }).labels).toEqual(["bug"]);
    expect(validateSetLabelsInput({ owner: "acme", repo: "app", issueNumber: 50, labels: ["bug"] }).labels).toEqual(["bug"]);
    expect(validateLockIssueInput({ owner: "acme", repo: "app", issueNumber: 50, lockReason: "resolved" }).lockReason).toBe("resolved");
    expect(() => validateLockIssueInput({ owner: "acme", repo: "app", issueNumber: 50, lockReason: "nope" })).toThrow();
    expect(validateUnlockIssueInput({ owner: "acme", repo: "app", issueNumber: 50 }).issueNumber).toBe(50);
    expect(validateListLabelsInput({ owner: "acme", repo: "app" }).owner).toBe("acme");
    expect(validateSearchIssuesInput({ q: "repo:acme/app is:issue" }).q).toContain("acme");
    expect(validateSearchPullRequestsInput({ q: "repo:acme/app" }).q).toBe("repo:acme/app");
  });

  test("listIssueComments validates without token and hits API", async () => {
    const validated = listIssueComments({ owner: "acme", repo: "app", issueNumber: 50 });
    expect(validated.action).toBe("issues.comments.list");
    const requests: Request[] = [];
    const result = await listIssueComments({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      issueNumber: 50,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(commentsListFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/issues/50/comments");
    expect(requests[0].method).toBe("GET");
    expect((result.comments as unknown[]).length).toBe(2);
  });

  test("updateIssueComment patches comment", async () => {
    const requests: Request[] = [];
    const result = await updateIssueComment({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      commentId: 1,
      body: "Updated comment body",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(commentUpdateFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].url).toContain("/issues/comments/1");
    expect((result.comment as Record<string, unknown>).body).toBe("Updated comment body");
  });

  test("deleteIssueComment deletes with 204", async () => {
    const requests: Request[] = [];
    const result = await deleteIssueComment({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      commentId: 1,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });
    expect(requests[0].method).toBe("DELETE");
    expect(result.deleted).toBe(true);
    expect(result.commentId).toBe(1);
  });

  test("addIssueAssignees posts assignees", async () => {
    const requests: Request[] = [];
    const result = await addIssueAssignees({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      issueNumber: 50,
      assignees: ["bob"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(assigneesFixture), { status: 201 });
      },
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toContain("/issues/50/assignees");
    const body = JSON.parse(await requests[0].text());
    expect(body.assignees).toEqual(["bob"]);
    expect((result.issue as Record<string, unknown>).number).toBe(50);
  });

  test("removeIssueAssignees deletes assignees", async () => {
    const requests: Request[] = [];
    const result = await removeIssueAssignees({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      issueNumber: 50,
      assignees: ["bob"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(assigneesFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("DELETE");
    expect((result.issue as Record<string, unknown>).assignee).toBe("bob");
  });

  test("removeIssueLabels sends one DELETE per label with the name URL-encoded", async () => {
    const requests: Request[] = [];
    const result = await removeIssueLabels({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      issueNumber: 50,
      labels: ["bug", "good first issue", "bug"],
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        const remaining = requests.length === 1
          ? [{ id: 11, name: "enhancement" }, { id: 12, name: "good first issue" }]
          : [{ id: 11, name: "enhancement" }];
        return new Response(JSON.stringify(remaining), { status: 200 });
      },
    });
    expect(requests).toHaveLength(2);
    expect(requests.map((r) => r.method)).toEqual(["DELETE", "DELETE"]);
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/issues/50/labels/bug");
    expect(requests[1].url).toBe("https://api.github.com/repos/acme/app/issues/50/labels/good%20first%20issue");
    expect(requests.some((r) => r.method === "GET" || r.method === "PUT")).toBe(false);
    expect(result.labels).toEqual(["enhancement"]);
  });

  test("removeIssueLabels 404 on DELETE is an upstream error naming labels already removed", async () => {
    const requests: Request[] = [];
    await expect(
      removeIssueLabels({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        issueNumber: 50,
        labels: ["bug", "a/b?"],
        fetch: async (input, init) => {
          requests.push(new Request(input, init));
          if (requests.length === 1) return new Response(JSON.stringify([]), { status: 200 });
          return new Response(JSON.stringify({ message: "Label does not exist" }), { status: 404 });
        },
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: expect.stringContaining("Already removed: bug") });
    expect(requests[1].url).toBe("https://api.github.com/repos/acme/app/issues/50/labels/a%2Fb%3F");
  });

  test("setIssueLabels puts full label list", async () => {
    const requests: Request[] = [];
    const result = await setIssueLabels({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      issueNumber: 50,
      labels: ["bug", "enhancement"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(labelsFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("PUT");
    const body = JSON.parse(await requests[0].text());
    expect(body).toEqual(["bug", "enhancement"]);
    expect(result.labels).toEqual(["bug", "enhancement"]);
  });

  test("lockIssue and unlockIssue", async () => {
    const lockRequests: Request[] = [];
    const lockResult = await lockIssue({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      issueNumber: 50,
      lockReason: "resolved",
      fetch: async (input, init) => {
        lockRequests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });
    expect(lockRequests[0].method).toBe("PUT");
    expect(lockRequests[0].url).toContain("/issues/50/lock");
    expect(JSON.parse(await lockRequests[0].text()).lock_reason).toBe("resolved");
    expect(lockResult.locked).toBe(true);

    const unlockRequests: Request[] = [];
    const unlockResult = await unlockIssue({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      issueNumber: 50,
      fetch: async (input, init) => {
        unlockRequests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });
    expect(unlockRequests[0].method).toBe("DELETE");
    expect(unlockResult.locked).toBe(false);
  });

  test("listLabels lists repo labels", async () => {
    const requests: Request[] = [];
    const result = await listLabels({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(repoLabelsFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/labels");
    expect((result.labels as unknown[]).length).toBe(3);
  });

  test("searchIssues appends is:issue and returns issue items", async () => {
    const requests: Request[] = [];
    const result = await searchIssues({
      accessToken: "ghp_test-token",
      q: "repo:acme/app",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(searchIssuesFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toContain("/search/issues?");
    expect(decodeURIComponent(requests[0].url)).toContain("is:issue");
    expect((result.items as unknown[]).length).toBe(1);
    expect(result.totalCount).toBe(1);
  });

  test("searchPullRequests appends is:pr", async () => {
    const requests: Request[] = [];
    const result = await searchPullRequests({
      accessToken: "ghp_test-token",
      q: "repo:acme/app",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(searchPrsFixture), { status: 200 });
      },
    });
    expect(decodeURIComponent(requests[0].url)).toContain("is:pr");
    expect((result.items as unknown[]).length).toBe(1);
    expect((result.items as Record<string, unknown>[])[0].number).toBe(15);
  });
});
