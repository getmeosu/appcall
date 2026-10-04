import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  checkUserFollowing,
  listAuthenticatedUserFollowers,
  listAuthenticatedUserFollowing,
  listAuthenticatedUserSubscriptions,
  listOrgActionsRunners,
  listOrgRunnerDownloads,
  listRepoActionsRunners,
  listRepoRunnerDownloads,
  listRepoStargazers,
  listRepoSubscribers,
  listUserFollowers,
  listUserFollowing,
  listUserSubscriptions,
} from "../src/actions";

const READS = [
  "orgs.actions.runners.downloads.list",
  "repos.actions.runners.downloads.list",
  "orgs.actions.runners.list",
  "repos.actions.runners.list",
  "users.following.check",
  "users.followers.list",
  "user.followers.list",
  "users.subscriptions.list",
  "user.subscriptions.list",
  "repos.stargazers.list",
  "users.following.list",
  "user.following.list",
  "repos.subscribers.list",
] as const;

const user = { id: 7, login: "hubot", html_url: "https://github.com/hubot", type: "User" };
const repo = { id: 9, name: "app", full_name: "acme/app", html_url: "https://github.com/acme/app", stargazers_count: 3 };
const download = {
  os: "osx",
  architecture: "x64",
  download_url: "https://github.com/actions/runner/releases/download/runner.tar.gz",
  filename: "runner.tar.gz",
  sha256_checksum: "abc",
  temp_download_token: "nope",
};
const runner = {
  id: 23,
  name: "build",
  os: "linux",
  status: "online",
  busy: false,
  labels: [{ id: 1, name: "self-hosted", type: "read-only" }],
};

describe("github card11 runner and social reads", () => {
  test("version stays 0.45.0 and the thirteen reads omit effect fields", () => {
    expect(manifest.version).toBe("0.45.0");
    expect(READS).toHaveLength(13);
    expect(Object.keys(manifest.operations)).toHaveLength(443);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
    }
    expect(manifest.operations["orgs.actions.runners.get"]).toBeDefined();
    expect(manifest.operations["repos.actions.runners.get"]).toBeDefined();
    expect(manifest.operations["orgs.actions.runners.labels.list"]).toBeUndefined();
    expect(manifest.operations["repos.actions.runners.labels.list"]).toBeDefined();
    expect(manifest.operations["user.following.check"]).toBeUndefined();
  });

  test("reads the documented paths with the bearer token", async () => {
    const seen: string[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      seen.push(url);
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer t");
      expect(headers.Accept).toBe("application/vnd.github+json");
      if (url.endsWith("/actions/runners/downloads")) return json([download]);
      if (url.includes("/actions/runners?")) return json({ total_count: 1, runners: [runner] });
      if (url.endsWith("/users/octocat/following/hubot")) return new Response("", { status: 204 });
      if (url.includes("/subscriptions?")) return json([repo]);
      if (url.includes("/followers?") || url.includes("/following?") || url.includes("/stargazers?") || url.includes("/subscribers?")) return json([user]);
      return new Response("{}", { status: 500 });
    };
    const token = { accessToken: "t", fetch, perPage: 30, page: 2 };
    const orgDownloads = await listOrgRunnerDownloads({ accessToken: "t", fetch, org: "acme" });
    expect(orgDownloads.downloads[0].filename).toBe("runner.tar.gz");
    expect(JSON.stringify(orgDownloads.downloads)).not.toContain("nope");
    const repoDownloads = await listRepoRunnerDownloads({ accessToken: "t", fetch, owner: "acme", repo: "app" });
    expect(repoDownloads.downloads).toHaveLength(1);
    const orgRunners = await listOrgActionsRunners({ ...token, org: "acme" });
    expect(orgRunners.totalCount).toBe(1);
    expect(orgRunners.runners[0].labels).toEqual([{ id: 1, name: "self-hosted", type: "read-only" }]);
    const repoRunners = await listRepoActionsRunners({ ...token, owner: "acme", repo: "app" });
    expect(repoRunners.runners[0].name).toBe("build");
    const check = await checkUserFollowing({ accessToken: "t", fetch, username: "octocat", targetUser: "hubot" });
    expect(check.following).toBe(true);
    const followers = await listUserFollowers({ ...token, username: "octocat" });
    expect(followers.users[0].login).toBe("hubot");
    const myFollowers = await listAuthenticatedUserFollowers(token);
    expect(myFollowers.users).toHaveLength(1);
    const watched = await listUserSubscriptions({ ...token, username: "octocat" });
    expect(watched.repositories[0].fullName).toBe("acme/app");
    expect(watched.repositories[0].stars).toBe(3);
    const myWatched = await listAuthenticatedUserSubscriptions(token);
    expect(myWatched.repositories[0].name).toBe("app");
    const stars = await listRepoStargazers({ ...token, owner: "acme", repo: "app" });
    expect(stars.users[0].providerUserId).toBe(7);
    const following = await listUserFollowing({ ...token, username: "octocat" });
    expect(following.users[0].login).toBe("hubot");
    const myFollowing = await listAuthenticatedUserFollowing(token);
    expect(myFollowing.users).toHaveLength(1);
    const subscribers = await listRepoSubscribers({ ...token, owner: "acme", repo: "app" });
    expect(subscribers.users[0].login).toBe("hubot");
    expect(seen).toEqual([
      "https://api.github.com/orgs/acme/actions/runners/downloads",
      "https://api.github.com/repos/acme/app/actions/runners/downloads",
      "https://api.github.com/orgs/acme/actions/runners?per_page=30&page=2",
      "https://api.github.com/repos/acme/app/actions/runners?per_page=30&page=2",
      "https://api.github.com/users/octocat/following/hubot",
      "https://api.github.com/users/octocat/followers?per_page=30&page=2",
      "https://api.github.com/user/followers?per_page=30&page=2",
      "https://api.github.com/users/octocat/subscriptions?per_page=30&page=2",
      "https://api.github.com/user/subscriptions?per_page=30&page=2",
      "https://api.github.com/repos/acme/app/stargazers?per_page=30&page=2",
      "https://api.github.com/users/octocat/following?per_page=30&page=2",
      "https://api.github.com/user/following?per_page=30&page=2",
      "https://api.github.com/repos/acme/app/subscribers?per_page=30&page=2",
    ]);
  });

  test("a normal 404 is CONNECTOR_UPSTREAM_ERROR and the follow check maps 204 and 404", async () => {
    const missing = async () => new Response("", { status: 404 });
    const denied = async () => new Response("", { status: 401 });
    await expect(listUserFollowers({ accessToken: "t", username: "octocat", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listOrgActionsRunners({ accessToken: "t", org: "acme", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listRepoStargazers({ accessToken: "t", owner: "acme", repo: "app", fetch: denied })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    const absent = await checkUserFollowing({ accessToken: "t", username: "octocat", targetUser: "nobody", fetch: missing });
    expect(absent.following).toBe(false);
    const present = await checkUserFollowing({
      accessToken: "t",
      username: "octocat",
      targetUser: "hubot",
      fetch: async () => new Response("", { status: 204 }),
    });
    expect(present.following).toBe(true);
    await expect(checkUserFollowing({ accessToken: "t", username: "octocat", targetUser: "hubot", fetch: denied })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("the follow check does not follow redirects", async () => {
    let calls = 0;
    const fetch = async (_input: string | URL, init?: RequestInit) => {
      calls += 1;
      expect(init?.redirect).toBe("manual");
      return new Response("", { status: 302, headers: { Location: "https://example.com/following" } });
    };
    await expect(checkUserFollowing({ accessToken: "t", username: "octocat", targetUser: "hubot", fetch })).rejects.toMatchObject({ code: "OUTBOUND_REDIRECT_BLOCKED" });
    expect(calls).toBe(1);
  });

  test("validation-only path does not fetch", () => {
    const validated = checkUserFollowing({ username: "octocat", targetUser: "hubot" });
    expect(validated.validated).toEqual({ username: "octocat", targetUser: "hubot" });
  });
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
