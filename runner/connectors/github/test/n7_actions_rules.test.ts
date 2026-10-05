import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import jobFixture from "../fixtures/workflow_job_get.json";
import runFixture from "../fixtures/workflow_run_get.json";
import runsFixture from "../fixtures/workflow_runs_list.json";
import gitCommitFixture from "../fixtures/get_git_commit.json";
import {
  listRunsForWorkflow,
  listWorkflowRuns,
  listCaches,
  deleteCache,
  deleteCachesByKey,
  rerunJob,
  deleteRun,
  approveRun,
  listRuleSuites,
  getRuleSuite,
  getRepoRuleset,
  listCommitPulls,
  listBranchesWhereHead,
  getGitCommit,
} from "../src/actions";

const N7_READS = [
  "actions.workflows.runs.list",
  "actions.caches.list",
  "repos.rule_suites.list",
  "repos.rule_suites.get",
  "repos.rulesets.get",
  "commits.pulls.list",
  "commits.branches_where_head.list",
  "git.commits.get",
] as const;

describe("github N7 actions rules", () => {
  test("manifest is v0.54.0 with 570 ops and the N7 policies", () => {
    expect(manifest.version).toBe("0.54.0");
    expect(Object.keys(manifest.operations).length).toBe(570);
    for (const key of N7_READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
    for (const key of ["actions.jobs.rerun", "actions.runs.approve"] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(String(op.description)).toContain("not a retry key");
      expect(String(op.description)).toContain("not desired state");
    }
    expect(manifest.operations["actions.caches.delete"].effectPolicy).toBe("Idempotent");
    expect(manifest.operations["actions.caches.delete"].reconcile).toBe("actions.caches.list");
    expect(manifest.operations["actions.caches.delete_by_key"].effectPolicy).toBe("Idempotent");
    expect(manifest.operations["actions.caches.delete_by_key"].reconcile).toBe("actions.caches.list");
    expect(manifest.operations["actions.runs.delete"].effectPolicy).toBe("Idempotent");
    expect(manifest.operations["actions.runs.delete"].reconcile).toBe("actions.runs.get");
    expect(String(manifest.operations["actions.runs.delete"].description)).toContain("artifacts");
    expect(manifest.operations["actions.runs.list"].inputSchema.properties.workflowId).toBeUndefined();
    expect(manifest.operations["actions.runs.rerun"].effectPolicy).toBe("Reconcile");
    expect(manifest.operations["actions.runs.rerun_failed"].effectPolicy).toBe("Reconcile");
    expect(manifest.operations["actions.runs.pending_deployments.review"].effectPolicy).toBeUndefined();
    expect(manifest.operations["contents.put"]).toBeUndefined();
    expect(manifest.operations["contents.delete"]).toBeUndefined();
    expect(manifest.operations["contents.push_files"]).toBeUndefined();
    expect(manifest.operations["repos.delete"]).toBeDefined();
    expect(manifest.operations["repos.rulesets.create"]).toBeUndefined();
  });

  test("workflow runs list is a separate op and job rerun pre-checks without treating 403 as success", async () => {
    const listed = await listRunsForWorkflow({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      workflowId: "ci.yml",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/workflows/ci.yml/runs");
        return new Response(JSON.stringify(runsFixture), { status: 200 });
      },
    });
    expect(listed.totalCount).toBe(1);

    const calls: { url: string; method: string }[] = [];
    await listWorkflowRuns({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      workflowId: "ci.yml",
      fetch: async (input, init) => {
        calls.push({ url: String(input), method: init?.method ?? "GET" });
        return new Response(JSON.stringify(runsFixture), { status: 200 });
      },
    });
    expect(calls).toEqual([{ url: "https://api.github.com/repos/acme/app/actions/runs", method: "GET" }]);

    const rerunCalls: { url: string; method: string }[] = [];
    const rerun = await rerunJob({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      jobId: 399444496,
      fetch: async (input, init) => {
        rerunCalls.push({ url: String(input), method: init?.method ?? "GET" });
        if ((init?.method ?? "GET") === "GET") return new Response(JSON.stringify(jobFixture), { status: 200 });
        return new Response("", { status: 201 });
      },
    });
    expect(rerun.rerun).toBe(true);
    expect(rerunCalls.map((call) => call.method)).toEqual(["GET", "POST"]);
    expect(rerunCalls[1].url).toBe("https://api.github.com/repos/acme/app/actions/jobs/399444496/rerun");

    const repeatCalls: string[] = [];
    await expect(rerunJob({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      jobId: 7,
      fetch: async (input, init) => {
        repeatCalls.push(init?.method ?? "GET");
        if ((init?.method ?? "GET") === "GET") return new Response(JSON.stringify(jobFixture), { status: 200 });
        return new Response("", { status: 403 });
      },
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    expect(repeatCalls).toEqual(["GET", "POST"]);

    const missing: string[] = [];
    await expect(rerunJob({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      jobId: 8,
      fetch: async (_input, init) => {
        missing.push(init?.method ?? "GET");
        return new Response("", { status: 404 });
      },
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Workflow job not found." });
    expect(missing).toEqual(["GET"]);
  });

  test("approve pre-checks the run and cache deletes stay idempotent", async () => {
    const calls: string[] = [];
    const approved = await approveRun({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      runId: 30433642,
      fetch: async (input, init) => {
        calls.push(`${init?.method ?? "GET"} ${String(input)}`);
        if ((init?.method ?? "GET") === "GET") return new Response(JSON.stringify(runFixture), { status: 200 });
        return new Response("", { status: 201 });
      },
    });
    expect(approved.approved).toBe(true);
    expect(calls[0]).toContain("/actions/runs/30433642");
    expect(calls[1]).toBe("POST https://api.github.com/repos/acme/app/actions/runs/30433642/approve");

    const caches = await listCaches({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      key: "linux-npm",
      ref: "refs/heads/main",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/caches?key=linux-npm&ref=refs%2Fheads%2Fmain");
        return new Response(JSON.stringify({
          total_count: 1,
          actions_caches: [{ id: 9, ref: "refs/heads/main", key: "linux-npm", version: "v", size_in_bytes: 4, created_at: "t", last_accessed_at: "t" }],
        }), { status: 200 });
      },
    });
    expect(caches.totalCount).toBe(1);

    const deleted = await deleteCache({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      cacheId: 9,
      fetch: async (input, init) => {
        expect(init?.method).toBe("DELETE");
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/caches/9");
        return new Response("", { status: 204 });
      },
    });
    expect(deleted.deleted).toBe(true);

    await expect(deleteCache({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      cacheId: 9,
      fetch: async () => new Response("", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Actions cache not found." });

    const byKey = await deleteCachesByKey({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      key: "linux-npm",
      ref: "refs/heads/main",
      fetch: async (input, init) => {
        expect(init?.method).toBe("DELETE");
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/caches?key=linux-npm&ref=refs%2Fheads%2Fmain");
        return new Response(JSON.stringify({ total_count: 1, actions_caches: [{ id: 9, key: "linux-npm", ref: "refs/heads/main" }] }), { status: 200 });
      },
    });
    expect(byKey.totalCount).toBe(1);

    const run = await deleteRun({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      runId: 30433642,
      fetch: async (input, init) => {
        expect(init?.method).toBe("DELETE");
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/runs/30433642");
        return new Response("", { status: 204 });
      },
    });
    expect(run.deleted).toBe(true);
  });

  test("rule suite, ruleset, commit pulls, branches, and git commit reads hit their paths", async () => {
    const suites = await listRuleSuites({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/rulesets/rule-suites");
        return new Response(JSON.stringify([{ id: 3, actor_name: "octo", ref: "refs/heads/main", result: "pass" }]), { status: 200 });
      },
    });
    expect((suites.ruleSuites as { ruleSuiteId: number }[])[0].ruleSuiteId).toBe(3);

    const suite = await getRuleSuite({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      ruleSuiteId: 3,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/rulesets/rule-suites/3");
        return new Response(JSON.stringify({ id: 3, result: "pass" }), { status: 200 });
      },
    });
    expect((suite.ruleSuite as { result: string }).result).toBe("pass");

    const ruleset = await getRepoRuleset({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      rulesetId: 21,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/rulesets/21");
        return new Response(JSON.stringify({ id: 21, name: "protect-main", target: "branch", enforcement: "active", rules: [{ type: "deletion" }] }), { status: 200 });
      },
    });
    expect((ruleset.ruleset as { name: string; rules: unknown[] }).name).toBe("protect-main");
    expect((ruleset.ruleset as { rules: unknown[] }).rules).toHaveLength(1);

    const pulls = await listCommitPulls({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      commitSha: "abc123",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/commits/abc123/pulls");
        return new Response(JSON.stringify([{ id: 1, number: 4, title: "fix" }]), { status: 200 });
      },
    });
    expect((pulls.pullRequests as { number: number }[])[0].number).toBe(4);

    const branches = await listBranchesWhereHead({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      commitSha: "abc123",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/commits/abc123/branches-where-head");
        return new Response(JSON.stringify([{ name: "main", commit: { sha: "abc123" }, protected: true }]), { status: 200 });
      },
    });
    expect((branches.branches as { name: string }[])[0].name).toBe("main");

    const commit = await getGitCommit({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      commitSha: "abc123def456abc123def456abc123def456abc1",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/git/commits/abc123def456abc123def456abc123def456abc1");
        return new Response(JSON.stringify(gitCommitFixture), { status: 200 });
      },
    });
    expect((commit.commit as { sha: string; message: string }).message).toBe("prior");
    expect(commit.action).toBe("git.commits.get");
  });
});
