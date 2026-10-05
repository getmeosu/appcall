import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  addUserEmails,
  addUserSocialAccounts,
  blockUser,
  addCodespaceSecretRepository,
  upsertEnvironmentSecret,
  upsertCodespaceSecret,
  deleteUserSocialAccounts,
  unblockUser,
  unlockUserMigrationRepo,
  deleteCodespaceSecret,
  deleteEnvironmentSecret,
  updateAuthenticatedUser,
} from "../src/actions";

const NO_POLICY = [
  "user.emails.create",
  "user.social_accounts.add",
  "user.blocks.block",
  "user.codespaces.secrets.repositories.add",
  "repos.environments.secrets.create_or_update",
  "user.codespaces.secrets.create_or_update",
  "user.social_accounts.delete",
  "user.blocks.unblock",
  "user.migrations.repos.unlock",
  "user.codespaces.secrets.delete",
  "repos.environments.secrets.delete",
] as const;

function empty(status: number) {
  return new Response("", { status });
}

describe("github write card 3 user writes", () => {
  test("version is 0.62.0 at 639 ops with the write breakdown", () => {
    expect(manifest.version).toBe("0.62.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(639);
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
    expect(kinds).toEqual({ action: 589, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 328, write: 246, absent: 15 });
    expect(String(ops["users.get_authenticated"].description)).toContain("GET /user");
    expect(ops["users.get_authenticated"].sideEffect).toBe("read");
    for (const key of NO_POLICY) {
      const op = ops[key];
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
    }
    const update = ops["user.update"];
    expect(update.kind).toBe("action");
    expect(update.sideEffect).toBe("write");
    expect(update.effectPolicy).toBe("Reconcile");
    expect(update.reconcile).toBe("users.get_authenticated");
    expect(update.effect).toBeUndefined();
    expect(update.inputSchema).not.toHaveProperty("properties.login");
    expect(JSON.stringify(update.inputSchema)).not.toContain('"login"');
    expect(ops["classroom"]).toBeUndefined();
  });

  test("writes use the documented method and path and a 404 delete is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number, body?: unknown) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      if (body === undefined) return empty(status);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    };

    const emails = await addUserEmails({
      accessToken: token,
      emails: ["octocat@example.com"],
      fetch: fetchOf(201, [{ email: "octocat@example.com", primary: false, verified: false, visibility: null }]),
    });
    expect(calls.at(-1)).toContain("POST https://api.github.com/user/emails");
    expect(calls.at(-1)).toContain(JSON.stringify({ emails: ["octocat@example.com"] }));
    expect(emails.emails).toHaveLength(1);

    const social = await addUserSocialAccounts({
      accessToken: token,
      accountUrls: ["https://example.com/octo"],
      fetch: fetchOf(201, [{ provider: "generic", url: "https://example.com/octo" }]),
    });
    expect(calls.at(-1)).toContain("POST https://api.github.com/user/social_accounts");
    expect(calls.at(-1)).toContain(JSON.stringify({ account_urls: ["https://example.com/octo"] }));
    expect(social.accounts).toHaveLength(1);

    const blocked = await blockUser({ accessToken: token, username: "octo", fetch: fetchOf(204) });
    expect(calls.at(-1)).toBe("PUT https://api.github.com/user/blocks/octo ");
    expect(blocked.blocked).toBe(true);

    const added = await addCodespaceSecretRepository({
      accessToken: token, secretName: "BUILD", repositoryId: 42, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("PUT https://api.github.com/user/codespaces/secrets/BUILD/repositories/42 ");
    expect(added.added).toBe(true);

    const createdEnv = await upsertEnvironmentSecret({
      accessToken: token,
      owner: "acme",
      repo: "app",
      environmentName: "prod",
      secretName: "BUILD",
      encryptedValue: "not-a-secret",
      keyId: "not-a-key",
      fetch: fetchOf(201),
    });
    expect(calls.at(-1)).toContain("PUT https://api.github.com/repos/acme/app/environments/prod/secrets/BUILD");
    expect(calls.at(-1)).toContain(JSON.stringify({ encrypted_value: "not-a-secret", key_id: "not-a-key" }));
    expect(createdEnv.created).toBe(true);
    expect(createdEnv.status).toBe(201);
    const updatedEnv = await upsertEnvironmentSecret({
      accessToken: token,
      owner: "acme",
      repo: "app",
      environmentName: "prod",
      secretName: "BUILD",
      encryptedValue: "not-a-secret",
      keyId: "not-a-key",
      fetch: fetchOf(204),
    });
    expect(updatedEnv.status).toBe(204);
    expect(updatedEnv.created).toBe(false);

    const createdSecret = await upsertCodespaceSecret({
      accessToken: token,
      secretName: "BUILD",
      keyId: "not-a-key",
      encryptedValue: "not-a-secret",
      selectedRepositoryIds: [42],
      fetch: fetchOf(201),
    });
    expect(calls.at(-1)).toContain("PUT https://api.github.com/user/codespaces/secrets/BUILD");
    expect(calls.at(-1)).toContain(JSON.stringify({ key_id: "not-a-key", encrypted_value: "not-a-secret", selected_repository_ids: [42] }));
    expect(createdSecret.status).toBe(201);
    const updatedSecret = await upsertCodespaceSecret({
      accessToken: token, secretName: "BUILD", keyId: "not-a-key", fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toContain(JSON.stringify({ key_id: "not-a-key" }));
    expect(updatedSecret.status).toBe(204);

    const deletedSocial = await deleteUserSocialAccounts({
      accessToken: token, accountUrls: ["https://example.com/octo"], fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toContain("DELETE https://api.github.com/user/social_accounts");
    expect(calls.at(-1)).toContain(JSON.stringify({ account_urls: ["https://example.com/octo"] }));
    expect(deletedSocial.deleted).toBe(true);
    await expect(deleteUserSocialAccounts({
      accessToken: token, accountUrls: ["https://example.com/octo"], fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const unblocked = await unblockUser({ accessToken: token, username: "octo", fetch: fetchOf(204) });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/user/blocks/octo ");
    expect(unblocked.unblocked).toBe(true);
    await expect(unblockUser({ accessToken: token, username: "octo", fetch: fetchOf(404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const unlocked = await unlockUserMigrationRepo({
      accessToken: token, migrationId: 9, repoName: "app", fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/user/migrations/9/repos/app/lock ");
    expect(unlocked.unlocked).toBe(true);
    await expect(unlockUserMigrationRepo({
      accessToken: token, migrationId: 9, repoName: "app", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const deletedSecret = await deleteCodespaceSecret({ accessToken: token, secretName: "BUILD", fetch: fetchOf(204) });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/user/codespaces/secrets/BUILD ");
    expect(deletedSecret.deleted).toBe(true);
    await expect(deleteCodespaceSecret({ accessToken: token, secretName: "BUILD", fetch: fetchOf(404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const deletedEnv = await deleteEnvironmentSecret({
      accessToken: token, owner: "acme", repo: "app", environmentName: "prod", secretName: "BUILD", fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/repos/acme/app/environments/prod/secrets/BUILD ");
    expect(deletedEnv.deleted).toBe(true);
    await expect(deleteEnvironmentSecret({
      accessToken: token, owner: "acme", repo: "app", environmentName: "prod", secretName: "BUILD", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const updated = await updateAuthenticatedUser({
      accessToken: token, name: "Octo", blog: "https://example.com", fetch: fetchOf(200, { login: "octocat", name: "Octo" }),
    });
    expect(calls.at(-1)).toContain("PATCH https://api.github.com/user");
    expect(calls.at(-1)).toContain(JSON.stringify({ name: "Octo", blog: "https://example.com" }));
    expect(calls.at(-1)).not.toContain('"login"');
    expect(updated.user).toMatchObject({ name: "Octo" });
    expect(() => updateAuthenticatedUser({ name: "Octo", login: "renamed" })).toThrow(/cannot change the user login/);
  });
});
