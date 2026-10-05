import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  restoreAuthenticatedPackageVersion,
  restoreOrgPackageVersion,
  restoreUserPackageVersion,
  addOrgCodespacesAccessSelectedUsers,
  createUserCodespace,
  createRepoCodespace,
  createPullCodespace,
  publishCodespace,
  createCodespaceExport,
  setOrgCodespacesAccess,
  startUserCodespace,
  stopOrgMemberCodespace,
  stopUserCodespace,
} from "../src/actions";

const PATHS = {
  "user.packages.versions.restore": "POST /user/packages/{package_type}/{package_name}/versions/{package_version_id}/restore",
  "orgs.packages.versions.restore": "POST /orgs/{org}/packages/{package_type}/{package_name}/versions/{package_version_id}/restore",
  "users.packages.versions.restore": "POST /users/{username}/packages/{package_type}/{package_name}/versions/{package_version_id}/restore",
  "orgs.codespaces.access.selected_users.add": "POST /orgs/{org}/codespaces/access/selected_users",
  "user.codespaces.create": "POST /user/codespaces",
  "repos.codespaces.create": "POST /repos/{owner}/{repo}/codespaces",
  "repos.pulls.codespaces.create": "POST /repos/{owner}/{repo}/pulls/{pull_number}/codespaces",
  "user.codespaces.publish": "POST /user/codespaces/{codespace_name}/publish",
  "user.codespaces.exports.create": "POST /user/codespaces/{codespace_name}/exports",
  "orgs.codespaces.access.set": "PUT /orgs/{org}/codespaces/access",
  "user.codespaces.start": "POST /user/codespaces/{codespace_name}/start",
  "orgs.members.codespaces.stop": "POST /orgs/{org}/members/{username}/codespaces/{codespace_name}/stop",
  "user.codespaces.stop": "POST /user/codespaces/{codespace_name}/stop",
} as const;

const EFFECT_UNKNOWN = [
  "user.packages.versions.restore",
  "orgs.packages.versions.restore",
  "users.packages.versions.restore",
  "user.codespaces.publish",
] as const;

function empty(status: number) {
  return new Response("", { status });
}

describe("github write card 9 package version restores and codespace writes", () => {
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
    for (const key of EFFECT_UNKNOWN) {
      expect(String(ops[key].description)).toContain("Effect-unknown");
    }
    // Package-level restores from card 8 stay distinct from version restores.
    expect(String(ops["user.packages.restore"].description)).toContain(
      "POST /user/packages/{package_type}/{package_name}/restore",
    );
    expect(String(ops["user.packages.restore"].description)).not.toContain("/versions/{package_version_id}/restore");
    expect(ops["classroom"]).toBeUndefined();
  });

  test("package version restores use versions restore and a 404 is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      return empty(status);
    };

    const auth = await restoreAuthenticatedPackageVersion({
      accessToken: token, packageType: "npm", packageName: "app", packageVersionId: 9, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("POST https://api.github.com/user/packages/npm/app/versions/9/restore ");
    expect(auth).toMatchObject({ action: "user.packages.versions.restore", restored: true, packageVersionId: 9 });
    await expect(restoreAuthenticatedPackageVersion({
      accessToken: token, packageType: "npm", packageName: "app", packageVersionId: 9, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const org = await restoreOrgPackageVersion({
      accessToken: token, org: "acme", packageType: "container", packageName: "acme/app", packageVersionId: 3, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("POST https://api.github.com/orgs/acme/packages/container/acme%2Fapp/versions/3/restore ");
    expect(org).toMatchObject({ action: "orgs.packages.versions.restore", restored: true, org: "acme" });

    const user = await restoreUserPackageVersion({
      accessToken: token, username: "octo", packageType: "maven", packageName: "lib", packageVersionId: 7, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("POST https://api.github.com/users/octo/packages/maven/lib/versions/7/restore ");
    expect(user).toMatchObject({ action: "users.packages.versions.restore", restored: true, username: "octo" });
  });

  test("codespace writes use the documented method and path", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number, body?: unknown) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      if (body === undefined) return empty(status);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    };
    const codespace = { id: 1, name: "monalisa-octocat-hello-world-g4wpq6h95q", state: "Available" };
    const exportBody = { id: "exp-1", state: "succeeded", completed_at: "2026-10-05T12:00:00Z" };

    const selected = await addOrgCodespacesAccessSelectedUsers({
      accessToken: token, org: "acme", selectedUsernames: ["octo", "mona"], fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe(
      `POST https://api.github.com/orgs/acme/codespaces/access/selected_users ${JSON.stringify({ selected_usernames: ["octo", "mona"] })}`,
    );
    expect(selected).toMatchObject({ action: "orgs.codespaces.access.selected_users.add", added: true });

    const created = await createUserCodespace({
      accessToken: token, repositoryId: 42, ref: "main", fetch: fetchOf(201, codespace),
    });
    expect(calls.at(-1)).toBe(
      `POST https://api.github.com/user/codespaces ${JSON.stringify({ ref: "main", repository_id: 42 })}`,
    );
    expect(created.codespace).toEqual(codespace);
    await expect(createUserCodespace({
      accessToken: token, repositoryId: 42, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const repoCreated = await createRepoCodespace({
      accessToken: token, owner: "acme", repo: "app", machine: "standardLinux32gb", fetch: fetchOf(202, codespace),
    });
    expect(calls.at(-1)).toBe(
      `POST https://api.github.com/repos/acme/app/codespaces ${JSON.stringify({ machine: "standardLinux32gb" })}`,
    );
    expect(repoCreated.codespace).toEqual(codespace);

    const pullCreated = await createPullCodespace({
      accessToken: token, owner: "acme", repo: "app", pullNumber: 12, fetch: fetchOf(201, codespace),
    });
    expect(calls.at(-1)).toBe(
      `POST https://api.github.com/repos/acme/app/pulls/12/codespaces ${JSON.stringify({})}`,
    );
    expect(pullCreated.codespace).toEqual(codespace);

    const published = await publishCodespace({
      accessToken: token, codespaceName: "cs-1", name: "hello", private: true, fetch: fetchOf(201, codespace),
    });
    expect(calls.at(-1)).toBe(
      `POST https://api.github.com/user/codespaces/cs-1/publish ${JSON.stringify({ name: "hello", private: true })}`,
    );
    expect(published.codespace).toEqual(codespace);

    const exported = await createCodespaceExport({
      accessToken: token, codespaceName: "cs-1", fetch: fetchOf(202, exportBody),
    });
    expect(calls.at(-1)).toBe("POST https://api.github.com/user/codespaces/cs-1/exports ");
    expect(exported.export).toEqual(exportBody);

    const access = await setOrgCodespacesAccess({
      accessToken: token, org: "acme", visibility: "selected_members", selectedUsernames: ["octo"], fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe(
      `PUT https://api.github.com/orgs/acme/codespaces/access ${JSON.stringify({ visibility: "selected_members", selected_usernames: ["octo"] })}`,
    );
    expect(access).toMatchObject({ action: "orgs.codespaces.access.set", set: true, visibility: "selected_members" });

    const started = await startUserCodespace({
      accessToken: token, codespaceName: "cs-1", fetch: fetchOf(200, codespace),
    });
    expect(calls.at(-1)).toBe("POST https://api.github.com/user/codespaces/cs-1/start ");
    expect(started.codespace).toEqual(codespace);

    const orgStopped = await stopOrgMemberCodespace({
      accessToken: token, org: "acme", username: "octo", codespaceName: "cs-1", fetch: fetchOf(200, codespace),
    });
    expect(calls.at(-1)).toBe("POST https://api.github.com/orgs/acme/members/octo/codespaces/cs-1/stop ");
    expect(orgStopped.codespace).toEqual(codespace);

    const stopped = await stopUserCodespace({
      accessToken: token, codespaceName: "cs-1", fetch: fetchOf(200, codespace),
    });
    expect(calls.at(-1)).toBe("POST https://api.github.com/user/codespaces/cs-1/stop ");
    expect(stopped.codespace).toEqual(codespace);
    await expect(stopUserCodespace({
      accessToken: token, codespaceName: "missing", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
