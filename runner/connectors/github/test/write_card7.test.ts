import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  deleteMilestone,
  createOrgRunnerRegistrationToken,
  createRepoRunnerRegistrationToken,
  createOrgRunnerRemoveToken,
  createRepoRunnerRemoveToken,
  addInstallationRepository,
  removeInstallationRepository,
} from "../src/actions";

const PATHS = {
  "milestones.delete": "DELETE /repos/{owner}/{repo}/milestones/{milestone_number}",
  "orgs.actions.runners.registration_token.create": "POST /orgs/{org}/actions/runners/registration-token",
  "repos.actions.runners.registration_token.create": "POST /repos/{owner}/{repo}/actions/runners/registration-token",
  "orgs.actions.runners.remove_token.create": "POST /orgs/{org}/actions/runners/remove-token",
  "repos.actions.runners.remove_token.create": "POST /repos/{owner}/{repo}/actions/runners/remove-token",
  "user.installations.repositories.add": "PUT /user/installations/{installation_id}/repositories/{repository_id}",
  "user.installations.repositories.remove": "DELETE /user/installations/{installation_id}/repositories/{repository_id}",
} as const;

const TOKEN_FIXTURE = { token: "not-a-token", expires_at: "2026-10-05T12:00:00Z" };

function empty(status: number) {
  return new Response("", { status });
}

describe("github write card 7 milestone, runner token, and installation writes", () => {
  test("version is 0.58.0 at 601 ops with the write breakdown", () => {
    expect(manifest.version).toBe("0.58.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(601);
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
    expect(kinds).toEqual({ action: 551, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 328, write: 208, absent: 15 });
    for (const [key, path] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(String(op.description)).toContain(path);
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
    }
    for (const key of ["user.installations.repositories.add", "user.installations.repositories.remove"]) {
      const description = String(ops[key].description);
      expect(description).toContain("classic personal access token (PAT) with repo scope");
      expect(description).toContain("CONNECTOR_UPSTREAM_ERROR");
      expect(description).toContain("CONNECTOR_RATE_LIMITED");
    }
    expect(ops["classroom"]).toBeUndefined();
  });

  test("writes use the documented method and path and a 404 on a delete is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
      async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
        if (body === undefined) return new Response("", { status, headers });
        return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
      };

    const milestone = await deleteMilestone({
      accessToken: token, owner: "acme", repo: "app", milestoneNumber: 7, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/repos/acme/app/milestones/7 ");
    expect(milestone).toMatchObject({ action: "milestones.delete", deleted: true, owner: "acme", repo: "app", milestoneNumber: 7 });
    await expect(deleteMilestone({
      accessToken: token, owner: "acme", repo: "app", milestoneNumber: 7, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const added = await addInstallationRepository({
      accessToken: token, installationId: 11, repositoryId: 22, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("PUT https://api.github.com/user/installations/11/repositories/22 ");
    expect(added).toMatchObject({ action: "user.installations.repositories.add", added: true, installationId: 11, repositoryId: 22 });
    await expect(addInstallationRepository({
      accessToken: token, installationId: 11, repositoryId: 22, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const removed = await removeInstallationRepository({
      accessToken: token, installationId: 11, repositoryId: 22, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/user/installations/11/repositories/22 ");
    expect(removed).toMatchObject({ action: "user.installations.repositories.remove", removed: true, installationId: 11, repositoryId: 22 });
    await expect(removeInstallationRepository({
      accessToken: token, installationId: 11, repositoryId: 22, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    // A fine-grained token rejected with 403 surfaces as upstream; a rate-limited 403 is rate limited.
    await expect(removeInstallationRepository({
      accessToken: token, installationId: 11, repositoryId: 22, fetch: fetchOf(403, { message: "Resource not accessible" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(addInstallationRepository({
      accessToken: token, installationId: 11, repositoryId: 22,
      fetch: fetchOf(403, { message: "API rate limit exceeded" }, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 60),
      }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });

  test("runner token writes pass the upstream body through as-is", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number, body?: unknown) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      if (body === undefined) return empty(status);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    };

    const cases = [
      [createOrgRunnerRegistrationToken, { org: "octo cat" }, "orgs.actions.runners.registration_token.create", "https://api.github.com/orgs/octo%20cat/actions/runners/registration-token"],
      [createRepoRunnerRegistrationToken, { owner: "acme", repo: "app" }, "repos.actions.runners.registration_token.create", "https://api.github.com/repos/acme/app/actions/runners/registration-token"],
      [createOrgRunnerRemoveToken, { org: "octo cat" }, "orgs.actions.runners.remove_token.create", "https://api.github.com/orgs/octo%20cat/actions/runners/remove-token"],
      [createRepoRunnerRemoveToken, { owner: "acme", repo: "app" }, "repos.actions.runners.remove_token.create", "https://api.github.com/repos/acme/app/actions/runners/remove-token"],
    ] as const;

    for (const [fn, args, action, url] of cases) {
      const result = await fn({ accessToken: token, ...args, fetch: fetchOf(201, TOKEN_FIXTURE) });
      expect(calls.at(-1)).toBe(`POST ${url} `);
      expect(result).toEqual({ ...TOKEN_FIXTURE, connector: "github", action, source: "connector" });
      await expect(fn({ accessToken: token, ...args, fetch: fetchOf(404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    }
  });
});
