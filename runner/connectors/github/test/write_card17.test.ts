import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  createUserProjectField,
  createUserProjectItem,
  createUserProjectDraft,
  createUserProjectView,
  deleteAutolink,
  deleteCodeScanningAnalysis,
  deleteUserPackage,
  removeRunnerLabel,
  testRepoHook,
  updateCodeScanningDefaultSetup,
  updateOrgHookConfig,
  updateRepoHookConfig,
  updateUserProjectItem,
} from "../src/actions";

const PATHS = {
  "users.projects_v2.fields.create": "POST /users/{username}/projectsV2/{project_number}/fields",
  "users.projects_v2.items.create": "POST /users/{username}/projectsV2/{project_number}/items",
  "users.projects_v2.drafts.create": "POST /user/{user_id}/projectsV2/{project_number}/drafts",
  "users.projects_v2.views.create": "POST /users/{username}/projectsV2/{project_number}/views",
  "repos.autolinks.delete": "DELETE /repos/{owner}/{repo}/autolinks/{autolink_id}",
  "code_scanning.analyses.delete": "DELETE /repos/{owner}/{repo}/code-scanning/analyses/{analysis_id}",
  "users.packages.delete": "DELETE /users/{username}/packages/{package_type}/{package_name}",
  "repos.actions.runners.labels.remove": "DELETE /repos/{owner}/{repo}/actions/runners/{runner_id}/labels/{name}",
  "repos.hooks.test": "POST /repos/{owner}/{repo}/hooks/{hook_id}/tests",
  "code_scanning.default_setup.update": "PATCH /repos/{owner}/{repo}/code-scanning/default-setup",
  "orgs.hooks.config.update": "PATCH /orgs/{org}/hooks/{hook_id}/config",
  "repos.hooks.config.update": "PATCH /repos/{owner}/{repo}/hooks/{hook_id}/config",
  "users.projects_v2.items.update": "PATCH /users/{username}/projectsV2/{project_number}/items/{item_id}",
} as const;

const OMIT = [
  "users.projects_v2.fields.create",
  "users.projects_v2.items.create",
  "users.projects_v2.drafts.create",
  "users.projects_v2.views.create",
  "repos.autolinks.delete",
  "code_scanning.analyses.delete",
  "users.packages.delete",
  "repos.actions.runners.labels.remove",
  "repos.hooks.test",
  "code_scanning.default_setup.update",
  "users.projects_v2.items.update",
] as const;

const RECONCILE = {
  "orgs.hooks.config.update": "orgs.hooks.config.get",
  "repos.hooks.config.update": "repos.hooks.config.get",
} as const;

function empty(status: number) {
  return new Response("", { status });
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("github write card 17 fuzzy writes", () => {
  test("version is 0.77.0 at 797 ops with the write breakdown", () => {
    expect(manifest.version).toBe("0.77.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(797);
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
    expect(kinds).toEqual({ action: 747, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 396, write: 336, absent: 15 });
    for (const [key, path] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(String(op.description)).toContain(path);
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
    }
    for (const key of OMIT) {
      const op = ops[key];
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
    }
    for (const [key, reconcile] of Object.entries(RECONCILE)) {
      expect(ops[key].effectPolicy).toBe("Reconcile");
      expect(ops[key].reconcile).toBe(reconcile);
      expect(ops[key].effect).toBeUndefined();
      expect(String(ops[key].description)).toContain("Secret is kept out of the Reconcile compare");
      expect(ops[key].inputSchema.properties.insecureSsl).toBeDefined();
      expect(ops[key].inputSchema.properties.secret).toBeDefined();
    }
    expect(ops["repos.autolinks.delete"].inputSchema.properties.autolink_id).toBeDefined();
    expect(ops["code_scanning.analyses.delete"].inputSchema.properties.confirmDelete).toBeDefined();
    expect(ops["code_scanning.analyses.delete"].inputSchema.properties.confirmDelete.type).toBe("string");
    expect(ops["users.projects_v2.drafts.create"].inputSchema.properties.userId).toBeDefined();
    expect(ops["user.projects_v2.drafts.create"]).toBeUndefined();
    expect(ops["classroom"]).toBeUndefined();
  });

  test("writes use the documented method and path and a 404 is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number, body?: unknown) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      if (body === undefined) return empty(status);
      return json(status, body);
    };

    const field = await createUserProjectField({
      accessToken: token, username: "octo", projectNumber: 1, name: "Notes", dataType: "text", fetch: fetchOf(201, { id: 9 }),
    });
    expect(field).toMatchObject({ action: "users.projects_v2.fields.create", field: { id: 9 } });
    expect(calls.at(-1)).toContain("POST https://api.github.com/users/octo/projectsV2/1/fields");
    expect(calls.at(-1)).toContain(JSON.stringify({ name: "Notes", data_type: "text" }));

    const item = await createUserProjectItem({
      accessToken: token, username: "octo", projectNumber: 1, type: "Issue", id: 55, fetch: fetchOf(201, { id: 12 }),
    });
    expect(item.item).toEqual({ id: 12 });
    expect(calls.at(-1)).toContain("POST https://api.github.com/users/octo/projectsV2/1/items");

    const draft = await createUserProjectDraft({
      accessToken: token, userId: "42", projectNumber: 1, title: "Draft", fetch: fetchOf(201, { id: 3 }),
    });
    expect(draft.draft).toEqual({ id: 3 });
    expect(calls.at(-1)).toContain("POST https://api.github.com/user/42/projectsV2/1/drafts");

    const view = await createUserProjectView({
      accessToken: token, username: "octo", projectNumber: 1, name: "Board", layout: "board", fetch: fetchOf(201, { id: 4 }),
    });
    expect(view.view).toEqual({ id: 4 });
    expect(calls.at(-1)).toContain("POST https://api.github.com/users/octo/projectsV2/1/views");

    const deletedAutolink = await deleteAutolink({
      accessToken: token, owner: "acme", repo: "app", autolink_id: 7, fetch: fetchOf(204),
    });
    expect(deletedAutolink).toMatchObject({ action: "repos.autolinks.delete", deleted: true, autolinkId: 7 });
    expect(calls.at(-1)).toContain("DELETE https://api.github.com/repos/acme/app/autolinks/7");

    const deletion = await deleteCodeScanningAnalysis({
      accessToken: token, owner: "acme", repo: "app", analysisId: 8, confirmDelete: "true", fetch: fetchOf(200, { next_analysis_url: null }),
    });
    expect(deletion.deletion).toEqual({ next_analysis_url: null });
    expect(calls.at(-1)).toContain("DELETE https://api.github.com/repos/acme/app/code-scanning/analyses/8?confirm_delete=true");

    const deletedPkg = await deleteUserPackage({
      accessToken: token, username: "octo", packageType: "npm", packageName: "@acme/pkg", fetch: fetchOf(204),
    });
    expect(deletedPkg).toMatchObject({ action: "users.packages.delete", deleted: true, packageName: "@acme/pkg" });
    expect(calls.at(-1)).toContain("DELETE https://api.github.com/users/octo/packages/npm/%40acme%2Fpkg");

    const labels = await removeRunnerLabel({
      accessToken: token, owner: "acme", repo: "app", runnerId: 3, name: "gpu", fetch: fetchOf(200, { total_count: 1, labels: [{ name: "self-hosted" }] }),
    });
    expect(labels).toMatchObject({ action: "repos.actions.runners.labels.remove", totalCount: 1 });
    expect(calls.at(-1)).toContain("DELETE https://api.github.com/repos/acme/app/actions/runners/3/labels/gpu");

    const tested = await testRepoHook({
      accessToken: token, owner: "acme", repo: "app", hookId: 11, fetch: fetchOf(204),
    });
    expect(tested).toMatchObject({ action: "repos.hooks.test", tested: true, hookId: 11 });
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/hooks/11/tests");

    const setup = await updateCodeScanningDefaultSetup({
      accessToken: token, owner: "acme", repo: "app", state: "configured", fetch: fetchOf(202, { run_id: 99 }),
    });
    expect(setup.setup).toEqual({ run_id: 99 });
    expect(calls.at(-1)).toContain("PATCH https://api.github.com/repos/acme/app/code-scanning/default-setup");

    const orgConfig = await updateOrgHookConfig({
      accessToken: token, org: "acme", hookId: 5, url: "https://example.com", insecureSsl: true, secret: "s3cret", fetch: fetchOf(200, { url: "https://example.com", insecure_ssl: "1" }),
    });
    expect(orgConfig.config).toEqual({ url: "https://example.com", insecure_ssl: "1" });
    expect(calls.at(-1)).toContain("PATCH https://api.github.com/orgs/acme/hooks/5/config");
    expect(calls.at(-1)).toContain(JSON.stringify({ url: "https://example.com", secret: "s3cret", insecure_ssl: "1" }));

    const repoConfig = await updateRepoHookConfig({
      accessToken: token, owner: "acme", repo: "app", hookId: 6, contentType: "json", insecureSsl: false, fetch: fetchOf(200, { content_type: "json", insecure_ssl: "0" }),
    });
    expect(repoConfig.config).toEqual({ content_type: "json", insecure_ssl: "0" });
    expect(calls.at(-1)).toContain(JSON.stringify({ content_type: "json", insecure_ssl: "0" }));

    const updatedItem = await updateUserProjectItem({
      accessToken: token, username: "octo", projectNumber: 1, itemId: 9, fields: [{ id: 2, value: "done" }], fetch: fetchOf(200, { id: 9 }),
    });
    expect(updatedItem.item).toEqual({ id: 9 });
    expect(calls.at(-1)).toContain("PATCH https://api.github.com/users/octo/projectsV2/1/items/9");

    await expect(deleteAutolink({
      accessToken: token, owner: "acme", repo: "app", autolink_id: 99, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(deleteCodeScanningAnalysis({
      accessToken: token, owner: "acme", repo: "app", analysisId: 99, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(deleteUserPackage({
      accessToken: token, username: "octo", packageType: "npm", packageName: "missing", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation rejects bad input without a token", () => {
    expect(() => createUserProjectField({ username: "octo", projectNumber: 1, name: "x" } as never)).toThrow();
    expect(() => deleteAutolink({ owner: "acme", repo: "app" } as never)).toThrow();
    expect(() => updateOrgHookConfig({ org: "acme", hookId: 1, contentType: "xml" } as never)).toThrow();
    expect(deleteAutolink({ owner: "acme", repo: "app", autolink_id: 1 })).toMatchObject({
      action: "repos.autolinks.delete", validated: { owner: "acme", repo: "app", autolinkId: 1 },
    });
    expect(updateRepoHookConfig({ owner: "acme", repo: "app", hookId: 1, insecureSsl: true })).toMatchObject({
      action: "repos.hooks.config.update",
      validated: { owner: "acme", repo: "app", hookId: 1, insecureSsl: true },
    });
    expect(deleteCodeScanningAnalysis({ owner: "acme", repo: "app", analysisId: 1, confirmDelete: "true" })).toMatchObject({
      action: "code_scanning.analyses.delete",
      validated: { owner: "acme", repo: "app", analysisId: 1, confirmDelete: "true" },
    });
  });
});
