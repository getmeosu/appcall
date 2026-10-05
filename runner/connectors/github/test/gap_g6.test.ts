import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  addOrgActionsPermissionsRepository,
  addOrgRunnerLabels,
  addRepoRunnerLabels,
  createOrgRunnerJitConfig,
  getActionsPermissionsAccess,
  removeAllOrgRunnerLabels,
  removeOrgActionsPermissionsRepository,
  reviewDeploymentProtectionRule,
  setActionsPermissionsAccess,
  setOrgActionsPermissionsRepositories,
  setOrgRunnerLabels,
  setRepoRunnerLabels,
} from "../src/actions";
import {
  validateAddOrgRunnerLabelsInput,
  validateReviewDeploymentProtectionRuleInput,
  validateSetActionsPermissionsAccessInput,
} from "../src/gap_g6";

const PATHS: Record<string, { methodPath: string; sideEffect: "read" | "write"; reconcile?: string }> = {
  "orgs.actions.runners.labels.add": { methodPath: "POST /orgs/{org}/actions/runners/{runner_id}/labels", sideEffect: "write", reconcile: "orgs.actions.runners.labels.list" },
  "orgs.actions.runners.labels.set": { methodPath: "PUT /orgs/{org}/actions/runners/{runner_id}/labels", sideEffect: "write", reconcile: "orgs.actions.runners.labels.list" },
  "orgs.actions.runners.labels.remove_all": { methodPath: "DELETE /orgs/{org}/actions/runners/{runner_id}/labels", sideEffect: "write" },
  "repos.actions.runners.labels.add": { methodPath: "POST /repos/{owner}/{repo}/actions/runners/{runner_id}/labels", sideEffect: "write", reconcile: "repos.actions.runners.labels.list" },
  "repos.actions.runners.labels.set": { methodPath: "PUT /repos/{owner}/{repo}/actions/runners/{runner_id}/labels", sideEffect: "write", reconcile: "repos.actions.runners.labels.list" },
  "orgs.actions.runners.jitconfig.create": { methodPath: "POST /orgs/{org}/actions/runners/generate-jitconfig", sideEffect: "write" },
  "repos.actions.runners.jitconfig.create": { methodPath: "POST /repos/{owner}/{repo}/actions/runners/generate-jitconfig", sideEffect: "write" },
  "actions.permissions.access.get": { methodPath: "GET /repos/{owner}/{repo}/actions/permissions/access", sideEffect: "read" },
  "actions.permissions.access.set": { methodPath: "PUT /repos/{owner}/{repo}/actions/permissions/access", sideEffect: "write", reconcile: "actions.permissions.access.get" },
  "orgs.actions.permissions.repositories.remove": { methodPath: "DELETE /orgs/{org}/actions/permissions/repositories/{repository_id}", sideEffect: "write" },
  "actions.runs.deployment_protection_rule.review": { methodPath: "POST /repos/{owner}/{repo}/actions/runs/{run_id}/deployment_protection_rule", sideEffect: "write" },
  "orgs.actions.permissions.repositories.set": { methodPath: "PUT /orgs/{org}/actions/permissions/repositories", sideEffect: "write" },
  "orgs.actions.permissions.repositories.add": { methodPath: "PUT /orgs/{org}/actions/permissions/repositories/{repository_id}", sideEffect: "write" },
};

type Seen = { url: string; method: string; body?: string };

function recorder(responses: Response[] | (() => Response)) {
  const seen: Seen[] = [];
  let i = 0;
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), method: init?.method ?? "GET", body: init?.body as string | undefined });
    if (typeof responses === "function") return responses();
    return responses[i++];
  };
  return { seen, fetch };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function empty(status: number) {
  return new Response(null, { status });
}

describe("github gap G6 runners access org Actions repos", () => {
  test("version is 0.78.0 at 812 ops with the read/write breakdown", () => {
    expect(manifest.version).toBe("0.78.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(812);
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
    expect(kinds).toEqual({ action: 762, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 411, write: 336, absent: 15 });
  });

  test("the thirteen G6 ops wire effects and document their paths", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(PATHS)).toHaveLength(13);
    let reconciles = 0;
    for (const [key, meta] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(op).toBeDefined();
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe(meta.sideEffect);
      expect(String(op.description)).toContain(meta.methodPath.split(" ")[1]);
      if (meta.reconcile) {
        expect(op.effectPolicy).toBe("Reconcile");
        expect(op.reconcile).toBe(meta.reconcile);
        reconciles += 1;
      } else {
        expect(op.effectPolicy).toBeUndefined();
        expect(op.reconcile).toBeUndefined();
        expect(op.effect).toBeUndefined();
      }
    }
    expect(reconciles).toBe(5);
  });

  test("validators enforce runner ids, accessLevel, and review state", () => {
    expect(validateAddOrgRunnerLabelsInput({ org: "octo", runnerId: 1, labels: ["self-hosted"] }))
      .toEqual({ org: "octo", runnerId: 1, labels: ["self-hosted"] });
    expect(validateSetActionsPermissionsAccessInput({ owner: "o", repo: "r", accessLevel: "organization" }))
      .toEqual({ owner: "o", repo: "r", accessLevel: "organization" });
    expect(() => validateSetActionsPermissionsAccessInput({ owner: "o", repo: "r", accessLevel: "all" })).toThrow(/accessLevel/);
    expect(validateReviewDeploymentProtectionRuleInput({
      owner: "o", repo: "r", runId: 9, environmentName: "prod", state: "approved",
    })).toMatchObject({ state: "approved", environmentName: "prod" });
  });

  test("labels add/set and access set wire bodies; DELETE 404 → CONNECTOR_UPSTREAM_ERROR", async () => {
    const add = recorder([json({ total_count: 1, labels: [{ id: 1, name: "self-hosted", type: "custom" }] })]);
    expect(await addOrgRunnerLabels({ accessToken: "t", fetch: add.fetch, org: "octo", runnerId: 3, labels: ["self-hosted"] }))
      .toMatchObject({ totalCount: 1, labels: [{ name: "self-hosted" }] });
    expect(add.seen[0].method).toBe("POST");
    expect(JSON.parse(add.seen[0].body!)).toEqual({ labels: ["self-hosted"] });

    const set = recorder([json({ total_count: 0, labels: [] })]);
    await setRepoRunnerLabels({ accessToken: "t", fetch: set.fetch, owner: "o", repo: "r", runnerId: 2, labels: ["x"] });
    expect(set.seen[0].method).toBe("PUT");

    const accessGet = recorder([json({ access_level: "none" })]);
    expect(await getActionsPermissionsAccess({ accessToken: "t", fetch: accessGet.fetch, owner: "o", repo: "r" }))
      .toMatchObject({ access: { accessLevel: "none" } });

    const accessSet = recorder([empty(204)]);
    expect(await setActionsPermissionsAccess({ accessToken: "t", fetch: accessSet.fetch, owner: "o", repo: "r", accessLevel: "user" }))
      .toMatchObject({ access: { accessLevel: "user" } });
    expect(JSON.parse(accessSet.seen[0].body!)).toEqual({ access_level: "user" });

    const missing = recorder([empty(404)]);
    await expect(removeOrgActionsPermissionsRepository({
      accessToken: "t", fetch: missing.fetch, org: "octo", repositoryId: 9,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("jitconfig create, repo selection set/add, remove_all, and review", async () => {
    const jit = recorder([json({ runner: { id: 11, name: "r1" }, encoded_jit_config: "abc" }, 201)]);
    expect(await createOrgRunnerJitConfig({
      accessToken: "t", fetch: jit.fetch, org: "octo", name: "r1", runnerGroupId: 1, labels: ["self-hosted"],
    })).toMatchObject({ jitConfig: { runnerId: 11, runnerName: "r1", encodedJitConfig: "abc" } });
    expect(JSON.parse(jit.seen[0].body!)).toEqual({ name: "r1", runner_group_id: 1, labels: ["self-hosted"] });

    const setRepos = recorder([empty(204)]);
    await setOrgActionsPermissionsRepositories({
      accessToken: "t", fetch: setRepos.fetch, org: "octo", selectedRepositoryIds: [1, 2],
    });
    expect(JSON.parse(setRepos.seen[0].body!)).toEqual({ selected_repository_ids: [1, 2] });

    const addRepo = recorder([empty(204)]);
    await addOrgActionsPermissionsRepository({ accessToken: "t", fetch: addRepo.fetch, org: "octo", repositoryId: 5 });
    expect(addRepo.seen[0].url).toContain("/repositories/5");

    const clear = recorder([json({ total_count: 0, labels: [] })]);
    await removeAllOrgRunnerLabels({ accessToken: "t", fetch: clear.fetch, org: "octo", runnerId: 3 });
    expect(clear.seen[0].method).toBe("DELETE");

    const review = recorder([empty(204)]);
    expect(await reviewDeploymentProtectionRule({
      accessToken: "t", fetch: review.fetch, owner: "o", repo: "r", runId: 8,
      environmentName: "prod", state: "approved", comment: "ok",
    })).toMatchObject({ reviewed: true, state: "approved" });
    expect(JSON.parse(review.seen[0].body!)).toEqual({
      environment_name: "prod", state: "approved", comment: "ok",
    });

    // dry-run wrappers
    expect(addRepoRunnerLabels({ owner: "o", repo: "r", runnerId: 1, labels: ["a"] }))
      .toMatchObject({ action: "repos.actions.runners.labels.add" });
    expect(setOrgRunnerLabels({ org: "octo", runnerId: 1, labels: ["a"] }))
      .toMatchObject({ action: "orgs.actions.runners.labels.set" });
  });
});
