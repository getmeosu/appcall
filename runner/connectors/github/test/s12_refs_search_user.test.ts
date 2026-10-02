import { describe, expect, test } from "bun:test";
import searchCodeFixture from "../fixtures/search_code.json";
import searchCommitsFixture from "../fixtures/search_commits.json";
import searchReposFixture from "../fixtures/search_repositories.json";
import searchOrgsFixture from "../fixtures/search_orgs.json";
import getRefFixture from "../fixtures/get_ref.json";
import userGetFixture from "../fixtures/user_get.json";
import {
  getGitRef,
  searchCode,
  searchCommits,
  searchRepositories,
  searchOrgs,
  getUsersAuthenticated,
} from "../src/actions";
import { validateGetRefInput } from "../src/git";
import { buildOrgSearchQuery, validateSearchCodeInput, validateSearchOrgsInput } from "../src/search";
import { validateUsersGetAuthenticatedInput } from "../src/users";

describe("github S12 refs-search-user", () => {
  test("validates S12 read inputs", () => {
    expect(validateGetRefInput({ owner: "acme", repo: "app", ref: "heads/main" }).ref).toBe("heads/main");
    expect(() => validateGetRefInput({ owner: "acme", repo: "app" })).toThrow(/ref is required/);
    expect(validateSearchCodeInput({ q: "repo:acme/app auth", order: "desc" }).order).toBe("desc");
    expect(() => validateSearchCodeInput({ q: "repo:acme/app", order: "sideways" })).toThrow(/order must be asc or desc/);
    expect(() => validateSearchCodeInput({ q: "" })).toThrow(/q is required/);
    expect(validateSearchOrgsInput({ q: "github" }).q).toBe("github");
    expect(buildOrgSearchQuery("github")).toBe("github type:org");
    expect(buildOrgSearchQuery("type:org github")).toBe("type:org github");
    expect(validateUsersGetAuthenticatedInput({})).toEqual({});
    expect(validateUsersGetAuthenticatedInput(undefined)).toEqual({});
    expect(() => validateUsersGetAuthenticatedInput("nope")).toThrow(/users.get_authenticated/);
  });

  test("git.refs.get hits /git/refs/{ref} and strips refs/ prefix", async () => {
    const dry = getGitRef({ owner: "acme", repo: "app", ref: "heads/main" });
    expect(dry.action).toBe("git.refs.get");
    const requests: Request[] = [];
    const result = await getGitRef({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      ref: "refs/heads/main",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(getRefFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/git/refs/heads/main");
    expect(requests[0].method).toBe("GET");
    const ref = result.ref as Record<string, unknown>;
    expect(ref.ref).toBe("refs/heads/main");
    expect(ref.sha).toBe("abc123def456abc123def456abc123def456abc1");
  });

  test("git.refs.get maps 404 to upstream error", async () => {
    await expect(
      getGitRef({
        accessToken: "ghp_test",
        owner: "acme",
        repo: "app",
        ref: "heads/missing",
        fetch: async () => new Response("{}", { status: 404 }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Ref not found." });
  });

  test("search.code hits /search/code", async () => {
    const requests: Request[] = [];
    const result = await searchCode({
      accessToken: "ghp_test",
      q: "repo:acme/app auth",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(searchCodeFixture), { status: 200 });
      },
    });
    const url = decodeURIComponent(requests[0].url).replaceAll("+", " ");
    expect(url).toContain("https://api.github.com/search/code?");
    expect(url).toContain("q=repo:acme/app auth");
    expect(result.totalCount).toBe(1);
    const item = (result.items as Record<string, unknown>[])[0];
    expect(item.path).toBe("src/auth.ts");
    expect(item.repository).toBe("acme/app");
  });

  test("search.commits hits /search/commits", async () => {
    const requests: Request[] = [];
    const result = await searchCommits({
      accessToken: "ghp_test",
      q: "repo:acme/app fix",
      sort: "author-date",
      order: "desc",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(searchCommitsFixture), { status: 200 });
      },
    });
    const url = decodeURIComponent(requests[0].url).replaceAll("+", " ");
    expect(url).toContain("https://api.github.com/search/commits?");
    expect(url).toContain("sort=author-date");
    expect(url).toContain("order=desc");
    const item = (result.items as Record<string, unknown>[])[0];
    expect(item.sha).toBe("abc123def456abc123def456abc123def456abc1");
    expect(item.author).toBe("octocat");
    expect(item.message).toBe("Fix auth");
  });

  test("search.repositories hits /search/repositories", async () => {
    const requests: Request[] = [];
    const result = await searchRepositories({
      accessToken: "ghp_test",
      q: "app org:acme",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(searchReposFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toContain("https://api.github.com/search/repositories?");
    const item = (result.items as Record<string, unknown>[])[0];
    expect(item.fullName).toBe("acme/app");
    expect(item.id).toBe("gh-repo:42");
  });

  test("search.orgs forces type:org on /search/users", async () => {
    const requests: Request[] = [];
    const result = await searchOrgs({
      accessToken: "ghp_test",
      q: "github",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(searchOrgsFixture), { status: 200 });
      },
    });
    const url = decodeURIComponent(requests[0].url.replaceAll("+", " "));
    expect(url).toContain("https://api.github.com/search/users?");
    expect(url).toContain("type:org");
    expect(url).not.toContain("type:org type:org");
    const item = (result.items as Record<string, unknown>[])[0];
    expect(item.login).toBe("github");
    expect(item.id).toBe("gh-org:10");
  });

  test("search.orgs does not double-qualify type:org", async () => {
    const requests: Request[] = [];
    await searchOrgs({
      accessToken: "ghp_test",
      q: "github type:org",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(searchOrgsFixture), { status: 200 });
      },
    });
    const url = decodeURIComponent(requests[0].url.replaceAll("+", " "));
    expect(url.match(/type:org/g)?.length).toBe(1);
  });

  test("users.get_authenticated hits GET /user", async () => {
    const dry = getUsersAuthenticated({});
    expect(dry.action).toBe("users.get_authenticated");
    const requests: Request[] = [];
    const result = await getUsersAuthenticated({
      accessToken: "ghp_test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(userGetFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/user");
    expect(requests[0].method).toBe("GET");
    expect((result.user as Record<string, unknown>).login).toBe("octocat");
  });

  test("maps 422 search and 429 user to connector errors", async () => {
    await expect(
      searchCode({
        accessToken: "ghp_test",
        q: "not-a-qualifier",
        fetch: async () => new Response("{}", { status: 422 }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Invalid search query." });
    await expect(
      getUsersAuthenticated({
        accessToken: "ghp_test",
        fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "12" } }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});
