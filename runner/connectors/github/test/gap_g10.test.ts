import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  addOrgDependabotSecretRepository,
  deleteOrgDependabotSecret,
  getOrgDependabotSecret,
  getRepoCodespacesSecretsPublicKey,
  getRepoDependabotSecret,
  getRepoDependabotSecretsPublicKey,
  listOrgDependabotSecretRepositories,
  listOrgDependabotSecrets,
  listRepoCodespacesSecrets,
  listRepoDependabotSecrets,
  removeOrgDependabotSecretRepository,
  setOrgDependabotSecretRepositories,
  upsertOrgDependabotSecret,
  upsertRepoCodespacesSecret,
  upsertRepoDependabotSecret,
} from "../src/actions";
import {
  validateAddOrgDependabotSecretRepositoryInput,
  validateUpsertOrgDependabotSecretInput,
  validateUpsertRepoDependabotSecretInput,
  validateUpsertRepoCodespacesSecretInput,
} from "../src/gap_g10";

const PATHS: Record<string, { methodPath: string; sideEffect: "read" | "write" }> = {
  "dependabot.secrets.public_key.get": {
    methodPath: "GET /repos/{owner}/{repo}/dependabot/secrets/public-key",
    sideEffect: "read",
  },
  "dependabot.secrets.list": {
    methodPath: "GET /repos/{owner}/{repo}/dependabot/secrets",
    sideEffect: "read",
  },
  "dependabot.secrets.get": {
    methodPath: "GET /repos/{owner}/{repo}/dependabot/secrets/{secret_name}",
    sideEffect: "read",
  },
  "dependabot.secrets.create_or_update": {
    methodPath: "PUT /repos/{owner}/{repo}/dependabot/secrets/{secret_name}",
    sideEffect: "write",
  },
  "orgs.dependabot.secrets.list": {
    methodPath: "GET /orgs/{org}/dependabot/secrets",
    sideEffect: "read",
  },
  "orgs.dependabot.secrets.get": {
    methodPath: "GET /orgs/{org}/dependabot/secrets/{secret_name}",
    sideEffect: "read",
  },
  "orgs.dependabot.secrets.create_or_update": {
    methodPath: "PUT /orgs/{org}/dependabot/secrets/{secret_name}",
    sideEffect: "write",
  },
  "orgs.dependabot.secrets.delete": {
    methodPath: "DELETE /orgs/{org}/dependabot/secrets/{secret_name}",
    sideEffect: "write",
  },
  "orgs.dependabot.secrets.repositories.list": {
    methodPath: "GET /orgs/{org}/dependabot/secrets/{secret_name}/repositories",
    sideEffect: "read",
  },
  "orgs.dependabot.secrets.repositories.set": {
    methodPath: "PUT /orgs/{org}/dependabot/secrets/{secret_name}/repositories",
    sideEffect: "write",
  },
  "orgs.dependabot.secrets.repositories.add": {
    methodPath: "PUT /orgs/{org}/dependabot/secrets/{secret_name}/repositories/{repository_id}",
    sideEffect: "write",
  },
  "orgs.dependabot.secrets.repositories.remove": {
    methodPath: "DELETE /orgs/{org}/dependabot/secrets/{secret_name}/repositories/{repository_id}",
    sideEffect: "write",
  },
  "repos.codespaces.secrets.public_key.get": {
    methodPath: "GET /repos/{owner}/{repo}/codespaces/secrets/public-key",
    sideEffect: "read",
  },
  "repos.codespaces.secrets.list": {
    methodPath: "GET /repos/{owner}/{repo}/codespaces/secrets",
    sideEffect: "read",
  },
  "repos.codespaces.secrets.create_or_update": {
    methodPath: "PUT /repos/{owner}/{repo}/codespaces/secrets/{secret_name}",
    sideEffect: "write",
  },
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

describe("github gap G10 dependabot + repo codespaces secrets", () => {
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

  test("the fifteen G10 ops all omit effect policy and document their paths", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(PATHS)).toHaveLength(15);
    let reads = 0;
    let writes = 0;
    for (const [key, meta] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(op).toBeDefined();
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe(meta.sideEffect);
      expect(String(op.description)).toContain(meta.methodPath.split(" ")[1]);
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
      if (meta.sideEffect === "read") reads += 1;
      else writes += 1;
    }
    expect(reads).toBe(8);
    expect(writes).toBe(7);
  });

  test("validators enforce sealed-box fields, visibility, and integer repository ids", () => {
    expect(validateUpsertRepoDependabotSecretInput({
      owner: "o", repo: "r", secretName: "S", encryptedValue: "cipher", keyId: "k1",
    })).toEqual({
      owner: "o", repo: "r", secretName: "S", encryptedValue: "cipher", keyId: "k1",
    });
    expect(() => validateUpsertRepoDependabotSecretInput({
      owner: "o", repo: "r", secretName: "S", keyId: "k1",
    })).toThrow(/encryptedValue/);

    expect(validateUpsertOrgDependabotSecretInput({
      org: "octo", secretName: "S", encryptedValue: "cipher", keyId: "k1",
      visibility: "selected", selectedRepositoryIds: [9],
    })).toMatchObject({ visibility: "selected", selectedRepositoryIds: [9] });
    expect(() => validateUpsertOrgDependabotSecretInput({
      org: "octo", secretName: "S", encryptedValue: "cipher", keyId: "k1",
      visibility: "all", selectedRepositoryIds: [1],
    })).toThrow(/selectedRepositoryIds/);
    expect(() => validateUpsertOrgDependabotSecretInput({
      org: "octo", secretName: "S", encryptedValue: "cipher", keyId: "k1", visibility: "hidden",
    })).toThrow(/visibility/);

    expect(validateAddOrgDependabotSecretRepositoryInput({
      org: "octo", secretName: "S", repositoryId: 42,
    })).toEqual({ org: "octo", secretName: "S", repositoryId: 42 });
    expect(() => validateAddOrgDependabotSecretRepositoryInput({
      org: "octo", secretName: "S", repositoryId: "42",
    })).toThrow(/repositoryId/);

    expect(validateUpsertRepoCodespacesSecretInput({
      owner: "o", repo: "r", secretName: "C", encryptedValue: "cipher", keyId: "k2",
    })).toMatchObject({ secretName: "C", keyId: "k2" });
  });

  test("dry-run wrappers return validated payloads", () => {
    expect(getRepoDependabotSecretsPublicKey({ owner: "o", repo: "r" }))
      .toMatchObject({ action: "dependabot.secrets.public_key.get", validated: { owner: "o", repo: "r" } });
    expect(upsertRepoDependabotSecret({
      owner: "o", repo: "r", secretName: "S", encryptedValue: "c", keyId: "k",
    })).toMatchObject({ action: "dependabot.secrets.create_or_update" });
    expect(deleteOrgDependabotSecret({ org: "octo", secretName: "S" }))
      .toMatchObject({ action: "orgs.dependabot.secrets.delete" });
    expect(upsertRepoCodespacesSecret({
      owner: "o", repo: "r", secretName: "C", encryptedValue: "c", keyId: "k",
    })).toMatchObject({ action: "repos.codespaces.secrets.create_or_update" });
  });

  test("upserts wire sealed-box bodies; set uses selected_repository_ids; DELETE 404 → CONNECTOR_UPSTREAM_ERROR", async () => {
    const upsert = recorder([empty(201)]);
    expect(await upsertRepoDependabotSecret({
      accessToken: "t", fetch: upsert.fetch, owner: "o", repo: "r", secretName: "S",
      encryptedValue: "cipher", keyId: "k1",
    })).toMatchObject({ upserted: true, created: true, status: 201 });
    expect(upsert.seen[0].method).toBe("PUT");
    expect(upsert.seen[0].url).toContain("/repos/o/r/dependabot/secrets/S");
    expect(JSON.parse(upsert.seen[0].body!)).toEqual({ encrypted_value: "cipher", key_id: "k1" });

    const orgUpsert = recorder([empty(204)]);
    expect(await upsertOrgDependabotSecret({
      accessToken: "t", fetch: orgUpsert.fetch, org: "octo", secretName: "S",
      encryptedValue: "cipher", keyId: "k1", visibility: "private",
    })).toMatchObject({ upserted: true, created: false, status: 204, visibility: "private" });
    expect(JSON.parse(orgUpsert.seen[0].body!)).toEqual({
      encrypted_value: "cipher", key_id: "k1", visibility: "private",
    });

    const set = recorder([empty(204)]);
    expect(await setOrgDependabotSecretRepositories({
      accessToken: "t", fetch: set.fetch, org: "octo", secretName: "S", selectedRepositoryIds: [1, 2],
    })).toMatchObject({ set: true, selectedRepositoryIds: [1, 2] });
    expect(JSON.parse(set.seen[0].body!)).toEqual({ selected_repository_ids: [1, 2] });

    const add = recorder([empty(204)]);
    expect(await addOrgDependabotSecretRepository({
      accessToken: "t", fetch: add.fetch, org: "octo", secretName: "S", repositoryId: 9,
    })).toMatchObject({ added: true, repositoryId: 9 });
    expect(add.seen[0].method).toBe("PUT");
    expect(add.seen[0].url).toContain("/repositories/9");

    const remove = recorder([empty(204)]);
    expect(await removeOrgDependabotSecretRepository({
      accessToken: "t", fetch: remove.fetch, org: "octo", secretName: "S", repositoryId: 9,
    })).toMatchObject({ removed: true, repositoryId: 9 });

    const cs = recorder([empty(201)]);
    expect(await upsertRepoCodespacesSecret({
      accessToken: "t", fetch: cs.fetch, owner: "o", repo: "r", secretName: "C",
      encryptedValue: "cipher", keyId: "k2",
    })).toMatchObject({ upserted: true, created: true, status: 201 });
    expect(cs.seen[0].url).toContain("/repos/o/r/codespaces/secrets/C");
    expect(JSON.parse(cs.seen[0].body!)).toEqual({ encrypted_value: "cipher", key_id: "k2" });

    const missing = recorder([empty(404)]);
    await expect(deleteOrgDependabotSecret({
      accessToken: "t", fetch: missing.fetch, org: "octo", secretName: "S",
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("reads normalize public keys, secrets, and selected repositories", async () => {
    const key = recorder([json({ key_id: "1", key: "pk" })]);
    expect(await getRepoDependabotSecretsPublicKey({
      accessToken: "t", fetch: key.fetch, owner: "o", repo: "r",
    })).toMatchObject({ publicKey: { keyId: "1", key: "pk" } });

    const list = recorder([json({
      total_count: 1,
      secrets: [{ name: "S", created_at: "a", updated_at: "b" }],
    })]);
    expect(await listRepoDependabotSecrets({
      accessToken: "t", fetch: list.fetch, owner: "o", repo: "r",
    })).toMatchObject({ totalCount: 1, secrets: [{ name: "S", createdAt: "a", updatedAt: "b" }] });

    const get = recorder([json({ name: "S", created_at: "a", updated_at: "b" })]);
    expect(await getRepoDependabotSecret({
      accessToken: "t", fetch: get.fetch, owner: "o", repo: "r", secretName: "S",
    })).toMatchObject({ secret: { name: "S" } });

    const orgList = recorder([json({
      total_count: 1,
      secrets: [{
        name: "O", created_at: "a", updated_at: "b", visibility: "selected",
        selected_repositories_url: "https://api.github.com/x",
      }],
    })]);
    expect(await listOrgDependabotSecrets({
      accessToken: "t", fetch: orgList.fetch, org: "octo",
    })).toMatchObject({
      totalCount: 1,
      secrets: [{ name: "O", visibility: "selected", selectedRepositoriesUrl: "https://api.github.com/x" }],
    });

    const orgGet = recorder([json({
      name: "O", created_at: "a", updated_at: "b", visibility: "private",
      selected_repositories_url: "https://api.github.com/y",
    })]);
    expect(await getOrgDependabotSecret({
      accessToken: "t", fetch: orgGet.fetch, org: "octo", secretName: "O",
    })).toMatchObject({ secret: { name: "O", visibility: "private" } });

    const repos = recorder([json({
      total_count: 1,
      repositories: [{ id: 9, name: "r", full_name: "o/r", private: true }],
    })]);
    expect(await listOrgDependabotSecretRepositories({
      accessToken: "t", fetch: repos.fetch, org: "octo", secretName: "O",
    })).toMatchObject({ totalCount: 1, repositories: [{ id: 9, name: "r", fullName: "o/r", private: true }] });

    const csKey = recorder([json({ key_id: "2", key: "cspk" })]);
    expect(await getRepoCodespacesSecretsPublicKey({
      accessToken: "t", fetch: csKey.fetch, owner: "o", repo: "r",
    })).toMatchObject({ publicKey: { keyId: "2", key: "cspk" } });

    const csList = recorder([json({
      total_count: 1,
      secrets: [{ name: "C", created_at: "a", updated_at: "b" }],
    })]);
    expect(await listRepoCodespacesSecrets({
      accessToken: "t", fetch: csList.fetch, owner: "o", repo: "r",
    })).toMatchObject({ totalCount: 1, secrets: [{ name: "C" }] });
  });
});
