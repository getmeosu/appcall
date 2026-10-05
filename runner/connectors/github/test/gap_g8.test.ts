import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  deleteDependabotSecret,
  deleteOrgCodespacesSecret,
  deleteOrgMemberCodespace,
  deleteUserCodespace,
  getOrgCodespacesSecret,
  getOrgCodespacesSecretsPublicKey,
  getRepoCodespacesPermissionsCheck,
  getRepoCodespacesSecret,
  listOrgCodespacesSecretRepositories,
  listRepoCodespaces,
  listRepoDevcontainers,
  removeOrgCodespacesSecretRepository,
  setOrgCodespacesSecretRepositories,
  upsertOrgCodespacesSecret,
} from "../src/actions";
import {
  validateDeleteUserCodespaceInput,
  validateUpsertOrgCodespacesSecretInput,
  validateGetRepoCodespacesPermissionsCheckInput,
} from "../src/gap_g8";

const PATHS: Record<string, { methodPath: string; sideEffect: "read" | "write" }> = {
  "user.codespaces.delete": { methodPath: "DELETE /user/codespaces/{codespace_name}", sideEffect: "write" },
  "orgs.members.codespaces.delete": { methodPath: "DELETE /orgs/{org}/members/{username}/codespaces/{codespace_name}", sideEffect: "write" },
  "repos.codespaces.list": { methodPath: "GET /repos/{owner}/{repo}/codespaces", sideEffect: "read" },
  "repos.codespaces.devcontainers.list": { methodPath: "GET /repos/{owner}/{repo}/codespaces/devcontainers", sideEffect: "read" },
  "repos.codespaces.permissions_check.get": { methodPath: "GET /repos/{owner}/{repo}/codespaces/permissions_check", sideEffect: "read" },
  "orgs.codespaces.secrets.get": { methodPath: "GET /orgs/{org}/codespaces/secrets/{secret_name}", sideEffect: "read" },
  "orgs.codespaces.secrets.create_or_update": { methodPath: "PUT /orgs/{org}/codespaces/secrets/{secret_name}", sideEffect: "write" },
  "orgs.codespaces.secrets.delete": { methodPath: "DELETE /orgs/{org}/codespaces/secrets/{secret_name}", sideEffect: "write" },
  "orgs.codespaces.secrets.repositories.set": { methodPath: "PUT /orgs/{org}/codespaces/secrets/{secret_name}/repositories", sideEffect: "write" },
  "orgs.codespaces.secrets.repositories.remove": { methodPath: "DELETE /orgs/{org}/codespaces/secrets/{secret_name}/repositories/{repository_id}", sideEffect: "write" },
  "repos.codespaces.secrets.get": { methodPath: "GET /repos/{owner}/{repo}/codespaces/secrets/{secret_name}", sideEffect: "read" },
  "dependabot.secrets.delete": { methodPath: "DELETE /repos/{owner}/{repo}/dependabot/secrets/{secret_name}", sideEffect: "write" },
  "orgs.codespaces.secrets.public_key.get": { methodPath: "GET /orgs/{org}/codespaces/secrets/public-key", sideEffect: "read" },
  "orgs.codespaces.secrets.repositories.list": { methodPath: "GET /orgs/{org}/codespaces/secrets/{secret_name}/repositories", sideEffect: "read" },
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

describe("github gap G8 codespaces + dependabot secret delete", () => {
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

  test("the fourteen G8 ops all omit effect policy and document their paths", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(PATHS)).toHaveLength(14);
    for (const [key, meta] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(op).toBeDefined();
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe(meta.sideEffect);
      expect(String(op.description)).toContain(meta.methodPath.split(" ")[1]);
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
    }
  });

  test("validators enforce codespaceName, sealed-box fields, and permissions_check queries", () => {
    expect(validateDeleteUserCodespaceInput({ codespaceName: "cs-1" })).toEqual({ codespaceName: "cs-1" });
    expect(validateUpsertOrgCodespacesSecretInput({
      org: "octo", secretName: "S", encryptedValue: "abc", keyId: "1", visibility: "selected", selectedRepositoryIds: [9],
    })).toMatchObject({ visibility: "selected", selectedRepositoryIds: [9] });
    expect(() => validateUpsertOrgCodespacesSecretInput({
      org: "octo", secretName: "S", encryptedValue: "abc", keyId: "1", visibility: "all", selectedRepositoryIds: [1],
    })).toThrow(/selectedRepositoryIds/);
    expect(validateGetRepoCodespacesPermissionsCheckInput({
      owner: "o", repo: "r", ref: "main", devcontainerPath: ".devcontainer/devcontainer.json",
    })).toMatchObject({ ref: "main", devcontainerPath: ".devcontainer/devcontainer.json" });
  });

  test("codespace deletes accept 202; secret upsert/set wire bodies; DELETE 404 → CONNECTOR_UPSTREAM_ERROR", async () => {
    const del = recorder([empty(202)]);
    expect(await deleteUserCodespace({ accessToken: "t", fetch: del.fetch, codespaceName: "cs-1" }))
      .toMatchObject({ deleted: true, codespaceName: "cs-1" });
    expect(del.seen[0].method).toBe("DELETE");

    const orgDel = recorder([empty(202)]);
    await deleteOrgMemberCodespace({
      accessToken: "t", fetch: orgDel.fetch, org: "octo", username: "u", codespaceName: "cs-2",
    });
    expect(orgDel.seen[0].url).toContain("/orgs/octo/members/u/codespaces/cs-2");

    const upsert = recorder([empty(201)]);
    expect(await upsertOrgCodespacesSecret({
      accessToken: "t", fetch: upsert.fetch, org: "octo", secretName: "S",
      encryptedValue: "cipher", keyId: "k1", visibility: "private",
    })).toMatchObject({ upserted: true, created: true, status: 201 });
    expect(JSON.parse(upsert.seen[0].body!)).toEqual({
      encrypted_value: "cipher", key_id: "k1", visibility: "private",
    });

    const set = recorder([empty(204)]);
    await setOrgCodespacesSecretRepositories({
      accessToken: "t", fetch: set.fetch, org: "octo", secretName: "S", selectedRepositoryIds: [1, 2],
    });
    expect(JSON.parse(set.seen[0].body!)).toEqual({ selected_repository_ids: [1, 2] });

    const missing = recorder([empty(404)]);
    await expect(deleteDependabotSecret({
      accessToken: "t", fetch: missing.fetch, owner: "o", repo: "r", secretName: "D",
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("reads normalize codespaces, secrets, public key, permissions, and repositories", async () => {
    const list = recorder([json({ total_count: 1, codespaces: [{ id: 3, name: "cs", state: "Available" }] })]);
    expect(await listRepoCodespaces({ accessToken: "t", fetch: list.fetch, owner: "o", repo: "r" }))
      .toMatchObject({ totalCount: 1, codespaces: [{ id: 3, name: "cs", state: "Available" }] });

    const devs = recorder([json({ total_count: 1, devcontainers: [{ path: ".devcontainer/devcontainer.json", name: "default", display_name: "Default" }] })]);
    expect(await listRepoDevcontainers({ accessToken: "t", fetch:devs.fetch, owner: "o", repo: "r" }))
      .toMatchObject({ devcontainers: [{ path: ".devcontainer/devcontainer.json", displayName: "Default" }] });

    const check = recorder([json({ accepted: true })]);
    expect(await getRepoCodespacesPermissionsCheck({
      accessToken: "t", fetch: check.fetch, owner: "o", repo: "r", ref: "main",
      devcontainerPath: ".devcontainer/devcontainer.json",
    })).toMatchObject({ check: { accepted: true } });
    expect(check.seen[0].url).toContain("devcontainer_path=");

    const orgSecret = recorder([json({
      name: "S", created_at: "a", updated_at: "b", visibility: "selected",
      selected_repositories_url: "https://api.github.com/x",
    })]);
    expect(await getOrgCodespacesSecret({ accessToken: "t", fetch: orgSecret.fetch, org: "octo", secretName: "S" }))
      .toMatchObject({ secret: { name: "S", visibility: "selected" } });

    const repoSecret = recorder([json({ name: "R", created_at: "a", updated_at: "b" })]);
    expect(await getRepoCodespacesSecret({
      accessToken: "t", fetch: repoSecret.fetch, owner: "o", repo: "r", secretName: "R",
    })).toMatchObject({ secret: { name: "R" } });

    const key = recorder([json({ key_id: "1", key: "pk" })]);
    expect(await getOrgCodespacesSecretsPublicKey({ accessToken: "t", fetch: key.fetch, org: "octo" }))
      .toMatchObject({ publicKey: { keyId: "1", key: "pk" } });

    const repos = recorder([json({ total_count: 1, repositories: [{ id: 9, name: "r", full_name: "o/r", private: true }] })]);
    expect(await listOrgCodespacesSecretRepositories({
      accessToken: "t", fetch: repos.fetch, org: "octo", secretName: "S",
    })).toMatchObject({ totalCount: 1, repositories: [{ id: 9, private: true }] });

    expect(await deleteOrgCodespacesSecret({
      accessToken: "t", fetch: recorder([empty(204)]).fetch, org: "octo", secretName: "S",
    })).toMatchObject({ deleted: true });

    expect(removeOrgCodespacesSecretRepository({ org: "octo", secretName: "S", repositoryId: 1 }))
      .toMatchObject({ action: "orgs.codespaces.secrets.repositories.remove" });
  });
});
