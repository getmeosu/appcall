import { describe, expect, test } from "bun:test";
import reposListFixture from "../fixtures/repositories_list.json";
import {
  normalizeGitHubRepository,
  parseRepositoriesResponse,
} from "../src/repositories";

describe("github repositories", () => {
  test("normalizes public repository from fixture", () => {
    const repo = normalizeGitHubRepository(reposListFixture[0]);

    expect(repo.id).toBe("gh-repo:111111111");
    expect(repo.provider).toBe("github");
    expect(repo.providerRepoId).toBe(111111111);
    expect(repo.name).toBe("app");
    expect(repo.fullName).toBe("acme/app");
    expect(repo.description).toBe("Main application repository");
    expect(repo.url).toBe("https://github.com/acme/app");
    expect(repo.isPrivate).toBe(false);
    expect(repo.isFork).toBe(false);
    expect(repo.language).toBe("TypeScript");
    expect(repo.stars).toBe(150);
    expect(repo.forks).toBe(23);
    expect(repo.openIssues).toBe(12);
    expect(repo.defaultBranch).toBe("main");
    expect(repo.owner).toBe("acme");
    expect(repo.modelVersion).toBe("2026-05-16");
  });

  test("normalizes private repository", () => {
    const repo = normalizeGitHubRepository(reposListFixture[1]);

    expect(repo.isPrivate).toBe(true);
    expect(repo.language).toBe("HCL");
    expect(repo.name).toBe("infra");
  });

  test("normalizes forked repository", () => {
    const repo = normalizeGitHubRepository(reposListFixture[2]);

    expect(repo.isFork).toBe(true);
    expect(repo.owner).toBe("alice");
    expect(repo.fullName).toBe("alice/react-components");
  });

  test("normalizes repository with minimal fields", () => {
    const repo = normalizeGitHubRepository({ id: 1, name: "min", full_name: "org/min" });

    expect(repo.id).toBe("gh-repo:1");
    expect(repo.name).toBe("min");
    expect(repo.isPrivate).toBe(false);
    expect(repo.stars).toBe(0);
  });

  test("parses repositories list response", () => {
    const parsed = parseRepositoriesResponse(reposListFixture);

    expect(parsed.repositories).toHaveLength(3);
    expect(parsed.repositories[0].id).toBe(111111111);
    expect(parsed.repositories[1].private).toBe(true);
    expect(parsed.repositories[2].fork).toBe(true);
  });

  test("parses empty repositories list response", () => {
    const parsed = parseRepositoriesResponse([]);

    expect(parsed.repositories).toHaveLength(0);
    expect(parsed.nextLink).toBeNull();
  });

  test("handles non-object response gracefully", () => {
    expect(parseRepositoriesResponse(null)).toEqual({ repositories: [], nextLink: null });
    expect(parseRepositoriesResponse("string")).toEqual({ repositories: [], nextLink: null });
  });
});
