import { describe, expect, test } from "bun:test";
import issuesListFixture from "../fixtures/issues_list.json";
import prsListFixture from "../fixtures/pull_requests_list.json";
import commitsListFixture from "../fixtures/commits_list.json";
import reposListFixture from "../fixtures/repositories_list.json";
import {
  executeIssuesListSync,
  executePullRequestsListSync,
  executeCommitsListSync,
  executeRepositoriesListSync,
} from "../src/sync";

describe("github sync operations", () => {
  test("issues.list sync parses and normalizes issues, filtering PRs", () => {
    const result = executeIssuesListSync({ response: issuesListFixture });

    expect(result.provider).toBe("github");
    expect(result.operation).toBe("issues.list");
    // issues_list has 3 items, but the last one has pull_request field, so it's filtered
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("gh-issue:123456789");
    expect(result.items[0].title).toBe("Fix authentication middleware");
    expect(result.items[1].id).toBe("gh-issue:123456790");
  });

  test("issues.list sync handles empty response", () => {
    const result = executeIssuesListSync({ response: [] });

    expect(result.items).toHaveLength(0);
    expect(result.nextLink).toBeNull();
  });

  test("pull_requests.list sync parses and normalizes PRs", () => {
    const result = executePullRequestsListSync({ response: prsListFixture });

    expect(result.provider).toBe("github");
    expect(result.operation).toBe("pull_requests.list");
    expect(result.items).toHaveLength(3);
    expect(result.items[0].id).toBe("gh-pr:987654321");
    expect(result.items[0].isDraft).toBe(false);
    expect(result.items[1].isDraft).toBe(true);
    expect(result.items[2].isMerged).toBe(true);
  });

  test("pull_requests.list sync handles empty response", () => {
    const result = executePullRequestsListSync({ response: [] });

    expect(result.items).toHaveLength(0);
    expect(result.nextLink).toBeNull();
  });

  test("commits.list sync parses and normalizes commits", () => {
    const result = executeCommitsListSync({ response: commitsListFixture });

    expect(result.provider).toBe("github");
    expect(result.operation).toBe("commits.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].sha).toBe("abc123def456789012345678901234567890abcd");
    expect(result.items[1].author).toBe("Bob Smith");
  });

  test("commits.list sync handles empty response", () => {
    const result = executeCommitsListSync({ response: [] });

    expect(result.items).toHaveLength(0);
    expect(result.nextLink).toBeNull();
  });

  test("repositories.list sync parses and normalizes repos", () => {
    const result = executeRepositoriesListSync({ response: reposListFixture });

    expect(result.provider).toBe("github");
    expect(result.operation).toBe("repositories.list");
    expect(result.items).toHaveLength(3);
    expect(result.items[0].fullName).toBe("acme/app");
    expect(result.items[0].isPrivate).toBe(false);
    expect(result.items[1].isPrivate).toBe(true);
    expect(result.items[2].isFork).toBe(true);
  });

  test("repositories.list sync handles empty response", () => {
    const result = executeRepositoriesListSync({ response: [] });

    expect(result.items).toHaveLength(0);
    expect(result.nextLink).toBeNull();
  });
});
