import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import networkEvents from "../fixtures/repo_network_events.json";
import publicRepos from "../fixtures/public_repositories.json";
import activity from "../fixtures/repo_activity.json";
import contributors from "../fixtures/repo_contributors.json";
import events from "../fixtures/repo_events.json";
import languages from "../fixtures/repo_languages.json";
import advisories from "../fixtures/repo_security_advisories.json";
import topics from "../fixtures/repo_topics.json";
import {
  listRepoNetworkEvents,
  listPublicRepositories,
  listRepoActivity,
  listRepoContributors,
  listRepoEvents,
  listRepoLanguages,
  listRepoSecurityAdvisories,
  getRepoTopics,
} from "../src/actions";
import {
  validateListNetworkEventsInput,
  validateListPublicRepositoriesInput,
  validateListRepoSecurityAdvisoriesInput,
} from "../src/repos_reads";

const READS = [
  "repos.network.events.list",
  "repos.public.list",
  "repos.activity.list",
  "repos.contributors.list",
  "repos.events.list",
  "repos.languages.list",
  "repos.security_advisories.list",
  "repos.topics.get",
] as const;

describe("github repos-3 repository activity reads", () => {
  test("manifest stays v0.66.0 at 671 ops and these reads omit effect policy", () => {
    expect(manifest.version).toBe("0.66.0");
    expect(Object.keys(manifest.operations).length).toBe(671);
    expect(READS).toHaveLength(8);
    expect(manifest.operations["repos.security_advisories.get"]).toBeDefined();
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
  });

  test("validates repos-3 inputs", () => {
    expect(validateListNetworkEventsInput({ owner: "acme", repo: "app", perPage: 10, page: 2 }).perPage).toBe(10);
    expect(() => validateListNetworkEventsInput({ owner: "acme/other", repo: "app" })).toThrow(/single path segment/);
    expect(validateListPublicRepositoriesInput({ since: 100, perPage: 5 }).since).toBe(100);
    expect(validateListPublicRepositoriesInput(undefined)).toEqual({});
    expect(() => validateListPublicRepositoriesInput({ since: -1 })).toThrow(/since/);
    expect(validateListRepoSecurityAdvisoriesInput({ owner: "acme", repo: "app" }).repo).toBe("app");
  });

  test("lists hit the documented paths and encode owner and repo", async () => {
    const network = await listRepoNetworkEvents({
      accessToken: "t", owner: "acme org", repo: "app", perPage: 5, page: 2,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/networks/acme%20org/app/events?per_page=5&page=2");
        return new Response(JSON.stringify(networkEvents), { status: 200 });
      },
    });
    expect((network.events as Array<Record<string, unknown>>)[0].type).toBe("PushEvent");

    const pubs = await listPublicRepositories({
      accessToken: "t", since: 9, perPage: 2,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repositories?since=9&per_page=2");
        return new Response(JSON.stringify(publicRepos), { status: 200 });
      },
    });
    expect((pubs.repositories as Array<Record<string, unknown>>)[0].fullName).toBe("acme/app");

    const acts = await listRepoActivity({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/activity");
        return new Response(JSON.stringify(activity), { status: 200 });
      },
    });
    expect((acts.activity as Array<Record<string, unknown>>)[0].activityType).toBe("push");

    const people = await listRepoContributors({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/contributors");
        return new Response(JSON.stringify(contributors), { status: 200 });
      },
    });
    expect((people.contributors as Array<Record<string, unknown>>)[0].contributions).toBe(12);

    const listed = await listRepoEvents({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/events");
        return new Response(JSON.stringify(events), { status: 200 });
      },
    });
    expect((listed.events as Array<Record<string, unknown>>)[0].actor).toBe("ada");

    const langs = await listRepoLanguages({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/languages");
        return new Response(JSON.stringify(languages), { status: 200 });
      },
    });
    expect(langs.languages).toEqual({ TypeScript: 1200, Rust: 40 });

    const advisoryList = await listRepoSecurityAdvisories({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/security-advisories");
        return new Response(JSON.stringify(advisories), { status: 200 });
      },
    });
    expect((advisoryList.advisories as Array<Record<string, unknown>>)[0].ghsaId).toBe("GHSA-abcd-efgh-ijkl");

    const names = await getRepoTopics({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/topics");
        return new Response(JSON.stringify(topics), { status: 200 });
      },
    });
    expect(names.names).toEqual(["rust", "connectors"]);
  });

  test("404 on these reads stays upstream", async () => {
    await expect(listRepoEvents({
      accessToken: "t", owner: "acme", repo: "missing",
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getRepoTopics({
      accessToken: "t", owner: "acme", repo: "missing",
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listRepoSecurityAdvisories({
      accessToken: "t", owner: "acme", repo: "missing",
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
