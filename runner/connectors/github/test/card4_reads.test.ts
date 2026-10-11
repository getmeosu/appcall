import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import hovercardFixture from "../fixtures/user_hovercard.json";
import emailsFixture from "../fixtures/user_emails.json";
import eventsFixture from "../fixtures/user_events.json";
import gpgFixture from "../fixtures/user_gpg_keys.json";
import purchasesFixture from "../fixtures/user_marketplace_purchases.json";
import blocksFixture from "../fixtures/user_blocks.json";
import envPublicKeyFixture from "../fixtures/environment_secrets_public_key.json";
import envSecretFixture from "../fixtures/environment_secret.json";
import codespacesSecretFixture from "../fixtures/codespaces_secret.json";
import codespacesPublicKeyFixture from "../fixtures/codespaces_secrets_public_key.json";
import {
  getUserHovercard,
  listUserEmails,
  listUserEvents,
  listUserReceivedEvents,
  listUserGpgKeys,
  listMarketplacePurchases,
  listMarketplacePurchasesStubbed,
  listUserBlocks,
  getEnvironmentSecretsPublicKey,
  getEnvironmentSecret,
  getCodespacesSecret,
  getCodespacesSecretsPublicKey,
} from "../src/actions";
import {
  validateUsersHovercardGetInput,
  validateListUserEmailsInput,
  validateListUserEventsInput,
  validateListUserBlocksInput,
} from "../src/users";
import {
  validateGetEnvironmentSecretsPublicKeyInput,
  validateGetEnvironmentSecretInput,
  validateGetCodespacesSecretInput,
  normalizeNamedSecret,
  normalizeSecretPublicKey,
} from "../src/alerts";

const READS = [
  "users.hovercard.get",
  "user.emails.list",
  "users.events.list",
  "users.received_events.list",
  "users.gpg_keys.list",
  "user.marketplace_purchases.list",
  "user.marketplace_purchases.stubbed.list",
  "user.blocks.list",
  "repos.environments.secrets.public_key.get",
  "repos.environments.secrets.get",
  "user.codespaces.secrets.get",
  "user.codespaces.secrets.public_key.get",
] as const;

const FORBIDDEN = [
  "users.events.public.list",
  "users.received_events.public.list",
  "users.keys.list",
  "users.ssh_signing_keys.list",
  "actions.secrets.list",
  "secret_scanning.alerts.list",
] as const;

describe("github card-4 reads", () => {
  test("manifest stays v0.78.1 at 812 ops and these reads omit effect policy", () => {
    expect(manifest.version).toBe("0.78.1");
    expect(Object.keys(manifest.operations).length).toBe(812);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
    }
    expect(manifest.operations["user.blocks.check"]).toBeDefined();
    expect(manifest.operations["user.blocks.check"].sideEffect).toBe("read");
    expect(manifest.operations["user.blocks.list"]).toBeDefined();
    for (const key of FORBIDDEN) {
      expect(manifest.operations[key].sideEffect).toBe("read");
    }
  });

  test("validates hovercard subjects, pagination, and secret path fields", () => {
    expect(validateUsersHovercardGetInput({ username: " octocat " }).username).toBe("octocat");
    expect(validateUsersHovercardGetInput({
      username: "octocat",
      subject_type: "repository",
      subject_id: "1300192",
    }).subject_id).toBe("1300192");
    expect(() => validateUsersHovercardGetInput({ username: "octocat", subject_type: "repository" })).toThrow(/both/);
    expect(() => validateUsersHovercardGetInput({ username: "octocat", subject_type: "gist", subject_id: "1" })).toThrow(/subject_type/);
    expect(validateListUserEmailsInput({ perPage: 10, page: 2 })).toEqual({ perPage: 10, page: 2 });
    expect(() => validateListUserEventsInput({ username: "octocat", perPage: 101 })).toThrow(/perPage/);
    expect(validateListUserBlocksInput(null)).toEqual({ perPage: undefined, page: undefined });
    expect(validateGetEnvironmentSecretsPublicKeyInput({
      owner: "acme",
      repo: "app",
      environment_name: "prod/us",
    }).environment_name).toBe("prod/us");
    expect(() => validateGetEnvironmentSecretInput({ owner: "acme", repo: "app", environment_name: "prod" })).toThrow(/secret_name/);
    expect(validateGetCodespacesSecretInput({ secret_name: "TOKEN" }).secret_name).toBe("TOKEN");
  });

  test("gets a hovercard with optional subject query params", async () => {
    const bare = await getUserHovercard({
      accessToken: "t",
      username: "octo/cat",
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/users/octo%2Fcat/hovercard");
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        return new Response(JSON.stringify(hovercardFixture), { status: 200 });
      },
    });
    expect(bare.action).toBe("users.hovercard.get");
    expect((bare.hovercard as { contexts: { message: string }[] }).contexts[0].message).toBe("Owns this repository");

    const contextual = await getUserHovercard({
      accessToken: "t",
      username: "octocat",
      subject_type: "repository",
      subject_id: "1300192",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/users/octocat/hovercard?subject_type=repository&subject_id=1300192");
        return new Response(JSON.stringify(hovercardFixture), { status: 200 });
      },
    });
    expect((contextual.hovercard as { contexts: unknown[] }).contexts.length).toBe(2);
  });

  test("lists emails, events, received events, and gpg keys", async () => {
    const emails = await listUserEmails({
      accessToken: "t",
      perPage: 30,
      page: 1,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/user/emails?per_page=30&page=1");
        return new Response(JSON.stringify(emailsFixture), { status: 200 });
      },
    });
    expect(emails.action).toBe("user.emails.list");
    expect((emails.emails as { email: string; primary: boolean }[])[0]).toMatchObject({
      email: "octocat@github.com",
      primary: true,
      verified: true,
      visibility: "public",
    });

    const events = await listUserEvents({
      accessToken: "t",
      username: "octo/cat",
      perPage: 30,
      page: 2,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/users/octo%2Fcat/events?per_page=30&page=2");
        expect(String(input)).not.toContain("/events/public");
        return new Response(JSON.stringify(eventsFixture), { status: 200 });
      },
    });
    expect(events.action).toBe("users.events.list");
    expect((events.events as { public: boolean; type: string }[])[0]).toMatchObject({
      type: "WatchEvent",
      public: false,
    });

    const received = await listUserReceivedEvents({
      accessToken: "t",
      username: "octo/cat",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/users/octo%2Fcat/received_events");
        expect(String(input)).not.toContain("/received_events/public");
        return new Response(JSON.stringify(eventsFixture), { status: 200 });
      },
    });
    expect((received.events as unknown[]).length).toBe(1);

    const gpg = await listUserGpgKeys({
      accessToken: "t",
      username: "octocat",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/users/octocat/gpg_keys");
        return new Response(JSON.stringify(gpgFixture), { status: 200 });
      },
    });
    expect((gpg.keys as { keyId: string; publicKey: string }[])[0].keyId).toBe("3262EFF25BA0D270");
    expect((gpg.keys as { publicKey: string }[])[0].publicKey.length).toBeGreaterThan(10);
  });

  test("lists marketplace purchases, stubbed purchases, and blocks", async () => {
    const purchases = await listMarketplacePurchases({
      accessToken: "t",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/user/marketplace_purchases");
        return new Response(JSON.stringify(purchasesFixture), { status: 200 });
      },
    });
    expect(purchases.action).toBe("user.marketplace_purchases.list");
    expect((purchases.purchases as { planName: string; accountLogin: string }[])[0]).toMatchObject({
      planName: "Pro",
      accountLogin: "octocat",
      billingCycle: "monthly",
    });

    const stubbed = await listMarketplacePurchasesStubbed({
      accessToken: "t",
      perPage: 5,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/user/marketplace_purchases/stubbed?per_page=5");
        return new Response(JSON.stringify(purchasesFixture), { status: 200 });
      },
    });
    expect(stubbed.action).toBe("user.marketplace_purchases.stubbed.list");
    expect((stubbed.purchases as unknown[]).length).toBe(1);

    const blocks = await listUserBlocks({
      accessToken: "t",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/user/blocks");
        return new Response(JSON.stringify(blocksFixture), { status: 200 });
      },
    });
    expect(blocks.action).toBe("user.blocks.list");
    expect((blocks.users as { login: string }[])[0].login).toBe("blocked-user");
  });

  test("gets environment and codespaces secrets without values", async () => {
    expect(normalizeNamedSecret(envSecretFixture as unknown as Record<string, unknown>)).toEqual({
      name: "CI_TOKEN",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });
    expect(normalizeSecretPublicKey(envPublicKeyFixture as unknown as Record<string, unknown>)).toEqual({
      key_id: "012345678912345678",
      key: "not-a-public-key",
    });

    const envKey = await getEnvironmentSecretsPublicKey({
      accessToken: "t",
      owner: "octo cat",
      repo: "app/name",
      environment_name: "prod/us",
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/octo%20cat/app%2Fname/environments/prod%2Fus/secrets/public-key");
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        return new Response(JSON.stringify(envPublicKeyFixture), { status: 200 });
      },
    });
    expect(envKey.action).toBe("repos.environments.secrets.public_key.get");
    expect(envKey.publicKey).toEqual({
      key_id: "012345678912345678",
      key: "not-a-public-key",
    });

    const envSecret = await getEnvironmentSecret({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      environment_name: "staging",
      secret_name: "CI/TOKEN",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/environments/staging/secrets/CI%2FTOKEN");
        return new Response(JSON.stringify(envSecretFixture), { status: 200 });
      },
    });
    expect(envSecret.secret).toEqual({
      name: "CI_TOKEN",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });
    expect((envSecret.secret as Record<string, unknown>).value).toBeUndefined();
    expect((envSecret.secret as Record<string, unknown>).encrypted_value).toBeUndefined();

    const csSecret = await getCodespacesSecret({
      accessToken: "t",
      secret_name: "octocat-label",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/user/codespaces/secrets/octocat-label");
        return new Response(JSON.stringify(codespacesSecretFixture), { status: 200 });
      },
    });
    expect(csSecret.action).toBe("user.codespaces.secrets.get");
    expect(csSecret.secret).toEqual({
      name: "octocat-label",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });
    expect((csSecret.secret as Record<string, unknown>).value).toBeUndefined();

    const csKey = await getCodespacesSecretsPublicKey({
      accessToken: "t",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/user/codespaces/secrets/public-key");
        return new Response(JSON.stringify(codespacesPublicKeyFixture), { status: 200 });
      },
    });
    expect(csKey.publicKey).toEqual({
      key_id: "98172384917234",
      key: "not-a-public-key",
    });
  });

  test("maps 429 and keeps 404 as CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listUserEmails({
      accessToken: "t",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "12" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
    await expect(getUserHovercard({
      accessToken: "t",
      username: "missing",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getEnvironmentSecret({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      environment_name: "missing",
      secret_name: "X",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getCodespacesSecret({
      accessToken: "t",
      secret_name: "missing",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation-only path does not fetch", () => {
    const result = getCodespacesSecretsPublicKey({});
    expect(result.action).toBe("user.codespaces.secrets.public_key.get");
    expect(result.validated).toEqual({});
  });
});
