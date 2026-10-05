import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import eventsFixture from "../fixtures/user_public_events.json";
import keysFixture from "../fixtures/user_public_keys.json";
import signingFixture from "../fixtures/user_ssh_signing_keys.json";
import socialFixture from "../fixtures/user_social_accounts.json";
import reposFixture from "../fixtures/user_repos_list.json";
import {
  listPublicUserEvents,
  listPublicReceivedUserEvents,
  listUserKeys,
  listUserStarred,
  listAuthenticatedStarred,
  listUserSocialAccounts,
  listAuthenticatedSocialAccounts,
  listUserSshSigningKeys,
} from "../src/actions";
import {
  validateListPublicEventsInput,
  validateListUserStarredInput,
  validateListAuthenticatedStarredInput,
  validateListAuthenticatedSocialAccountsInput,
} from "../src/users";

const READS = [
  "users.events.public.list",
  "users.received_events.public.list",
  "users.keys.list",
  "users.starred.list",
  "user.starred.list",
  "users.social_accounts.list",
  "user.social_accounts.list",
  "users.ssh_signing_keys.list",
] as const;

describe("github users-3 public user reads", () => {
  test("manifest stays v0.66.0 at 671 ops and these reads omit effect policy", () => {
    expect(manifest.version).toBe("0.66.0");
    expect(Object.keys(manifest.operations).length).toBe(671);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
    }
    expect(manifest.operations["repos.delete"]).toBeDefined();
  });

  test("validates username, pagination, and starred sort", () => {
    expect(validateListPublicEventsInput({ username: " octocat ", perPage: 30, page: 2 }).username).toBe("octocat");
    expect(() => validateListPublicEventsInput({})).toThrow(/username is required/);
    expect(() => validateListPublicEventsInput({ username: "octocat", perPage: 101 })).toThrow(/perPage/);
    expect(validateListUserStarredInput({ username: "octocat", sort: "updated", direction: "asc" }).sort).toBe("updated");
    expect(() => validateListUserStarredInput({ username: "octocat", sort: 1 })).toThrow(/sort must be a string/);
    expect(() => validateListUserStarredInput({ username: "octocat", sort: "stars" })).toThrow(/created or updated/);
    expect(() => validateListUserStarredInput({ username: "octocat", direction: "sideways" })).toThrow(/asc or desc/);
    expect(validateListAuthenticatedStarredInput(null).page).toBeUndefined();
    expect(() => validateListAuthenticatedStarredInput([])).toThrow(/input must be an object/);
    expect(validateListAuthenticatedSocialAccountsInput({ perPage: 10, page: 3 })).toEqual({ perPage: 10, page: 3 });
  });

  test("lists public events and received events with an encoded username", async () => {
    const events = await listPublicUserEvents({
      accessToken: "t",
      username: "octo/cat",
      perPage: 30,
      page: 2,
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/users/octo%2Fcat/events/public?per_page=30&page=2");
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        return new Response(JSON.stringify(eventsFixture), { status: 200 });
      },
    });
    expect(events.action).toBe("users.events.public.list");
    expect(events.events).toEqual([
      {
        id: "gh-event:1001",
        provider: "github",
        eventId: "1001",
        type: "PushEvent",
        actor: "octo/cat",
        repo: "octo/cat/hello",
        public: true,
        createdAt: "2026-05-16T00:00:00Z",
        modelVersion: "2026-05-16",
        raw: eventsFixture[0],
      },
    ]);

    const received = await listPublicReceivedUserEvents({
      accessToken: "t",
      username: "octo/cat",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/users/octo%2Fcat/received_events/public");
        return new Response(JSON.stringify(eventsFixture), { status: 200 });
      },
    });
    expect((received.events as unknown[]).length).toBe(1);
  });

  test("lists public keys, signing keys, and social accounts", async () => {
    const keys = await listUserKeys({
      accessToken: "t",
      username: "octocat",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/users/octocat/keys");
        return new Response(JSON.stringify(keysFixture), { status: 200 });
      },
    });
    expect(keys.keys).toEqual([
      { id: "gh-key:42", provider: "github", keyId: 42, key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestPublicKeyOnly octocat", modelVersion: "2026-05-16", raw: keysFixture[0] },
    ]);

    const signing = await listUserSshSigningKeys({
      accessToken: "t",
      username: "octocat",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/users/octocat/ssh_signing_keys");
        return new Response(JSON.stringify(signingFixture), { status: 200 });
      },
    });
    expect((signing.keys as Record<string, unknown>[])[0].title).toBe("laptop");
    expect((signing.keys as Record<string, unknown>[])[0].createdAt).toBe("2026-01-02T00:00:00Z");

    const social = await listUserSocialAccounts({
      accessToken: "t",
      username: "octocat",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/users/octocat/social_accounts");
        return new Response(JSON.stringify(socialFixture), { status: 200 });
      },
    });
    expect(social.socialAccounts).toEqual([
      { id: "gh-social:twitter:https://twitter.com/octocat", provider: "github", accountProvider: "twitter", url: "https://twitter.com/octocat", modelVersion: "2026-05-16", raw: socialFixture[0] },
    ]);

    const mine = await listAuthenticatedSocialAccounts({
      accessToken: "t",
      perPage: 5,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/user/social_accounts?per_page=5");
        return new Response(JSON.stringify(socialFixture), { status: 200 });
      },
    });
    expect((mine.socialAccounts as unknown[]).length).toBe(1);
  });

  test("lists starred repositories for a user and the authenticated user", async () => {
    const starred = await listUserStarred({
      accessToken: "t",
      username: "octo cat",
      sort: "updated",
      direction: "asc",
      perPage: 10,
      page: 1,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/users/octo%20cat/starred?sort=updated&direction=asc&per_page=10&page=1");
        return new Response(JSON.stringify(reposFixture), { status: 200 });
      },
    });
    expect((starred.repositories as Record<string, unknown>[])[0].fullName).toBe("acme/app");

    const mine = await listAuthenticatedStarred({
      accessToken: "t",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/user/starred");
        return new Response(JSON.stringify(reposFixture), { status: 200 });
      },
    });
    expect((mine.repositories as unknown[]).length).toBe(1);
  });

  test("maps 429 and non-200 responses", async () => {
    await expect(listUserKeys({
      accessToken: "t",
      username: "octocat",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "12" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
    await expect(listPublicUserEvents({
      accessToken: "t",
      username: "missing",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation-only path does not fetch", () => {
    const result = listUserSshSigningKeys({ username: "octocat" });
    expect(result.action).toBe("users.ssh_signing_keys.list");
    expect(result.validated).toEqual({ username: "octocat", perPage: undefined, page: undefined });
  });
});
