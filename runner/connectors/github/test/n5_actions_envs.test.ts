import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import pendingFixture from "../fixtures/pending_deployments.json";
import approvalsFixture from "../fixtures/run_approvals.json";
import attemptFixture from "../fixtures/workflow_run_attempt.json";
import attemptJobsFixture from "../fixtures/workflow_attempt_jobs.json";
import environmentFixture from "../fixtures/environment.json";
import {
  listPendingDeployments,
  reviewPendingDeployments,
  listRunApprovals,
  createEnvironment,
  deleteDeployment,
  deleteEnvironment,
  disableWorkflow,
  enableWorkflow,
  deleteArtifact,
  getRunAttempt,
  listAttemptJobs,
  downloadAttemptLogs,
  forceCancelRun,
} from "../src/actions";
import {
  validateCreateEnvironmentInput,
  validateDeleteDeploymentInput,
  validateDeleteEnvironmentInput,
} from "../src/deployments";
import {
  validateReviewPendingDeploymentsInput,
  validateRunAttemptInput,
  validateForceCancelRunInput,
} from "../src/workflows";

const N5_READS = [
  "actions.runs.pending_deployments.list",
  "actions.runs.approvals.list",
  "actions.runs.attempt.get",
  "actions.runs.attempt.jobs.list",
  "actions.runs.attempt.logs.download",
] as const;

const N5_KEYS = [
  ...N5_READS,
  "actions.runs.pending_deployments.review",
  "environments.create",
  "deployments.delete",
  "environments.delete",
  "actions.workflows.disable",
  "actions.workflows.enable",
  "actions.artifacts.delete",
  "actions.runs.force_cancel",
] as const;

describe("github N5 actions environments", () => {
  test("manifest wires exactly the N5 effect policies", () => {
    expect(N5_KEYS).toHaveLength(13);
    expect(Object.keys(manifest.operations).length).toBe(296);
    for (const key of N5_READS) {
      const op = manifest.operations[key];
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
    const review = manifest.operations["actions.runs.pending_deployments.review"];
    expect(review.sideEffect).toBe("write");
    expect(review.effectPolicy).toBeUndefined();
    const force = manifest.operations["actions.runs.force_cancel"];
    expect(force.sideEffect).toBe("write");
    expect(force.effectPolicy).toBeUndefined();

    const created = manifest.operations["environments.create"];
    expect(created.effectPolicy).toBe("Reconcile");
    expect(created.reconcile).toBe("environments.get");
    const disable = manifest.operations["actions.workflows.disable"];
    expect(disable.effectPolicy).toBe("Reconcile");
    expect(disable.reconcile).toBe("actions.workflows.get");
    expect(disable.outputSchema.properties.state.enum).toEqual(["disabled_manually"]);
    const enable = manifest.operations["actions.workflows.enable"];
    expect(enable.effectPolicy).toBe("Reconcile");
    expect(enable.reconcile).toBe("actions.workflows.get");
    expect(enable.outputSchema.properties.state.enum).toEqual(["active"]);
    for (const key of ["deployments.delete", "environments.delete", "actions.artifacts.delete"] as const) {
      expect(manifest.operations[key].effectPolicy).toBe("Idempotent");
      expect(manifest.operations[key].reconcile).toBeUndefined();
    }
  });

  test("validates N5 inputs", () => {
    expect(validateRunAttemptInput({ owner: "acme", repo: "app", runId: 1, attemptNumber: 2 }).attemptNumber).toBe(2);
    expect(() => validateRunAttemptInput({ owner: "acme", repo: "app", runId: 1.5, attemptNumber: 1 })).toThrow(/runId/);
    expect(validateReviewPendingDeploymentsInput({
      owner: "acme", repo: "app", runId: 1, environmentIds: [9], state: "approved", comment: "ok",
    }).state).toBe("approved");
    expect(() => validateReviewPendingDeploymentsInput({
      owner: "acme", repo: "app", runId: 1, environmentIds: [], state: "approved", comment: "ok",
    })).toThrow(/environmentIds/);
    expect(validateCreateEnvironmentInput({
      owner: "acme", repo: "app", name: "production", waitTimer: 0, reviewers: [{ type: "User", id: 1 }],
    }).name).toBe("production");
    expect(() => validateCreateEnvironmentInput({ owner: "acme", repo: "app", name: "production", waitTimer: 43201 })).toThrow(/waitTimer/);
    expect(() => validateCreateEnvironmentInput({
      owner: "acme", repo: "app", name: "production", reviewers: [{ type: "Bot", id: 1 }],
    })).toThrow(/User or Team/);
    expect(validateDeleteDeploymentInput({ owner: "acme", repo: "app", deploymentId: 4 }).deploymentId).toBe(4);
    expect(validateDeleteEnvironmentInput({ owner: "acme", repo: "app", environment: "staging" }).name).toBe("staging");
    expect(validateForceCancelRunInput({ owner: "acme", repo: "app", runId: 7 }).runId).toBe(7);
  });

  test("lists pending deployments and surfaces a second review as 422", async () => {
    const listed = await listPendingDeployments({
      accessToken: "t", owner: "acme", repo: "app", runId: 30433642,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/runs/30433642/pending_deployments");
        return new Response(JSON.stringify(pendingFixture), { status: 200 });
      },
    });
    const pending = (listed.pendingDeployments as Array<Record<string, unknown>>)[0];
    expect(pending.environment).toBe("production");
    expect(pending.currentUserCanApprove).toBe(true);

    const requests: Request[] = [];
    const reviewed = await reviewPendingDeployments({
      accessToken: "t", owner: "acme", repo: "app", runId: 30433642,
      environmentIds: [161088068], state: "approved", comment: "ok",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(pendingFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("POST");
    expect(JSON.parse(await requests[0].text())).toEqual({
      environment_ids: [161088068], state: "approved", comment: "ok",
    });
    expect((reviewed.pendingDeployments as unknown[]).length).toBe(1);

    await expect(reviewPendingDeployments({
      accessToken: "t", owner: "acme", repo: "app", runId: 30433642,
      environmentIds: [161088068], state: "approved", comment: "again",
      fetch: async () => new Response(JSON.stringify({ message: "Invalid" }), { status: 422 }),
    })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: expect.stringMatching(/422/),
    });
  });

  test("lists run approvals", async () => {
    const listed = await listRunApprovals({
      accessToken: "t", owner: "acme", repo: "app", runId: 30433642,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/runs/30433642/approvals");
        return new Response(JSON.stringify(approvalsFixture), { status: 200 });
      },
    });
    const approval = (listed.approvals as Array<Record<string, unknown>>)[0];
    expect(approval.state).toBe("approved");
    expect(approval.user).toBe("octocat");
  });

  test("creates an environment and deletes deployment or environment idempotently", async () => {
    const requests: Request[] = [];
    const created = await createEnvironment({
      accessToken: "t", owner: "acme", repo: "app", name: "production",
      waitTimer: 30, preventSelfReview: true,
      reviewers: [{ type: "Team", id: 2 }],
      deploymentBranchPolicy: { protectedBranches: true, customBranchPolicies: false },
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(environmentFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/environments/production");
    expect(JSON.parse(await requests[0].text())).toEqual({
      wait_timer: 30,
      prevent_self_review: true,
      reviewers: [{ type: "Team", id: 2 }],
      deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
    });
    expect((created.environment as Record<string, unknown>).name).toBe("production");

    const deleted = await deleteDeployment({
      accessToken: "t", owner: "acme", repo: "app", deploymentId: 1,
      fetch: async (input, init) => {
        expect(new Request(input, init).method).toBe("DELETE");
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/deployments/1");
        return new Response(null, { status: 204 });
      },
    });
    expect(deleted.deleted).toBe(true);
    const missing = await deleteDeployment({
      accessToken: "t", owner: "acme", repo: "app", deploymentId: 2,
      fetch: async () => new Response("{}", { status: 404 }),
    });
    expect(missing.deleted).toBe(true);

    const envGone = await deleteEnvironment({
      accessToken: "t", owner: "acme", repo: "app", name: "staging",
      fetch: async () => new Response(null, { status: 404 }),
    });
    expect(envGone.deleted).toBe(true);
    expect(envGone.name).toBe("staging");
  });

  test("disables and enables a workflow with the observed state", async () => {
    const disabled = await disableWorkflow({
      accessToken: "t", owner: "acme", repo: "app", workflowId: "ci.yml",
      fetch: async (input, init) => {
        expect(new Request(input, init).method).toBe("PUT");
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/workflows/ci.yml/disable");
        return new Response(null, { status: 204 });
      },
    });
    expect(disabled.state).toBe("disabled_manually");
    const enabled = await enableWorkflow({
      accessToken: "t", owner: "acme", repo: "app", workflowId: 161335,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/workflows/161335/enable");
        return new Response(null, { status: 204 });
      },
    });
    expect(enabled.state).toBe("active");
  });

  test("deletes an artifact idempotently", async () => {
    const deleted = await deleteArtifact({
      accessToken: "t", owner: "acme", repo: "app", artifactId: 99,
      fetch: async (input, init) => {
        expect(new Request(input, init).method).toBe("DELETE");
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/artifacts/99");
        return new Response(null, { status: 204 });
      },
    });
    expect(deleted.deleted).toBe(true);
    const missing = await deleteArtifact({
      accessToken: "t", owner: "acme", repo: "app", artifactId: 100,
      fetch: async () => new Response("{}", { status: 404 }),
    });
    expect(missing.deleted).toBe(true);
  });

  test("reads a run attempt and its jobs", async () => {
    const attempt = await getRunAttempt({
      accessToken: "t", owner: "acme", repo: "app", runId: 30433642, attemptNumber: 2,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/runs/30433642/attempts/2");
        return new Response(JSON.stringify(attemptFixture), { status: 200 });
      },
    });
    expect((attempt.run as Record<string, unknown>).runAttempt).toBe(2);
    const jobs = await listAttemptJobs({
      accessToken: "t", owner: "acme", repo: "app", runId: 30433642, attemptNumber: 2,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/runs/30433642/attempts/2/jobs");
        return new Response(JSON.stringify(attemptJobsFixture), { status: 200 });
      },
    });
    expect(jobs.totalCount).toBe(1);
    expect(((jobs.jobs as Array<Record<string, unknown>>)[0]).name).toBe("build");
  });

  test("attempt log download captures the 302 and does not follow it", async () => {
    const seen: string[] = [];
    const logs = await downloadAttemptLogs({
      accessToken: "t", owner: "acme", repo: "app", runId: 30433642, attemptNumber: 2,
      fetch: async (input, init) => {
        seen.push(String(input));
        expect(init?.redirect).toBe("manual");
        return new Response(null, { status: 302, headers: { Location: "https://pipelines.actions.githubusercontent.com/attempt" } });
      },
    });
    expect(seen).toEqual(["https://api.github.com/repos/acme/app/actions/runs/30433642/attempts/2/logs"]);
    expect((logs.logs as Record<string, unknown>).downloadUrl).toBe("https://pipelines.actions.githubusercontent.com/attempt");
    expect((logs.logs as Record<string, unknown>).attemptNumber).toBe(2);
  });

  test("force cancel succeeds with 202 and does not hide a 409 after cancel already finished", async () => {
    const forced = await forceCancelRun({
      accessToken: "t", owner: "acme", repo: "app", runId: 30433642,
      fetch: async (input, init) => {
        expect(new Request(input, init).method).toBe("POST");
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/runs/30433642/force-cancel");
        return new Response("", { status: 202 });
      },
    });
    expect(forced.forced).toBe(true);
    expect(forced.runId).toBe(30433642);
    await expect(forceCancelRun({
      accessToken: "t", owner: "acme", repo: "app", runId: 30433642,
      fetch: async () => new Response(JSON.stringify({ message: "already cancelled" }), { status: 409 }),
    })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: expect.stringMatching(/409|already finished cancelling/),
    });
  });
});
