import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import reviewFixture from "../fixtures/pr_review_create.json";
import reviewCommentsFixture from "../fixtures/pr_review_comments_list.json";
import commitCommentFixture from "../fixtures/commit_comment.json";
import checkRunFixture from "../fixtures/get_check_run.json";
import timelineFixture from "../fixtures/issue_timeline.json";
import eventsFixture from "../fixtures/issue_events.json";
import annotationsFixture from "../fixtures/check_annotations.json";
import {
  getPullRequestReview,
  submitPullRequestReview,
  updatePullRequestReviewComment,
  deletePullRequestReviewComment,
  deletePendingPullRequestReview,
  listCommitComments,
  updateCommitComment,
  deleteCommitComment,
  listIssueTimeline,
  listIssueEvents,
  listCheckAnnotations,
  createCheckRun,
  getCheckRun,
} from "../src/actions";
import { validateListReviewCommentsInput } from "../src/pull_requests";
import { validateListCommitCommentsInput } from "../src/commits";

const N2_READS = [
  "pull_requests.reviews.get",
  "commits.comments.list",
  "issues.timeline.list",
  "issues.events.list",
  "checks.annotations.list",
] as const;

const N2_RECONCILE = [
  ["pull_requests.reviews.submit", "pull_requests.reviews.get"],
  ["pull_requests.review_comments.update", "pull_requests.review_comments.list"],
  ["pull_requests.review_comments.delete", "pull_requests.review_comments.list"],
  ["checks.runs.create", "checks.runs.get"],
  ["commits.comments.update", "commits.comments.list"],
  ["commits.comments.delete", "commits.comments.list"],
] as const;

describe("github N2 reviews comments timeline checks", () => {
  test("manifest wires exactly the N2 effect policies on the N1 tip", () => {
    expect(manifest.version).toBe("0.26.0");
    expect(Object.keys(manifest.operations).length).toBe(271);
    for (const key of N2_READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
    for (const [key, reconcile] of N2_RECONCILE) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Reconcile");
      expect(op.reconcile).toBe(reconcile);
    }
    const pending = manifest.operations["pull_requests.reviews.delete_pending"] as Record<string, unknown>;
    expect(pending.sideEffect).toBe("write");
    expect(pending.effectPolicy).toBe("Idempotent");
    expect(pending.reconcile).toBeUndefined();
    expect(manifest.operations["pull_requests.review_comments.list"].sideEffect).toBe("read");
    expect(manifest.operations["contents.put"]).toBeUndefined();
    expect(manifest.operations["repos.contents.put"].effectPolicy).toBe("Reconcile");
  });

  test("reviews.get encodes owner and repo", async () => {
    const dry = getPullRequestReview({ owner: "acme", repo: "app", pullNumber: 15, reviewId: 80 });
    expect(dry.action).toBe("pull_requests.reviews.get");
    const requests: Request[] = [];
    const result = await getPullRequestReview({
      accessToken: "ghp_test",
      owner: "acme?x",
      repo: "app",
      pullNumber: 15,
      reviewId: 80,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(reviewFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme%3Fx/app/pulls/15/reviews/80");
    expect(requests[0].headers.get("accept")).toBe("application/vnd.github+json");
    expect((result.review as Record<string, unknown>).providerReviewId).toBe(80);
  });

  test("reviews.submit POSTs events and reconciles via reviews.get fields", async () => {
    const requests: Request[] = [];
    const result = await submitPullRequestReview({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      pullNumber: 15,
      reviewId: 80,
      event: "APPROVE",
      body: "ship it",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(reviewFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/pulls/15/reviews/80/events");
    expect(JSON.parse(await requests[0].text())).toEqual({ event: "APPROVE", body: "ship it" });
    expect((result.review as Record<string, unknown>).state).toBe("APPROVED");
    expect(() => submitPullRequestReview({ owner: "acme", repo: "app", pullNumber: 15, reviewId: 80, event: "PENDING" })).toThrow(/event must be APPROVE/);
  });

  test("review comment update and delete keep list reconcile inputs", async () => {
    const shared = { owner: "acme", repo: "app", pullNumber: 15, commentId: 10 };
    expect(validateListReviewCommentsInput({ ...shared, body: "updated" }).pullNumber).toBe(15);
    const requests: Request[] = [];
    const updated = await updatePullRequestReviewComment({
      accessToken: "ghp_test",
      ...shared,
      body: "updated",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(reviewCommentsFixture[0]), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/pulls/comments/10");
    expect((updated.comment as Record<string, unknown>).providerCommentId).toBe(10);
    const deleted = await deletePullRequestReviewComment({
      accessToken: "ghp_test",
      ...shared,
      fetch: async () => new Response("", { status: 204 }),
    });
    expect(deleted.deleted).toBe(true);
    expect(deleted.commentId).toBe(10);
  });

  test("delete_pending is 204 and 404 is an upstream error", async () => {
    const requests: Request[] = [];
    const result = await deletePendingPullRequestReview({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      pullNumber: 15,
      reviewId: 80,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/pulls/15/reviews/80");
    expect(result.deleted).toBe(true);
    await expect(deletePendingPullRequestReview({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      pullNumber: 15,
      reviewId: 80,
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Review not found." });
  });

  test("commit comment list encodes sha and update/delete omit sha from the path", async () => {
    const sha = "abc/def";
    expect(validateListCommitCommentsInput({ owner: "acme", repo: "app", sha, commentId: 42 }).sha).toBe(sha);
    const requests: Request[] = [];
    const listed = await listCommitComments({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      sha,
      perPage: 10,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify([commitCommentFixture]), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/commits/abc%2Fdef/comments?per_page=10");
    expect((listed.comments as Record<string, unknown>[])[0].providerCommentId).toBe(42);
    const updated = await updateCommitComment({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      sha,
      commentId: 42,
      body: "fixed",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(commitCommentFixture), { status: 200 });
      },
    });
    expect(requests[1].method).toBe("PATCH");
    expect(requests[1].url).toBe("https://api.github.com/repos/acme/app/comments/42");
    expect(requests[1].url).not.toContain("/commits/");
    expect((updated.comment as Record<string, unknown>).body).toBe("nit: rename this");
    const deleted = await deleteCommitComment({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      sha,
      commentId: 42,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(requests[2].method).toBe("DELETE");
    expect(requests[2].url).toBe("https://api.github.com/repos/acme/app/comments/42");
    expect(deleted.deleted).toBe(true);
  });

  test("issue timeline and events use the standard accept header", async () => {
    const requests: Request[] = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      const url = String(input);
      const body = url.includes("/timeline") ? timelineFixture : eventsFixture;
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const timeline = await listIssueTimeline({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      issueNumber: 7,
      fetch: fetchImpl,
    });
    const events = await listIssueEvents({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      issueNumber: 7,
      fetch: fetchImpl,
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/issues/7/timeline");
    expect(requests[1].url).toBe("https://api.github.com/repos/acme/app/issues/7/events");
    expect(requests[0].headers.get("accept")).toBe("application/vnd.github+json");
    expect(requests[0].headers.get("accept")).not.toContain("mockingbird");
    expect((timeline.events as Record<string, unknown>[])[0].event).toBe("commented");
    expect((events.events as Record<string, unknown>[])[0].actor).toBe("hubot");
  });

  test("checks.annotations.list and checks.runs.create", async () => {
    const requests: Request[] = [];
    const annotations = await listCheckAnnotations({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      checkRunId: 42,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(annotationsFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/check-runs/42/annotations");
    expect((annotations.annotations as Record<string, unknown>[])[0].message).toBe("unused");

    const created = await createCheckRun({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      name: "build",
      headSha: "abc123",
      status: "completed",
      conclusion: "success",
      checkRunId: 42,
      output: { title: "Build", summary: "ok", text: "done" },
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(checkRunFixture), { status: 201 });
      },
    });
    expect(requests[1].method).toBe("POST");
    expect(requests[1].url).toBe("https://api.github.com/repos/acme/app/check-runs");
    const body = JSON.parse(await requests[1].text());
    expect(body).toEqual({
      name: "build",
      head_sha: "abc123",
      status: "completed",
      conclusion: "success",
      output: { title: "Build", summary: "ok", text: "done" },
    });
    expect(body.checkRunId).toBeUndefined();
    expect(created.id).toBe(42);
    expect((created.checkRun as Record<string, unknown>).headSha).toBe("abc123def456abc123def456abc123def456abc1");
    const byId = getCheckRun({ owner: "acme", repo: "app", id: 42 });
    expect((byId.validated as Record<string, unknown>).checkRunId).toBe(42);
    const byString = getCheckRun({ owner: "acme", repo: "app", id: "42" });
    expect((byString.validated as Record<string, unknown>).checkRunId).toBe(42);
    expect(() => getCheckRun({ owner: "acme", repo: "app", id: "9007199254740993" })).toThrow(/safe integer/);
  });
});
