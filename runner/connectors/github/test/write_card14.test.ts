import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  addOrgVariableRepository,
  deleteRunLogs,
  setOrgWorkflowPermissions,
  setOrgActionsPermissions,
  renderMarkdown,
  cancelPagesDeployment,
  createPagesDeployment,
  createPagesSite,
  deletePagesSite,
  requestPagesBuild,
} from "../src/actions";

const PATHS = {
  "actions.org_variables.repositories.add": "PUT /orgs/{org}/actions/variables/{name}/repositories/{repository_id}",
  "actions.runs.logs.delete": "DELETE /repos/{owner}/{repo}/actions/runs/{run_id}/logs",
  "orgs.actions.permissions.workflow.set": "PUT /orgs/{org}/actions/permissions/workflow",
  "orgs.actions.permissions.set": "PUT /orgs/{org}/actions/permissions",
  "markdown.render": "POST /markdown",
  "repos.pages.deployments.cancel": "POST /repos/{owner}/{repo}/pages/deployments/{pages_deployment_id}/cancel",
  "repos.pages.deployments.create": "POST /repos/{owner}/{repo}/pages/deployments",
  "repos.pages.create": "POST /repos/{owner}/{repo}/pages",
  "repos.pages.delete": "DELETE /repos/{owner}/{repo}/pages",
  "repos.pages.builds.request": "POST /repos/{owner}/{repo}/pages/builds",
} as const;

const OMIT = [
  "actions.org_variables.repositories.add",
  "actions.runs.logs.delete",
  "repos.pages.deployments.cancel",
  "repos.pages.deployments.create",
  "repos.pages.create",
  "repos.pages.delete",
  "repos.pages.builds.request",
] as const;

const RECONCILE = {
  "orgs.actions.permissions.workflow.set": "orgs.actions.permissions.workflow.get",
  "orgs.actions.permissions.set": "orgs.actions.permissions.get",
} as const;

function empty(status: number) {
  return new Response("", { status });
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function html(status: number, body: string) {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

describe("github write card 14 org permissions pages markdown writes", () => {
  test("version is 0.76.0 at 782 ops with the write breakdown", () => {
    expect(manifest.version).toBe("0.76.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(782);
    const kinds = { action: 0, sync: 0, webhook: 0 };
    const side = { read: 0, write: 0, absent: 0 };
    for (const op of Object.values(ops)) {
      kinds[op.kind as keyof typeof kinds] += 1;
      if (op.kind === "action") {
        if (op.sideEffect === "read") side.read += 1;
        else if (op.sideEffect === "write") side.write += 1;
        else side.absent += 1;
      }
    }
    expect(kinds).toEqual({ action: 732, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 388, write: 329, absent: 15 });
    for (const [key, path] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(String(op.description)).toContain(path);
      expect(op.kind).toBe("action");
      if (key === "markdown.render") {
        expect(op.sideEffect).toBe("read");
        expect(op.effectPolicy).toBeUndefined();
        expect(op.reconcile).toBeUndefined();
        expect(op.effect).toBeUndefined();
      } else {
        expect(op.sideEffect).toBe("write");
      }
    }
    for (const key of OMIT) {
      const op = ops[key];
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
    }
    for (const [key, observe] of Object.entries(RECONCILE)) {
      expect(ops[key].effectPolicy).toBe("Reconcile");
      expect(ops[key].reconcile).toBe(observe);
      expect(ops[key].effect).toBeUndefined();
    }
    expect(String(ops["orgs.actions.permissions.workflow.get"].description)).toContain(
      "GET /orgs/{org}/actions/permissions/workflow",
    );
    expect(String(ops["orgs.actions.permissions.get"].description)).toContain(
      "GET /orgs/{org}/actions/permissions",
    );
    expect(ops["classroom"]).toBeUndefined();
  });

  test("writes use the documented method and path and a 404 is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number, body?: unknown) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      if (body === undefined) return empty(status);
      if (typeof body === "string") return html(status, body);
      return json(status, body);
    };

    const added = await addOrgVariableRepository({
      accessToken: token, org: "acme", name: "TOKEN", repositoryId: 42, fetch: fetchOf(204),
    });
    expect(added).toMatchObject({ action: "actions.org_variables.repositories.add", added: true, repositoryId: 42 });
    expect(calls.at(-1)).toContain("PUT https://api.github.com/orgs/acme/actions/variables/TOKEN/repositories/42");

    const deletedLogs = await deleteRunLogs({
      accessToken: token, owner: "acme", repo: "app", runId: 9, fetch: fetchOf(204),
    });
    expect(deletedLogs).toMatchObject({ action: "actions.runs.logs.delete", deleted: true, runId: 9 });
    expect(calls.at(-1)).toContain("DELETE https://api.github.com/repos/acme/app/actions/runs/9/logs");

    const workflow = await setOrgWorkflowPermissions({
      accessToken: token,
      org: "acme",
      defaultWorkflowPermissions: "read",
      canApprovePullRequestReviews: true,
      fetch: fetchOf(204),
    });
    expect(workflow).toMatchObject({
      action: "orgs.actions.permissions.workflow.set",
      permissions: { defaultWorkflowPermissions: "read", canApprovePullRequestReviews: true },
    });
    expect(calls.at(-1)).toContain("PUT https://api.github.com/orgs/acme/actions/permissions/workflow");
    expect(calls.at(-1)).toContain(JSON.stringify({
      default_workflow_permissions: "read",
      can_approve_pull_request_reviews: true,
    }));

    const actions = await setOrgActionsPermissions({
      accessToken: token,
      org: "acme",
      enabledRepositories: "all",
      allowedActions: "selected",
      shaPinningRequired: true,
      fetch: fetchOf(204),
    });
    expect(actions).toMatchObject({
      action: "orgs.actions.permissions.set",
      permissions: { enabledRepositories: "all", allowedActions: "selected", shaPinningRequired: true },
    });
    expect(calls.at(-1)).toContain("PUT https://api.github.com/orgs/acme/actions/permissions");

    const rendered = await renderMarkdown({
      accessToken: token, text: "Hello **world**", mode: "gfm", context: "acme/app", fetch: fetchOf(200, "<p>Hello <strong>world</strong></p>"),
    });
    expect(rendered).toMatchObject({ action: "markdown.render", html: "<p>Hello <strong>world</strong></p>" });
    expect(calls.at(-1)).toContain("POST https://api.github.com/markdown");
    expect(calls.at(-1)).toContain(JSON.stringify({ text: "Hello **world**", mode: "gfm", context: "acme/app" }));

    const cancelled = await cancelPagesDeployment({
      accessToken: token, owner: "acme", repo: "app", pagesDeploymentId: "abc123", fetch: fetchOf(204),
    });
    expect(cancelled).toMatchObject({ action: "repos.pages.deployments.cancel", cancelled: true, pagesDeploymentId: "abc123" });
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/pages/deployments/abc123/cancel");

    const deployment = { id: 1, status_url: "https://api.github.com/status", page_url: "https://acme.github.io/app" };
    const createdDeployment = await createPagesDeployment({
      accessToken: token,
      owner: "acme",
      repo: "app",
      artifactUrl: "https://example.com/site.zip",
      pagesBuildVersion: "deadbeef",
      oidcToken: "oidc-token",
      fetch: fetchOf(200, deployment),
    });
    expect(createdDeployment.deployment).toEqual(deployment);
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/pages/deployments");

    const pages = { url: "https://api.github.com/repos/acme/app/pages", status: "built" };
    const createdPages = await createPagesSite({
      accessToken: token,
      owner: "acme",
      repo: "app",
      buildType: "legacy",
      source: { branch: "main", path: "/docs" },
      fetch: fetchOf(201, pages),
    });
    expect(createdPages.pages).toEqual(pages);
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/pages");

    const deletedPages = await deletePagesSite({
      accessToken: token, owner: "acme", repo: "app", fetch: fetchOf(204),
    });
    expect(deletedPages).toMatchObject({ action: "repos.pages.delete", deleted: true });
    expect(calls.at(-1)).toContain("DELETE https://api.github.com/repos/acme/app/pages");

    const build = { url: "https://api.github.com/repos/acme/app/pages/builds/1", status: "queued" };
    const requested = await requestPagesBuild({
      accessToken: token, owner: "acme", repo: "app", fetch: fetchOf(201, build),
    });
    expect(requested.build).toEqual(build);
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/pages/builds");

    await expect(deleteRunLogs({
      accessToken: token, owner: "acme", repo: "app", runId: 9, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(deletePagesSite({
      accessToken: token, owner: "acme", repo: "missing", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(cancelPagesDeployment({
      accessToken: token, owner: "acme", repo: "app", pagesDeploymentId: "missing", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation rejects bad input without a token", () => {
    expect(() => addOrgVariableRepository({ org: "acme", name: "TOKEN" } as never)).toThrow();
    expect(() => setOrgWorkflowPermissions({ org: "acme", defaultWorkflowPermissions: "admin", canApprovePullRequestReviews: true } as never)).toThrow();
    expect(() => createPagesDeployment({ owner: "acme", repo: "app", pagesBuildVersion: "x", oidcToken: "y" } as never)).toThrow();
    expect(deletePagesSite({ owner: "acme", repo: "app" })).toMatchObject({
      action: "repos.pages.delete", validated: { owner: "acme", repo: "app" },
    });
    expect(renderMarkdown({ text: "hi" })).toMatchObject({
      action: "markdown.render", validated: { text: "hi" },
    });
  });
});
