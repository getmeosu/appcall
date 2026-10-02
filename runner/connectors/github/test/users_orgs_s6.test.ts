import { describe, expect, test } from "bun:test";
import searchUsersFixture from "../fixtures/search_users.json";
import userGetFixture from "../fixtures/user_get.json";
import orgGetFixture from "../fixtures/org_get.json";
import orgsListFixture from "../fixtures/orgs_list.json";
import orgMembersFixture from "../fixtures/org_members_list.json";
import userReposFixture from "../fixtures/user_repos_list.json";
import orgReposFixture from "../fixtures/org_repos_list.json";
import {
  searchUsers,
  getAuthenticatedUser,
  getUserByUsername,
  listUserRepos,
  getOrg,
  listOrgs,
  listOrgMembers,
  listOrgRepos,
} from "../src/actions";
import { normalizeGitHubUser, validateGetUserByUsernameInput, validateListUserReposInput } from "../src/users";
import { normalizeGitHubOrg, validateGetOrgInput, validateListOrgMembersInput } from "../src/orgs";
import { validateSearchUsersInput } from "../src/search";

describe("github S6 search-users-orgs", () => {
  test("normalizes user and org fixtures", () => {
    const user = normalizeGitHubUser(userGetFixture as never);
    expect(user.id).toBe("gh-user:1");
    expect(user.login).toBe("octocat");
    const org = normalizeGitHubOrg(orgGetFixture as never);
    expect(org.id).toBe("gh-org:10");
    expect(org.login).toBe("github");
  });

  test("validates S6 inputs", () => {
    expect(validateSearchUsersInput({ q: "octocat" }).q).toBe("octocat");
    expect(() => validateSearchUsersInput({ q: "" })).toThrow();
    expect(validateGetUserByUsernameInput({ username: "octocat" }).username).toBe("octocat");
    expect(() => validateGetUserByUsernameInput({})).toThrow();
    expect(validateListUserReposInput({ username: "octocat", perPage: 10 }).perPage).toBe(10);
    expect(() => validateListUserReposInput({ username: "octocat", perPage: 0 })).toThrow();
    expect(validateGetOrgInput({ org: "github" }).org).toBe("github");
    expect(validateListOrgMembersInput({ org: "github", role: "admin" }).role).toBe("admin");
    expect(() => validateListOrgMembersInput({ org: "github", role: "nope" })).toThrow();
  });

  test("searchUsers hits /search/users", async () => {
    const validated = searchUsers({ q: "octocat" });
    expect(validated.action).toBe("search.users");
    const requests: Request[] = [];
    const result = await searchUsers({
      accessToken: "ghp_test",
      q: "octocat",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(searchUsersFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toContain("https://api.github.com/search/users?");
    expect(requests[0].url).toContain("q=octocat");
    expect((result.items as unknown[]).length).toBe(2);
    expect(result.totalCount).toBe(2);
  });

  test("getAuthenticatedUser hits /user", async () => {
    const requests: Request[] = [];
    const result = await getAuthenticatedUser({
      accessToken: "ghp_test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(userGetFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/user");
    expect((result.user as Record<string, unknown>).login).toBe("octocat");
  });

  test("getUserByUsername hits /users/{username}", async () => {
    const requests: Request[] = [];
    const result = await getUserByUsername({
      accessToken: "ghp_test",
      username: "octocat",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(userGetFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/users/octocat");
    expect((result.user as Record<string, unknown>).login).toBe("octocat");
  });

  test("listUserRepos hits /users/{username}/repos", async () => {
    const requests: Request[] = [];
    const result = await listUserRepos({
      accessToken: "ghp_test",
      username: "octocat",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(userReposFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/users/octocat/repos");
    expect((result.repositories as unknown[]).length).toBe(1);
  });

  test("getOrg hits /orgs/{org}", async () => {
    const requests: Request[] = [];
    const result = await getOrg({
      accessToken: "ghp_test",
      org: "github",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(orgGetFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/orgs/github");
    expect((result.organization as Record<string, unknown>).login).toBe("github");
  });

  test("listOrgs hits /user/orgs", async () => {
    const requests: Request[] = [];
    const result = await listOrgs({
      accessToken: "ghp_test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(orgsListFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/user/orgs");
    expect((result.organizations as unknown[]).length).toBe(1);
  });

  test("listOrgMembers hits /orgs/{org}/members", async () => {
    const requests: Request[] = [];
    const result = await listOrgMembers({
      accessToken: "ghp_test",
      org: "github",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(orgMembersFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/orgs/github/members");
    expect((result.members as unknown[]).length).toBe(1);
  });

  test("listOrgRepos hits /orgs/{org}/repos", async () => {
    const requests: Request[] = [];
    const result = await listOrgRepos({
      accessToken: "ghp_test",
      org: "github",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(orgReposFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/orgs/github/repos");
    expect((result.repositories as unknown[]).length).toBe(1);
  });

  test("maps 429 to rate limit on searchUsers", async () => {
    await expect(
      searchUsers({
        accessToken: "ghp_test",
        q: "octocat",
        fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "30" } }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});
