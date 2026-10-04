import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import reactionFixture from "../fixtures/reaction_create.json";
import {
  createCommitCommentReaction,
  deleteCommitCommentReaction,
  createIssueCommentReaction,
  deleteIssueCommentReaction,
  createIssueReaction,
  deleteIssueReaction,
  createPullRequestCommentReaction,
  deletePullRequestCommentReaction,
  createReleaseReaction,
  deleteReleaseReaction,
} from "../src/actions";
import {
  validateCreateCommitCommentReactionInput,
  validateDeleteCommitCommentReactionInput,
  validateCreateIssueCommentReactionInput,
  validateDeleteIssueCommentReactionInput,
  validateCreateIssueReactionInput,
  validateDeleteIssueReactionInput,
  validateCreatePullRequestCommentReactionInput,
  validateDeletePullRequestCommentReactionInput,
  validateCreateReleaseReactionInput,
  validateDeleteReleaseReactionInput,
} from "../src/card_reactions";

const CREATES = [
  ["reactions.commit_comment.create", "POST /repos/{owner}/{repo}/comments/{comment_id}/reactions"],
  ["reactions.issue_comment.create", "POST /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions"],
  ["reactions.issue.create", "POST /repos/{owner}/{repo}/issues/{issue_number}/reactions"],
  ["reactions.pull_request_comment.create", "POST /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions"],
  ["reactions.release.create", "POST /repos/{owner}/{repo}/releases/{release_id}/reactions"],
] as const;

const DELETES = [
  ["reactions.commit_comment.delete", "DELETE /repos/{owner}/{repo}/comments/{comment_id}/reactions/{reaction_id}"],
  ["reactions.issue_comment.delete", "DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions/{reaction_id}"],
  ["reactions.issue.delete", "DELETE /repos/{owner}/{repo}/issues/{issue_number}/reactions/{reaction_id}"],
  ["reactions.pull_request_comment.delete", "DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions/{reaction_id}"],
  ["reactions.release.delete", "DELETE /repos/{owner}/{repo}/releases/{release_id}/reactions/{reaction_id}"],
] as const;

const CONTENTS = ["+1", "-1", "laugh", "confused", "heart", "hooray", "rocket", "eyes"] as const;
const RELEASE_CONTENTS = ["+1", "laugh", "heart", "hooray", "rocket", "eyes"] as const;

const normalizedHeart = {
  id: 1,
  content: "heart",
  createdAt: "2024-01-02T00:00:00Z",
  userLogin: "octocat",
};

describe("github reaction create and delete", () => {
  test("version is 0.44.0 at 434 ops and the ten reaction writes declare effect policy", () => {
    expect(manifest.version).toBe("0.44.0");
    expect(CREATES).toHaveLength(5);
    expect(DELETES).toHaveLength(5);
    expect(Object.keys(manifest.operations)).toHaveLength(434);
    for (const [key, path] of CREATES) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(typeof op.title).toBe("string");
      expect((op.title as string).length).toBeGreaterThan(0);
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Idempotent");
      expect(op.reconcile).toBeUndefined();
      expect(op.description).toContain(path);
      expect((op.inputSchema as Record<string, unknown>).type).toBe("object");
      expect((op.outputSchema as Record<string, unknown>).type).toBe("object");
    }
    for (const [key, path] of DELETES) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(typeof op.title).toBe("string");
      expect((op.title as string).length).toBeGreaterThan(0);
      expect(op.sideEffect).toBe("destructive");
      expect(op.effectPolicy).toBe("Idempotent");
      expect(op.reconcile).toBeUndefined();
      expect(op.description).toContain(path);
      expect((op.inputSchema as Record<string, unknown>).type).toBe("object");
      expect((op.outputSchema as Record<string, unknown>).type).toBe("object");
    }
    expect(manifest.operations["issues.reactions.list"]).toBeDefined();
    expect(manifest.operations["releases.reactions.list"]).toBeDefined();
  });

  test("validates required path fields and documented reaction content", () => {
    expect(validateCreateIssueReactionInput({
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      content: "heart",
    })).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      content: "heart",
    });
    expect(validateCreateCommitCommentReactionInput({
      owner: "octocat",
      repo: "Hello-World",
      commentId: 12,
      content: "+1",
    }).content).toBe("+1");
    expect(validateCreateIssueCommentReactionInput({
      owner: "octocat",
      repo: "Hello-World",
      commentId: 11,
      content: "eyes",
    }).commentId).toBe(11);
    expect(validateCreatePullRequestCommentReactionInput({
      owner: "octocat",
      repo: "Hello-World",
      commentId: 13,
      content: "rocket",
    }).content).toBe("rocket");
    expect(validateCreateReleaseReactionInput({
      owner: "octocat",
      repo: "Hello-World",
      releaseId: 9,
      content: "hooray",
    }).content).toBe("hooray");
    expect(validateDeleteIssueReactionInput({
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      reactionId: 1,
    })).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      reactionId: 1,
    });
    expect(validateDeleteCommitCommentReactionInput({
      owner: "octocat",
      repo: "Hello-World",
      commentId: 12,
      reactionId: 7,
    }).reactionId).toBe(7);
    expect(validateDeleteIssueCommentReactionInput({
      owner: "octocat",
      repo: "Hello-World",
      commentId: 11,
      reactionId: 7,
    }).commentId).toBe(11);
    expect(validateDeletePullRequestCommentReactionInput({
      owner: "octocat",
      repo: "Hello-World",
      commentId: 13,
      reactionId: 7,
    }).reactionId).toBe(7);
    expect(validateDeleteReleaseReactionInput({
      owner: "octocat",
      repo: "Hello-World",
      releaseId: 9,
      reactionId: 7,
    }).releaseId).toBe(9);

    for (const content of CONTENTS) {
      expect(validateCreateIssueReactionInput({
        owner: "octocat",
        repo: "Hello-World",
        issueNumber: 1,
        content,
      }).content).toBe(content);
    }
    for (const content of RELEASE_CONTENTS) {
      expect(validateCreateReleaseReactionInput({
        owner: "octocat",
        repo: "Hello-World",
        releaseId: 9,
        content,
      }).content).toBe(content);
    }

    expect(() => validateCreateIssueReactionInput({})).toThrow(/owner is required/);
    expect(() => validateCreateIssueReactionInput({ owner: "octo/cat", repo: "Hello-World", issueNumber: 1, content: "heart" })).toThrow(/single path segment/);
    expect(() => validateCreateIssueReactionInput({ owner: "octocat", repo: "Hello-World", issueNumber: 1, content: "thumb" })).toThrow(/content/);
    expect(() => validateCreateIssueReactionInput({ owner: "octocat", repo: "Hello-World", issueNumber: 0, content: "heart" })).toThrow(/issueNumber/);
    expect(() => validateCreateReleaseReactionInput({
      owner: "octocat",
      repo: "Hello-World",
      releaseId: 9,
      content: "-1",
    })).toThrow(/content/);
    expect(() => validateCreateReleaseReactionInput({
      owner: "octocat",
      repo: "Hello-World",
      releaseId: 9,
      content: "confused",
    })).toThrow(/content/);
    expect(() => validateDeleteIssueReactionInput({
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 1,
    })).toThrow(/reactionId/);
    expect(() => validateDeleteCommitCommentReactionInput({
      owner: "octocat",
      repo: "a/b",
      commentId: 1,
      reactionId: 1,
    })).toThrow(/single path segment/);
  });

  test("validation-only path does not fetch", () => {
    const created = createIssueReaction({
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      content: "heart",
    });
    expect(created.validated).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      content: "heart",
    });
    const deleted = deleteIssueReaction({
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      reactionId: 1,
    });
    expect(deleted.validated).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      reactionId: 1,
    });
  });

  test("creates POST the documented paths with vnd.github+json and treat 200 as already-exists success", async () => {
    const seen: Array<{ url: string; method: string; contentType: string | null; body: unknown }> = [];
    const fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      seen.push({
        url: request.url,
        method: request.method,
        contentType: request.headers.get("content-type"),
        body: JSON.parse(await request.text()),
      });
      expect(request.headers.get("authorization")).toBe("Bearer t");
      expect(request.headers.get("accept")).toBe("application/vnd.github+json");
      const status = request.url.includes("/issues/4/reactions") ? 200 : 201;
      return new Response(JSON.stringify(reactionFixture), {
        status,
        headers: { "content-type": "application/json" },
      });
    };

    const issue = await createIssueReaction({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      issueNumber: 4,
      content: "heart",
      fetch,
    });
    expect(issue.action).toBe("reactions.issue.create");
    expect(issue.reaction).toEqual(normalizedHeart);
    expect(JSON.stringify(issue.reaction)).not.toContain("drop-me");

    const commit = await createCommitCommentReaction({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      commentId: 12,
      content: "+1",
      fetch,
    });
    expect(commit.action).toBe("reactions.commit_comment.create");
    expect(commit.reaction).toEqual(normalizedHeart);

    const issueComment = await createIssueCommentReaction({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      commentId: 11,
      content: "eyes",
      fetch,
    });
    expect(issueComment.action).toBe("reactions.issue_comment.create");

    const review = await createPullRequestCommentReaction({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      commentId: 13,
      content: "rocket",
      fetch,
    });
    expect(review.action).toBe("reactions.pull_request_comment.create");

    const release = await createReleaseReaction({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      releaseId: 9,
      content: "hooray",
      fetch,
    });
    expect(release.action).toBe("reactions.release.create");
    expect(release.reaction).toEqual(normalizedHeart);

    expect(seen).toEqual([
      {
        url: "https://api.github.com/repos/octo%20cat/Hello%20World/issues/4/reactions",
        method: "POST",
        contentType: "application/vnd.github+json",
        body: { content: "heart" },
      },
      {
        url: "https://api.github.com/repos/octocat/Hello-World/comments/12/reactions",
        method: "POST",
        contentType: "application/vnd.github+json",
        body: { content: "+1" },
      },
      {
        url: "https://api.github.com/repos/octocat/Hello-World/issues/comments/11/reactions",
        method: "POST",
        contentType: "application/vnd.github+json",
        body: { content: "eyes" },
      },
      {
        url: "https://api.github.com/repos/octocat/Hello-World/pulls/comments/13/reactions",
        method: "POST",
        contentType: "application/vnd.github+json",
        body: { content: "rocket" },
      },
      {
        url: "https://api.github.com/repos/octocat/Hello-World/releases/9/reactions",
        method: "POST",
        contentType: "application/vnd.github+json",
        body: { content: "hooray" },
      },
    ]);
  });

  test("deletes the documented paths and treat a missing reaction as already gone", async () => {
    const seen: Array<{ url: string; method: string }> = [];
    const fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      seen.push({ url: request.url, method: request.method });
      expect(request.headers.get("authorization")).toBe("Bearer t");
      expect(request.headers.get("accept")).toBe("application/vnd.github+json");
      const status = request.url.includes("/issues/4/reactions/1") ? 404 : 204;
      return new Response("", { status });
    };

    const missing = await deleteIssueReaction({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      issueNumber: 4,
      reactionId: 1,
      fetch,
    });
    expect(missing).toMatchObject({
      action: "reactions.issue.delete",
      deleted: true,
      reactionId: 1,
    });

    const commit = await deleteCommitCommentReaction({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      commentId: 12,
      reactionId: 7,
      fetch,
    });
    expect(commit.action).toBe("reactions.commit_comment.delete");
    expect(commit.deleted).toBe(true);
    expect(commit.reactionId).toBe(7);

    await deleteIssueCommentReaction({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      commentId: 11,
      reactionId: 7,
      fetch,
    });
    await deletePullRequestCommentReaction({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      commentId: 13,
      reactionId: 7,
      fetch,
    });
    const release = await deleteReleaseReaction({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      releaseId: 9,
      reactionId: 8,
      fetch,
    });
    expect(release.action).toBe("reactions.release.delete");
    expect(release.deleted).toBe(true);
    expect(release.reactionId).toBe(8);

    expect(seen).toEqual([
      { url: "https://api.github.com/repos/octo%20cat/Hello%20World/issues/4/reactions/1", method: "DELETE" },
      { url: "https://api.github.com/repos/octocat/Hello-World/comments/12/reactions/7", method: "DELETE" },
      { url: "https://api.github.com/repos/octocat/Hello-World/issues/comments/11/reactions/7", method: "DELETE" },
      { url: "https://api.github.com/repos/octocat/Hello-World/pulls/comments/13/reactions/7", method: "DELETE" },
      { url: "https://api.github.com/repos/octocat/Hello-World/releases/9/reactions/8", method: "DELETE" },
    ]);
  });

  test("a missing create target is CONNECTOR_UPSTREAM_ERROR and 429 is rate limited", async () => {
    await expect(createIssueReaction({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      content: "heart",
      fetch: async () => new Response("", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(createIssueReaction({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      content: "heart",
      fetch: async () => new Response("", { status: 401 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(createIssueReaction({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      content: "heart",
      fetch: async () => new Response("", {
        status: 429,
        headers: { "Retry-After": "45" },
      }),
    })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 45,
    });
    await expect(deleteIssueReaction({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      reactionId: 1,
      fetch: async () => new Response("", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "0" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});
