import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  mergeUpstream,
  renameBranch,
  mergeBranches,
  updatePullRequestReview,
  listCodeownersErrors,
  compareDependencyGraph,
  listCodeScanningAlertInstances,
  listCodeScanningAnalyses,
  getCodeScanningAnalysis,
  getDeploymentStatus,
  listCheckRunsForSuite,
} from "../src/actions";

const READS = [
  "repos.codeowners.errors.list",
  "dependency_graph.compare",
  "code_scanning.alerts.instances.list",
  "code_scanning.analyses.list",
  "code_scanning.analyses.get",
  "deployments.statuses.get",
  "checks.runs.list_for_suite",
] as const;

describe("github N10 fork sync and scan", () => {
  test("manifest keeps the base version and the N10 effect policies", () => {
    expect(manifest.version).toBe("0.24.0");
    expect(Object.keys(manifest.operations).length).toBe(251);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
    for (const key of ["repos.merge_upstream", "branches.rename"] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
    const review = manifest.operations["pull_requests.reviews.update"] as Record<string, unknown>;
    expect(review.effectPolicy).toBe("Reconcile");
    expect(review.reconcile).toBe("pull_requests.reviews.get");
    const merges = manifest.operations["repos.merges"] as Record<string, unknown>;
    expect(merges.effectPolicy).toBe("Idempotent");
    expect(merges.reconcile).toBe("repos.compare");
    expect(manifest.operations["repos.merge_upstream"].description).toContain("branches.get");
    expect(manifest.operations["repos.merge_upstream"].description).toContain("grouped with branches, not forks");
    expect(manifest.operations["actions.runs.delete"]).toBeDefined();
    expect(Object.keys(manifest.operations).filter((key) => key === "actions.runs.delete")).toEqual(["actions.runs.delete"]);
  });

  test("merge upstream is one shot and does not treat 409 as success", async () => {
    const calls: string[] = [];
    const synced = await mergeUpstream({
      accessToken: "t",
      owner: "acme",
      repo: "fork",
      branch: "feature/x",
      fetch: async (input, init) => {
        const method = init?.method ?? "GET";
        calls.push(`${method} ${String(input)}`);
        if (method === "POST") {
          expect(String(init?.body)).toBe(JSON.stringify({ branch: "feature/x" }));
          return new Response(JSON.stringify({ message: "Successfully fetched and fast-forwarded from upstream.", merge_type: "fast-forward", base_branch: "main" }), { status: 200 });
        }
        expect(String(input)).toBe("https://api.github.com/repos/acme/fork/branches/feature%2Fx");
        return new Response(JSON.stringify({ name: "feature/x", commit: { sha: "abc123", url: "" }, protected: false }), { status: 200 });
      },
    });
    expect(calls).toEqual([
      "POST https://api.github.com/repos/acme/fork/merge-upstream",
      "GET https://api.github.com/repos/acme/fork/branches/feature%2Fx",
    ]);
    expect(synced.synced).toBe(true);
    expect(synced.mergeType).toBe("fast-forward");
    expect(synced.sha).toBe("abc123");

    const conflictCalls: string[] = [];
    await expect(mergeUpstream({
      accessToken: "t",
      owner: "acme",
      repo: "fork",
      branch: "main",
      fetch: async (input, init) => {
        conflictCalls.push(init?.method ?? "GET");
        return new Response(JSON.stringify({ message: "Merge conflict" }), { status: 409 });
      },
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Merge conflict. A conflict does not converge." });
    expect(conflictCalls).toEqual(["POST"]);

    await expect(mergeUpstream({
      accessToken: "t",
      owner: "acme",
      repo: "fork",
      branch: "main",
      fetch: async () => new Response("", { status: 422 }),
    })).rejects.toMatchObject({ message: "The branch could not be synced." });
  });

  test("branch rename 404 is not a no-op and the new-name read stays in the handler", async () => {
    const calls: string[] = [];
    const renamed = await renameBranch({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      branch: "old",
      newName: "new/name",
      fetch: async (input, init) => {
        const method = init?.method ?? "GET";
        calls.push(`${method} ${String(input)} ${String(init?.body ?? "")}`);
        if (method === "POST") {
          return new Response(JSON.stringify({ name: "new/name", commit: { sha: "def456", url: "" }, protected: false }), { status: 201 });
        }
        return new Response(JSON.stringify({ name: "new/name", commit: { sha: "def456", url: "" }, protected: false }), { status: 200 });
      },
    });
    expect(calls[0]).toContain("POST https://api.github.com/repos/acme/app/branches/old/rename");
    expect(calls[0]).toContain(JSON.stringify({ new_name: "new/name" }));
    expect(calls[1]).toContain("GET https://api.github.com/repos/acme/app/branches/new%2Fname");
    expect(renamed.renamed).toBe(true);
    expect(renamed.name).toBe("new/name");
    expect(renamed.sha).toBe("def456");

    const missing: string[] = [];
    await expect(renameBranch({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      branch: "old",
      newName: "again",
      fetch: async (_input, init) => {
        missing.push(init?.method ?? "GET");
        return new Response("", { status: 404 });
      },
    })).rejects.toMatchObject({ message: "Branch not found." });
    expect(missing).toEqual(["POST"]);
  });

  test("repos.merges treats 204 as already merged and does not retry 409", async () => {
    const created = await mergeBranches({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      base: "main",
      head: "feature",
      commitMessage: "ship it",
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/merges");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ base: "main", head: "feature", commit_message: "ship it" });
        return new Response(JSON.stringify({ sha: "aaa111" }), { status: 201 });
      },
    });
    expect(created.created).toBe(true);
    expect(created.sha).toBe("aaa111");

    const repeat = await mergeBranches({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      base: "main",
      head: "feature",
      fetch: async (_input, init) => {
        expect(JSON.parse(String(init?.body))).toEqual({ base: "main", head: "feature" });
        return new Response("", { status: 204 });
      },
    });
    expect(repeat.created).toBe(false);
    expect(repeat.sha).toBe("");
    expect(repeat.merged).toBe(true);

    const calls: string[] = [];
    await expect(mergeBranches({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      base: "main",
      head: "feature",
      fetch: async (_input, init) => {
        calls.push(init?.method ?? "GET");
        return new Response("", { status: 409 });
      },
    })).rejects.toMatchObject({ message: "Merge conflict." });
    expect(calls).toEqual(["POST"]);
  });

  test("review update stops on 422 and reconciles through reviews.get inputs", async () => {
    const updated = await updatePullRequestReview({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      pullNumber: 7,
      reviewId: 9,
      body: "still pending",
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/pulls/7/reviews/9");
        expect(init?.method).toBe("PUT");
        expect(JSON.parse(String(init?.body))).toEqual({ body: "still pending" });
        return new Response(JSON.stringify({ id: 9, state: "PENDING", body: "still pending", user: { login: "octo" }, html_url: "https://github.com/acme/app/pull/7#pullrequestreview-9" }), { status: 200 });
      },
    });
    expect((updated.review as { state: string }).state).toBe("PENDING");

    const calls: string[] = [];
    await expect(updatePullRequestReview({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      pullNumber: 7,
      reviewId: 9,
      body: "too late",
      fetch: async (_input, init) => {
        calls.push(init?.method ?? "GET");
        return new Response("", { status: 422 });
      },
    })).rejects.toMatchObject({ message: "Review is not pending." });
    expect(calls).toEqual(["PUT"]);
  });

  test("reads use the documented paths and do not invent a second identity", async () => {
    const errors = await listCodeownersErrors({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      ref: "main",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/codeowners/errors?ref=main");
        return new Response(JSON.stringify({ errors: [{ line: 3, column: 1, kind: "Invalid owner", source: "* @nope", suggestion: null, message: "bad", path: ".github/CODEOWNERS" }] }), { status: 200 });
      },
    });
    expect(errors.errors).toEqual([{ line: 3, column: 1, kind: "Invalid owner", source: "* @nope", suggestion: "", message: "bad", path: ".github/CODEOWNERS" }]);

    const changes = await compareDependencyGraph({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      base: "main",
      head: "feature",
      name: "package.json",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/dependency-graph/compare/main...feature?name=package.json");
        return new Response(JSON.stringify([{ change_type: "added", manifest: "package.json", ecosystem: "npm", name: "left-pad", version: "1.0.0", package_url: "pkg:npm/left-pad@1.0.0", license: "MIT", scope: "runtime" }]), { status: 200 });
      },
    });
    expect(changes.changes[0]).toMatchObject({ changeType: "added", name: "left-pad", version: "1.0.0" });

    const instances = await listCodeScanningAlertInstances({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      alertNumber: 4,
      perPage: 5,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/code-scanning/alerts/4/instances?per_page=5");
        return new Response(JSON.stringify([{ ref: "refs/heads/main", analysis_key: "k", environment: "prod", category: "/", state: "open", commit_sha: "abc", message: { text: "hi" }, location: { path: "a.ts", start_line: 1, end_line: 2 }, html_url: "https://github.com/acme/app/security/code-scanning/4" }]), { status: 200 });
      },
    });
    expect(instances.instances[0]).toMatchObject({ ref: "refs/heads/main", path: "a.ts", message: "hi" });

    const analyses = await listCodeScanningAnalyses({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      ref: "refs/heads/main",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/code-scanning/analyses?ref=refs%2Fheads%2Fmain");
        return new Response(JSON.stringify([{ id: 42, ref: "refs/heads/main", commit_sha: "abc", analysis_key: "k", environment: "{}", tool_name: "should-not-be-identity", tool: { name: "CodeQL", version: "2.0.0", guid: "g" }, results_count: 1, rules_count: 2, url: "u", sarif_id: "s", deletable: true, warning: "" }]), { status: 200 });
      },
    });
    expect(analyses.analyses[0]).toMatchObject({ id: 42, tool: { name: "CodeQL", version: "2.0.0", guid: "g" } });
    expect(analyses.analyses[0]).not.toHaveProperty("toolName");
    expect(analyses.analyses[0]).not.toHaveProperty("tool_name");

    const analysis = await getCodeScanningAnalysis({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      analysisId: 42,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/code-scanning/analyses/42");
        return new Response(JSON.stringify({ id: 42, ref: "refs/heads/main", commit_sha: "abc", tool: { name: "CodeQL", version: null, guid: null }, results_count: 1, rules_count: 0 }), { status: 200 });
      },
    });
    expect((analysis.analysis as { id: number; tool: { name: string } }).tool.name).toBe("CodeQL");

    const status = await getDeploymentStatus({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      deploymentId: 3,
      statusId: 8,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/deployments/3/statuses/8");
        return new Response(JSON.stringify({ id: 8, state: "success", environment: "production", log_url: "https://example.com/log", created_at: "", updated_at: "" }), { status: 200 });
      },
    });
    expect((status.status as { state: string; providerStatusId: number }).state).toBe("success");
    expect((status.status as { providerStatusId: number }).providerStatusId).toBe(8);

    const runs = await listCheckRunsForSuite({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      checkSuiteId: 11,
      checkName: "ci",
      perPage: 2,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/check-suites/11/check-runs?check_name=ci&per_page=2");
        return new Response(JSON.stringify({ total_count: 1, check_runs: [{ id: 5, name: "ci", status: "completed", conclusion: "success", head_sha: "abc" }] }), { status: 200 });
      },
    });
    expect(runs.totalCount).toBe(1);
    expect(runs.checkRuns).toMatchObject([{ id: 5, name: "ci", headSha: "abc" }]);
  });
});
