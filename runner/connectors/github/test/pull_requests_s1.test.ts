import { describe, expect, test } from "bun:test";
import reviewsListFixture from "../fixtures/pr_reviews_list.json";
import reviewCreateFixture from "../fixtures/pr_review_create.json";
import reviewDismissFixture from "../fixtures/pr_review_dismiss.json";
import commentsListFixture from "../fixtures/pr_review_comments_list.json";
import commentCreateFixture from "../fixtures/pr_review_comment_create.json";
import commentReplyFixture from "../fixtures/pr_review_comment_reply.json";
import prCommitsFixture from "../fixtures/pr_commits_list.json";
import requestedReviewersFixture from "../fixtures/pr_requested_reviewers.json";
import convertDraftFixture from "../fixtures/pr_convert_to_draft.json";
import markReadyFixture from "../fixtures/pr_mark_ready.json";
import {
  listPullRequestReviews,
  createPullRequestReview,
  dismissPullRequestReview,
  listPullRequestReviewComments,
  createPullRequestReviewComment,
  replyPullRequestReviewComment,
  addPullRequestRequestedReviewers,
  removePullRequestRequestedReviewers,
  listPullRequestCommits,
  checkPullRequestMerged,
  convertPullRequestToDraft,
  markPullRequestReady,
} from "../src/actions";
import {
  normalizeGitHubReview,
  normalizeGitHubReviewComment,
  validateCreateReviewInput,
  validateDismissReviewInput,
  validateRequestedReviewersInput,
  validateCreateReviewCommentInput,
  validateCheckMergedInput,
} from "../src/pull_requests";

describe("github S1 pr-reviews-comments", () => {
  test("normalizes review fixture", () => {
    const review = normalizeGitHubReview(reviewsListFixture[0] as Record<string, unknown>);
    expect(review.id).toBe("gh-review:80");
    expect(review.state).toBe("APPROVED");
    expect(review.author).toBe("octocat");
    expect(review.modelVersion).toBe("2026-05-16");
  });

  test("normalizes review comment fixture", () => {
    const comment = normalizeGitHubReviewComment(commentsListFixture[0] as Record<string, unknown>);
    expect(comment.id).toBe("gh-review-comment:10");
    expect(comment.path).toBe("src/index.ts");
    expect(comment.author).toBe("octocat");
  });

  test("validates create review / dismiss / reviewers / comment / checkMerged", () => {
    expect(validateCreateReviewInput({ owner: "acme", repo: "app", pullNumber: 15, event: "APPROVE" }).event).toBe("APPROVE");
    expect(validateDismissReviewInput({ owner: "acme", repo: "app", pullNumber: 15, reviewId: 81, message: "outdated" }).reviewId).toBe(81);
    expect(validateRequestedReviewersInput({ owner: "acme", repo: "app", pullNumber: 15, reviewers: ["bob"] }).reviewers).toEqual(["bob"]);
    expect(() => validateRequestedReviewersInput({ owner: "acme", repo: "app", pullNumber: 15 })).toThrow();
    expect(validateCreateReviewCommentInput({
      owner: "acme", repo: "app", pullNumber: 15, body: "nit", commitId: "abc", path: "src/a.ts", line: 3,
    }).line).toBe(3);
    expect(validateCheckMergedInput({ owner: "acme", repo: "app", pullNumber: 15 }).pullNumber).toBe(15);
  });

  test("listPullRequestReviews validates without token", () => {
    const result = listPullRequestReviews({ owner: "acme", repo: "app", pullNumber: 15 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("pull_requests.reviews.list");
  });

  test("listPullRequestReviews hits GitHub API", async () => {
    const requests: Request[] = [];
    const result = await listPullRequestReviews({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 15,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(reviewsListFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/pulls/15/reviews");
    expect(requests[0].method).toBe("GET");
    expect(result.action).toBe("pull_requests.reviews.list");
    expect((result.reviews as unknown[]).length).toBe(2);
  });

  test("createPullRequestReview posts event", async () => {
    const requests: Request[] = [];
    const result = await createPullRequestReview({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 15,
      event: "APPROVE",
      body: "Looks good",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(reviewCreateFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toContain("/pulls/15/reviews");
    const body = JSON.parse(await requests[0].text());
    expect(body.event).toBe("APPROVE");
    expect((result.review as Record<string, unknown>).providerReviewId).toBe(80);
  });

  test("dismissPullRequestReview puts dismissal", async () => {
    const requests: Request[] = [];
    const result = await dismissPullRequestReview({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 15,
      reviewId: 81,
      message: "no longer relevant",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(reviewDismissFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toContain("/reviews/81/dismissals");
    expect((result.review as Record<string, unknown>).state).toBe("DISMISSED");
  });

  test("listPullRequestReviewComments hits comments endpoint", async () => {
    const requests: Request[] = [];
    const result = await listPullRequestReviewComments({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 15,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(commentsListFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/pulls/15/comments");
    expect((result.comments as unknown[]).length).toBe(1);
  });

  test("createPullRequestReviewComment posts diff comment", async () => {
    const requests: Request[] = [];
    const result = await createPullRequestReviewComment({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 15,
      body: "Nit: rename this",
      commitId: "abc123def456",
      path: "src/index.ts",
      line: 12,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(commentCreateFixture), { status: 201 });
      },
    });
    expect(requests[0].method).toBe("POST");
    const body = JSON.parse(await requests[0].text());
    expect(body.path).toBe("src/index.ts");
    expect(body.line).toBe(12);
    expect((result.comment as Record<string, unknown>).providerCommentId).toBe(10);
  });

  test("replyPullRequestReviewComment posts reply", async () => {
    const requests: Request[] = [];
    const result = await replyPullRequestReviewComment({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 15,
      commentId: 10,
      body: "Done",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(commentReplyFixture), { status: 201 });
      },
    });
    expect(requests[0].url).toContain("/comments/10/replies");
    expect((result.comment as Record<string, unknown>).inReplyToId).toBe(10);
  });

  test("add/remove requested reviewers", async () => {
    const addRequests: Request[] = [];
    const add = await addPullRequestRequestedReviewers({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 15,
      reviewers: ["bob"],
      fetch: async (input, init) => {
        addRequests.push(new Request(input, init));
        return new Response(JSON.stringify(requestedReviewersFixture), { status: 201 });
      },
    });
    expect(addRequests[0].method).toBe("POST");
    expect(addRequests[0].url).toContain("/requested_reviewers");
    expect(add.action).toBe("pull_requests.requested_reviewers.add");

    const removeRequests: Request[] = [];
    const remove = await removePullRequestRequestedReviewers({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 15,
      reviewers: ["bob"],
      fetch: async (input, init) => {
        removeRequests.push(new Request(input, init));
        return new Response(JSON.stringify(requestedReviewersFixture), { status: 200 });
      },
    });
    expect(removeRequests[0].method).toBe("DELETE");
    expect(remove.action).toBe("pull_requests.requested_reviewers.remove");
  });

  test("listPullRequestCommits lists PR commits", async () => {
    const requests: Request[] = [];
    const result = await listPullRequestCommits({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 15,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(prCommitsFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/pulls/15/commits");
    expect((result.commits as unknown[]).length).toBe(2);
    expect((result.commits as Record<string, unknown>[])[0].sha).toBe("abc123def456");
  });

  test("checkPullRequestMerged maps 204/404", async () => {
    const merged = await checkPullRequestMerged({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 15,
      fetch: async () => new Response(null, { status: 204 }),
    });
    expect(merged.merged).toBe(true);

    const notMerged = await checkPullRequestMerged({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 15,
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    });
    expect(notMerged.merged).toBe(false);
  });

  test("convertToDraft and markReady", async () => {
    const draftReqs: Request[] = [];
    const draft = await convertPullRequestToDraft({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 20,
      fetch: async (input, init) => {
        draftReqs.push(new Request(input, init));
        return new Response(JSON.stringify(convertDraftFixture), { status: 200 });
      },
    });
    expect(draftReqs[0].method).toBe("POST");
    expect(draftReqs[0].url).toContain("/convert_to_draft");
    expect((draft.pullRequest as Record<string, unknown>).isDraft).toBe(true);

    const readyReqs: Request[] = [];
    const ready = await markPullRequestReady({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 20,
      fetch: async (input, init) => {
        readyReqs.push(new Request(input, init));
        return new Response(JSON.stringify(markReadyFixture), { status: 200 });
      },
    });
    expect(readyReqs[0].url).toContain("/ready_for_review");
    expect((ready.pullRequest as Record<string, unknown>).isDraft).toBe(false);
  });

  test("create review maps rate limit", async () => {
    await expect(
      createPullRequestReview({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        pullNumber: 15,
        event: "COMMENT",
        fetch: async () =>
          new Response(JSON.stringify({ message: "rate limited" }), {
            status: 429,
            headers: { "Retry-After": "45" },
          }),
      }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 45 });
  });
});
