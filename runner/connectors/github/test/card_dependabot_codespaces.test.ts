import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import alertFixture from "../fixtures/dependabot_alert.json";
import orgAlertsFixture from "../fixtures/org_dependabot_alerts.json";
import secretsFixture from "../fixtures/dependabot_secrets.json";
import secretFixture from "../fixtures/dependabot_secret.json";
import orgSecretsFixture from "../fixtures/org_dependabot_secrets.json";
import orgSecretFixture from "../fixtures/org_dependabot_secret.json";
import publicKeyFixture from "../fixtures/dependabot_public_key.json";
import codespaceFixture from "../fixtures/codespace.json";
import codespacesListFixture from "../fixtures/codespaces_list.json";
import machinesFixture from "../fixtures/codespaces_machines.json";
import codespacesSecretsFixture from "../fixtures/codespaces_secrets_list.json";
import {
  getDependabotAlert,
  updateDependabotAlert,
  listOrgDependabotAlerts,
  listDependabotSecrets,
  getDependabotSecret,
  createOrUpdateDependabotSecret,
  deleteDependabotSecret,
  listOrgDependabotSecrets,
  getOrgDependabotSecret,
  createOrUpdateOrgDependabotSecret,
  deleteOrgDependabotSecret,
  getDependabotRepoPublicKey,
  getDependabotOrgPublicKey,
  listCodespacesForAuthenticatedUser,
  listRepoCodespaces,
  getCodespace,
  createCodespaceForAuthenticatedUser,
  startCodespace,
  stopCodespace,
  deleteCodespace,
  listCodespaceMachines,
  listCodespacesSecrets,
} from "../src/actions";
import {
  validateGetDependabotAlertInput,
  validateUpdateDependabotAlertInput,
  validateListOrgDependabotAlertsInput,
  validateListDependabotSecretsInput,
  validateGetDependabotSecretInput,
  validateCreateOrUpdateDependabotSecretInput,
  validateDeleteDependabotSecretInput,
  validateListOrgDependabotSecretsInput,
  validateGetOrgDependabotSecretInput,
  validateCreateOrUpdateOrgDependabotSecretInput,
  validateDeleteOrgDependabotSecretInput,
  validateGetDependabotRepoPublicKeyInput,
  validateGetDependabotOrgPublicKeyInput,
  validateListCodespacesForAuthenticatedUserInput,
  validateListRepoCodespacesInput,
  validateGetCodespaceInput,
  validateCreateCodespaceForAuthenticatedUserInput,
  validateStartCodespaceInput,
  validateStopCodespaceInput,
  validateDeleteCodespaceInput,
  validateListCodespaceMachinesInput,
  validateListCodespacesSecretsInput,
} from "../src/card_dependabot_codespaces";

const READS = [
  "dependabot.alerts.get",
  "dependabot.org_alerts.list",
  "dependabot.secrets.list",
  "dependabot.secrets.get",
  "dependabot.org_secrets.list",
  "dependabot.org_secrets.get",
  "dependabot.repo_public_key.get",
  "dependabot.org_public_key.get",
  "codespaces.list_for_authenticated_user",
  "codespaces.list_for_repo",
  "codespaces.get",
  "codespaces.machines.list",
  "codespaces.secrets.list",
] as const;

const RECONCILE = [
  ["dependabot.alerts.update", "dependabot.alerts.get"],
  ["codespaces.create_for_authenticated_user", "codespaces.get"],
] as const;

const IDEMPOTENT = [
  "dependabot.secrets.create_or_update",
  "dependabot.org_secrets.create_or_update",
  "codespaces.start",
  "codespaces.stop",
] as const;

const DESTRUCTIVE = [
  "dependabot.secrets.delete",
  "dependabot.org_secrets.delete",
  "codespaces.delete",
] as const;

const PATHS: Record<string, string> = {
  "dependabot.alerts.get": "GET /repos/{owner}/{repo}/dependabot/alerts/{alert_number}",
  "dependabot.alerts.update": "PATCH /repos/{owner}/{repo}/dependabot/alerts/{alert_number}",
  "dependabot.org_alerts.list": "GET /orgs/{org}/dependabot/alerts",
  "dependabot.secrets.list": "GET /repos/{owner}/{repo}/dependabot/secrets",
  "dependabot.secrets.get": "GET /repos/{owner}/{repo}/dependabot/secrets/{secret_name}",
  "dependabot.secrets.create_or_update": "PUT /repos/{owner}/{repo}/dependabot/secrets/{secret_name}",
  "dependabot.secrets.delete": "DELETE /repos/{owner}/{repo}/dependabot/secrets/{secret_name}",
  "dependabot.org_secrets.list": "GET /orgs/{org}/dependabot/secrets",
  "dependabot.org_secrets.get": "GET /orgs/{org}/dependabot/secrets/{secret_name}",
  "dependabot.org_secrets.create_or_update": "PUT /orgs/{org}/dependabot/secrets/{secret_name}",
  "dependabot.org_secrets.delete": "DELETE /orgs/{org}/dependabot/secrets/{secret_name}",
  "dependabot.repo_public_key.get": "GET /repos/{owner}/{repo}/dependabot/secrets/public-key",
  "dependabot.org_public_key.get": "GET /orgs/{org}/dependabot/secrets/public-key",
  "codespaces.list_for_authenticated_user": "GET /user/codespaces",
  "codespaces.list_for_repo": "GET /repos/{owner}/{repo}/codespaces",
  "codespaces.get": "GET /user/codespaces/{codespace_name}",
  "codespaces.create_for_authenticated_user": "POST /user/codespaces",
  "codespaces.start": "POST /user/codespaces/{codespace_name}/start",
  "codespaces.stop": "POST /user/codespaces/{codespace_name}/stop",
  "codespaces.delete": "DELETE /user/codespaces/{codespace_name}",
  "codespaces.machines.list": "GET /user/codespaces/{codespace_name}/machines",
  "codespaces.secrets.list": "GET /user/codespaces/secrets",
};

const SECRET_OUTPUTS = [
  "dependabot.secrets.list",
  "dependabot.secrets.get",
  "dependabot.secrets.create_or_update",
  "dependabot.org_secrets.list",
  "dependabot.org_secrets.get",
  "dependabot.org_secrets.create_or_update",
  "codespaces.secrets.list",
] as const;

describe("github dependabot remaining and codespaces first slice", () => {
  test("version is 0.44.0 at 446 ops and the dependabot/codespaces policies", () => {
    expect(manifest.version).toBe("0.44.0");
    expect(Object.keys(manifest.operations)).toHaveLength(446);
    expect(manifest.operations["dependabot.alerts.list"]).toBeDefined();
    expect(manifest.operations["user.codespaces.list"]).toBeDefined();
    expect(manifest.operations["user.codespaces.machines.list"]).toBeDefined();
    expect(manifest.operations["user.codespaces.secrets.list"]).toBeDefined();
    expect(manifest.operations["repos.codespaces.machines.list"]).toBeDefined();
    expect(manifest.operations["enterprises.dependabot.alerts.list"]).toBeUndefined();
    expect(manifest.operations["enterprises.dependabot.secrets.list"]).toBeUndefined();
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
      expect(String(op.description)).toContain(PATHS[key]);
    }
    for (const [key, reconcile] of RECONCILE) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Reconcile");
      expect(op.reconcile).toBe(reconcile);
      expect(String(op.description)).toContain(PATHS[key]);
    }
    for (const key of IDEMPOTENT) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Idempotent");
      expect(op.reconcile).toBeUndefined();
      expect(String(op.description)).toContain(PATHS[key]);
    }
    for (const key of DESTRUCTIVE) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("destructive");
      expect(op.effectPolicy).toBe("Idempotent");
      expect(op.reconcile).toBeUndefined();
      expect(String(op.description)).toContain(PATHS[key]);
    }
    for (const key of SECRET_OUTPUTS) {
      const keys = schemaKeys(manifest.operations[key].outputSchema);
      expect(keys).not.toContain("value");
      expect(keys).not.toContain("encrypted_value");
      expect(keys).not.toContain("encryptedValue");
    }
  });

  test("validates path fields, dismiss reasons, secret payloads, and codespace ids", () => {
    expect(validateGetDependabotAlertInput({ owner: "octocat", repo: "Hello-World", alertNumber: 3 })).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      alertNumber: 3,
    });
    expect(() => validateGetDependabotAlertInput({ owner: "octo/cat", repo: "Hello-World", alertNumber: 3 })).toThrow(/owner/);
    expect(() => validateGetDependabotAlertInput({ owner: "octocat", repo: "Hello-World", alertNumber: 0 })).toThrow(/alertNumber/);
    expect(validateUpdateDependabotAlertInput({
      owner: "octocat",
      repo: "Hello-World",
      alertNumber: 3,
      state: "dismissed",
      dismissedReason: "tolerable_risk",
      dismissedComment: "noise",
    })).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      alertNumber: 3,
      state: "dismissed",
      dismissedReason: "tolerable_risk",
      dismissedComment: "noise",
    });
    expect(() => validateUpdateDependabotAlertInput({
      owner: "octocat",
      repo: "Hello-World",
      alertNumber: 3,
      state: "dismissed",
    })).toThrow(/dismissedReason/);
    expect(() => validateUpdateDependabotAlertInput({
      owner: "octocat",
      repo: "Hello-World",
      alertNumber: 3,
      state: "open",
      dismissedReason: "tolerable_risk",
    })).toThrow(/dismissedReason/);
    expect(validateListOrgDependabotAlertsInput({ org: "octocat", perPage: 10, page: 1, state: "open" })).toEqual({
      org: "octocat",
      perPage: 10,
      page: 1,
      state: "open",
    });
    expect(() => validateListOrgDependabotAlertsInput({ org: "octo/cat" })).toThrow(/org/);
    expect(validateListDependabotSecretsInput({ owner: "octocat", repo: "Hello-World" })).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      perPage: undefined,
      page: undefined,
    });
    expect(validateGetDependabotSecretInput({ owner: "octocat", repo: "Hello-World", secretName: "NPM_TOKEN" }).secretName).toBe("NPM_TOKEN");
    expect(() => validateGetDependabotSecretInput({ owner: "octocat", repo: "Hello-World", secretName: "NPM/TOKEN" })).toThrow(/secretName/);
    expect(validateCreateOrUpdateDependabotSecretInput({
      owner: "octocat",
      repo: "Hello-World",
      secretName: "NPM_TOKEN",
      encryptedValue: "c2VjcmV0",
      keyId: "012345678912345678",
    })).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      secretName: "NPM_TOKEN",
      encryptedValue: "c2VjcmV0",
      keyId: "012345678912345678",
    });
    expect(validateDeleteDependabotSecretInput({ owner: "octocat", repo: "Hello-World", secretName: "NPM_TOKEN" }).secretName).toBe("NPM_TOKEN");
    expect(validateListOrgDependabotSecretsInput({ org: "octocat" }).org).toBe("octocat");
    expect(validateGetOrgDependabotSecretInput({ org: "octocat", secretName: "ORG_NPM" }).secretName).toBe("ORG_NPM");
    expect(validateCreateOrUpdateOrgDependabotSecretInput({
      org: "octocat",
      secretName: "ORG_NPM",
      encryptedValue: "c2VjcmV0",
      keyId: "012345678912345678",
      visibility: "selected",
      selectedRepositoryIds: [1296269],
    })).toEqual({
      org: "octocat",
      secretName: "ORG_NPM",
      encryptedValue: "c2VjcmV0",
      keyId: "012345678912345678",
      visibility: "selected",
      selectedRepositoryIds: [1296269],
    });
    expect(() => validateCreateOrUpdateOrgDependabotSecretInput({
      org: "octocat",
      secretName: "ORG_NPM",
      encryptedValue: "c2VjcmV0",
      keyId: "1",
      visibility: "public",
    })).toThrow(/visibility/);
    expect(validateDeleteOrgDependabotSecretInput({ org: "octocat", secretName: "ORG_NPM" }).org).toBe("octocat");
    expect(validateGetDependabotRepoPublicKeyInput({ owner: "octocat", repo: "Hello-World" })).toEqual({
      owner: "octocat",
      repo: "Hello-World",
    });
    expect(validateGetDependabotOrgPublicKeyInput({ org: "octocat" })).toEqual({ org: "octocat" });
    expect(validateListCodespacesForAuthenticatedUserInput({ perPage: 10, page: 2 })).toEqual({ perPage: 10, page: 2 });
    expect(validateListRepoCodespacesInput({ owner: "octocat", repo: "Hello-World" }).repo).toBe("Hello-World");
    expect(validateGetCodespaceInput({ codespaceName: "octo-app" })).toEqual({ codespaceName: "octo-app" });
    expect(() => validateGetCodespaceInput({ codespaceName: "octo/app" })).toThrow(/codespaceName/);
    expect(validateCreateCodespaceForAuthenticatedUserInput({
      repositoryId: 1296269,
      ref: "main",
      machine: "standardLinux32gb",
    })).toEqual({
      repositoryId: 1296269,
      ref: "main",
      machine: "standardLinux32gb",
      displayName: undefined,
      location: undefined,
    });
    expect(() => validateCreateCodespaceForAuthenticatedUserInput({ repositoryId: 0 })).toThrow(/repositoryId/);
    expect(validateStartCodespaceInput({ codespaceName: "octo-app" }).codespaceName).toBe("octo-app");
    expect(validateStopCodespaceInput({ codespaceName: "octo-app" }).codespaceName).toBe("octo-app");
    expect(validateDeleteCodespaceInput({ codespaceName: "octo-app" }).codespaceName).toBe("octo-app");
    expect(validateListCodespaceMachinesInput({ codespaceName: "octo-app" }).codespaceName).toBe("octo-app");
    expect(validateListCodespacesSecretsInput({ perPage: 30 })).toEqual({ perPage: 30, page: undefined });
  });

  test("gets and updates a dependabot alert and lists org alerts", async () => {
    const seen: string[] = [];
    const alert = await getDependabotAlert({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      alertNumber: 3,
      fetch: async (input, init) => {
        seen.push(`${init?.method ?? "GET"} ${String(input)}`);
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer t");
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        return json(alertFixture);
      },
    });
    expect(alert.action).toBe("dependabot.alerts.get");
    expect(alert.alert).toEqual({
      number: 3,
      state: "open",
      severity: "high",
      packageName: "lodash",
      manifestPath: "package.json",
      htmlUrl: "https://github.com/acme/app/security/dependabot/3",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
    });
    expect(JSON.stringify(alert)).not.toContain("drop_me");

    const requests: Request[] = [];
    const updated = await updateDependabotAlert({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      alertNumber: 3,
      state: "dismissed",
      dismissedReason: "tolerable_risk",
      dismissedComment: "noise",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return json({ ...alertFixture, state: "dismissed" });
      },
    });
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/dependabot/alerts/3");
    expect(JSON.parse(await requests[0].text())).toEqual({
      state: "dismissed",
      dismissed_reason: "tolerable_risk",
      dismissed_comment: "noise",
    });
    expect((updated.alert as { state: string }).state).toBe("dismissed");

    const org = await listOrgDependabotAlerts({
      accessToken: "t",
      org: "octo cat",
      state: "open",
      perPage: 10,
      page: 1,
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/orgs/octo%20cat/dependabot/alerts?state=open&per_page=10&page=1");
        expect(String(input)).not.toContain("/enterprises/");
        expect(init?.method ?? "GET").toBe("GET");
        return json(orgAlertsFixture);
      },
    });
    expect(org.action).toBe("dependabot.org_alerts.list");
    expect((org.alerts as { number: number; repositoryFullName: string }[])[0]).toMatchObject({
      number: 9,
      packageName: "left-pad",
      repositoryFullName: "acme/app",
    });
    expect(seen).toEqual([
      "GET https://api.github.com/repos/octo%20cat/Hello%20World/dependabot/alerts/3",
    ]);
  });

  test("lists, gets, puts, and deletes dependabot repo and org secrets without leaking values", async () => {
    const listed = await listDependabotSecrets({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      perPage: 10,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/octo%20cat/Hello%20World/dependabot/secrets?per_page=10");
        return json(secretsFixture);
      },
    });
    expect(listed.action).toBe("dependabot.secrets.list");
    expect(listed.total_count).toBe(1);
    expect((listed.secrets as { name: string }[])[0]).toEqual({
      name: "NPM_TOKEN",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });
    expect(JSON.stringify(listed)).not.toContain("should-not-leak");
    expect(JSON.stringify(listed)).not.toContain("ciphertext");

    const got = await getDependabotSecret({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      secretName: "NPM_TOKEN",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/dependabot/secrets/NPM_TOKEN");
        return json(secretFixture);
      },
    });
    expect(got.secret).toEqual({
      name: "NPM_TOKEN",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });
    expect(JSON.stringify(got)).not.toContain("should-not-leak");

    const requests: Request[] = [];
    const put = await createOrUpdateDependabotSecret({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      secretName: "NPM_TOKEN",
      encryptedValue: "c2VjcmV0",
      keyId: "012345678912345678",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/dependabot/secrets/NPM_TOKEN");
    expect(JSON.parse(await requests[0].text())).toEqual({
      encrypted_value: "c2VjcmV0",
      key_id: "012345678912345678",
    });
    expect(put.secret).toEqual({ name: "NPM_TOKEN", created: false });
    expect(JSON.stringify(put)).not.toContain("c2VjcmV0");

    const deleted = await deleteDependabotSecret({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      secretName: "NPM_TOKEN",
      fetch: async (input, init) => {
        expect(init?.method).toBe("DELETE");
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/dependabot/secrets/NPM_TOKEN");
        return new Response(null, { status: 204 });
      },
    });
    expect(deleted.deleted).toBe(true);
    expect(deleted.secretName).toBe("NPM_TOKEN");

    const orgListed = await listOrgDependabotSecrets({
      accessToken: "t",
      org: "octo cat",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/octo%20cat/dependabot/secrets");
        return json(orgSecretsFixture);
      },
    });
    expect((orgListed.secrets as { name: string }[])[0].name).toBe("ORG_NPM");
    expect(JSON.stringify(orgListed)).not.toContain("should-not-leak");
    expect(JSON.stringify(orgListed)).not.toContain("selected_repositories_url");

    const orgGot = await getOrgDependabotSecret({
      accessToken: "t",
      org: "acme",
      secretName: "ORG_NPM",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/dependabot/secrets/ORG_NPM");
        return json(orgSecretFixture);
      },
    });
    expect((orgGot.secret as { name: string }).name).toBe("ORG_NPM");
    expect(JSON.stringify(orgGot)).not.toContain("should-not-leak");

    const orgPut = await createOrUpdateOrgDependabotSecret({
      accessToken: "t",
      org: "acme",
      secretName: "ORG_NPM",
      encryptedValue: "c2VjcmV0",
      keyId: "012345678912345678",
      visibility: "selected",
      selectedRepositoryIds: [1296269, 1296280],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 201 });
      },
    });
    expect(requests[1].method).toBe("PUT");
    expect(requests[1].url).toBe("https://api.github.com/orgs/acme/dependabot/secrets/ORG_NPM");
    expect(JSON.parse(await requests[1].text())).toEqual({
      encrypted_value: "c2VjcmV0",
      key_id: "012345678912345678",
      visibility: "selected",
      selected_repository_ids: [1296269, 1296280],
    });
    expect(orgPut.secret).toEqual({ name: "ORG_NPM", created: true });

    const orgDeleted = await deleteOrgDependabotSecret({
      accessToken: "t",
      org: "acme",
      secretName: "ORG_NPM",
      fetch: async (input, init) => {
        expect(init?.method).toBe("DELETE");
        expect(String(input)).toBe("https://api.github.com/orgs/acme/dependabot/secrets/ORG_NPM");
        return new Response(null, { status: 204 });
      },
    });
    expect(orgDeleted.deleted).toBe(true);

    const repoKey = await getDependabotRepoPublicKey({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/octo%20cat/Hello%20World/dependabot/secrets/public-key");
        return json(publicKeyFixture);
      },
    });
    expect(repoKey.publicKey).toEqual({ key_id: "98172384917234", key: "not-a-public-key" });
    expect(JSON.stringify(repoKey)).not.toContain("drop_me");

    const orgKey = await getDependabotOrgPublicKey({
      accessToken: "t",
      org: "octo cat",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/octo%20cat/dependabot/secrets/public-key");
        return json(publicKeyFixture);
      },
    });
    expect((orgKey.publicKey as { key_id: string }).key_id).toBe("98172384917234");
  });

  test("lists, gets, creates, starts, stops, and deletes codespaces", async () => {
    const seen: string[] = [];
    const mine = await listCodespacesForAuthenticatedUser({
      accessToken: "t",
      perPage: 10,
      page: 2,
      fetch: async (input, init) => {
        seen.push(`${init?.method ?? "GET"} ${String(input)}`);
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        return json(codespacesListFixture);
      },
    });
    expect(mine.action).toBe("codespaces.list_for_authenticated_user");
    expect((mine.codespaces as { name: string; state: string }[])[0]).toEqual({
      id: 42,
      name: "octo-app",
      state: "Available",
      machine: "standardLinux32gb",
      repositoryFullName: "acme/app",
    });

    const repo = await listRepoCodespaces({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      fetch: async (input) => {
        seen.push(`GET ${String(input)}`);
        return json(codespacesListFixture);
      },
    });
    expect(repo.action).toBe("codespaces.list_for_repo");
    expect((repo.codespaces as { name: string }[])[0].name).toBe("octo-app");

    const got = await getCodespace({
      accessToken: "t",
      codespaceName: "octo-app",
      fetch: async (input) => {
        seen.push(`GET ${String(input)}`);
        return json(codespaceFixture);
      },
    });
    expect(got.action).toBe("codespaces.get");
    expect(got.codespace).toEqual({
      id: 42,
      name: "octo-app",
      state: "Available",
      machine: "standardLinux32gb",
      repositoryFullName: "acme/app",
    });
    expect(JSON.stringify(got)).not.toContain("drop_me");

    const requests: Request[] = [];
    const created = await createCodespaceForAuthenticatedUser({
      accessToken: "t",
      repositoryId: 1296269,
      ref: "main",
      machine: "standardLinux32gb",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return json(codespaceFixture, 201);
      },
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("https://api.github.com/user/codespaces");
    expect(JSON.parse(await requests[0].text())).toEqual({
      repository_id: 1296269,
      ref: "main",
      machine: "standardLinux32gb",
    });
    expect((created.codespace as { name: string }).name).toBe("octo-app");

    const started = await startCodespace({
      accessToken: "t",
      codespaceName: "octo-app",
      fetch: async (input, init) => {
        expect(init?.method).toBe("POST");
        expect(String(input)).toBe("https://api.github.com/user/codespaces/octo-app/start");
        return json({ ...codespaceFixture, state: "Starting" });
      },
    });
    expect((started.codespace as { state: string }).state).toBe("Starting");

    const stopped = await stopCodespace({
      accessToken: "t",
      codespaceName: "octo-app",
      fetch: async (input, init) => {
        expect(init?.method).toBe("POST");
        expect(String(input)).toBe("https://api.github.com/user/codespaces/octo-app/stop");
        return json({ ...codespaceFixture, state: "Shutdown" });
      },
    });
    expect((stopped.codespace as { state: string }).state).toBe("Shutdown");

    const deleted = await deleteCodespace({
      accessToken: "t",
      codespaceName: "octo-app",
      fetch: async (input, init) => {
        expect(init?.method).toBe("DELETE");
        expect(String(input)).toBe("https://api.github.com/user/codespaces/octo-app");
        return new Response(null, { status: 202 });
      },
    });
    expect(deleted.deleted).toBe(true);
    expect(deleted.codespaceName).toBe("octo-app");

    const machines = await listCodespaceMachines({
      accessToken: "t",
      codespaceName: "octo-app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/user/codespaces/octo-app/machines");
        return json(machinesFixture);
      },
    });
    expect(machines.action).toBe("codespaces.machines.list");
    expect((machines.machines as { name: string; os: string }[])[0]).toEqual({
      name: "standardLinux32gb",
      displayName: "32-core",
      os: "linux",
    });

    const secrets = await listCodespacesSecrets({
      accessToken: "t",
      perPage: 10,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/user/codespaces/secrets?per_page=10");
        return json(codespacesSecretsFixture);
      },
    });
    expect(secrets.action).toBe("codespaces.secrets.list");
    expect((secrets.secrets as { name: string }[])[0]).toEqual({
      name: "CODESPACE_TOKEN",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });
    expect(JSON.stringify(secrets)).not.toContain("should-not-leak");
    expect(JSON.stringify(secrets)).not.toContain("selected");
    expect(seen).toEqual([
      "GET https://api.github.com/user/codespaces?per_page=10&page=2",
      "GET https://api.github.com/repos/octo%20cat/Hello%20World/codespaces",
      "GET https://api.github.com/user/codespaces/octo-app",
    ]);
  });

  test("maps 429 and keeps 404 as CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getDependabotAlert({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      alertNumber: 1,
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "9" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });

    const missing = async () => new Response("{}", { status: 404 });
    await expect(getDependabotAlert({ accessToken: "t", owner: "octocat", repo: "Hello-World", alertNumber: 1, fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(updateDependabotAlert({ accessToken: "t", owner: "octocat", repo: "Hello-World", alertNumber: 1, state: "open", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listOrgDependabotAlerts({ accessToken: "t", org: "octocat", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listDependabotSecrets({ accessToken: "t", owner: "octocat", repo: "Hello-World", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getDependabotSecret({ accessToken: "t", owner: "octocat", repo: "Hello-World", secretName: "X", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(createOrUpdateDependabotSecret({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      secretName: "X",
      encryptedValue: "c2VjcmV0",
      keyId: "1",
      fetch: missing,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(deleteDependabotSecret({ accessToken: "t", owner: "octocat", repo: "Hello-World", secretName: "X", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listOrgDependabotSecrets({ accessToken: "t", org: "octocat", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getOrgDependabotSecret({ accessToken: "t", org: "octocat", secretName: "X", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(createOrUpdateOrgDependabotSecret({
      accessToken: "t",
      org: "octocat",
      secretName: "X",
      encryptedValue: "c2VjcmV0",
      keyId: "1",
      visibility: "all",
      fetch: missing,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(deleteOrgDependabotSecret({ accessToken: "t", org: "octocat", secretName: "X", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getDependabotRepoPublicKey({ accessToken: "t", owner: "octocat", repo: "Hello-World", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getDependabotOrgPublicKey({ accessToken: "t", org: "octocat", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listCodespacesForAuthenticatedUser({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listRepoCodespaces({ accessToken: "t", owner: "octocat", repo: "Hello-World", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getCodespace({ accessToken: "t", codespaceName: "octo-app", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(createCodespaceForAuthenticatedUser({ accessToken: "t", repositoryId: 1, fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(startCodespace({ accessToken: "t", codespaceName: "octo-app", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(stopCodespace({ accessToken: "t", codespaceName: "octo-app", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(deleteCodespace({ accessToken: "t", codespaceName: "octo-app", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listCodespaceMachines({ accessToken: "t", codespaceName: "octo-app", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listCodespacesSecrets({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation-only path does not fetch", () => {
    const result = getDependabotAlert({ owner: "octocat", repo: "Hello-World", alertNumber: 3 });
    expect(result.action).toBe("dependabot.alerts.get");
    expect(result.validated).toEqual({ owner: "octocat", repo: "Hello-World", alertNumber: 3 });
  });
});

function schemaKeys(schema: unknown, acc: string[] = []): string[] {
  if (!schema || typeof schema !== "object") return acc;
  const record = schema as { properties?: Record<string, unknown>; items?: unknown };
  if (record.properties) {
    for (const [key, value] of Object.entries(record.properties)) {
      acc.push(key);
      schemaKeys(value, acc);
    }
  }
  if (record.items) schemaKeys(record.items, acc);
  return acc;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
