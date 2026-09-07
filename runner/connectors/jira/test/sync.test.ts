import { describe, expect, it } from "bun:test";
import { executeIssuesSearchSync, executeProjectsListSync, executeUsersListSync } from "../src/sync";
import issuesSearch from "../fixtures/issues_search.json";
import issuesSearchLast from "../fixtures/issues_search_last.json";
import projectsList from "../fixtures/projects_list.json";
import usersList from "../fixtures/users_list.json";

describe("issues.search sync", () => {
  it("returns normalized issues with cursor", () => {
    const result = executeIssuesSearchSync({ response: issuesSearch });
    expect(result.provider).toBe("jira");
    expect(result.operation).toBe("issues.search");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].key).toBe("PROJ-123");
    expect(result.nextPageToken).toBe("abc123cursor");
  });

  it("returns null token on last page", () => {
    const result = executeIssuesSearchSync({ response: issuesSearchLast });
    expect(result.items).toHaveLength(1);
    expect(result.nextPageToken).toBeNull();
  });
});

describe("projects.list sync", () => {
  it("returns normalized projects", () => {
    const result = executeProjectsListSync({ response: projectsList });
    expect(result.provider).toBe("jira");
    expect(result.operation).toBe("projects.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].key).toBe("PROJ");
    expect(result.items[0].name).toBe("Main Project");
  });
});

describe("users.list sync", () => {
  it("returns normalized users", () => {
    const result = executeUsersListSync({ response: usersList });
    expect(result.provider).toBe("jira");
    expect(result.operation).toBe("users.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].displayName).toBe("Jane Smith");
  });
});
