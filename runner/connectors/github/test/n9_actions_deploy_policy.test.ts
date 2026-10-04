import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import workflowFixture from "../fixtures/workflow_permissions.json";
import permissionsFixture from "../fixtures/actions_permissions.json";
import permissionsAllFixture from "../fixtures/actions_permissions_all.json";
import selectedFixture from "../fixtures/selected_actions.json";
import policiesFixture from "../fixtures/branch_policies.json";
import policyFixture from "../fixtures/branch_policy.json";
import {
  getWorkflowPermissions,
  setWorkflowPermissions,
  getActionsPermissions,
  setActionsPermissions,
  getSelectedActions,
  setSelectedActions,
  listDeploymentBranchPolicies,
  getDeploymentBranchPolicy,
  createDeploymentBranchPolicy,
  updateDeploymentBranchPolicy,
  deleteDeploymentBranchPolicy,
} from "../src/actions";
import {
  validateSetWorkflowPermissionsInput,
  validateSetSelectedActionsInput,
  validateCreateBranchPolicyInput,
} from "../src/actions_deploy_policy";

const READS = [
  "actions.permissions.workflow.get",
  "actions.permissions.get",
  "actions.permissions.selected_actions.get",
  "deployments.branch_policies.list",
  "deployments.branch_policies.get",
] as const;

describe("github N9 actions permissions and deployment branch policies", () => {
  test("manifest is v0.44.0 with 446 ops and the N9 effect policies", () => {
    expect(manifest.version).toBe("0.44.0");
    expect(Object.keys(manifest.operations).length).toBe(446);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
    const workflowSet = manifest.operations["actions.permissions.workflow.set"] as Record<string, unknown>;
    expect(workflowSet.effectPolicy).toBe("Reconcile");
    expect(workflowSet.reconcile).toBe("actions.permissions.workflow.get");
    const permSet = manifest.operations["actions.permissions.set"] as Record<string, unknown>;
    expect(permSet.effectPolicy).toBe("Reconcile");
    expect(permSet.reconcile).toBe("actions.permissions.get");
    const selectedSet = manifest.operations["actions.permissions.selected_actions.set"] as Record<string, unknown>;
    expect(selectedSet.effectPolicy).toBe("Reconcile");
    expect(selectedSet.reconcile).toBe("actions.permissions.selected_actions.get");
    const created = manifest.operations["deployments.branch_policies.create"] as Record<string, unknown>;
    expect(created.effectPolicy).toBe("Idempotent");
    expect(created.reconcile).toBe("deployments.branch_policies.list");
    expect(String(created.description)).toContain("not Reconcile");
    const updated = manifest.operations["deployments.branch_policies.update"] as Record<string, unknown>;
    expect(updated.effectPolicy).toBe("Reconcile");
    expect(updated.reconcile).toBe("deployments.branch_policies.get");
    const deleted = manifest.operations["deployments.branch_policies.delete"] as Record<string, unknown>;
    expect(deleted.effectPolicy).toBe("Idempotent");
    expect(deleted.reconcile).toBeUndefined();
    expect(String(deleted.description)).not.toContain("observes via");
  });

  test("validates N9 inputs", () => {
    expect(validateSetWorkflowPermissionsInput({
      owner: "acme", repo: "app", default_workflow_permissions: "write", can_approve_pull_request_reviews: true,
    }).defaultWorkflowPermissions).toBe("write");
    expect(() => validateSetWorkflowPermissionsInput({
      owner: "acme", repo: "app", default_workflow_permissions: "admin", can_approve_pull_request_reviews: true,
    })).toThrow(/default_workflow_permissions/);
    expect(validateSetSelectedActionsInput({
      owner: "acme", repo: "app", github_owned_allowed: false, verified_allowed: false, patterns_allowed: ["docker/*"],
    }).patternsAllowed).toEqual(["docker/*"]);
    expect(validateSetSelectedActionsInput({
      owner: "acme", repo: "app", github_owned_allowed: false, verified_allowed: false,
    }).patternsAllowed).toEqual([]);
    expect(validateCreateBranchPolicyInput({
      owner: "acme", repo: "app", environment_name: "prod/us", name: "release/*", type: "branch",
    }).environmentName).toBe("prod/us");
    expect(() => validateCreateBranchPolicyInput({
      owner: "acme", repo: "app", environment_name: "prod", name: "main", type: "commit",
    })).toThrow(/type/);
  });

  test("workflow permissions get and set, and 409 is not success", async () => {
    const got = await getWorkflowPermissions({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/permissions/workflow");
        return new Response(JSON.stringify(workflowFixture), { status: 200 });
      },
    });
    expect(got.permissions).toEqual({ defaultWorkflowPermissions: "read", canApprovePullRequestReviews: false });

    const requests: Request[] = [];
    const set = await setWorkflowPermissions({
      accessToken: "t", owner: "acme", repo: "app",
      default_workflow_permissions: "write", can_approve_pull_request_reviews: true,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });
    expect(requests[0].method).toBe("PUT");
    expect(JSON.parse(await requests[0].text())).toEqual({
      default_workflow_permissions: "write",
      can_approve_pull_request_reviews: true,
    });
    expect((set.permissions as Record<string, unknown>).defaultWorkflowPermissions).toBe("write");

    await expect(setWorkflowPermissions({
      accessToken: "t", owner: "acme", repo: "app",
      default_workflow_permissions: "write", can_approve_pull_request_reviews: false,
      fetch: async () => new Response(JSON.stringify({ message: "Conflict" }), { status: 409 }),
    })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: expect.stringMatching(/did not move/),
    });
  });

  test("actions permissions get and set", async () => {
    const got = await getActionsPermissions({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/permissions");
        return new Response(JSON.stringify(permissionsFixture), { status: 200 });
      },
    });
    expect((got.permissions as Record<string, unknown>).allowedActions).toBe("selected");

    const requests: Request[] = [];
    await setActionsPermissions({
      accessToken: "t", owner: "acme", repo: "app", enabled: true, allowed_actions: "selected",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });
    expect(JSON.parse(await requests[0].text())).toEqual({ enabled: true, allowed_actions: "selected" });
  });

  test("selected actions require allowed_actions=selected and do not hide 409", async () => {
    const seen: string[] = [];
    await expect(setSelectedActions({
      accessToken: "t", owner: "acme", repo: "app",
      github_owned_allowed: true, verified_allowed: false, patterns_allowed: ["docker/*"],
      fetch: async (input, init) => {
        seen.push(`${new Request(input, init).method} ${String(input)}`);
        return new Response(JSON.stringify(permissionsAllFixture), { status: 200 });
      },
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: expect.stringMatching(/must be selected/) });
    expect(seen).toEqual(["GET https://api.github.com/repos/acme/app/actions/permissions"]);

    const calls: string[] = [];
    const set = await setSelectedActions({
      accessToken: "t", owner: "acme", repo: "app",
      github_owned_allowed: true, verified_allowed: false, patterns_allowed: ["monalisa/octocat@*"],
      fetch: async (input, init) => {
        const req = new Request(input, init);
        calls.push(`${req.method} ${String(input)}`);
        if (req.method === "GET") return new Response(JSON.stringify(permissionsFixture), { status: 200 });
        return new Response(null, { status: 204 });
      },
    });
    expect(calls).toEqual([
      "GET https://api.github.com/repos/acme/app/actions/permissions",
      "PUT https://api.github.com/repos/acme/app/actions/permissions/selected-actions",
    ]);
    expect((set.selectedActions as Record<string, unknown>).githubOwnedAllowed).toBe(true);

    const got = await getSelectedActions({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async () => new Response(JSON.stringify(selectedFixture), { status: 200 }),
    });
    expect((got.selectedActions as Record<string, unknown>).patternsAllowed).toEqual(["monalisa/octocat@*"]);

    await expect(setSelectedActions({
      accessToken: "t", owner: "acme", repo: "app",
      github_owned_allowed: true, verified_allowed: true,
      fetch: async (input, init) => {
        if (new Request(input, init).method === "GET") return new Response(JSON.stringify(permissionsFixture), { status: 200 });
        return new Response(JSON.stringify({ message: "Conflict" }), { status: 409 });
      },
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: expect.stringMatching(/did not move/) });
  });

  test("branch policy list encodes the environment and get reads one policy", async () => {
    const listed = await listDeploymentBranchPolicies({
      accessToken: "t", owner: "acme", repo: "app", environment_name: "prod/us", perPage: 10, page: 2,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/environments/prod%2Fus/deployment-branch-policies?per_page=10&page=2");
        return new Response(JSON.stringify(policiesFixture), { status: 200 });
      },
    });
    expect(listed.totalCount).toBe(1);
    expect((listed.policies as Array<Record<string, unknown>>)[0].name).toBe("release/*");

    const got = await getDeploymentBranchPolicy({
      accessToken: "t", owner: "acme", repo: "app", environment_name: "prod/us", branch_policy_id: 361471,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/environments/prod%2Fus/deployment-branch-policies/361471");
        return new Response(JSON.stringify(policyFixture), { status: 200 });
      },
    });
    expect((got.policy as Record<string, unknown>).id).toBe(361471);
  });

  test("create is idempotent on the name pattern: skip POST, 200 creates, 303 does not POST again, 404 stops", async () => {
    const skipped: string[] = [];
    const existing = await createDeploymentBranchPolicy({
      accessToken: "t", owner: "acme", repo: "app", environment_name: "production", name: "release/*", type: "branch",
      fetch: async (input, init) => {
        skipped.push(new Request(input, init).method);
        return new Response(JSON.stringify(policiesFixture), { status: 200 });
      },
    });
    expect(skipped).toEqual(["GET"]);
    expect(existing.created).toBe(false);
    expect((existing.policy as Record<string, unknown>).id).toBe(361471);

    const createdCalls: string[] = [];
    const created = await createDeploymentBranchPolicy({
      accessToken: "t", owner: "acme", repo: "app", environment_name: "production", name: "main", type: "branch",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        createdCalls.push(req.method);
        if (req.method === "GET") return new Response(JSON.stringify({ total_count: 0, branch_policies: [] }), { status: 200 });
        expect(JSON.parse(await req.text())).toEqual({ name: "main", type: "branch" });
        return new Response(JSON.stringify({ id: 9, node_id: "N", name: "main", type: "branch" }), { status: 200 });
      },
    });
    expect(createdCalls).toEqual(["GET", "POST"]);
    expect(created.created).toBe(true);
    expect(created.id).toBe(9);

    let posts = 0;
    const already = await createDeploymentBranchPolicy({
      accessToken: "t", owner: "acme", repo: "app", environment_name: "production", name: "hotfix/*", type: "tag",
      fetch: async (input, init) => {
        const method = new Request(input, init).method;
        if (method === "POST") posts += 1;
        if (method === "GET") return new Response(JSON.stringify({ total_count: 0, branch_policies: [] }), { status: 200 });
        return new Response(null, { status: 303, headers: { Location: "https://api.github.com/repos/acme/app/environments/production/deployment-branch-policies/3" } });
      },
    });
    expect(posts).toBe(1);
    expect(already.created).toBe(false);
    expect((already.policy as Record<string, unknown>).id).toBe(3);

    await expect(createDeploymentBranchPolicy({
      accessToken: "t", owner: "acme", repo: "app", environment_name: "missing", name: "main", type: "branch",
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: expect.stringMatching(/custom deployment branch policies/),
    });
  });

  test("update puts the policy and delete pre-gets, treats a missing policy as already gone, and does not hide a DELETE 404", async () => {
    const updated = await updateDeploymentBranchPolicy({
      accessToken: "t", owner: "acme", repo: "app", environment_name: "prod/us", branch_policy_id: 361471, name: "release/*", type: "tag",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        expect(req.method).toBe("PUT");
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/environments/prod%2Fus/deployment-branch-policies/361471");
        expect(JSON.parse(await req.text())).toEqual({ name: "release/*", type: "tag" });
        return new Response(JSON.stringify({ id: 361471, node_id: "MDE", name: "release/*", type: "tag" }), { status: 200 });
      },
    });
    expect((updated.policy as Record<string, unknown>).type).toBe("tag");

    const methods: string[] = [];
    const gone = await deleteDeploymentBranchPolicy({
      accessToken: "t", owner: "acme", repo: "app", environment_name: "production", branch_policy_id: 4,
      fetch: async (input, init) => {
        methods.push(new Request(input, init).method);
        return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
      },
    });
    expect(methods).toEqual(["GET"]);
    expect(gone.deleted).toBe(true);
    expect(gone.alreadyGone).toBe(true);

    const deleted = await deleteDeploymentBranchPolicy({
      accessToken: "t", owner: "acme", repo: "app", environment_name: "production", branch_policy_id: 361471,
      fetch: async (input, init) => {
        const method = new Request(input, init).method;
        if (method === "GET") return new Response(JSON.stringify(policyFixture), { status: 200 });
        expect(method).toBe("DELETE");
        return new Response(null, { status: 204 });
      },
    });
    expect(deleted.deleted).toBe(true);
    expect(deleted.alreadyGone).toBe(false);

    await expect(deleteDeploymentBranchPolicy({
      accessToken: "t", owner: "acme", repo: "app", environment_name: "production", branch_policy_id: 8,
      fetch: async (input, init) => {
        const method = new Request(input, init).method;
        if (method === "GET") return new Response(JSON.stringify(policyFixture), { status: 200 });
        return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
      },
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
