import { describe, expect, test } from "bun:test";
import deploymentFixture from "../fixtures/deployment.json";
import deploymentsListFixture from "../fixtures/deployments_list.json";
import deploymentStatusFixture from "../fixtures/deployment_status.json";
import environmentFixture from "../fixtures/environment.json";
import environmentsListFixture from "../fixtures/environments_list.json";
import releaseNotesFixture from "../fixtures/release_notes.json";
import releaseAssetFixture from "../fixtures/release_assets_list.json";
import {
  listDeployments,
  getDeployment,
  createDeployment,
  listDeploymentStatuses,
  createDeploymentStatus,
  listEnvironments,
  getEnvironment,
  downloadWorkflowRunLogs,
  downloadArtifact,
  rerunFailedWorkflowJobs,
  generateReleaseNotes,
  deleteRelease,
  getReleaseAsset,
  uploadReleaseAsset,
} from "../src/actions";
import { normalizeGitHubDeployment, validateCreateDeploymentStatusInput, validateGetDeploymentInput } from "../src/deployments";
import { validateUploadReleaseAssetInput, validateGenerateReleaseNotesInput } from "../src/releases";

const asset = (releaseAssetFixture as Array<Record<string, unknown>>)[0];

describe("github N1 deployments environments releases", () => {
  test("normalizes a deployment fixture", () => {
    const deployment = normalizeGitHubDeployment(deploymentFixture as never);
    expect(deployment.id).toBe("gh-deployment:1");
    expect(deployment.ref).toBe("main");
    expect(deployment.environment).toBe("production");
  });

  test("validates N1 inputs", () => {
    expect(validateGetDeploymentInput({ owner: "acme", repo: "app", ref: "main" }).ref).toBe("main");
    expect(() => validateGetDeploymentInput({ owner: "acme", repo: "app" })).toThrow(/deploymentId or ref/);
    expect(validateCreateDeploymentStatusInput({ owner: "acme", repo: "app", deploymentId: 1, state: "success" }).state).toBe("success");
    expect(() => validateCreateDeploymentStatusInput({ owner: "acme", repo: "app", deploymentId: 1, state: "nope" })).toThrow(/state/);
    expect(validateGenerateReleaseNotesInput({ owner: "acme", repo: "app", tagName: "v1.0.1" }).tagName).toBe("v1.0.1");
    expect(() => validateUploadReleaseAssetInput({ owner: "acme", repo: "app", releaseId: 1, name: "a.txt", contentType: "text/plain" })).toThrow(/content/);
    expect(validateUploadReleaseAssetInput({ owner: "acme", repo: "app", releaseId: 1, name: "a.txt", contentType: "text/plain", content: "hi" }).bytes.byteLength).toBe(2);
  });

  test("list and get deployments, including reconcile-by-ref", async () => {
    const listed = await listDeployments({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      ref: "main",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/deployments?ref=main");
        return new Response(JSON.stringify(deploymentsListFixture), { status: 200 });
      },
    });
    expect((listed.deployments as unknown[]).length).toBe(1);

    const got = await getDeployment({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      ref: "main",
      environment: "production",
      fetch: async (input) => {
        expect(String(input)).toContain("/repos/acme/app/deployments?");
        expect(String(input)).toContain("ref=main");
        expect(String(input)).toContain("environment=production");
        return new Response(JSON.stringify(deploymentsListFixture), { status: 200 });
      },
    });
    expect((got.deployment as Record<string, unknown>).providerDeploymentId).toBe(1);
  });

  test("create deployment posts ref and maps rate limit", async () => {
    const requests: Request[] = [];
    const created = await createDeployment({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      ref: "main",
      environment: "production",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(deploymentFixture), { status: 201 });
      },
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/deployments");
    expect(JSON.parse(await requests[0].text()).ref).toBe("main");
    expect((created.deployment as Record<string, unknown>).environment).toBe("production");

    await expect(createDeployment({
      accessToken: "t", owner: "acme", repo: "app", ref: "main",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "9" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });

  test("deployment statuses and environments", async () => {
    const created = await createDeploymentStatus({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      deploymentId: 1,
      state: "success",
      logUrl: "https://example.com/logs/1",
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/deployments/1/statuses");
        expect(new Request(input, init).method).toBe("POST");
        const body = JSON.parse(String(init?.body));
        expect(body.state).toBe("success");
        expect(body.log_url).toBe("https://example.com/logs/1");
        return new Response(JSON.stringify(deploymentStatusFixture), { status: 201 });
      },
    });
    expect((created.status as Record<string, unknown>).state).toBe("success");

    const listed = await listDeploymentStatuses({
      accessToken: "t", owner: "acme", repo: "app", deploymentId: 1,
      fetch: async () => new Response(JSON.stringify([deploymentStatusFixture]), { status: 200 }),
    });
    expect((listed.statuses as unknown[]).length).toBe(1);

    const envs = await listEnvironments({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/environments");
        return new Response(JSON.stringify(environmentsListFixture), { status: 200 });
      },
    });
    expect(envs.totalCount).toBe(1);

    const env = await getEnvironment({
      accessToken: "t", owner: "acme", repo: "app", name: "production",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/environments/production");
        return new Response(JSON.stringify(environmentFixture), { status: 200 });
      },
    });
    expect((env.environment as Record<string, unknown>).name).toBe("production");
  });

  test("downloads capture Location and do not follow it", async () => {
    const seen: string[] = [];
    const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(String(input));
      expect(init?.redirect).toBe("manual");
      return new Response(null, { status: 302, headers: { Location: "https://pipelines.actions.githubusercontent.com/short-lived" } });
    };
    const logs = await downloadWorkflowRunLogs({ accessToken: "t", owner: "acme", repo: "app", runId: 30433642, fetch: fetchFn });
    expect((logs.logs as Record<string, unknown>).downloadUrl).toBe("https://pipelines.actions.githubusercontent.com/short-lived");
    expect(seen).toEqual(["https://api.github.com/repos/acme/app/actions/runs/30433642/logs"]);

    seen.length = 0;
    const artifact = await downloadArtifact({ accessToken: "t", owner: "acme", repo: "app", artifactId: 99, fetch: fetchFn });
    expect((artifact.download as Record<string, unknown>).downloadUrl).toBe("https://pipelines.actions.githubusercontent.com/short-lived");
    expect(seen[0]).toBe("https://api.github.com/repos/acme/app/actions/artifacts/99/zip");
    expect(seen).toHaveLength(1);
  });

  test("rerun failed jobs and release notes delete asset upload", async () => {
    const rerun = await rerunFailedWorkflowJobs({
      accessToken: "t", owner: "acme", repo: "app", runId: 30433642,
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/runs/30433642/rerun-failed-jobs");
        expect(new Request(input, init).method).toBe("POST");
        return new Response("", { status: 201 });
      },
    });
    expect(rerun.rerun).toBe(true);

    const notes = await generateReleaseNotes({
      accessToken: "t", owner: "acme", repo: "app", tagName: "v1.0.1",
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/releases/generate-notes");
        expect(JSON.parse(String(init?.body)).tag_name).toBe("v1.0.1");
        return new Response(JSON.stringify(releaseNotesFixture), { status: 200 });
      },
    });
    expect(notes.name).toBe("v1.0.1");

    const deleted = await deleteRelease({
      accessToken: "t", owner: "acme", repo: "app", releaseId: 800000001,
      fetch: async (input, init) => {
        expect(new Request(input, init).method).toBe("DELETE");
        return new Response(null, { status: 204 });
      },
    });
    expect(deleted.deleted).toBe(true);

    const already = await deleteRelease({
      accessToken: "t", owner: "acme", repo: "app", releaseId: 2,
      fetch: async () => new Response("{}", { status: 404 }),
    });
    expect(already.deleted).toBe(true);

    const got = await getReleaseAsset({
      accessToken: "t", owner: "acme", repo: "app", releaseId: 800000001, name: "app-linux.tar.gz",
      fetch: async (input) => {
        expect(String(input)).toContain("/releases/800000001/assets");
        return new Response(JSON.stringify(releaseAssetFixture), { status: 200 });
      },
    });
    expect((got.asset as Record<string, unknown>).name).toBe("app-linux.tar.gz");

    const uploaded = await uploadReleaseAsset({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      releaseId: 800000001,
      name: "notes.txt",
      contentType: "text/plain",
      content: "hello",
      fetch: async (input, init) => {
        const url = String(input);
        expect(url.startsWith("https://uploads.github.com/repos/acme/app/releases/800000001/assets?")).toBe(true);
        expect(url).toContain("name=notes.txt");
        expect(init?.redirect).toBe("manual");
        expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("text/plain");
        return new Response(JSON.stringify(asset), { status: 201 });
      },
    });
    expect((uploaded.asset as Record<string, unknown>).name).toBe("app-linux.tar.gz");
  });
});
