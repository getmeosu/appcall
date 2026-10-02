import { describe, expect, test } from "bun:test";
import workflowsListFixture from "../fixtures/workflows_list.json";
import workflowGetFixture from "../fixtures/workflow_get.json";
import runsListFixture from "../fixtures/workflow_runs_list.json";
import runGetFixture from "../fixtures/workflow_run_get.json";
import jobsListFixture from "../fixtures/workflow_jobs_list.json";
import jobGetFixture from "../fixtures/workflow_job_get.json";
import artifactsListFixture from "../fixtures/artifacts_list.json";
import artifactGetFixture from "../fixtures/artifact_get.json";
import {
  listWorkflows,
  getWorkflow,
  listWorkflowRuns,
  getWorkflowRun,
  cancelWorkflowRun,
  rerunWorkflowRun,
  dispatchWorkflow,
  listWorkflowJobs,
  getWorkflowJob,
  getWorkflowJobLogs,
  listArtifacts,
  getArtifact,
} from "../src/actions";
import {
  normalizeWorkflow,
  normalizeWorkflowRun,
  normalizeWorkflowJob,
  normalizeArtifact,
  validateListWorkflowsInput,
  validateGetWorkflowInput,
  validateListRunsInput,
  validateGetRunInput,
  validateCancelRunInput,
  validateRerunRunInput,
  validateDispatchWorkflowInput,
  validateListJobsInput,
  validateGetJobInput,
  validateGetJobLogsInput,
  validateListArtifactsInput,
  validateGetArtifactInput,
} from "../src/workflows";

describe("github S3 actions-workflows", () => {
  test("normalizes workflow/run/job/artifact fixtures", () => {
    const wf = normalizeWorkflow(workflowGetFixture as Record<string, unknown>);
    expect(wf.id).toBe("gh-workflow:161335");
    expect(wf.name).toBe("CI");
    const run = normalizeWorkflowRun(runGetFixture as Record<string, unknown>);
    expect(run.id).toBe("gh-run:30433642");
    expect(run.conclusion).toBe("success");
    const job = normalizeWorkflowJob(jobGetFixture as Record<string, unknown>);
    expect(job.id).toBe("gh-job:399444496");
    expect(job.name).toBe("build");
    const art = normalizeArtifact(artifactGetFixture as Record<string, unknown>);
    expect(art.id).toBe("gh-artifact:11");
    expect(art.name).toBe("coverage");
  });

  test("validates S3 inputs", () => {
    expect(validateListWorkflowsInput({ owner: "acme", repo: "app" }).owner).toBe("acme");
    expect(validateGetWorkflowInput({ owner: "acme", repo: "app", workflowId: "ci.yml" }).workflowId).toBe("ci.yml");
    expect(validateGetWorkflowInput({ owner: "acme", repo: "app", workflowId: 161335 }).workflowId).toBe("161335");
    expect(() => validateGetWorkflowInput({ owner: "acme", repo: "app" })).toThrow();
    expect(validateListRunsInput({ owner: "acme", repo: "app", branch: "main" }).branch).toBe("main");
    expect(validateGetRunInput({ owner: "acme", repo: "app", runId: 30433642 }).runId).toBe(30433642);
    expect(validateCancelRunInput({ owner: "acme", repo: "app", runId: 1 }).runId).toBe(1);
    expect(validateRerunRunInput({ owner: "acme", repo: "app", runId: 1, enableDebugLogging: true }).enableDebugLogging).toBe(true);
    expect(() => validateRerunRunInput({ owner: "acme", repo: "app", runId: 1, enableDebugLogging: "yes" })).toThrow();
    expect(validateDispatchWorkflowInput({ owner: "acme", repo: "app", workflowId: "ci.yml", ref: "main" }).ref).toBe("main");
    expect(() => validateDispatchWorkflowInput({ owner: "acme", repo: "app", workflowId: "ci.yml", ref: "main", inputs: { a: 1 } })).toThrow();
    expect(validateListJobsInput({ owner: "acme", repo: "app", runId: 1, filter: "latest" }).filter).toBe("latest");
    expect(() => validateListJobsInput({ owner: "acme", repo: "app", runId: 1, filter: "nope" })).toThrow();
    expect(validateGetJobInput({ owner: "acme", repo: "app", jobId: 9 }).jobId).toBe(9);
    expect(validateGetJobLogsInput({ owner: "acme", repo: "app", jobId: 9 }).jobId).toBe(9);
    expect(validateListArtifactsInput({ owner: "acme", repo: "app", runId: 1 }).runId).toBe(1);
    expect(validateGetArtifactInput({ owner: "acme", repo: "app", artifactId: 11 }).artifactId).toBe(11);
  });

  test("listWorkflows hits API", async () => {
    const validated = listWorkflows({ owner: "acme", repo: "app" });
    expect(validated.action).toBe("actions.workflows.list");
    const requests: Request[] = [];
    const result = await listWorkflows({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(workflowsListFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/actions/workflows");
    expect(requests[0].method).toBe("GET");
    expect((result.workflows as unknown[]).length).toBe(2);
    expect(result.totalCount).toBe(2);
  });

  test("getWorkflow by file name", async () => {
    const requests: Request[] = [];
    const result = await getWorkflow({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      workflowId: "ci.yml",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(workflowGetFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toContain("/actions/workflows/ci.yml");
    expect((result.workflow as Record<string, unknown>).name).toBe("CI");
  });

  test("listWorkflowRuns and getWorkflowRun", async () => {
    const listReqs: Request[] = [];
    const list = await listWorkflowRuns({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      branch: "main",
      fetch: async (input, init) => {
        listReqs.push(new Request(input, init));
        return new Response(JSON.stringify(runsListFixture), { status: 200 });
      },
    });
    expect(listReqs[0].url).toContain("/actions/runs?");
    expect(listReqs[0].url).toContain("branch=main");
    expect((list.runs as unknown[]).length).toBe(1);

    const getReqs: Request[] = [];
    const got = await getWorkflowRun({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      runId: 30433642,
      fetch: async (input, init) => {
        getReqs.push(new Request(input, init));
        return new Response(JSON.stringify(runGetFixture), { status: 200 });
      },
    });
    expect(getReqs[0].url).toBe("https://api.github.com/repos/acme/app/actions/runs/30433642");
    expect((got.run as Record<string, unknown>).runNumber).toBe(562);
  });

  test("cancelWorkflowRun and rerunWorkflowRun", async () => {
    const cancelReqs: Request[] = [];
    const cancelled = await cancelWorkflowRun({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      runId: 30433642,
      fetch: async (input, init) => {
        cancelReqs.push(new Request(input, init));
        return new Response(null, { status: 202 });
      },
    });
    expect(cancelReqs[0].method).toBe("POST");
    expect(cancelReqs[0].url).toContain("/actions/runs/30433642/cancel");
    expect(cancelled.cancelled).toBe(true);

    const rerunReqs: Request[] = [];
    const rerun = await rerunWorkflowRun({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      runId: 30433642,
      enableDebugLogging: true,
      fetch: async (input, init) => {
        rerunReqs.push(new Request(input, init));
        return new Response(null, { status: 201 });
      },
    });
    expect(rerunReqs[0].method).toBe("POST");
    expect(rerunReqs[0].url).toContain("/rerun");
    expect(JSON.parse(await rerunReqs[0].text()).enable_debug_logging).toBe(true);
    expect(rerun.rerun).toBe(true);
  });

  test("dispatchWorkflow posts ref and inputs", async () => {
    const requests: Request[] = [];
    const result = await dispatchWorkflow({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      workflowId: "deploy.yml",
      ref: "main",
      inputs: { env: "staging" },
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toContain("/actions/workflows/deploy.yml/dispatches");
    expect(JSON.parse(await requests[0].text())).toEqual({ ref: "main", inputs: { env: "staging" } });
    expect(result.dispatched).toBe(true);
    expect(result.ref).toBe("main");
  });

  test("listWorkflowJobs and getWorkflowJob", async () => {
    const listReqs: Request[] = [];
    const list = await listWorkflowJobs({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      runId: 30433642,
      fetch: async (input, init) => {
        listReqs.push(new Request(input, init));
        return new Response(JSON.stringify(jobsListFixture), { status: 200 });
      },
    });
    expect(listReqs[0].url).toBe("https://api.github.com/repos/acme/app/actions/runs/30433642/jobs");
    expect((list.jobs as unknown[]).length).toBe(1);

    const getReqs: Request[] = [];
    const got = await getWorkflowJob({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      jobId: 399444496,
      fetch: async (input, init) => {
        getReqs.push(new Request(input, init));
        return new Response(JSON.stringify(jobGetFixture), { status: 200 });
      },
    });
    expect(getReqs[0].url).toContain("/actions/jobs/399444496");
    expect((got.job as Record<string, unknown>).name).toBe("build");
  });

  test("getWorkflowJobLogs returns downloadUrl from 302 Location", async () => {
    const requests: Request[] = [];
    const result = await getWorkflowJobLogs({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      jobId: 399444496,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        expect(init?.redirect).toBe("manual");
        return new Response(null, {
          status: 302,
          headers: { Location: "https://pipelines.actions.githubusercontent.com/logs/abc" },
        });
      },
    });
    expect(requests[0].url).toContain("/actions/jobs/399444496/logs");
    expect((result.logs as Record<string, unknown>).downloadUrl).toBe(
      "https://pipelines.actions.githubusercontent.com/logs/abc",
    );
    expect((result.logs as Record<string, unknown>).expiresInSeconds).toBe(60);
  });

  test("listArtifacts and getArtifact", async () => {
    const listReqs: Request[] = [];
    const list = await listArtifacts({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      runId: 30433642,
      fetch: async (input, init) => {
        listReqs.push(new Request(input, init));
        return new Response(JSON.stringify(artifactsListFixture), { status: 200 });
      },
    });
    expect(listReqs[0].url).toBe("https://api.github.com/repos/acme/app/actions/runs/30433642/artifacts");
    expect((list.artifacts as unknown[]).length).toBe(1);

    const getReqs: Request[] = [];
    const got = await getArtifact({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      artifactId: 11,
      fetch: async (input, init) => {
        getReqs.push(new Request(input, init));
        return new Response(JSON.stringify(artifactGetFixture), { status: 200 });
      },
    });
    expect(getReqs[0].url).toContain("/actions/artifacts/11");
    expect((got.artifact as Record<string, unknown>).name).toBe("coverage");
  });
});
