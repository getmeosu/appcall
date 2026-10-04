import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import suiteFixture from "../fixtures/get_check_suite.json";
import checkRunFixture from "../fixtures/get_check_run.json";
import variableFixture from "../fixtures/actions_variable.json";
import reviewersFixture from "../fixtures/requested_reviewers_list.json";
import reviewCommentsFixture from "../fixtures/pr_review_comments_list.json";
import issueLabelsFixture from "../fixtures/issue_labels.json";
import commitCommentFixture from "../fixtures/commit_comment.json";
import {
  updateCheckRun,
  rerequestCheckRun,
  getCheckSuite,
  rerequestCheckSuite,
  listRequestedReviewers,
  getPullRequestReviewComment,
  listReviewCommentsForReview,
  getIssueComment,
  listIssueLabels,
  getCommitComment,
  getActionsVariable,
  createActionsVariable,
  updateActionsVariable,
  deleteActionsVariable,
} from "../src/actions";

const N6_READS = [
  "checks.suites.get",
  "pull_requests.requested_reviewers.list",
  "pull_requests.review_comments.get",
  "pull_requests.reviews.comments.list",
  "issues.comments.get",
  "issues.labels.list",
  "commits.comments.get",
  "actions.variables.get",
] as const;

describe("github N6 checks and actions variables", () => {
  test("manifest stays on the N5 tip version and wires the 14 N6 policies", () => {
    expect(manifest.version).toBe("0.48.0");
    expect(Object.keys(manifest.operations).length).toBe(489);
    for (const key of N6_READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
    const update = manifest.operations["checks.runs.update"] as Record<string, unknown>;
    expect(update.sideEffect).toBe("write");
    expect(update.effectPolicy).toBe("Reconcile");
    expect(update.reconcile).toBe("checks.runs.get");
    const variableUpdate = manifest.operations["actions.variables.update"] as Record<string, unknown>;
    expect(variableUpdate.effectPolicy).toBe("Reconcile");
    expect(variableUpdate.reconcile).toBe("actions.variables.get");
    for (const key of ["actions.variables.create", "actions.variables.delete"] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Idempotent");
      expect(op.reconcile).toBeUndefined();
    }
    for (const key of ["checks.runs.rerequest", "checks.suites.rerequest"] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
    // N4 owns actions.variables.list; N6 adds get/create/update/delete only.
    expect(manifest.operations["actions.variables.list"]).toBeDefined();
    expect(manifest.operations["contents.put"]).toBeUndefined();
    expect(manifest.operations["contents.delete"]).toBeUndefined();
    expect(manifest.operations["contents.push_files"]).toBeUndefined();
    expect(manifest.operations["repos.delete"]).toBeUndefined();
    expect(manifest.operations["actions.secrets.create"]).toBeUndefined();
    expect(manifest.operations["checks.runs.get"].effectPolicy).toBeUndefined();
  });

  test("check run update strips annotations and rerequest is one POST", async () => {
    const calls: { url: string; method: string; body: string }[] = [];
    const updated = await updateCheckRun({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      checkRunId: 42,
      status: "completed",
      conclusion: "success",
      output: { title: "done", summary: "ok", annotations: [{ path: "a.ts", message: "nope" }] },
      annotations: [{ path: "a.ts" }],
      fetch: async (input, init) => {
        calls.push({ url: String(input), method: init?.method ?? "GET", body: String(init?.body ?? "") });
        return new Response(JSON.stringify(checkRunFixture), { status: 200 });
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.github.com/repos/acme/app/check-runs/42");
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].body).not.toContain("annotations");
    expect(JSON.parse(calls[0].body).output).toEqual({ title: "done", summary: "ok" });
    expect(updated.id).toBe((checkRunFixture as { id: number }).id);

    const rerequested = await rerequestCheckRun({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      checkRunId: 42,
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/check-runs/42/rerequest");
        expect(init?.method).toBe("POST");
        return new Response("", { status: 201 });
      },
    });
    expect(rerequested.rerequested).toBe(true);
  });

  test("suite rerequest posts only when rerequestable is true", async () => {
    const calls: string[] = [];
    const suite = await getCheckSuite({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      checkSuiteId: 7,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/check-suites/7");
        return new Response(JSON.stringify(suiteFixture), { status: 200 });
      },
    });
    expect(suite.rerequestable).toBe(true);

    const ok = await rerequestCheckSuite({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      checkSuiteId: 7,
      fetch: async (input, init) => {
        calls.push(`${init?.method ?? "GET"} ${String(input)}`);
        if ((init?.method ?? "GET") === "GET") {
          return new Response(JSON.stringify(suiteFixture), { status: 200 });
        }
        return new Response("", { status: 201 });
      },
    });
    expect(ok.rerequested).toBe(true);
    expect(calls).toEqual([
      "GET https://api.github.com/repos/acme/app/check-suites/7",
      "POST https://api.github.com/repos/acme/app/check-suites/7/rerequest",
    ]);

    const blocked: string[] = [];
    await expect(rerequestCheckSuite({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      checkSuiteId: 7,
      fetch: async (input, init) => {
        blocked.push(init?.method ?? "GET");
        return new Response(JSON.stringify({ ...suiteFixture, rerequestable: false }), { status: 200 });
      },
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Check suite is not rerequestable." });
    expect(blocked).toEqual(["GET"]);

    const missingField: string[] = [];
    await expect(rerequestCheckSuite({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      checkSuiteId: 7,
      fetch: async (_input, init) => {
        missingField.push(init?.method ?? "GET");
        const { rerequestable: _dropped, ...rest } = suiteFixture as Record<string, unknown>;
        return new Response(JSON.stringify(rest), { status: 200 });
      },
    })).rejects.toMatchObject({ message: "Check suite is not rerequestable." });
    expect(missingField).toEqual(["GET"]);
  });

  test("reads hit the GitHub REST paths", async () => {
    const reviewers = await listRequestedReviewers({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      pullNumber: 20,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/pulls/20/requested_reviewers");
        return new Response(JSON.stringify(reviewersFixture), { status: 200 });
      },
    });
    expect(reviewers.users).toEqual([{ login: "hubot", id: 1 }]);
    expect(reviewers.teams).toEqual([{ slug: "platform", name: "Platform", id: 4 }]);

    const reviewComment = reviewCommentsFixture[0];
    const comment = await getPullRequestReviewComment({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      commentId: reviewComment.id,
      fetch: async (input) => {
        expect(String(input)).toBe(`https://api.github.com/repos/acme/app/pulls/comments/${reviewComment.id}`);
        return new Response(JSON.stringify(reviewComment), { status: 200 });
      },
    });
    expect((comment.comment as { providerCommentId: number }).providerCommentId).toBe(reviewComment.id);

    const listed = await listReviewCommentsForReview({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      pullNumber: 20,
      reviewId: 9,
      perPage: 10,
      page: 2,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/pulls/20/reviews/9/comments?per_page=10&page=2");
        return new Response(JSON.stringify(reviewCommentsFixture), { status: 200 });
      },
    });
    expect((listed.comments as unknown[]).length).toBe(reviewCommentsFixture.length);

    const issueComment = await getIssueComment({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      commentId: 15,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/issues/comments/15");
        return new Response(JSON.stringify({ id: 15, body: "hello", user: { login: "hubot" }, html_url: "https://github.com/acme/app", created_at: "2026-05-16T00:00:00Z" }), { status: 200 });
      },
    });
    expect((issueComment.comment as { body: string }).body).toBe("hello");

    const labels = await listIssueLabels({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      issueNumber: 3,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/issues/3/labels");
        return new Response(JSON.stringify(issueLabelsFixture), { status: 200 });
      },
    });
    expect((labels.labels as { name: string }[])[0].name).toBe("bug");

    const commitComment = await getCommitComment({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      commentId: 42,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/comments/42");
        return new Response(JSON.stringify(commitCommentFixture), { status: 200 });
      },
    });
    expect((commitComment.comment as { body: string }).body).toBe("nit: rename this");
  });

  test("actions variables are repository scoped and create skips an existing name", async () => {
    const got = await getActionsVariable({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      name: "DEPLOY_ENV",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/variables/DEPLOY_ENV");
        return new Response(JSON.stringify(variableFixture), { status: 200 });
      },
    });
    expect(got.variable).toEqual({ name: "DEPLOY_ENV", value: "staging", createdAt: "2026-05-16T12:00:00Z", updatedAt: "2026-05-16T12:30:00Z" });

    const skipped: string[] = [];
    const existing = await createActionsVariable({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      name: "DEPLOY_ENV",
      value: "staging",
      fetch: async (input, init) => {
        skipped.push(init?.method ?? "GET");
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/variables/DEPLOY_ENV");
        return new Response(JSON.stringify(variableFixture), { status: 200 });
      },
    });
    expect(skipped).toEqual(["GET"]);
    expect(existing.created).toBe(false);

    const createdCalls: { method: string; url: string; body: string }[] = [];
    const created = await createActionsVariable({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      name: "NEW_VAR",
      value: "1",
      fetch: async (input, init) => {
        createdCalls.push({ method: init?.method ?? "GET", url: String(input), body: String(init?.body ?? "") });
        if ((init?.method ?? "GET") === "GET") {
          return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
        }
        return new Response(JSON.stringify({ name: "NEW_VAR", value: "1", created_at: "2026-05-16T00:00:00Z", updated_at: "2026-05-16T00:00:00Z" }), { status: 201 });
      },
    });
    expect(createdCalls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET https://api.github.com/repos/acme/app/actions/variables/NEW_VAR",
      "POST https://api.github.com/repos/acme/app/actions/variables",
    ]);
    expect(createdCalls[1].body).toBe(JSON.stringify({ name: "NEW_VAR", value: "1" }));
    expect(created.created).toBe(true);

    let raceGets = 0;
    const raced = await createActionsVariable({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      name: "NEW_VAR",
      value: "1",
      fetch: async (input, init) => {
        const method = init?.method ?? "GET";
        if (method === "GET") {
          raceGets += 1;
          if (raceGets === 1) return new Response("", { status: 404 });
          return new Response(JSON.stringify(variableFixture), { status: 200 });
        }
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/variables");
        return new Response(JSON.stringify({ message: "Variable already exists" }), { status: 422 });
      },
    });
    expect(raceGets).toBe(2);
    expect(raced.created).toBe(false);
    expect(raced.variable?.name).toBe("DEPLOY_ENV");

    const patched = await updateActionsVariable({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      name: "DEPLOY_ENV",
      value: "prod",
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/variables/DEPLOY_ENV");
        expect(init?.method).toBe("PATCH");
        expect(JSON.parse(String(init?.body))).toEqual({ name: "DEPLOY_ENV", value: "prod" });
        return new Response("", { status: 204 });
      },
    });
    expect(patched.updated).toBe(true);
    expect(patched.value).toBe("prod");

    const removed = await deleteActionsVariable({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      name: "DEPLOY_ENV",
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/variables/DEPLOY_ENV");
        expect(init?.method).toBe("DELETE");
        return new Response("", { status: 204 });
      },
    });
    expect(removed.deleted).toBe(true);

    await expect(deleteActionsVariable({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      name: "MISSING",
      fetch: async () => new Response("", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Actions variable not found." });

    expect(() => createActionsVariable({ owner: "acme", repo: "app", name: "X" })).toThrow(/value is required/);
  });
});
