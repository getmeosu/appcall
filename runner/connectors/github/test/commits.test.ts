import { describe, expect, test } from "bun:test";
import commitsListFixture from "../fixtures/commits_list.json";
import {
  normalizeGitHubCommit,
  parseCommitsResponse,
} from "../src/commits";

describe("github commits", () => {
  test("normalizes commit from fixture", () => {
    const commit = normalizeGitHubCommit(commitsListFixture[0]);

    expect(commit.id).toBe(`gh-commit:${commitsListFixture[0].sha}`);
    expect(commit.provider).toBe("github");
    expect(commit.sha).toBe("abc123def456789012345678901234567890abcd");
    expect(commit.message).toContain("feat: add dark mode support");
    expect(commit.author).toBe("Alice Johnson");
    expect(commit.authorEmail).toBe("alice@example.com");
    expect(commit.committer).toBe("Alice Johnson");
    expect(commit.url).toBe("https://github.com/acme/app/commit/abc123def456789012345678901234567890abcd");
    expect(commit.authoredAt).toBe("2026-05-15T10:30:00Z");
    expect(commit.modelVersion).toBe("2026-05-16");
  });

  test("normalizes commit with different author and committer", () => {
    const commit = normalizeGitHubCommit(commitsListFixture[1]);

    expect(commit.author).toBe("Bob Smith");
    expect(commit.committer).toBe("Alice Johnson");
    expect(commit.authorEmail).toBe("bob@example.com");
    expect(commit.committerEmail).toBe("alice@example.com");
  });

  test("normalizes commit with minimal fields", () => {
    const commit = normalizeGitHubCommit({ sha: "abc123" });

    expect(commit.id).toBe("gh-commit:abc123");
    expect(commit.sha).toBe("abc123");
    expect(commit.message).toBe("");
    expect(commit.author).toBe("");
  });

  test("parses commits list response", () => {
    const parsed = parseCommitsResponse(commitsListFixture);

    expect(parsed.commits).toHaveLength(2);
    expect(parsed.commits[0].sha).toBe("abc123def456789012345678901234567890abcd");
    expect(parsed.commits[1].sha).toBe("def456abc123789012345678901234567890efgh");
  });

  test("parses empty commits list response", () => {
    const parsed = parseCommitsResponse([]);

    expect(parsed.commits).toHaveLength(0);
    expect(parsed.nextLink).toBeNull();
  });

  test("handles non-object response gracefully", () => {
    expect(parseCommitsResponse(null)).toEqual({ commits: [], nextLink: null });
    expect(parseCommitsResponse("string")).toEqual({ commits: [], nextLink: null });
  });
});
