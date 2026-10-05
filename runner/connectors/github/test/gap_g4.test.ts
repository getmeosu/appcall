import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  addOrgActionsSecretRepository,
  createDeploymentProtectionRule,
  deleteOrgActionsSecret,
  deleteRepoActionsSecret,
  deleteRepoCodespaceSecret,
  getRepoActionsSecret,
  getRepoActionsSecretsPublicKey,
  renderMarkdownRaw,
  setOrgActionsSecretRepositories,
  upsertOrgActionsSecret,
  upsertRepoActionsSecret,
} from "../src/actions";
import {
  validateAddOrgActionsSecretRepositoryInput,
  validateCreateDeploymentProtectionRuleInput,
  validateDeleteOrgActionsSecretInput,
  validateDeleteRepoActionsSecretInput,
  validateDeleteRepoCodespaceSecretInput,
  validateRenderMarkdownRawInput,
  validateSetOrgActionsSecretRepositoriesInput,
  validateUpsertOrgActionsSecretInput,
  validateUpsertRepoActionsSecretInput,
} from "../src/gap_g4";

const PATHS: Record<string, { methodPath: string; sideEffect: "read" | "write" }> = {
  "actions.secrets.public_key.get": { methodPath: "GET /repos/{owner}/{repo}/actions/secrets/public-key", sideEffect: "read" },
  "actions.secrets.get": { methodPath: "GET /repos/{owner}/{repo}/actions/secrets/{secret_name}", sideEffect: "read" },
  "actions.secrets.create_or_update": { methodPath: "PUT /repos/{owner}/{repo}/actions/secrets/{secret_name}", sideEffect: "write" },
  "actions.secrets.delete": { methodPath: "DELETE /repos/{owner}/{repo}/actions/secrets/{secret_name}", sideEffect: "write" },
  "actions.org_secrets.create_or_update": { methodPath: "PUT /orgs/{org}/actions/secrets/{secret_name}", sideEffect: "write" },
  "actions.org_secrets.delete": { methodPath: "DELETE /orgs/{org}/actions/secrets/{secret_name}", sideEffect: "write" },
  "actions.org_secrets.repositories.set": { methodPath: "PUT /orgs/{org}/actions/secrets/{secret_name}/repositories", sideEffect: "write" },
  "actions.org_secrets.repositories.add": {
    methodPath: "PUT /orgs/{org}/actions/secrets/{secret_name}/repositories/{repository_id}",
    sideEffect: "write",
  },
  "repos.environments.deployment_protection_rules.create": {
    methodPath: "POST /repos/{owner}/{repo}/environments/{environment_name}/deployment_protection_rules",
    sideEffect: "write",
  },
  "markdown.render_raw": { methodPath: "POST /markdown/raw", sideEffect: "read" },
  "repos.codespaces.secrets.delete": { methodPath: "DELETE /repos/{owner}/{repo}/codespaces/secrets/{secret_name}", sideEffect: "write" },
};

type Seen = { url: string; method: string; body?: string; contentType?: string | null };

function recorder(responses: Response[] | (() => Response)) {
  const seen: Seen[] = [];
  let i = 0;
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    seen.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body as string | undefined,
      contentType: headers.get("Content-Type"),
    });
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

describe("github gap G4 Actions secrets and leftovers", () => {
  test("version is 0.74.0 at 756 ops with the read/write breakdown", () => {
    expect(manifest.version).toBe("0.74.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(756);
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
    expect(kinds).toEqual({ action: 706, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 376, write: 315, absent: 15 });
  });

  test("the eleven G4 ops are present, omit all three effect keys, and document their paths", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(PATHS)).toHaveLength(11);
    let reads = 0;
    let writes = 0;
    for (const [key, meta] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(op).toBeDefined();
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe(meta.sideEffect);
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
      expect(String(op.description)).toContain(meta.methodPath.split(" ")[1]);
      if (meta.sideEffect === "read") reads += 1;
      else writes += 1;
    }
    expect(reads).toBe(3);
    expect(writes).toBe(8);
    const schema = (key: string) =>
      ops[key].inputSchema as { properties: Record<string, { type: string }>; required?: string[] };
    expect(schema("actions.secrets.create_or_update").properties.keyId.type).toBe("string");
    expect(schema("actions.org_secrets.repositories.add").properties.repositoryId.type).toBe("integer");
    expect(schema("repos.environments.deployment_protection_rules.create").properties.integrationId.type).toBe("integer");
    expect(schema("actions.org_secrets.create_or_update").required).toContain("visibility");
  });

  test("validators enforce sealed-box fields, visibility, and integer ids", () => {
    expect(
      validateUpsertRepoActionsSecretInput({
        owner: "octo",
        repo: "hello",
        secretName: "TOKEN",
        encryptedValue: "abc=",
        keyId: "key-1",
      }),
    ).toEqual({ owner: "octo", repo: "hello", secretName: "TOKEN", encryptedValue: "abc=", keyId: "key-1" });
    expect(() =>
      validateUpsertRepoActionsSecretInput({ owner: "octo", repo: "hello", secretName: "TOKEN", encryptedValue: "abc=", keyId: 1 }),
    ).toThrow(/keyId/);

    expect(
      validateUpsertOrgActionsSecretInput({
        org: "octo",
        secretName: "TOKEN",
        encryptedValue: "abc=",
        keyId: "key-1",
        visibility: "selected",
        selectedRepositoryIds: [42],
      }),
    ).toMatchObject({ visibility: "selected", selectedRepositoryIds: [42] });
    expect(() =>
      validateUpsertOrgActionsSecretInput({
        org: "octo",
        secretName: "TOKEN",
        encryptedValue: "abc=",
        keyId: "key-1",
        visibility: "all",
        selectedRepositoryIds: [1],
      }),
    ).toThrow(/selectedRepositoryIds/);
    expect(() =>
      validateUpsertOrgActionsSecretInput({
        org: "octo",
        secretName: "TOKEN",
        encryptedValue: "abc=",
        keyId: "key-1",
        visibility: "selected",
      }),
    ).toThrow(/selectedRepositoryIds/);

    expect(validateSetOrgActionsSecretRepositoriesInput({ org: "octo", secretName: "TOKEN", selectedRepositoryIds: [1, 2] }))
      .toEqual({ org: "octo", secretName: "TOKEN", selectedRepositoryIds: [1, 2] });
    expect(validateAddOrgActionsSecretRepositoryInput({ org: "octo", secretName: "TOKEN", repositoryId: 99 }))
      .toEqual({ org: "octo", secretName: "TOKEN", repositoryId: 99 });
    expect(validateCreateDeploymentProtectionRuleInput({
      owner: "octo",
      repo: "hello",
      environmentName: "prod",
      integrationId: 7,
    })).toEqual({ owner: "octo", repo: "hello", environmentName: "prod", integrationId: 7 });
    expect(validateRenderMarkdownRawInput({ text: "# hi" })).toEqual({ text: "# hi" });
    expect(validateDeleteRepoActionsSecretInput({ owner: "octo", repo: "hello", secretName: "TOKEN" }))
      .toEqual({ owner: "octo", repo: "hello", secretName: "TOKEN" });
    expect(validateDeleteOrgActionsSecretInput({ org: "octo", secretName: "TOKEN" }))
      .toEqual({ org: "octo", secretName: "TOKEN" });
    expect(validateDeleteRepoCodespaceSecretInput({ owner: "octo", repo: "hello", secretName: "TOKEN" }))
      .toEqual({ owner: "octo", repo: "hello", secretName: "TOKEN" });
  });

  test("dry-run wrappers return validated payloads", () => {
    expect(getRepoActionsSecretsPublicKey({ owner: "octo", repo: "hello" }))
      .toMatchObject({ action: "actions.secrets.public_key.get", validated: { owner: "octo", repo: "hello" } });
    expect(getRepoActionsSecret({ owner: "octo", repo: "hello", secretName: "TOKEN" }))
      .toMatchObject({ action: "actions.secrets.get", validated: { secretName: "TOKEN" } });
    expect(upsertRepoActionsSecret({
      owner: "octo",
      repo: "hello",
      secretName: "TOKEN",
      encryptedValue: "abc=",
      keyId: "key-1",
    })).toMatchObject({ action: "actions.secrets.create_or_update" });
    expect(renderMarkdownRaw({ text: "hi" })).toMatchObject({ action: "markdown.render_raw", validated: { text: "hi" } });
  });

  test("repo secret upsert and delete wire sealed-box body and 404 → CONNECTOR_UPSTREAM_ERROR", async () => {
    const created = recorder([empty(201)]);
    const createResult = await upsertRepoActionsSecret({
      accessToken: "t",
      fetch: created.fetch,
      owner: "octo",
      repo: "hello",
      secretName: "TOKEN",
      encryptedValue: "abc=",
      keyId: "key-1",
    });
    expect(createResult).toMatchObject({ upserted: true, created: true, status: 201, secretName: "TOKEN" });
    expect(created.seen[0].method).toBe("PUT");
    expect(created.seen[0].url).toContain("/repos/octo/hello/actions/secrets/TOKEN");
    expect(JSON.parse(created.seen[0].body!)).toEqual({ encrypted_value: "abc=", key_id: "key-1" });

    const missing = recorder([empty(404)]);
    await expect(
      deleteRepoActionsSecret({ accessToken: "t", fetch: missing.fetch, owner: "octo", repo: "hello", secretName: "TOKEN" }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("org secret upsert/set/add and deletes wire bodies; DELETE 404 → CONNECTOR_UPSTREAM_ERROR", async () => {
    const upsert = recorder([empty(204)]);
    const upsertResult = await upsertOrgActionsSecret({
      accessToken: "t",
      fetch: upsert.fetch,
      org: "octo",
      secretName: "TOKEN",
      encryptedValue: "abc=",
      keyId: "key-1",
      visibility: "selected",
      selectedRepositoryIds: [11, 22],
    });
    expect(upsertResult).toMatchObject({ upserted: true, created: false, status: 204, visibility: "selected" });
    expect(JSON.parse(upsert.seen[0].body!)).toEqual({
      encrypted_value: "abc=",
      key_id: "key-1",
      visibility: "selected",
      selected_repository_ids: [11, 22],
    });

    const set = recorder([empty(204)]);
    await setOrgActionsSecretRepositories({
      accessToken: "t",
      fetch: set.fetch,
      org: "octo",
      secretName: "TOKEN",
      selectedRepositoryIds: [3],
    });
    expect(JSON.parse(set.seen[0].body!)).toEqual({ selected_repository_ids: [3] });

    const add = recorder([empty(204)]);
    await addOrgActionsSecretRepository({
      accessToken: "t",
      fetch: add.fetch,
      org: "octo",
      secretName: "TOKEN",
      repositoryId: 9,
    });
    expect(add.seen[0].url).toContain("/repositories/9");
    expect(add.seen[0].method).toBe("PUT");

    const missing = recorder([empty(404)]);
    await expect(
      deleteOrgActionsSecret({ accessToken: "t", fetch: missing.fetch, org: "octo", secretName: "TOKEN" }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("reads, markdown raw text/plain, create protection rule, and codespace delete", async () => {
    const pk = recorder([json({ key_id: "k", key: "BASE64" })]);
    expect(
      await getRepoActionsSecretsPublicKey({ accessToken: "t", fetch: pk.fetch, owner: "octo", repo: "hello" }),
    ).toMatchObject({ publicKey: { keyId: "k", key: "BASE64" } });

    const secret = recorder([json({ name: "TOKEN", created_at: "a", updated_at: "b" })]);
    expect(
      await getRepoActionsSecret({ accessToken: "t", fetch: secret.fetch, owner: "octo", repo: "hello", secretName: "TOKEN" }),
    ).toMatchObject({ secret: { name: "TOKEN" } });

    const md = recorder([new Response("<p>hi</p>", { status: 200, headers: { "content-type": "text/html" } })]);
    const mdResult = await renderMarkdownRaw({ accessToken: "t", fetch: md.fetch, text: "# hi" });
    expect(mdResult).toMatchObject({ html: "<p>hi</p>" });
    expect(md.seen[0].contentType).toBe("text/plain");
    expect(md.seen[0].body).toBe("# hi");
    expect(md.seen[0].url).toContain("/markdown/raw");

    const create = recorder([
      json(
        {
          id: 55,
          node_id: "n",
          enabled: true,
          app: { id: 7, slug: "bot", name: "Bot" },
        },
        201,
      ),
    ]);
    expect(
      await createDeploymentProtectionRule({
        accessToken: "t",
        fetch: create.fetch,
        owner: "octo",
        repo: "hello",
        environmentName: "prod",
        integrationId: 7,
      }),
    ).toMatchObject({ rule: { id: 55, appId: 7, appSlug: "bot", enabled: true } });
    expect(JSON.parse(create.seen[0].body!)).toEqual({ integration_id: 7 });

    const missing = recorder([empty(404)]);
    await expect(
      deleteRepoCodespaceSecret({
        accessToken: "t",
        fetch: missing.fetch,
        owner: "octo",
        repo: "hello",
        secretName: "TOKEN",
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
